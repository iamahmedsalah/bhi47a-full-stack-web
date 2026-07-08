'use client';

import React from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardList,
  BookOpenCheck,
  FileText,
  Award,
  Mail,
  Calendar,
  MapPin,
  MessageCircle,
  User,
  ArrowUpRight,
} from 'lucide-react';

interface PortalCardProps {
  title: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

function PortalCard({ title, href, icon, description, color }: PortalCardProps) {
  return (
    <Link
      href={href}
      className="group card-glow bg-card rounded-2xl p-6 border border-border hover:border-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 block"
    >
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
          style={{ backgroundColor: `${color}15`, color }}
        >
          {icon}
        </div>
        <ArrowUpRight className="w-4 h-4 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <h3 className="text-foreground font-semibold text-base mb-1">{title}</h3>
      <p className="text-muted text-sm">{description}</p>
    </Link>
  );
}

export default function StudentDashboard() {
  const t = useTranslations('studentPortal');
  const tCommon = useTranslations('common');
  const params = useParams();
  const locale = params.locale as string;

  const portalCards = [
    {
      key: 'profile',
      icon: <User className="w-6 h-6" />,
      color: '#0d9488',
      descAr: 'عرض وتعديل بياناتك الشخصية',
      descEn: 'View and edit your personal info',
    },
    {
      key: 'attendance',
      icon: <ClipboardList className="w-6 h-6" />,
      color: '#22d3ee',
      descAr: 'نسبة الحضور والغياب',
      descEn: 'Attendance percentage',
    },
    {
      key: 'registration',
      icon: <BookOpenCheck className="w-6 h-6" />,
      color: '#14b8a6',
      descAr: 'تسجيل المواد وطلب الإرشاد الأكاديمي',
      descEn: 'Register courses and track advising',
    },
    {
      key: 'quizzes',
      icon: <FileText className="w-6 h-6" />,
      color: '#f59e0b',
      descAr: 'درجات الكويزات لجميع المواد',
      descEn: 'Quiz grades for all courses',
    },
    {
      key: 'results',
      icon: <Award className="w-6 h-6" />,
      color: '#8b5cf6',
      descAr: 'نتائج أعمال السنة والنهائي',
      descEn: 'Midterm and final results',
    },
    {
      key: 'academicEmail',
      icon: <Mail className="w-6 h-6" />,
      color: '#ec4899',
      descAr: 'البريد الأكاديمي الخاص بك',
      descEn: 'Your academic email',
    },
    {
      key: 'examSchedule',
      icon: <Calendar className="w-6 h-6" />,
      color: '#10b981',
      descAr: 'جداول امتحانات نصف العام والنهائي',
      descEn: 'Midterm and final exam schedules',
    },
    {
      key: 'examPlace',
      icon: <MapPin className="w-6 h-6" />,
      color: '#f43f5e',
      descAr: 'مكان ولجنة الامتحان',
      descEn: 'Exam committee and location',
    },
    {
      key: 'complaints',
      icon: <MessageCircle className="w-6 h-6" />,
      color: '#6366f1',
      descAr: 'تقديم شكوى أو الاستعلام عن تذكرة',
      descEn: 'Submit or inquire about a ticket',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-primary/10 via-accent/5 to-transparent rounded-2xl p-8 border border-border">
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {tCommon('welcome')} 👋
        </h2>
        <p className="text-muted">
          {locale === 'ar'
            ? 'تصفح خدماتك الأكاديمية من هنا'
            : 'Browse your academic services here'}
        </p>
      </div>

      {/* Portal Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {portalCards.map((card) => (
          <PortalCard
            key={card.key}
            title={
              card.key === 'registration'
                ? locale === 'ar'
                  ? 'تسجيل المواد'
                  : 'Registration'
                : t(card.key)
            }
            href={`/${locale}/dashboard/${card.key === 'profile' ? 'profile' : card.key === 'attendance' ? 'attendance' : card.key === 'registration' ? 'registration' : card.key === 'quizzes' ? 'quizzes' : card.key === 'results' ? 'results' : card.key === 'academicEmail' ? 'academic-email' : card.key === 'examSchedule' ? 'exam-schedule' : card.key === 'examPlace' ? 'exam-place' : 'complaints'}`}
            icon={card.icon}
            description={locale === 'ar' ? card.descAr : card.descEn}
            color={card.color}
          />
        ))}
      </div>
    </div>
  );
}
