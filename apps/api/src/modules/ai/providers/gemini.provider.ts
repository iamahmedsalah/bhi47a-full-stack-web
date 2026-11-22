import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GoogleGenerativeAI,
  type GenerateContentResult,
} from '@google/generative-ai';
import type {
  LlmProvider,
  LlmChatOptions,
  LlmChatResponse,
  LlmEmbeddingOptions,
} from './llm-provider.interface';

const DEFAULT_CHAT_MODEL = 'gemini-2.0-flash';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';

@Injectable()
export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenerativeAI;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY', '');
    this.client = new GoogleGenerativeAI(apiKey);
    this.chatModel = this.config.get('GEMINI_CHAT_MODEL', DEFAULT_CHAT_MODEL);
    this.embeddingModel = this.config.get(
      'GEMINI_EMBEDDING_MODEL',
      DEFAULT_EMBEDDING_MODEL,
    );
  }

  async chat(
    userMessage: string,
    options?: LlmChatOptions,
  ): Promise<LlmChatResponse> {
    const model = this.client.getGenerativeModel(
      {
        model: this.chatModel,
        systemInstruction: options?.systemInstruction,
      },
      { timeout: 12_000 },
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
  }

  async embed(text: string, _options?: LlmEmbeddingOptions): Promise<number[]> {
    const model = this.client.getGenerativeModel({
      model: this.embeddingModel,
    });

    const result = await model.embedContent(text);
    return result.embedding?.values ?? [];
  }

  async embedBatch(
    texts: string[],
    options?: LlmEmbeddingOptions,
  ): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      results.push(await this.embed(text, options));
    }
    return results;
  }
}
