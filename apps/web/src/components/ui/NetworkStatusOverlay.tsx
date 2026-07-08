'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  wifiDotVariants,
  wifiSlashVariants,
  wifiWave1Variants,
  wifiWave2Variants,
  wifiWave3Variants,
} from '@/lib/variants';

interface NetworkStatusOverlayProps {
  locale: string;
}

const ONLINE_CONFIRMATION_MS = 3600;

const trans = {
  ar: {
    networkStatus: {
      onlineTitle: 'تم استعادة الاتصال بالإنترنت',
      offlineTitle: 'لا يوجد اتصال بالإنترنت',
      onlineText: 'لقد تم إعادة الاتصال بالشبكة بنجاح. جاري الاستئناف...',
      offlineText: 'يرجى التحقق من اتصال الشبكة وجهاز التوجيه الخاص بك للمتابعة.',
    },
  },
  en: {
    networkStatus: {
      onlineTitle: 'Connection Restored',
      offlineTitle: 'No Internet Connection',
      onlineText: 'You have reconnected to the network. Resuming...',
      offlineText: 'Please check your network status to continue.',
    },
  },
};

const AnimatedWifiIcon: React.FC<{ isOnline: boolean }> = ({ isOnline }) => {
  if (isOnline) {
    return (
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      >
        <motion.circle
          cx="12"
          cy="18"
          r="1.5"
          fill="currentColor"
          variants={wifiDotVariants}
          animate="animate"
        />
        <motion.path
          d="M10.17 15.17a3 3 0 0 1 3.66 0"
          variants={wifiWave1Variants}
          animate="animate"
        />
        <motion.path
          d="M8.29 13.29a6 6 0 0 1 7.42 0"
          variants={wifiWave2Variants}
          animate="animate"
        />
        <motion.path
          d="M6.36 11.36a9 9 0 0 1 11.28 0"
          variants={wifiWave3Variants}
          animate="animate"
        />
      </svg>
    );
  } else {
    return (
      <svg
        width="64"
        height="64"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-danger"
      >
        <circle cx="12" cy="18" r="1.5" fill="currentColor" className="opacity-30" />
        <path d="M10.17 15.17a3 3 0 0 1 3.66 0" className="opacity-30" />
        <path d="M8.29 13.29a6 6 0 0 1 7.42 0" className="opacity-30" />
        <path d="M6.36 11.36a9 9 0 0 1 11.28 0" className="opacity-30" />
        
        <motion.line
          x1="4"
          y1="4"
          x2="20"
          y2="20"
          variants={wifiSlashVariants}
          initial="initial"
          animate="animate"
        />
      </svg>
    );
  }
};

export const NetworkStatusOverlay: React.FC<NetworkStatusOverlayProps> = ({ locale }) => {
  const t = locale === 'ar' ? trans.ar : trans.en;
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [justCameOnline, setJustCameOnline] = useState<boolean>(false);
  const onlineTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(window.navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      setJustCameOnline(true);

      if (onlineTimeoutRef.current) {
        clearTimeout(onlineTimeoutRef.current);
      }

      onlineTimeoutRef.current = setTimeout(() => {
        setJustCameOnline(false);
      }, ONLINE_CONFIRMATION_MS);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustCameOnline(false);
      if (onlineTimeoutRef.current) {
        clearTimeout(onlineTimeoutRef.current);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      if (onlineTimeoutRef.current) {
        clearTimeout(onlineTimeoutRef.current);
      }
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const shouldShow = !isOnline || justCameOnline;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-9999 flex items-center justify-center p-4"
          style={{
            background: 'rgba(8, 18, 23, 0.85)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 15 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="flex flex-col items-center justify-center p-8 rounded-2xl shadow-2xl max-w-sm w-full border text-center bg-card"
            style={{
              borderColor: isOnline ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
            }}
          >
            {/* Animated SVG Container */}
            <div
              className="p-4 rounded-full mb-5 flex items-center justify-center"
              style={{
                background: isOnline ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              }}
            >
              <AnimatedWifiIcon isOnline={isOnline} />
            </div>

            <h2 className="text-2xl font-bold mb-2 text-foreground">
              {isOnline ? t.networkStatus.onlineTitle : t.networkStatus.offlineTitle}
            </h2>

            <p className="text-sm font-medium wrap-break-word leading-relaxed text-muted">
              {isOnline ? t.networkStatus.onlineText : t.networkStatus.offlineText}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default NetworkStatusOverlay;
