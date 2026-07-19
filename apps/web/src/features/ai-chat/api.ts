import { apiGet, apiPost } from '@/lib/api-client';

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
  timestamp: string;
}

export interface ChatSessionSummary {
  _id: string;
  sessionType: string;
  isActive: boolean;
  lastMessageAt?: string;
  createdAt: string;
  totalTokens: number;
}

export interface SendMessageResponse {
  sessionId: string;
  message: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export const aiChatApi = {
  sendMessage: (message: string, sessionId?: string) =>
    apiPost<SendMessageResponse>('/student/chat/messages', {
      message,
      sessionId,
    }),

  listSessions: () =>
    apiGet<ChatSessionSummary[]>('/student/chat/sessions'),

  getSessionHistory: (sessionId: string) =>
    apiGet<ChatMessage[]>(`/student/chat/sessions/${sessionId}/messages`),

  endSession: (sessionId: string) =>
    apiPost<void>(`/student/chat/sessions/${sessionId}/end`, {}),
};
