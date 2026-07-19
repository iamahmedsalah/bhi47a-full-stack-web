'use client';

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { COURSE_LEVEL_VALUES, ENROLLMENT_STATUS_VALUES } from '@student-portal/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { studentFormSchema, type StudentFormValues } from '../schema';

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  onSubmit: (values: StudentFormValues) => Promise<void>;
  isSubmitting: boolean;
  defaultValues?: Partial<StudentFormValues>;
}

export function StudentFormDialog({
  open,
  onOpenChange,
  isEditing,
  onSubmit,
  isSubmitting,
  defaultValues,
}: StudentFormDialogProps) {
  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      fullName: defaultValues?.fullName ?? '',
      studentCode: defaultValues?.studentCode ?? '',
      nationalId: defaultValues?.nationalId ?? '',
      academicEmail: defaultValues?.academicEmail ?? '',
      department: defaultValues?.department ?? '',
      level: defaultValues?.level ?? '1',
      group: defaultValues?.group ?? '',
      section: defaultValues?.section ?? '',
      academicYear: defaultValues?.academicYear ?? '2024-2025',
      semester: defaultValues?.semester ?? 'first',
      seatNumber: defaultValues?.seatNumber ?? '',
      examRoom: defaultValues?.examRoom ?? '',
      examFloor: defaultValues?.examFloor ?? '',
      examBuilding: defaultValues?.examBuilding ?? '',
      enrollmentStatus: defaultValues?.enrollmentStatus ?? 'active',
      mustChangePassword: defaultValues?.mustChangePassword ?? false,
    },
  });

  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'تعديل بيانات الطالب' : 'إضافة طالب جديد'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'قم بتعديل بيانات الطالب الحالية ثم اضغط حفظ'
              : 'أدخل بيانات الطالب الجدد لإضافته للنظام'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold mb-1 block">الاسم بالكامل *</label>
              <Input {...form.register('fullName')} placeholder="أحمد محمد علي" />
              {form.formState.errors.fullName && (
                <p className="text-xs text-danger mt-1">{form.formState.errors.fullName.message}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">كود الطالب *</label>
              <Input {...form.register('studentCode')} placeholder="2024001" disabled={isEditing} />
              {form.formState.errors.studentCode && (
                <p className="text-xs text-danger mt-1">{form.formState.errors.studentCode.message}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">الرقم القومي *</label>
              <Input {...form.register('nationalId')} placeholder="30101010101010" />
              {form.formState.errors.nationalId && (
                <p className="text-xs text-danger mt-1">{form.formState.errors.nationalId.message}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">البريد الأكاديمي</label>
              <Input {...form.register('academicEmail')} placeholder="student@institute.edu.eg" />
              {form.formState.errors.academicEmail && (
                <p className="text-xs text-danger mt-1">{form.formState.errors.academicEmail.message}</p>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">المستوى *</label>
              <Select
                value={form.watch('level')}
                onValueChange={(val) => form.setValue('level', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر المستوى" />
                </SelectTrigger>
                <SelectContent>
                  {COURSE_LEVEL_VALUES.map((lvl) => (
                    <SelectItem key={lvl} value={lvl}>
                      المستوى {lvl}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">حالة القيد *</label>
              <Select
                value={form.watch('enrollmentStatus')}
                onValueChange={(val) => form.setValue('enrollmentStatus', val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="اختر الحالة" />
                </SelectTrigger>
                <SelectContent>
                  {ENROLLMENT_STATUS_VALUES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {st}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">القسم</label>
              <Input {...form.register('department')} placeholder="نظم معلومات الأعمال" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">المجموعة</label>
              <Input {...form.register('group')} placeholder="G1" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">رقم الجلوس</label>
              <Input {...form.register('seatNumber')} placeholder="1052" />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block">القاعة</label>
              <Input {...form.register('examRoom')} placeholder="Hall A" />
            </div>
          </div>
          <DialogFooter className="pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'جاري الحفظ...' : isEditing ? 'حفظ التعديلات' : 'إضافة الطالب'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
