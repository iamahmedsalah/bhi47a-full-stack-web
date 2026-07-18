'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

interface LanguageSwitchOverlayProps {
  locale: 'ar' | 'en';
}

export default function LanguageSwitchOverlay({ locale }: LanguageSwitchOverlayProps) {
  const isRTL = locale === 'ar';
  const switchingText = isRTL ? 'جارٍ تبديل اللغة...' : 'Switching Language...';

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: 'easeInOut' }}
      className="fixed inset-0 z-9999 flex flex-col items-center justify-center overflow-hidden px-6 bg-background/95 backdrop-blur-md"
      role="status"
      aria-live="polite"
    >
      {/* Background Orbitals - Accent themed (Teal/Gold) to match project style */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none flex items-center justify-center select-none">
        {/* Orbital rings */}
        <div className="absolute w-[60vw] h-[60vw] sm:w-[45vw] sm:h-[45vw] border border-primary/15 rounded-full animate-[spin_40s_linear_infinite]" />
        <div className="absolute w-[80vw] h-[40vw] sm:w-[55vw] sm:h-[28vw] border border-primary/10 rounded-full rotate-45 animate-[spin_30s_linear_infinite_reverse]" />
        <div className="absolute w-[35vw] h-[35vw] sm:w-[25vw] sm:h-[25vw] border border-primary/20 rounded-full -rotate-12 animate-[spin_20s_linear_infinite]" />

        {/* Glowing orbs */}
        <div className="absolute w-[30vw] h-[30vw] rounded-full bg-primary/5 blur-[120px] top-[15%] left-[5%]" />
        <div className="absolute w-[35vw] h-[35vw] rounded-full bg-primary/5 blur-[140px] bottom-[10%] right-[10%]" />
      </div>

      {/* Rotating project logo instead of ThreeSceneLoader */}
      <div className="relative mb-6 z-10 flex items-center justify-center w-36 h-36">
        <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/40 animate-[spin_10s_linear_infinite]" />
        <Image
          src="/logo.webp"
          alt="BHI Logo"
          width={120}
          height={120}
          className="object-contain rounded-full shadow-(--shadow-glow) animate-pulse"
          priority
        />
      </div>

      {/* Text Status Box with rounded-squircle class */}
      <div className="relative overflow-hidden rounded-xl border border-primary/25 mt-2 px-6 py-4 shadow-2xl backdrop-blur-xl z-10 select-none min-w-50 bg-card/65" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="relative flex items-center justify-center gap-3 text-sm font-semibold text-primary">
          <span className="relative grid w-5 h-5 place-items-center rounded-full border border-primary/30">
            <span className="w-2 h-2 animate-pulse rounded-full bg-primary" />
          </span>
          <span className="tracking-wide">{switchingText}</span>
        </div>
      </div>
    </motion.div>
  );
}
