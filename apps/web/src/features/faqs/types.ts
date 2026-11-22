export interface FaqEntry {
  _id: string;
  question: string;
  answer: string;
  topics: string[];
  keywords: string[];
  isActive: boolean;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SeedDefaultsResult {
  inserted: number;
  skipped: number;
  total: number;
}

export interface FaqTopicPreset {
  id: string;
  ar: string;
  en: string;
}

export const FAQ_TOPIC_PRESETS: FaqTopicPreset[] = [
  { id: 'exams', ar: 'الامتحانات', en: 'exams' },
  { id: 'results', ar: 'النتائج', en: 'results' },
  { id: 'academicEmail', ar: 'البريد الأكاديمي', en: 'academic email' },
  { id: 'attendance', ar: 'الحضور', en: 'attendance' },
  { id: 'complaints', ar: 'الشكاوى', en: 'complaints' },
  { id: 'accountCourses', ar: 'الحساب والمقررات', en: 'account & courses' },
];

export function isArabicFaqText(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

export function formatTopicDisplay(topic: string, ar: boolean): string {
  const normalized = topic.trim().toLowerCase();
  const preset = FAQ_TOPIC_PRESETS.find(
    (item) =>
      item.ar.toLowerCase() === normalized ||
      item.en.toLowerCase() === normalized,
  );
  if (preset) {
    return ar ? preset.ar : capitalizeWords(preset.en);
  }
  return ar ? topic : capitalizeWords(topic);
}

function capitalizeWords(value: string): string {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
