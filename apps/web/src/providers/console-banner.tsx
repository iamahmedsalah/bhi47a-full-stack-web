'use client';

import { useEffect } from 'react';

/**
 * Prints a stylized startup banner to the browser developer console
 * indicating the current environment (development/production) and version.
 */
export function ConsoleBanner() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Prevent duplicate logs across React fast-refresh / StrictMode renders
    const globalKey = '__STUDENT_PORTAL_BANNER_LOGGED__';
    if ((window as unknown as Record<string, boolean>)[globalKey]) return;
    (window as unknown as Record<string, boolean>)[globalKey] = true;

    const env = (
      process.env.NEXT_PUBLIC_APP_ENV ||
      process.env.NODE_ENV ||
      'development'
    ).toUpperCase();
    const version = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
    const isProduction = env === 'PRODUCTION';

    const portalStyle = [
      'background: #0d9488',
      'color: #ffffff',
      'font-weight: 700',
      'font-size: 11px',
      'padding: 3px 8px',
      'border-radius: 4px 0 0 4px',
    ].join(';');

    const envStyle = [
      `background: ${isProduction ? '#2563eb' : '#d97706'}`,
      'color: #ffffff',
      'font-weight: 700',
      'font-size: 11px',
      'padding: 3px 8px',
    ].join(';');

    const versionStyle = [
      'background: #1e293b',
      'color: #cbd5e1',
      'font-family: monospace',
      'font-size: 11px',
      'padding: 3px 8px',
      'border-radius: 0 4px 4px 0',
    ].join(';');

    console.log(
      `%c🎓 Student Portal%c⚡ ${env}%cv${version}`,
      portalStyle,
      envStyle,
      versionStyle,
    );

    console.info(
      `%c[Environment]%c Running in ${env} mode (v${version})`,
      'color: #0d9488; font-weight: bold;',
      'color: inherit;',
    );
  }, []);

  return null;
}
