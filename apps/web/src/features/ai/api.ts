import api, { getApiErrorDetails } from "@/lib/api";

export interface ChatRateLimit {
  limit: number;
  remaining: number;
  resetAt: string;
}

export interface ChatMessageResponse {
  answer: string;
  sessionId: string;
  sources?: { title: string; score: number }[];
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
