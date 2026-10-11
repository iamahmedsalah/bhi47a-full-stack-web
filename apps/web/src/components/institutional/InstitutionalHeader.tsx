'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Menu,
  X,
  Home,
  Info,
  BookOpen,
  Trophy,
  Newspaper,
  CalendarDays,
  Images,
  Download,
  Mail,
  GraduationCap,
  Globe,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { INSTITUTE_INFO } from '@/data/institutional-data';
import { useLanguage } from '@/providers/language-provider';
import { InstitutionalFloatingNav } from './InstitutionalFloatingNav';

interface InstitutionalHeaderProps {
  locale: string;
}

export function InstitutionalHeader({ locale }: InstitutionalHeaderProps) {
  const isAr = locale === 'ar';
  const pathname = usePathname();
  const { setLanguage, isLanguageChanging } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeSection, setActiveSection] = useState('home');

  const handleLanguageToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    const nextLang = isAr ? 'en' : 'ar';
    setLanguage(nextLang);
  };

  useEffect(() => {
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        setScrolled(window.scrollY > 20);
        setShowScrollTop(window.scrollY > 300);
      });
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const isHomePage = pathname === `/${locale}` || pathname === `/${locale}/`;
  useEffect(() => {
    if (!isHomePage) return;
    const sections = ['home', 'about', 'academics', 'activities', 'news', 'events', 'gallery', 'downloads', 'contact']
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => section !== null);
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id);
    }, { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.15, 0.35, 0.6] });

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isHomePage, locale]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const navLinks = [
    { href: `/${locale}`, section: 'home', labelAr: 'الرئيسية', labelEn: 'Home', icon: Home },
    { href: `/${locale}/about`, section: 'about', labelAr: 'عن المعهد', labelEn: 'About', icon: Info },
    { href: `/${locale}/academics`, section: 'academics', labelAr: 'الأكاديميات', labelEn: 'Academics', icon: BookOpen },
    { href: `/${locale}/activities`, section: 'activities', labelAr: 'الأنشطة', labelEn: 'Activities', icon: Trophy },
    { href: `/${locale}/news`, section: 'news', labelAr: 'الأخبار', labelEn: 'News', icon: Newspaper },
    { href: `/${locale}/events`, section: 'events', labelAr: 'الفعاليات', labelEn: 'Events', icon: CalendarDays },
    { href: `/${locale}/gallery`, section: 'gallery', labelAr: 'المعرض', labelEn: 'Gallery', icon: Images },
    { href: `/${locale}/downloads`, section: 'downloads', labelAr: 'التحميلات', labelEn: 'Downloads', icon: Download },
    { href: `/${locale}/contact`, section: 'contact', labelAr: 'تواصل معنا', labelEn: 'Contact', icon: Mail },
  ];

  // Helper to get alternate locale path
  const getAlternateLocalePath = () => {
    const targetLocale = isAr ? 'en' : 'ar';
    if (!pathname) return `/${targetLocale}`;
    const segments = pathname.split('/');
    if (segments.length > 1 && (segments[1] === 'ar' || segments[1] === 'en')) {
      segments[1] = targetLocale;
      return segments.join('/');
    }
    return `/${targetLocale}${pathname}`;
  };

  return (
    <>
    <header
      className={cn(
        'sticky top-0 z-50 w-full transition-all duration-300',
        scrolled
          ? 'border-b border-border/80 bg-background/95 backdrop-blur-md shadow-md'
          : 'border-b border-border/40 bg-background/90 backdrop-blur-sm',
      )}
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* Top Ministry Affiliation Bar */}
      <div className="hidden border-b border-border/40 bg-muted/30 px-4 py-1.5 text-xs text-muted-foreground sm:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <p className="font-medium">
            {isAr ? INSTITUTE_INFO.ministryAffiliationAr : INSTITUTE_INFO.ministryAffiliationEn}
          </p>
          <div className="flex items-center gap-4 text-[11px]">
            <span>{isAr ? 'كود المعهد بالتنسيق: 47' : 'Institute Coordination Code: 47'}</span>
            <span className="text-border">|</span>
            <span>{isAr ? INSTITUTE_INFO.systemAr : INSTITUTE_INFO.systemEn}</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Bar */}
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand / Logo */}
        <Link
          href={`/${locale}`}
          className="group flex items-center gap-3 transition-opacity hover:opacity-95 shrink-0"
        >
          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-primary/20 bg-primary/10 p-0.5 shadow-sm sm:h-12 sm:w-12">
            <Image
              src="/logo.webp"
              alt="Institute Logo"
              width={48}
              height={48}
              priority
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex flex-col text-start">
            <span className="text-xs font-bold leading-tight tracking-tight text-foreground sm:text-sm md:text-base">
              {isAr ? INSTITUTE_INFO.nameAr : INSTITUTE_INFO.nameEn}
            </span>
            <span className="text-[10px] font-semibold text-primary sm:text-xs">
              {isAr ? 'طريق مصر إسكندرية الصحراوي - ك 47 | محافظة البحيرة' : 'Cairo-Alex Desert Rd, Km 47 | Beheira'}
            </span>
          </div>
        </Link>

        {/* Right Action Cluster: Language Switcher + Electronic Portal CTA */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Language Switcher */}
          <button
            type="button"
            onClick={handleLanguageToggle}
            disabled={isLanguageChanging}
            className="flex items-center gap-1.5 rounded-squircle border border-border/80 bg-muted/40 px-2.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary hover:bg-muted hover:text-primary disabled:cursor-wait disabled:opacity-75 cursor-pointer"
            title={isAr ? 'Switch to English' : 'التحويل إلى اللغة العربية'}
            aria-label={isAr ? 'Switch to English' : 'التحويل إلى اللغة العربية'}
          >
            <Globe className="h-3.5 w-3.5" />
            <span>{isAr ? 'English' : 'عربي'}</span>
          </button>

          {/* Primary Portal CTA */}
          <Button
            asChild
            size="sm"
            className="hidden h-9 gap-1.5 rounded-squircle bg-primary px-3.5 text-xs font-bold text-primary-foreground shadow-sm transition-all hover:bg-primary-hover hover:shadow-md sm:inline-flex md:text-sm"
          >
            <Link href={`/${locale}/login`}>
              <GraduationCap className="h-4 w-4" />
              <span>{isAr ? 'البوابة الإلكترونية' : 'Electronic Portal'}</span>
            </Link>
          </Button>

          {/* Mobile Hamburger Toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-squircle border border-border bg-muted/40 text-foreground transition-colors hover:bg-muted lg:hidden"
            aria-label={isAr ? 'فتح القائمة الرئيسية' : 'Open Main Navigation'}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-border bg-background/98 px-4 pb-6 pt-3 shadow-lg backdrop-blur-xl lg:hidden">
          <div className="flex flex-col gap-1.5">
            {navLinks.map((link) => {
              const href = isHomePage ? `#${link.section}` : link.href;
              const isActive = isHomePage
                ? activeSection === link.section || (link.section === 'activities' && activeSection === 'gallery')
                : link.href === `/${locale}`
                  ? pathname === `/${locale}` || pathname === `/${locale}/`
                  : pathname?.startsWith(link.href) ||
                    (link.section === 'activities' && pathname?.startsWith(`/${locale}/gallery`));

              return (
                <Link
                  key={link.href}
                  href={href}
                  className={cn(
                    'rounded-squircle px-3 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-primary/10 font-bold text-primary border border-primary/20'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {isAr ? link.labelAr : link.labelEn}
                </Link>
              );
            })}

            <div className="mt-4 pt-3 border-t border-border/60">
              <Button
                asChild
                className="w-full h-11 gap-2 rounded-squircle bg-primary text-sm font-bold text-primary-foreground shadow-sm"
              >
                <Link href={`/${locale}/login`}>
                  <GraduationCap className="h-4 w-4" />
                  <span>{isAr ? 'دخول البوابة الإلكترونية' : 'Access Electronic Portal'}</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>

    {/* Desktop Floating Section Navigation (Centered, Portaled from Header) */}
    <InstitutionalFloatingNav locale={locale} />

    {/* Floating Scroll-to-Top Button */}
    <button
      type="button"
      onClick={scrollToTop}
      aria-label={isAr ? 'العودة إلى أعلى الصفحة' : 'Scroll to top'}
      className={cn(
        'fixed bottom-6 end-6 z-40 flex h-11 w-11 items-center justify-center rounded-squircle bg-teal-500 text-slate-950 shadow-xl shadow-teal-950/50 transition-all duration-300 hover:bg-teal-400 hover:scale-110 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
        showScrollTop
          ? 'opacity-100 translate-y-0 pointer-events-auto'
          : 'opacity-0 translate-y-4 pointer-events-none',
      )}
    >
      <ChevronUp className="h-5 w-5 stroke-[2.5]" />
    </button>
    </>
  );
}
