'use client';

import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface ScrollRevealProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  delay?: 0 | 100 | 200 | 300 | 400;
  threshold?: number;
}

export function ScrollReveal({
  children,
  className,
  delay = 0,
  threshold = 0.12,
  ...props
}: ScrollRevealProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Use IntersectionObserver with automatic cleanup after trigger for maximum performance
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsRevealed(true);
          observer.unobserve(element);
        }
      },
      {
        threshold,
        rootMargin: '0px 0px -40px 0px',
      },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      className={cn(
        'reveal-on-scroll',
        isRevealed && 'is-revealed',
        delay === 100 && 'reveal-delay-100',
        delay === 200 && 'reveal-delay-200',
        delay === 300 && 'reveal-delay-300',
        delay === 400 && 'reveal-delay-400',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
