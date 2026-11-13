'use client';
import { useHydrated } from "@/hooks/use-hydrated";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
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
  Pin,
  PinOff,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';

interface InstitutionalFloatingNavProps {
  locale: string;
}

interface NavItem {
  href: string;
  section: string;
  labelAr: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '', section: 'home', labelAr: 'الرئيسية', labelEn: 'Home', icon: Home },
  { href: '/about', section: 'about', labelAr: 'عن المعهد', labelEn: 'About', icon: Info },
  { href: '/academics', section: 'academics', labelAr: 'الأكاديميات', labelEn: 'Academics', icon: BookOpen },
  { href: '/news', section: 'news', labelAr: 'الأخبار', labelEn: 'News', icon: Newspaper },
  { href: '/events', section: 'events', labelAr: 'الفعاليات', labelEn: 'Events', icon: CalendarDays },
  { href: '/activities', section: 'activities', labelAr: 'الأنشطة', labelEn: 'Activities', icon: Trophy },
  { href: '/gallery', section: 'gallery', labelAr: 'المعرض', labelEn: 'Gallery', icon: Images },
  { href: '/downloads', section: 'downloads', labelAr: 'التحميلات', labelEn: 'Downloads', icon: Download },
  { href: '/contact', section: 'contact', labelAr: 'تواصل معنا', labelEn: 'Contact', icon: Mail },
] as const;

