import React, { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  glow?: boolean;
  interactive?: boolean;
}

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, className, glow = false, interactive = false, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'overflow-hidden rounded-xl border border-border/70 bg-card/90 p-6 shadow-[var(--shadow-glow)] backdrop-blur transition-all duration-300',
          glow && 'ring-1 ring-primary/10',
          interactive && 'cursor-pointer hover:border-primary/40 hover:bg-card-hover/70 hover:shadow-xl hover:shadow-primary/10 active:scale-[0.99]',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
GlassCard.displayName = 'GlassCard';
