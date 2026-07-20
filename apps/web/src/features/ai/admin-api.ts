import api, { type PaginatedResponse } from "@/lib/api";

export interface ChatAuditStudent {
  _id: string;
  name: string;
  studentCode?: string;
}

export interface ChatAuditMessage {
  role: "user" | "model" | "system";
  content: string;
  timestamp: string;
}

export interface ChatAuditSessionSummary {
  _id: string;
  sessionType: string;
  isActive: boolean;
  lastMessageAt?: string;
  createdAt: string;
  updatedAt: string;
  totalTokens: number;
  messageCount: number;
  lastMessage?: ChatAuditMessage;
  student: ChatAuditStudent;
}

export interface ChatAuditSessionDetail extends Omit<
  ChatAuditSessionSummary,
  "messageCount" | "lastMessage"
> {
  messages: ChatAuditMessage[];
}

export async function listAdminChatSessions(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<PaginatedResponse<ChatAuditSessionSummary>> {
  const response = await api.get<PaginatedResponse<ChatAuditSessionSummary>>(
    "/admin/ai/chat-sessions",
    { params },
  );
  return response.data;
}

export async function getAdminChatSession(
  sessionId: string,
): Promise<ChatAuditSessionDetail> {
  const response = await api.get<ChatAuditSessionDetail>(
    `/admin/ai/chat-sessions/${sessionId}`,
  );
  return response.data;
}
