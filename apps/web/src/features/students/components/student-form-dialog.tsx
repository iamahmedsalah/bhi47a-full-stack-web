'use client';

import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  User,
  GraduationCap,
  Building2,
  Lock,
  Mail,
  Phone,
  CreditCard,
  Hash,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createStudentFormSchema, type StudentFormValues } from '../schema';
import { useTranslations } from 'next-intl';
import { getStudentFullName } from '../student-name';

interface StudentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  onSubmit: (values: StudentFormValues) => Promise<void>;
  isSubmitting: boolean;
  defaultValues?: Partial<StudentFormValues>;
  locale?: string;
}

const ENROLLMENT_STATUS_OPTIONS = [
  { value: 'active', ar: 'منتظم (نشط)', en: 'Active' },
  { value: 'inactive', ar: 'غير نشط', en: 'Inactive' },
  { value: 'graduated', ar: 'خريج', en: 'Graduated' },
  { value: 'suspended', ar: 'موقوف قيده', en: 'Suspended' },
  { value: 'withdrawn', ar: 'منسحب', en: 'Withdrawn' },
];

const LEVEL_OPTIONS = [
  { value: '1', ar: 'المستوى الأول (السنة الأولى)', en: 'Level 1 (Freshman)' },
  { value: '2', ar: 'المستوى الثاني (السنة الثانية)', en: 'Level 2 (Sophomore)' },
  { value: '3', ar: 'المستوى الثالث (السنة الثالثة)', en: 'Level 3 (Junior)' },
  { value: '4', ar: 'المستوى الرابع (سنة التخرج)', en: 'Level 4 (Senior)' },
];

const SEMESTER_OPTIONS = [
  { value: 'first', ar: 'الفصل الدراسي الأول (خريف)', en: 'First Semester (Fall)' },
  { value: 'second', ar: 'الفصل الدراسي الثاني (ربيع)', en: 'Second Semester (Spring)' },
  { value: 'summer', ar: 'الفصل الصيفي', en: 'Summer Term' },
];

const DEPARTMENT_PRESETS = [
  { value: 'BIS', ar: 'نظم معلومات الأعمال (BIS)', en: 'Business Information Systems (BIS)' },
  { value: 'ACCOUNTING', ar: 'المحاسبة والمراجعة (Accounting)', en: 'Accounting & Auditing' },
  { value: 'GENERAL', ar: 'الشعبة العامة (General)', en: 'General' },
];

