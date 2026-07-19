import { apiGet, apiPost } from '@/lib/api-client';

export interface StudentAiAnalysis {
  analysis: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StudentAiSummary {
  summary: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AiUsageFeatureStat {
  _id: string;
  totalRequests: number;
  totalTokens: number;
  avgLatencyMs: number;
  errorCount: number;
}

export interface AiUsageStatsResponse {
  period: string;
  features: AiUsageFeatureStat[];
  totalRequests: number;
  totalTokens: number;
}

export const adminAiApi = {
  analyzeStudent: (studentId: string) =>
    apiPost<StudentAiAnalysis>(`/admin/ai/analyze-student/${studentId}`, {}),

  summarizeStudent: (studentId: string) =>
    apiPost<StudentAiSummary>(`/admin/ai/summarize-student/${studentId}`, {}),

  getUsageStats: (days = 30) =>
    apiGet<AiUsageStatsResponse>(`/admin/ai/usage-stats?days=${days}`),
};
