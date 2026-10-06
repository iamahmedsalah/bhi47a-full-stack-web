'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Bell,
  Calendar,
  BookOpenCheck,
  Award,
  ClipboardList,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  Trash2,
  Share2,
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { StudentNotification } from '@/lib/features/notifications';
import { cn } from '@/lib/cn';

interface NotificationDetailsDialogProps {
  notification: StudentNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: (id: string) => void;
  isDeleting?: boolean;
}

export function NotificationDetailsDialog({
  notification,
  open,
  onOpenChange,
  onDelete,
  isDeleting,
}: NotificationDetailsDialogProps) {
  const router = useRouter();
  const params = useParams();
  const locale = (params?.locale as string) || 'ar';
  const isAr = locale === 'ar';

  const metaType = notification?.meta?.type;

  // Memoize category details and icon
  const category = React.useMemo(() => {
    switch (metaType) {
      case 'quiz':
      case 'quiz_publish':
        return {
          label: isAr ? 'اختبار أكاديمي متاح' : 'Course Quiz Available',
          icon: <BookOpenCheck className="h-6 w-6 text-purple-400" />,
          badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
          actionUrl: `/${locale}/dashboard/quizzes`,
          actionLabel: isAr ? 'الذهاب للاختبار الأكاديمي' : 'Go to Course Quizzes',
        };
      case 'grade_publish':
      case 'grade':
        return {
          label: isAr ? 'اعتماد الدرجات والنتائج' : 'Grades & Results Published',
          icon: <Award className="h-6 w-6 text-amber-400" />,
          badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
          actionUrl: `/${locale}/dashboard/results`,
          actionLabel: isAr ? 'عرض بيان الدرجات والمعدل' : 'View Academic Transcript',
        };
      case 'attendance_publish':
      case 'attendance':
        return {
          label: isAr ? 'تنبيه الحضور والغياب' : 'Attendance Log Alert',
          icon: <ClipboardList className="h-6 w-6 text-emerald-400" />,
          badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          actionUrl: `/${locale}/dashboard/attendance`,
          actionLabel: isAr ? 'عرض سجل الحضور' : 'View Attendance Record',
        };
      case 'complaint_reply':
      case 'complaint_status':
        return {
          label: isAr ? 'تحديث بشأن الشكوى' : 'Complaint Support Update',
          icon: <MessageCircle className="h-6 w-6 text-blue-400" />,
          badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
          actionUrl: `/${locale}/dashboard/complaints${
            notification?.meta?.ticketNumber ? `?ticket=${notification.meta.ticketNumber}` : ''
          }`,
          actionLabel: isAr ? 'متابعة الشكوى والرد' : 'View Ticket & Reply',
        };
      case 'exam_schedule_publish':
        return {
          label: isAr ? 'جدول الامتحانات الرسمية' : 'Official Exam Schedule',
          icon: <Calendar className="h-6 w-6 text-teal-400" />,
          badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
          actionUrl: `/${locale}/dashboard/exam-schedule`,
          actionLabel: isAr ? 'عرض جدول الامتحانات والقاعات' : 'View Exam Schedule & Halls',
        };
      default:
        return {
          label: isAr ? 'تنبيه أكاديمي رسمي' : 'Official Academic Notice',
          icon: <Bell className="h-6 w-6 text-teal-400" />,
          badgeClass: 'bg-teal-500/15 text-teal-300 border-teal-500/30',
          actionUrl: null,
          actionLabel: null,
        };
    }
  }, [metaType, isAr, locale, notification?.meta?.ticketNumber]);

  // Memoize extracted localized title and body
  const titleText = React.useMemo(() => {
    if (!notification) return '';
    return isAr
      ? notification.meta?.titleAr ||
        (notification.title?.includes(' | ') ? notification.title.split(' | ')[0].trim() : notification.title)
      : notification.meta?.titleEn ||
        (notification.title?.includes(' | ') ? notification.title.split(' | ')[1].trim() : notification.title);
  }, [isAr, notification]);

  const bodyText = React.useMemo(() => {
    if (!notification) return '';
    return isAr
      ? notification.meta?.bodyAr ||
        (notification.body?.includes('\n') ? notification.body.split('\n')[0].trim() : notification.body)
      : notification.meta?.bodyEn ||
        (notification.body?.includes('\n') ? notification.body.split('\n')[1].trim() : notification.body);
  }, [isAr, notification]);

  const handleActionClick = () => {
    if (category.actionUrl) {
      onOpenChange(false);
      router.push(category.actionUrl);
    }
  };

  // Memoize expensive Intl.DateTimeFormat to avoid re-calculating on every tick/re-render
  const formattedDate = React.useMemo(() => {
    if (!notification?.createdAt) return '';
    try {
      return new Date(notification.createdAt).toLocaleString(
        isAr ? 'ar-EG' : 'en-US',
        {
          timeZone: 'Africa/Cairo',
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      );
    } catch {
      return String(notification.createdAt);
    }
  }, [notification?.createdAt, isAr]);

  if (!notification) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[92vw] max-w-lg sm:max-w-xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#071d24]/95 backdrop-blur-xl p-5 sm:p-7 shadow-2xl text-start"
        dir={isAr ? 'rtl' : 'ltr'}
      >
        <DialogHeader className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-white/5 border border-white/10 shadow-inner shrink-0">
                {category.icon}
              </div>
              <div className="min-w-0">
                <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border', category.badgeClass)}>
                  {category.label}
                </span>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1 font-mono">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <bdi>{formattedDate}</bdi>
                </p>
              </div>
            </div>
          </div>

          <DialogTitle className="text-base sm:text-xl font-extrabold text-foreground leading-snug pt-1">
            <bdi>{titleText}</bdi>
          </DialogTitle>
        </DialogHeader>

        {/* Notification Main Content Body */}
        <div className="my-4 rounded-xl bg-card/60 border border-white/5 p-4 sm:p-5 text-start">
          <div className="whitespace-pre-wrap text-sm sm:text-base leading-relaxed text-foreground/90 font-normal">
            <bdi>{bodyText}</bdi>
          </div>

          {/* Metadata Chips if present */}
          {(notification.meta?.courseCode || notification.meta?.ticketNumber || notification.meta?.examType) && (
            <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap gap-2 text-xs">
              {notification.meta?.courseCode && (
                <span className="px-2.5 py-1 rounded-squircle bg-primary/10 border border-primary/20 text-primary font-mono font-semibold" dir="ltr">
                  <bdi>Course: {notification.meta.courseCode}</bdi>
                </span>
              )}
              {notification.meta?.ticketNumber && (
                <span className="px-2.5 py-1 rounded-squircle bg-blue-500/10 border border-blue-500/20 text-blue-300 font-mono font-semibold" dir="ltr">
                  <bdi>Ticket #{notification.meta.ticketNumber}</bdi>
                </span>
              )}
              {notification.meta?.examType && (
                <span className="px-2.5 py-1 rounded-squircle bg-teal-500/10 border border-teal-500/20 text-teal-300 font-semibold">
                  <bdi>{notification.meta.examType}</bdi>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <DialogFooter className="flex flex-col-reverse sm:flex-row items-center gap-2 pt-2 rtl:sm:justify-start">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto rounded-squircle border-white/15 bg-white/5 hover:bg-white/10 text-foreground text-xs font-semibold cursor-pointer"
          >
            {isAr ? 'إغلاق' : 'Close'}
          </Button>

          {onDelete && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                onDelete(notification._id);
                onOpenChange(false);
              }}
              disabled={isDeleting}
              className="w-full sm:w-auto rounded-squircle bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5 me-1" />
              <span>{isAr ? 'حذف الإشعار' : 'Delete Notification'}</span>
            </Button>
          )}

          {category.actionUrl && (
            <Button
              type="button"
              onClick={handleActionClick}
              className="w-full sm:w-auto rounded-squircle bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
            >
              <span>{category.actionLabel}</span>
              <ExternalLink className="h-3.5 w-3.5 rtl:rotate-180" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
