import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  TaskType,
  type EmbedContentRequest,
  type GenerateContentResult,
} from '@google/generative-ai';
import type {
  LlmProvider,
  LlmChatOptions,
  LlmChatResponse,
  LlmEmbeddingOptions,
  LlmStreamChunk,
} from './llm-provider.interface';

export const DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_EMBEDDING_MODEL = 'gemini-embedding-001';
export const DEFAULT_EMBEDDING_BATCH_SIZE = 16;
export const DEFAULT_MAX_RETRIES = 3;

const TASK_TYPE_MAP: Record<
  NonNullable<LlmEmbeddingOptions['taskType']>,
  TaskType
> = {
  RETRIEVAL_DOCUMENT: TaskType.RETRIEVAL_DOCUMENT,
  RETRIEVAL_QUERY: TaskType.RETRIEVAL_QUERY,
  SEMANTIC_SIMILARITY: TaskType.SEMANTIC_SIMILARITY,
};

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('429') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('504') ||
    message.includes('resource_exhausted') ||
    message.includes('quota') ||
    message.includes('rate limit') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('fetch failed')
  );
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly client: GoogleGenerativeAI;
  private readonly chatModel: string;
  private readonly embeddingModel: string;
  private readonly expectedDimensions?: number;
  private readonly retryBaseDelayMs: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    this.client = new GoogleGenerativeAI(apiKey);
    this.chatModel =
      this.config.get<string>('GEMINI_CHAT_MODEL')?.trim() ||
      DEFAULT_CHAT_MODEL;
    this.embeddingModel =
      this.config.get<string>('GEMINI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_EMBEDDING_MODEL;

    const rawDims = this.config.get<string | number>(
      'GEMINI_EMBEDDING_DIMENSIONS',
    );
    const parsedDims =
      rawDims !== undefined && rawDims !== '' ? Number(rawDims) : undefined;
    this.expectedDimensions =
      parsedDims && Number.isInteger(parsedDims) && parsedDims > 0
        ? parsedDims
        : undefined;

    const rawDelay = this.config.get<string | number>(
      'GEMINI_RETRY_BASE_DELAY_MS',
    );
    this.retryBaseDelayMs =
      rawDelay !== undefined && Number(rawDelay) >= 0 ? Number(rawDelay) : 400;
  }

  getChatModelName(): string {
    return this.chatModel;
  }

  getEmbeddingModelName(): string {
    return this.embeddingModel;
  }

  getExpectedEmbeddingDimensions(): number | undefined {
    return this.expectedDimensions;
  }

  async chat(
    userMessage: string,
    options?: LlmChatOptions,
  ): Promise<LlmChatResponse> {
    return this.withExponentialBackoff(async () => {
      const model = this.client.getGenerativeModel(
        {
          model: this.chatModel,
          systemInstruction: options?.systemInstruction,
        },
        { timeout: 15_000 },
      );

      const history = (options?.history ?? []).map((msg) => ({
        role: msg.role === 'model' ? ('model' as const) : ('user' as const),
        parts: [{ text: msg.content }],
      }));

      const chatSession = model.startChat({
        history,
        generationConfig: {
          maxOutputTokens: options?.maxOutputTokens ?? 2048,
          temperature: options?.temperature ?? 0.7,
        },
      });

      const result: GenerateContentResult =
        await chatSession.sendMessage(userMessage);
      const response = result.response;
      const text = response.text() ?? '';
      const usage = response.usageMetadata;

      return {
        content: text,
        usage: {
          promptTokens: usage?.promptTokenCount ?? 0,
          completionTokens: usage?.candidatesTokenCount ?? 0,
          totalTokens: usage?.totalTokenCount ?? 0,
        },
        model: this.chatModel,
      };
    });
  }

  async *chatStream(
    userMessage: string,
    options?: LlmChatOptions,
  ): AsyncGenerator<LlmStreamChunk, void, unknown> {
    const model = this.client.getGenerativeModel(
      {
        model: this.chatModel,
        systemInstruction: options?.systemInstruction,
      },
      { timeout: 20_000 },
    );

    const history = (options?.history ?? []).map((msg) => ({
      role: msg.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: msg.content }],
    }));

    const chatSession = model.startChat({
      history,
      generationConfig: {
        maxOutputTokens: options?.maxOutputTokens ?? 2048,
        temperature: options?.temperature ?? 0.7,
      },
    });

    if (typeof chatSession.sendMessageStream !== 'function') {
      const fallback = await this.chat(userMessage, options);
      if (fallback.content) {
        yield { delta: fallback.content };
      }
      yield {
        delta: '',
        done: true,
        usage: fallback.usage,
        model: fallback.model,
      };
      return;
    }

    const streamResult = await this.withExponentialBackoff(() =>
      chatSession.sendMessageStream(userMessage),
    );

    for await (const chunk of streamResult.stream) {
      const piece = chunk.text() ?? '';
      if (piece) {
        yield { delta: piece };
      }
    }

    const finalResponse = await streamResult.response;
    const usage = finalResponse.usageMetadata;
    yield {
      delta: '',
      done: true,
      usage: {
        promptTokens: usage?.promptTokenCount ?? 0,
        completionTokens: usage?.candidatesTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
      model: this.chatModel,
    };
  }

  async embed(text: string, options?: LlmEmbeddingOptions): Promise<number[]> {
    const cleanText = text.trim();
    if (!cleanText) {
      throw new Error('EMBEDDING_INPUT_EMPTY');
    }

    return this.withExponentialBackoff(async () => {
      const model = this.client.getGenerativeModel(
        {
          model: this.embeddingModel,
        },
        { timeout: 15_000 },
      );

      const request: EmbedContentRequest = {
        content: {
          role: 'user',
          parts: [{ text: cleanText }],
        },
        ...(options?.taskType
          ? { taskType: TASK_TYPE_MAP[options.taskType] }
          : {}),
        ...(options?.title && options.taskType === 'RETRIEVAL_DOCUMENT'
          ? { title: options.title }
          : {}),
      };

      const result = await model.embedContent(request);
      const values = result.embedding?.values ?? [];
      this.validateEmbeddingVector(values);
      return values;
    });
  }

  async embedBatch(
    texts: string[],
    options?: LlmEmbeddingOptions,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const results: number[][] = [];
    let batchDimensions: number | undefined = this.expectedDimensions;

    for (
      let offset = 0;
      offset < texts.length;
      offset += DEFAULT_EMBEDDING_BATCH_SIZE
    ) {
      const slice = texts.slice(offset, offset + DEFAULT_EMBEDDING_BATCH_SIZE);
      const batchVectors = await this.embedBatchSlice(slice, options);

      for (const vector of batchVectors) {
        this.validateEmbeddingVector(vector, batchDimensions);
        if (!batchDimensions) {
          batchDimensions = vector.length;
        }
        results.push(vector);
      }
    }

    return results;
  }

  /**
   * Optional P2 multimodal OCR helper for scanned PDFs when RAG_OCR_ENABLED=true.
   */
  async extractTextFromPdfBuffer(pdfBuffer: Buffer): Promise<string> {
    return this.withExponentialBackoff(async () => {
      const model = this.client.getGenerativeModel(
        { model: this.chatModel },
        { timeout: 30_000 },
      );
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'application/pdf',
            data: pdfBuffer.toString('base64'),
          },
        },
        {
          text: 'Extract the verbatim text from this PDF document page by page. Prefix each page with "=== PAGE <number> ===". Output only the extracted text without commentary.',
        },
      ]);
      return result.response.text()?.trim() ?? '';
    });
  }

  private async embedBatchSlice(
    slice: string[],
    options?: LlmEmbeddingOptions,
  ): Promise<number[][]> {
    return this.withExponentialBackoff(async () => {
      const model = this.client.getGenerativeModel(
        { model: this.embeddingModel },
        { timeout: 20_000 },
      );

      if (typeof model.batchEmbedContents === 'function') {
        const requests: EmbedContentRequest[] = slice.map((raw) => {
          const clean = raw.trim();
          if (!clean) {
            throw new Error('EMBEDDING_INPUT_EMPTY');
          }
          return {
            content: {
              role: 'user',
              parts: [{ text: clean }],
            },
            ...(options?.taskType
              ? { taskType: TASK_TYPE_MAP[options.taskType] }
              : {}),
            ...(options?.title && options.taskType === 'RETRIEVAL_DOCUMENT'
              ? { title: options.title }
              : {}),
          };
        });

        const response = await model.batchEmbedContents({ requests });
        const embeddings = response.embeddings ?? [];
        if (embeddings.length !== slice.length) {
          throw new Error('EMBEDDING_BATCH_COUNT_MISMATCH');
        }
        return embeddings.map((entry) => entry.values ?? []);
      }

      // Fallback when batchEmbedContents is not provided by a test double
      const vectors: number[][] = [];
      for (const text of slice) {
        vectors.push(await this.embed(text, options));
      }
      return vectors;
    });
  }

  private validateEmbeddingVector(
    values: number[],
    expectedDim = this.expectedDimensions,
  ): void {
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      !values.every((v) => typeof v === 'number' && Number.isFinite(v))
    ) {
      throw new Error('EMBEDDING_EMPTY_OR_INVALID');
    }

    if (expectedDim && values.length !== expectedDim) {
      throw new Error(
        `EMBEDDING_DIMENSION_MISMATCH: expected ${expectedDim}, got ${values.length}`,
      );
    }
  }

  private async withExponentialBackoff<T>(
    fn: () => Promise<T>,
    maxRetries = DEFAULT_MAX_RETRIES,
  ): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        attempt += 1;
        if (attempt > maxRetries || !isRetryableProviderError(error)) {
          throw error;
        }
        const delayMs = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
        this.logger.warn(
          `Transient Gemini API error (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms`,
        );
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  }
}
