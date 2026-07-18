importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD4s4PDxoo9xv-T_jaxt5U1jOQ39Qes368",
  authDomain: "fcm-bhi.firebaseapp.com",
  projectId: "fcm-bhi",
  storageBucket: "fcm-bhi.appspot.com",
  messagingSenderId: "125360233430",
  appId: "1:125360233430:web:9e7185e21057a4c3dca277",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo.webp',
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
