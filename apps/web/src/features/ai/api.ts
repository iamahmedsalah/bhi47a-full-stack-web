import api, { getApiErrorDetails } from "@/lib/api";

export interface ChatRateLimit {
  limit: number;
  remaining: number;
  resetAt: string;
}

export interface ChatCitationSource {
  sourceId?: string;
  courseId?: string;
  courseCode?: string;
  courseTitle?: string;
  fileName?: string;
  pageNumber?: number;
  title?: string;
  score: number;
}

export interface ChatMessageResponse {
  answer: string;
  sessionId: string;
  sources?: ChatCitationSource[];
  metadata?: Record<string, unknown>;
  rateLimit?: ChatRateLimit;
}

export interface StudentChatStatus {
  enabled: boolean;
}

export async function getChatStatus(): Promise<StudentChatStatus> {
  const res = await api.get<StudentChatStatus>("/student/chat/status");
  return res.data;
}

export interface ChatSession {
  _id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryItem {
  sender: "user" | "assistant";
  content: string;
  timestamp: string;
}

export async function sendChatMessage(
  message: string,
  sessionId?: string,
  locale?: "ar" | "en",
): Promise<ChatMessageResponse> {
  try {
    const res = await api.post<ChatMessageResponse>("/student/chat/message", {
      message,
      sessionId,
      locale,
    });
    return res.data;
  } catch (error) {
    const details = getApiErrorDetails(error);
    const metadata = isRecord(details.errors) ? details.errors : undefined;
    if (
      details.statusCode === 429 &&
      metadata?.code === "STUDENT_CHAT_LIMIT_EXCEEDED"
    ) {
      throw new StudentChatRateLimitError(
        details.message,
        readString(metadata, "resetAt"),
      );
    }
    if (
      details.statusCode === 503 &&
      metadata?.code === "AI_ADVISOR_DISABLED"
    ) {
      throw new StudentChatDisabledError(details.message);
    }
    throw error;
  }
}

export interface StreamChatCallbacks {
  onMeta?: (meta: { sessionId: string; rateLimit?: ChatRateLimit }) => void;
  onToken?: (delta: string) => void;
}

export async function streamChatMessage(
  message: string,
  sessionId?: string,
  locale?: "ar" | "en",
  callbacks?: StreamChatCallbacks,
): Promise<ChatMessageResponse> {
  const baseUrl = String(api.defaults.baseURL || "/api").replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/student/chat/stream`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ message, sessionId, locale }),
    });
  } catch {
    return sendChatMessage(message, sessionId, locale);
  }

  if (!response.ok) {
    let payload: Record<string, unknown> | undefined;
    try {
      payload = (await response.json()) as Record<string, unknown>;
    } catch {
      payload = undefined;
    }
    const errObj = isRecord(payload?.errors)
      ? payload?.errors
      : isRecord(payload?.data) && isRecord((payload.data as Record<string, unknown>).errors)
        ? ((payload.data as Record<string, unknown>).errors as Record<string, unknown>)
        : undefined;
    const msg =
      (typeof payload?.message === "string" && payload.message) ||
      "Request failed";

    if (response.status === 429 && errObj?.code === "STUDENT_CHAT_LIMIT_EXCEEDED") {
      throw new StudentChatRateLimitError(msg, readString(errObj, "resetAt"));
    }
    if (response.status === 503 && errObj?.code === "AI_ADVISOR_DISABLED") {
      throw new StudentChatDisabledError(msg);
    }
    return sendChatMessage(message, sessionId, locale);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    return sendChatMessage(message, sessionId, locale);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse: ChatMessageResponse | undefined;
  let currentSessionId = sessionId || "";
  let accumulatedText = "";
  let currentRateLimit: ChatRateLimit | undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const lines = block.split("\n");
      let eventType = "message";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataStr += line.slice(5).trim();
        }
      }
      if (!dataStr) continue;
      try {
        const parsed = JSON.parse(dataStr) as Record<string, unknown>;
        if (eventType === "meta") {
          if (typeof parsed.sessionId === "string") {
            currentSessionId = parsed.sessionId;
          }
          if (isRecord(parsed.rateLimit)) {
            currentRateLimit = parsed.rateLimit as unknown as ChatRateLimit;
          }
          callbacks?.onMeta?.({
            sessionId: currentSessionId,
            rateLimit: currentRateLimit,
          });
        } else if (eventType === "token") {
          const delta = typeof parsed.delta === "string" ? parsed.delta : "";
          if (delta) {
            accumulatedText += delta;
            callbacks?.onToken?.(delta);
          }
        } else if (eventType === "done") {
          finalResponse = parsed as unknown as ChatMessageResponse;
        }
      } catch {
        // Ignore malformed frame
      }
    }
  }

  return (
    finalResponse ?? {
      sessionId: currentSessionId,
      answer: accumulatedText,
      rateLimit: currentRateLimit,
    }
  );
}

export class StudentChatDisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudentChatDisabledError";
  }
}

export class StudentChatRateLimitError extends Error {
  constructor(
    message: string,
    public readonly resetAt?: string,
  ) {
    super(message);
    this.name = "StudentChatRateLimitError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const res = await api.get<ChatSession[]>("/student/chat/sessions");
  return res.data;
}

export async function getSessionHistory(
  sessionId: string,
): Promise<ChatHistoryItem[]> {
  const res = await api.get<ChatHistoryItem[]>(
    `/student/chat/sessions/${sessionId}/messages`,
  );
  return res.data;
}