export function InstitutionalFloatingNav({ locale }: InstitutionalFloatingNavProps) {
  const isAr = locale === 'ar';
  const pathname = usePathname();
  const isHomePage = pathname === `/${locale}` || pathname === `/${locale}/`;

  const [activeSection, setActiveSection] = useState('home');
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const mounted = useHydrated();

  const navRef = useRef<HTMLElement>(null);
  const isClickScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafIdRef = useRef<number | null>(null);

  // Restore user pin preference
  const hydrated = useHydrated();
  const [restoredPin, setrestoredPin] = useState(false);
  if (hydrated && !restoredPin) {
    setrestoredPin(true);

    try {
      const stored = localStorage.getItem('inst-nav-pinned');
      if (stored === 'true') setIsPinned(true);
    } catch {
      // ignore storage errors
    }

  }

  const togglePin = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('inst-nav-pinned', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  // Performance-optimized active section scroll spy with click-lock & scanline detection
  useEffect(() => {
    if (!isHomePage) return;

    const sectionIds = NAV_ITEMS.map((item) => item.section);

    const updateActiveSection = () => {
      if (isClickScrollingRef.current) return;

      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const fullHeight = document.documentElement.scrollHeight;

      // 1. Top of page
      if (scrollY < 120) {
        setActiveSection('home');
        return;
      }

      // 2. Bottom of page
      if (scrollY + windowHeight >= fullHeight - 60) {
        setActiveSection('contact');
        return;
      }

      // 3. Scan all sections in DOM order
      const elements = sectionIds
        .map((id) => document.getElementById(id))
        .filter((el): el is HTMLElement => el !== null);

      if (!elements.length) return;

      const scanLine = 150; // Scanline below sticky header
      let currentSection = elements[0].id;

      for (let i = 0; i < elements.length; i++) {
        const el = elements[i];
        const rect = el.getBoundingClientRect();
        if (rect.top <= scanLine) {
          currentSection = el.id;
        } else {
          break;
        }
      }

      if (currentSection) {
        setActiveSection(currentSection);
      }
    };

    const handleScroll = () => {
      if (isClickScrollingRef.current) return;
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(updateActiveSection);
    };

    // Check initial hash on mount (e.g. #academics)
    const initialHash = window.location.hash.replace('#', '');
    if (initialHash && sectionIds.includes(initialHash)) {
      setActiveSection(initialHash);
    } else {
      updateActiveSection();
    }

    // Re-check after initial layout settles
    const initialTimer = setTimeout(updateActiveSection, 150);

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('hashchange', updateActiveSection);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('hashchange', updateActiveSection);
      clearTimeout(initialTimer);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [isHomePage]);

  // Click handler with smooth-scroll lock to prevent indicator hesitation
  const handleNavClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
      if (!isHomePage) return;

      e.preventDefault();
      const target = document.getElementById(sectionId);
      if (!target) return;

      // Lock observer during smooth scroll animation
      isClickScrollingRef.current = true;
      setActiveSection(sectionId);

      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

      const yOffset = -76;
      const y = target.getBoundingClientRect().top + window.scrollY + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });

      window.history.replaceState(null, '', `#${sectionId}`);

      // Release lock after scroll settles
      scrollTimeoutRef.current = setTimeout(() => {
        isClickScrollingRef.current = false;
      }, 750);
    },
    [isHomePage],
  );

  const isExpanded = isPinned || isHovered;

  return (
    <aside
      ref={navRef}
      dir={isAr ? 'rtl' : 'ltr'}
      aria-label={isAr ? 'التنقل السريع لأقسام المعهد' : 'Quick Section Navigation'}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        // Viewport fixed vertical centering
        'fixed top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col',
        // In Arabic (RTL): docks to left-4; in English (LTR): docks to right-4
        'end-4',
        // Dimensions & clean transitions
        'max-h-[calc(100dvh-3rem)] overflow-hidden rounded-2xl',
        'border border-border/80 bg-slate-950/90 backdrop-blur-xl shadow-xl shadow-black/40',
        'transition-[width,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isExpanded ? 'w-56' : 'w-[58px]',
      )}
    >
      <TooltipProvider delayDuration={100}>
        {/* Dock Header */}
        <div
          className={cn(
            'flex h-11 shrink-0 items-center border-b border-border/60 bg-muted/20 transition-all duration-300',
            isExpanded ? 'justify-between px-3.5' : 'justify-center px-0',
          )}
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-squircle bg-primary/10 text-primary">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span
              className={cn(
                'text-[11px] font-bold uppercase tracking-[0.14em] text-slate-300 whitespace-nowrap overflow-hidden transition-all duration-300',
                isExpanded ? 'max-w-[100px] opacity-100' : 'max-w-0 opacity-0 pointer-events-none',
              )}
            >
              {isAr ? 'تصفح المعهد' : 'Explore'}
            </span>
          </div>

          {/* Pin / Collapse Toggle */}
          <button
            type="button"
            onClick={togglePin}
            aria-label={
              isAr
                ? isPinned
                  ? 'إلغاء تثبيت القائمة'
                  : 'تثبيت القائمة مفتوحة'
                : isPinned
                  ? 'Unpin sidebar'
                  : 'Pin sidebar open'
            }
            title={
              isAr
                ? isPinned
                  ? 'إلغاء التثبيت'
                  : 'تثبيت القائمة'
                : isPinned
                  ? 'Unpin sidebar'
                  : 'Pin sidebar'
            }
            className={cn(
              'grid h-6 w-6 place-items-center rounded-squircle text-slate-400 hover:text-primary hover:bg-muted/40 transition-colors duration-200',
              !isExpanded && 'hidden',
              isPinned && 'text-primary bg-primary/15',
            )}
          >
            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
        </div>

        {/* Dock Navigation Items */}
        <nav
          className="flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain p-2 scrollbar-none items-center"
          aria-label={isAr ? 'روابط الأقسام' : 'Section Links'}
        >
          {NAV_ITEMS.map((item) => {
            const isActive = isHomePage
              ? activeSection === item.section
              : item.href === ''
                ? pathname === `/${locale}` || pathname === `/${locale}/`
                : pathname?.startsWith(`/${locale}${item.href}`);

            const href = isHomePage ? `#${item.section}` : `/${locale}${item.href}`;
            const Icon = item.icon;
            const label = isAr ? item.labelAr : item.labelEn;

            const linkContent = (
              <Link
                key={item.section}
                href={href}
                onClick={(e) => handleNavClick(e, item.section)}
                aria-current={isActive ? 'location' : undefined}
                className={cn(
                  'group relative flex h-10 w-full items-center rounded-squircle transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950',
                  isExpanded ? 'justify-start px-2.5' : 'justify-center px-0',
                  isActive
                    ? 'bg-primary/20 font-bold text-primary border border-primary/35 shadow-xs'
                    : 'text-slate-300 hover:bg-muted/40 hover:text-white',
                )}
              >
                {/* Icon Wrapper - NO background, transparent so only ONE background exists! */}
                <span
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-squircle transition-colors',
                    isActive
                      ? 'text-primary'
                      : 'text-slate-400 group-hover:text-slate-100',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-105" />
                </span>

                {/* Text Label */}
                <span
                  className={cn(
                    'text-xs font-semibold whitespace-nowrap overflow-hidden transition-all duration-300',
                    isExpanded
                      ? 'ms-2.5 max-w-[130px] opacity-100 translate-x-0'
                      : 'max-w-0 opacity-0 -translate-x-2 rtl:translate-x-2 pointer-events-none',
                  )}
                >
                  {label}
                </span>
              </Link>
            );

            // In collapsed mode, wrap in tooltip
            if (!isExpanded && mounted) {
              return (
                <Tooltip key={item.section}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent
                    side={isAr ? 'right' : 'left'}
                    sideOffset={12}
                    className="z-50 rounded-squircle border border-border/80 bg-slate-900/95 px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-lg backdrop-blur-md"
                  >
                    {label}
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </nav>
      </TooltipProvider>
    </aside>
  );
}
