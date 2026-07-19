import api from '@/lib/api';

export interface ChatMessageResponse {
  answer: string;
  sessionId: string;
  sources?: { title: string; score: number }[];
  metadata?: Record<string, unknown>;
}

export interface ChatSession {
  _id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatHistoryItem {
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export async function sendChatMessage(message: string, sessionId?: string): Promise<ChatMessageResponse> {
  const res = await api.post<ChatMessageResponse>('/student/chat/messages', { message, sessionId });
  return res.data;
}

export async function listChatSessions(): Promise<ChatSession[]> {
  const res = await api.get<ChatSession[]>('/student/chat/sessions');
  return res.data;
}

export async function getSessionHistory(sessionId: string): Promise<ChatHistoryItem[]> {
  const res = await api.get<ChatHistoryItem[]>(`/student/chat/sessions/${sessionId}/messages`);
  return res.data;
}
