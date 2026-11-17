'use client';

import { useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import api from '@/lib/api';

export function FcmInitializer() {
  const { user } = useAuth();
  const studentId = user?.role === 'student' && !user.mustChangePassword ? user._id : undefined;

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;

    const initializeFcm = async () => {
      try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        if (Notification.permission === 'denied') return;

        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          return;
        }

        const { initializeApp, getApps, getApp } = await import('firebase/app');
        const { getMessaging, getToken } = await import('firebase/messaging');

        const firebaseConfig = {
          apiKey: "AIzaSyD4s4PDxoo9xv-T_jaxt5U1jOQ39Qes368",
          authDomain: "fcm-bhi.firebaseapp.com",
          projectId: "fcm-bhi",
          storageBucket: "fcm-bhi.appspot.com",
          messagingSenderId: "125360233430",
          appId: "1:125360233430:web:9e7185e21057a4c3dca277",
        };

        const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        const messaging = getMessaging(app);

        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const activeRegistration = await navigator.serviceWorker.ready;

        const token = await getToken(messaging, {
          serviceWorkerRegistration: activeRegistration,
        });

        if (token && !cancelled) {
          await api.post('/students/me/fcm-token', {
            token,
            platform: 'web',
          });
        }
      } catch (err) {
        console.error('Error during FCM registration:', err);
      }
    };

    void initializeFcm();
    return () => { cancelled = true; };
  }, [studentId]);

  return null;
}
