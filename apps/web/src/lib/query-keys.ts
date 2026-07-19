export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  students: {
    all: ['students'] as const,
    lists: () => [...queryKeys.students.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.students.lists(), params ?? {}] as const,
    detail: (id: string) => [...queryKeys.students.all, 'detail', id] as const,
    profile: (id: string) => [...queryKeys.students.all, 'profile', id] as const,
  },
  courses: {
    all: ['courses'] as const,
    lists: () => [...queryKeys.courses.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.courses.lists(), params ?? {}] as const,
    detail: (id: string) => [...queryKeys.courses.all, 'detail', id] as const,
  },
  grades: {
    all: ['grades'] as const,
    lists: () => [...queryKeys.grades.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.grades.lists(), params ?? {}] as const,
    myGrades: () => [...queryKeys.grades.all, 'my-grades'] as const,
  },
  complaints: {
    all: ['complaints'] as const,
    lists: () => [...queryKeys.complaints.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.complaints.lists(), params ?? {}] as const,
    detail: (id: string) => [...queryKeys.complaints.all, 'detail', id] as const,
    myComplaints: () => [...queryKeys.complaints.all, 'my-complaints'] as const,
  },
  advising: {
    all: ['advising'] as const,
    cases: (params?: Record<string, unknown>) =>
      [...queryKeys.advising.all, 'cases', params ?? {}] as const,
    caseDetail: (id: string) =>
      [...queryKeys.advising.all, 'case', id] as const,
    studentAdvising: () => [...queryKeys.advising.all, 'student'] as const,
    recommendations: (caseId?: string) =>
      [...queryKeys.advising.all, 'recommendations', caseId] as const,
  },
  registrations: {
    all: ['registrations'] as const,
    lists: () => [...queryKeys.registrations.all, 'list'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.registrations.lists(), params ?? {}] as const,
    terms: () => [...queryKeys.registrations.all, 'terms'] as const,
    gpaRules: () => [...queryKeys.registrations.all, 'gpa-rules'] as const,
    eligibility: () => [...queryKeys.registrations.all, 'eligibility'] as const,
  },
  faqs: {
    all: ['faqs'] as const,
    list: (params?: Record<string, unknown>) =>
      [...queryKeys.faqs.all, 'list', params ?? {}] as const,
  },
  aiChat: {
    all: ['ai-chat'] as const,
    sessions: () => [...queryKeys.aiChat.all, 'sessions'] as const,
    history: (sessionId: string) =>
      [...queryKeys.aiChat.all, 'history', sessionId] as const,
  },
  notifications: {
    adminList: ['notifications', 'admin-list'] as const,
    studentList: ['notifications', 'student-list'] as const,
  },
};