export function StudentFormDialog({
  open,
  onOpenChange,
  isEditing,
  onSubmit,
  isSubmitting,
  defaultValues,
  locale = 'ar',
}: StudentFormDialogProps) {
  const isAr = locale === 'ar';
  const validation = useTranslations('students.formValidation');
  const [activeTab, setActiveTab] = useState<'identity' | 'academic' | 'exams'>('identity');

  const form = useForm<StudentFormValues>({
    resolver: zodResolver(createStudentFormSchema(validation)),
    defaultValues: {
      fullName: '',
      fullNameAr: '',
      fullNameEn: '',
      studentCode: '',
      nationalId: '',
      phone: '',
      academicEmail: '',
      department: '',
      level: '1',
      group: '',
      section: '',
      academicYear: '2024-2025',
      semester: 'first',
      seatNumber: '',
      examRoom: '',
      examFloor: '',
      examBuilding: '',
      enrollmentStatus: 'active',
      mustChangePassword: false,
    },
  });

  // Always reset & populate values when opened or defaultValues changes to prevent stale states
  useEffect(() => {
    if (open) {
      setActiveTab('identity');
      const resolvedAr =
        defaultValues?.fullNameAr ||
        (defaultValues?.fullName && /[\u0600-\u06FF]/.test(defaultValues.fullName)
          ? defaultValues.fullName
          : '');
      const resolvedEn =
        defaultValues?.fullNameEn ||
        (defaultValues?.fullName && !/[\u0600-\u06FF]/.test(defaultValues.fullName)
          ? defaultValues.fullName
          : '');

      form.reset({
        fullName: defaultValues?.fullName ?? '',
        fullNameAr: resolvedAr,
        fullNameEn: resolvedEn,
        studentCode: defaultValues?.studentCode ?? '',
        nationalId: '', // Kept empty in edit so admin only types if changing
        phone: defaultValues?.phone ?? '',
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
      });
    }
  }, [open, defaultValues, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    const finalFullName = getStudentFullName(values);

    await onSubmit({
      ...values,
      fullName: finalFullName,
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-2xl border-white/15 bg-card/95 backdrop-blur-md p-0 shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-white/10 shrink-0 text-start">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-squircle bg-primary/15 text-primary border border-primary/25">
              <User className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                {isEditing
                  ? isAr
                    ? 'تعديل بيانات الطالب'
                    : 'Edit Student Profile'
                  : isAr
                    ? 'إضافة طالب جديد'
                    : 'Add New Student'}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {isEditing
                  ? isAr
                    ? 'قم بتحديث الاسم المزدوج (عربي/إنجليزي)، الهوية، والبيانات الأكاديمية للطالب'
                    : 'Update bilingual names, identity, and academic placement for this student'
                  : isAr
                    ? 'أدخل بيانات الطالب باللغتين العربية والإنجليزية لإنشاء حسابه الأكاديمي'
                    : 'Enter student information in Arabic and English to create their profile'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          {!isEditing && <p className="mx-6 mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-6 text-muted-foreground">{validation('admissionGuidance')}</p>}
          <Tabs
            value={activeTab}
            onValueChange={(val) => setActiveTab(val as 'identity' | 'academic' | 'exams')}
            className="flex-1 flex flex-col"
          >
            <div className="px-6 pt-3 shrink-0 border-b border-white/10 bg-secondary/20">
              <TabsList className="grid grid-cols-3 h-10 w-full max-w-lg bg-surface/50 p-1 rounded-squircle">
                <TabsTrigger
                  value="identity"
                  className="rounded-squircle text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary-light"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>{isAr ? 'الهوية والاسم' : 'Identity'}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="academic"
                  className="rounded-squircle text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary-light"
                >
                  <GraduationCap className="h-3.5 w-3.5" />
                  <span>{isAr ? 'القيد الأكاديمي' : 'Academic'}</span>
                </TabsTrigger>
                <TabsTrigger
                  value="exams"
                  className="rounded-squircle text-xs font-semibold gap-1.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary-light"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'الامتحانات والجلوس' : 'Exams'}</span>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6 flex-1 space-y-5">
              {/* Tab 1: Identity & Bilingual Names */}
              <TabsContent value="identity" className="mt-0 space-y-4">
                <div className="rounded-xl border border-white/10 bg-surface/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary-light">
                    <User className="h-4 w-4" />
                    <span>{isAr ? 'الاسم باللغتين (Bilingual Names)' : 'Student Name (Arabic & English)'}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Arabic Name */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'الاسم باللغة العربية' : 'Name in Arabic'}{' '}
                        <span className="text-primary">*</span>
                      </label>
                      <Input
                        {...form.register('fullNameAr')}
                        dir="rtl"
                        placeholder="مثال: محمود خالد إبراهيم"
                        className="rounded-squircle text-sm border-white/15 bg-background/60 focus:border-primary"
                      />
                      {form.formState.errors.fullNameAr && (
                        <p className="text-xs text-danger mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>{form.formState.errors.fullNameAr.message}</span>
                        </p>
                      )}
                    </div>

                    {/* English Name */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'الاسم باللغة الإنجليزية' : 'Name in English'}
                      </label>
                      <Input
                        {...form.register('fullNameEn')}
                        dir="ltr"
                        placeholder="e.g. Mahmoud Khaled Ibrahim"
                        className="rounded-squircle text-left text-sm border-white/15 bg-background/60 focus:border-primary"
                      />
                      {form.formState.errors.fullNameEn && (
                        <p className="text-xs text-danger mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>{form.formState.errors.fullNameEn.message}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-surface/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary-light">
                    <CreditCard className="h-4 w-4" />
                    <span>{isAr ? 'بيانات الاعتماد والتواصل' : 'Credentials & Contact'}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Student Code */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-semibold block text-foreground">
                          {isAr ? 'كود الطالب' : 'Student Code'}{' '}
                          <span className="text-primary">*</span>
                        </label>
                        {isEditing && (
                          <span className="inline-flex items-center gap-1 rounded-squircle bg-surface/80 border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground font-mono">
                            <Lock className="h-2.5 w-2.5" />
                            {isAr ? 'مغلق (كود ثابت)' : 'Locked'}
                          </span>
                        )}
                      </div>
                      <Input
                        {...form.register('studentCode')}
                        dir="ltr"
                        disabled={isEditing}
                        placeholder="2024001"
                        className="rounded-squircle text-left font-mono text-sm border-white/15 bg-background/60 disabled:opacity-75 disabled:cursor-not-allowed"
                      />
                      {form.formState.errors.studentCode && (
                        <p className="text-xs text-danger mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>{form.formState.errors.studentCode.message}</span>
                        </p>
                      )}
                    </div>

                    {/* National ID */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'الرقم القومي (14 رقماً)' : 'National ID (14 digits)'}{' '}
                        {!isEditing && <span className="text-primary">*</span>}
                      </label>
                      <Input
                        {...form.register('nationalId')}
                        dir="ltr"
                        placeholder={
                          isEditing
                            ? isAr
                              ? 'اتركه فارغاً للإبقاء على الرقم الحالي'
                              : 'Leave blank to retain current'
                            : '30101010000301'
                        }
                        className="rounded-squircle text-left font-mono text-sm border-white/15 bg-background/60 focus:border-primary"
                      />
                      {form.formState.errors.nationalId && (
                        <p className="text-xs text-danger mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>{form.formState.errors.nationalId.message}</span>
                        </p>
                      )}
                    </div>

                    {/* Academic Email */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'البريد الأكاديمي' : 'Academic Email'}
                      </label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          {...form.register('academicEmail')}
                          dir="ltr"
                          placeholder="student@institute.edu.eg"
                          className="ps-9 rounded-squircle text-left font-mono text-sm border-white/15 bg-background/60 focus:border-primary"
                        />
                      </div>
                      {form.formState.errors.academicEmail && (
                        <p className="text-xs text-danger mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>{form.formState.errors.academicEmail.message}</span>
                        </p>
                      )}
                    </div>

                    {/* Phone Number */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'رقم الهاتف المحمول' : 'Mobile Phone'}
                      </label>
                      <div className="relative">
                        <Phone className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          {...form.register('phone')}
                          dir="ltr"
                          placeholder="01012345678"
                          className="ps-9 rounded-squircle text-left font-mono text-sm border-white/15 bg-background/60 focus:border-primary"
                        />
                      </div>
                      {form.formState.errors.phone && (
                        <p className="text-xs text-danger mt-1 flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          <span>{form.formState.errors.phone.message}</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Academic Placement */}
              <TabsContent value="academic" className="mt-0 space-y-4">
                <div className="rounded-xl border border-white/10 bg-surface/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary-light">
                    <GraduationCap className="h-4 w-4" />
                    <span>{isAr ? 'المستوى والشعبة والقيد' : 'Level, Track & Enrollment'}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Academic Level */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'المستوى الدراسي' : 'Academic Level'}{' '}
                        <span className="text-primary">*</span>
                      </label>
                      <Select
                        value={form.watch('level')}
                        onValueChange={(val) => form.setValue('level', val)}
                      >
                        <SelectTrigger className="rounded-squircle border-white/15 bg-background/60 text-sm">
                          <SelectValue placeholder={isAr ? 'اختر المستوى' : 'Select Level'} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-white/15 bg-card/95">
                          {LEVEL_OPTIONS.map((lvl) => (
                            <SelectItem key={lvl.value} value={lvl.value}>
                              {isAr ? lvl.ar : lvl.en}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.level && (
                        <p className="text-xs text-danger mt-1">{form.formState.errors.level.message}</p>
                      )}
                    </div>

                    {/* Enrollment Status */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'حالة القيد' : 'Enrollment Status'}{' '}
                        <span className="text-primary">*</span>
                      </label>
                      <Select
                        value={form.watch('enrollmentStatus')}
                        onValueChange={(val) => form.setValue('enrollmentStatus', val)}
                      >
                        <SelectTrigger className="rounded-squircle border-white/15 bg-background/60 text-sm">
                          <SelectValue placeholder={isAr ? 'اختر الحالة' : 'Select Status'} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-white/15 bg-card/95">
                          {ENROLLMENT_STATUS_OPTIONS.map((st) => (
                            <SelectItem key={st.value} value={st.value}>
                              <div className="flex items-center gap-2">
                                <span
                                  className={`h-2 w-2 rounded-full ${
                                    st.value === 'active'
                                      ? 'bg-emerald-400'
                                      : st.value === 'suspended'
                                        ? 'bg-rose-500'
                                        : 'bg-amber-400'
                                  }`}
                                />
                                <span>{isAr ? st.ar : st.en}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.enrollmentStatus && (
                        <p className="text-xs text-danger mt-1">{form.formState.errors.enrollmentStatus.message}</p>
                      )}
                    </div>

                    {/* Department / Track */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'القسم / الشعبة' : 'Department / Track'}
                      </label>
                      <div className="space-y-1.5">
                        <Input
                          {...form.register('department')}
                          placeholder={isAr ? 'مثال: نظم معلومات الأعمال' : 'e.g. Business Information Systems'}
                          className="rounded-squircle text-sm border-white/15 bg-background/60 focus:border-primary"
                        />
                        {/* Quick Presets */}
                        <div className="flex flex-wrap gap-1.5">
                          {DEPARTMENT_PRESETS.map((dept) => (
                            <button
                              key={dept.value}
                              type="button"
                              onClick={() => form.setValue('department', dept.value)}
                              className="rounded-squircle border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-primary/20 hover:text-primary-light transition-colors"
                            >
                              {isAr ? dept.ar : dept.en}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Academic Year */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'العام الأكاديمي' : 'Academic Year'}{' '}
                        <span className="text-primary">*</span>
                      </label>
                      <Input
                        {...form.register('academicYear')}
                        dir="ltr"
                        placeholder="2024-2025"
                        className="rounded-squircle text-left font-mono text-sm border-white/15 bg-background/60 focus:border-primary"
                      />
                      {form.formState.errors.academicYear && (
                        <p className="text-xs text-danger mt-1">{form.formState.errors.academicYear.message}</p>
                      )}
                    </div>

                    {/* Semester */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'الفصل الدراسي' : 'Semester'}{' '}
                        <span className="text-primary">*</span>
                      </label>
                      <Select
                        value={form.watch('semester')}
                        onValueChange={(val) => form.setValue('semester', val)}
                      >
                        <SelectTrigger className="rounded-squircle border-white/15 bg-background/60 text-sm">
                          <SelectValue placeholder={isAr ? 'اختر الفصل' : 'Select Semester'} />
                        </SelectTrigger>
                        <SelectContent className="rounded-xl border-white/15 bg-card/95">
                          {SEMESTER_OPTIONS.map((sem) => (
                            <SelectItem key={sem.value} value={sem.value}>
                              {isAr ? sem.ar : sem.en}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Group & Section */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block text-foreground">
                          {isAr ? 'المجموعة' : 'Group'}
                        </label>
                        <Input
                          {...form.register('group')}
                          placeholder="G1 / أ"
                          className="rounded-squircle text-sm border-white/15 bg-background/60"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold mb-1.5 block text-foreground">
                          {isAr ? 'السكشن' : 'Section'}
                        </label>
                        <Input
                          {...form.register('section')}
                          placeholder="S1 / 1"
                          className="rounded-squircle text-sm border-white/15 bg-background/60"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: Exams & Seating */}
              <TabsContent value="exams" className="mt-0 space-y-4">
                <div className="rounded-xl border border-white/10 bg-surface/20 p-4 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-primary-light">
                    <Building2 className="h-4 w-4" />
                    <span>{isAr ? 'أرقام الجلوس ومقرات الاختبارات' : 'Exam Seating & Location'}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Seat Number */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'رقم الجلوس' : 'Seat Number'}
                      </label>
                      <div className="relative">
                        <Hash className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          {...form.register('seatNumber')}
                          dir="ltr"
                          placeholder="1052"
                          className="ps-9 rounded-squircle text-left font-mono text-sm border-white/15 bg-background/60 focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* Exam Room */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'القاعة / لجنة الامتحان' : 'Exam Hall / Room'}
                      </label>
                      <Input
                        {...form.register('examRoom')}
                        placeholder="Hall A / مدرج 1"
                        className="rounded-squircle text-sm border-white/15 bg-background/60 focus:border-primary"
                      />
                    </div>

                    {/* Exam Floor */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'الدور / الطابق' : 'Floor'}
                      </label>
                      <Input
                        {...form.register('examFloor')}
                        placeholder={isAr ? 'الدور الثاني' : '2nd Floor'}
                        className="rounded-squircle text-sm border-white/15 bg-background/60 focus:border-primary"
                      />
                    </div>

                    {/* Exam Building */}
                    <div>
                      <label className="text-xs font-semibold mb-1.5 block text-foreground">
                        {isAr ? 'المبنى التعليمي' : 'Building'}
                      </label>
                      <Input
                        {...form.register('examBuilding')}
                        placeholder={isAr ? 'مبنى الامتحانات الرئيسي' : 'Main Building'}
                        className="rounded-squircle text-sm border-white/15 bg-background/60 focus:border-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* Password Change Flag */}
                <div className="rounded-xl border border-white/10 bg-surface/20 p-4">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...form.register('mustChangePassword')}
                      className="h-4 w-4 rounded border-white/20 bg-background text-primary focus:ring-primary/40"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-foreground block">
                        {isAr
                          ? 'إلزام الطالب بتغيير كلمة المرور عند أول تسجيل دخول'
                          : 'Force password change upon first login'}
                      </span>
                      <span className="text-muted-foreground block text-[11px] mt-0.5">
                        {isAr
                          ? 'يوصى بتفعيله عند إضافة طالب جديد لحماية أمان حسابه'
                          : 'Recommended when adding a new student for credential security'}
                      </span>
                    </div>
                  </label>
                </div>
              </TabsContent>
            </div>
          </Tabs>

          <DialogFooter className="p-4 px-6 border-t border-white/10 bg-surface/30 shrink-0 flex flex-row items-center justify-between sm:justify-between rtl:sm:justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-squircle border-white/15 text-xs px-4"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="rounded-squircle bg-primary hover:bg-primary-hover text-white text-xs font-bold px-6 shadow-lg shadow-primary/20 gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{isAr ? 'جاري الحفظ...' : 'Saving...'}</span>
                </>
              ) : isEditing ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{isAr ? 'حفظ التعديلات' : 'Save Changes'}</span>
                </>
              ) : (
                <>
                  <User className="h-3.5 w-3.5" />
                  <span>{isAr ? 'إضافة الطالب' : 'Add Student'}</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
