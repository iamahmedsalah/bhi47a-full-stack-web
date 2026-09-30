/**
 * LLM Provider abstraction for the AI module.
 *
 * All AI features go through this interface so swapping from Gemini to
 * OpenAI (or running both) requires only a new provider implementation.
 */
export interface LlmChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

export interface LlmChatOptions {
  /** System instruction prepended to the conversation. */
  systemInstruction?: string;
  /** Maximum tokens in the response. */
  maxOutputTokens?: number;
  /** Sampling temperature (0–2). */
  temperature?: number;
  /** Conversation history (excluding the current user message). */
  history?: LlmChatMessage[];
}

export interface LlmChatResponse {
  content: string;
  /** Token counts for cost tracking. */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** Provider-specific model identifier. */
  model: string;
}

export interface LlmEmbeddingOptions {
  /** Task type hint for embedding models. */
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
}

export interface LlmProvider {
  /** Send a chat message and receive a response. */
  chat(userMessage: string, options?: LlmChatOptions): Promise<LlmChatResponse>;

  /** Generate a vector embedding for the given text. */
  embed(text: string, options?: LlmEmbeddingOptions): Promise<number[]>;

  /** Embed multiple texts in a single batch. */
  embedBatch(
    texts: string[],
    options?: LlmEmbeddingOptions,
  ): Promise<number[][]>;
}
