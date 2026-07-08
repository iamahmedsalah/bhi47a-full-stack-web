'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { container } from '@/lib/variants';
import { useTheme } from '@/providers/theme-provider';
import { Monitor, Smartphone, Sun, Moon } from 'lucide-react';

export const Themes = () => {
  const { theme, setTheme, resolvedTheme, mounted } = useTheme();

  const toggleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
  };

  const currentTheme = mounted ? resolvedTheme : 'light';

  return (
    <motion.div
      className="flex"
      variants={container}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-squircle border border-border bg-card text-muted shadow-sm transition-all duration-300 hover:border-primary/30 hover:text-foreground hover:bg-accent/10"
        onClick={toggleTheme}
        aria-live="polite"
        aria-label={mounted ? `Theme: ${theme}` : 'Theme: system'}
        aria-pressed={mounted ? theme === 'system' : true}
      >
        <AnimatePresence mode="wait" initial={false}>
          {theme === 'system' ? (
            <motion.span
              key={`system-${currentTheme}`}
              initial={{ opacity: 0, scale: 0.72, rotate: -28, y: 8 }}
              animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.72, rotate: 28, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative grid place-items-center text-"
            >
              <Smartphone className="h-5 w-5 sm:hidden" />
              <Monitor className="hidden h-5 w-5 sm:block" />
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
            </motion.span>
          ) : currentTheme === 'light' ? (
            <motion.span
              key="sun"
              initial={{ opacity: 0, scale: 0.68, rotate: 55, y: 6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.68, rotate: -55, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <Sun className="h-5 w-5 animate-pulse text-warning" />
            </motion.span>
          ) : (
            <motion.span
              key="moon"
              initial={{ opacity: 0, scale: 0.68, rotate: -55, y: 6 }}
              animate={{ opacity: 1, scale: 1, rotate: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.68, rotate: 55, y: -6 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <Moon className="h-5 w-5 animate-pulse text-primary" />
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
};

export default Themes;