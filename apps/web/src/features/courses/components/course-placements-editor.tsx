'use client';

import { useTranslations } from 'next-intl';
import { COURSE_LEVEL_VALUES, COURSE_TYPES, CURRICULUM_DEPARTMENTS, SEMESTER_VALUES, type CourseCurriculum } from '@student-portal/shared';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function CoursePlacementsEditor({ value, onChange, locale }: {
  value: CourseCurriculum[]; onChange: (value: CourseCurriculum[]) => void; locale: string;
}) {
  const t = useTranslations('courses.placements');
  const update = (index: number, field: keyof CourseCurriculum, next: string) =>
    onChange(value.map((item, row) => row === index ? { ...item, [field]: next } : item));
  return <fieldset className="space-y-3 rounded-xl border border-border p-3">
    <legend className="px-1 text-sm font-semibold">{t('title')}</legend>
    <p className="text-xs text-muted-foreground">{t('help')}</p>
    {value.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-5">
      {([
        ['department', CURRICULUM_DEPARTMENTS], ['academicLevel', COURSE_LEVEL_VALUES],
        ['semester', SEMESTER_VALUES], ['type', COURSE_TYPES],
      ] as const).map(([field, options]) => <label key={field} className="space-y-1 text-xs">
        <span>{t(field)}</span>
        <Select value={item[field]} onValueChange={(next) => update(index, field, next)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent dir={locale === 'ar' ? 'rtl' : 'ltr'}>
            {options.map((option) => <SelectItem key={option} value={option} disabled={field === 'department' && value.some((other, row) => row !== index && other.department === option)}>{t(`values.${option}`)}</SelectItem>)}
          </SelectContent>
        </Select>
      </label>)}
      <Button type="button" variant="outline" className="self-end" onClick={() => onChange(value.filter((_, row) => row !== index))}>{t('remove')}</Button>
    </div>)}
    <Button type="button" variant="outline" disabled={value.length >= 3} onClick={() => {
      const department = CURRICULUM_DEPARTMENTS.find((dept) => !value.some((item) => item.department === dept));
      if (department) onChange([...value, { department, academicLevel: '3', semester: 'first', type: 'required' }]);
    }}>{t('add')}</Button>
  </fieldset>;
}
