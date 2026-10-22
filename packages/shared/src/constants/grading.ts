export interface GradeScaleItem {
  letter: string;
  letterGrade?: string;
  minPercentage: number;
  maxPercentage: number;
  points: number;
  nameAr: string;
  nameEn: string;
}

export const GRADE_SCALE: GradeScaleItem[] = [
  { letter: 'A+', minPercentage: 90, maxPercentage: 100, points: 4.0, nameAr: 'امتياز مرتفع', nameEn: 'Excellent Plus' },
  { letter: 'A',  minPercentage: 85, maxPercentage: 89.99, points: 3.7, nameAr: 'امتياز', nameEn: 'Excellent' },
  { letter: 'B+', minPercentage: 80, maxPercentage: 84.99, points: 3.3, nameAr: 'جيد جداً مرتفع', nameEn: 'Very Good Plus' },
  { letter: 'B',  minPercentage: 75, maxPercentage: 79.99, points: 3.0, nameAr: 'جيد جداً', nameEn: 'Very Good' },
  { letter: 'C+', minPercentage: 70, maxPercentage: 74.99, points: 2.7, nameAr: 'جيد مرتفع', nameEn: 'Good Plus' },
  { letter: 'C',  minPercentage: 65, maxPercentage: 69.99, points: 2.4, nameAr: 'جيد', nameEn: 'Good' },
  { letter: 'D+', minPercentage: 60, maxPercentage: 64.99, points: 2.3, nameAr: 'مقبول مرتفع', nameEn: 'Pass Plus' },
  { letter: 'D',  minPercentage: 50, maxPercentage: 59.99, points: 2.0, nameAr: 'مقبول', nameEn: 'Pass' },
  { letter: 'F',  minPercentage: 0,  maxPercentage: 49.99, points: 0.0, nameAr: 'راسب', nameEn: 'Fail' },
];

export function calculateGradeScale(
  percentage: number,
  status?: string,
): GradeScaleItem & { isPass: boolean } {
  const normStatus = (status || '').toLowerCase().trim();
  if (normStatus === 'absent' || normStatus === 'غائب') {
    return {
      letter: 'F',
      minPercentage: 0,
      maxPercentage: 0,
      points: 0,
      nameAr: 'غائب',
      nameEn: 'Absent',
      isPass: false,
    };
  }
  if (normStatus === 'banned' || normStatus === 'محروم' || normStatus === 'محجوب') {
    return {
      letter: 'F',
      minPercentage: 0,
      maxPercentage: 0,
      points: 0,
      nameAr: 'محروم',
      nameEn: 'Banned',
      isPass: false,
    };
  }
  const pct = Math.max(0, Math.min(100, Math.round(percentage * 100) / 100));
  for (const item of GRADE_SCALE) {
    if (pct >= item.minPercentage) {
      return { ...item, letterGrade: item.letter, isPass: item.points > 0 };
    }
  }
  const last = GRADE_SCALE[GRADE_SCALE.length - 1];
  return { ...last, letterGrade: last.letter, isPass: false };
}
