import { useCallback, useEffect, useRef, useState } from 'react';

type GoogleCredentialHandler = (credential: string) => void;
type GoogleButtonOptions = {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: string;
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: string;
  locale?: string;
};

let initializedGoogleClientId: string | undefined;
let activeGoogleCredentialHandler: GoogleCredentialHandler | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
          }) => void;
          renderButton: (
            element: HTMLElement | null,
            options: GoogleButtonOptions
          ) => void;
          prompt: () => void;
        };
      };
    };
  }
}

export function useGoogleSignIn({
  onSuccess,
  locale = 'ar',
}: {
  onSuccess: (credential: string) => void;
  locale?: string;
}) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '';
  const onSuccessRef = useRef(onSuccess);
  const [scriptLoaded, setScriptLoaded] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !!document.getElementById('google-gsi-client');
    }
    return false;
  });
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    activeGoogleCredentialHandler = (credential) => {
      onSuccessRef.current(credential);
    };

    return () => {
      activeGoogleCredentialHandler = undefined;
    };
  }, [onSuccess]);

  useEffect(() => {
    if (scriptLoaded) return;

    const existingScript = document.getElementById('google-gsi-client');
    if (existingScript) {
      setScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.id = 'google-gsi-client';
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    document.body.appendChild(script);
  }, [scriptLoaded]);

  useEffect(() => {
    if (!scriptLoaded || !window.google) return;

    if (!clientId) {
      console.warn('Google Client ID is missing. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable.');
      setIsInitialized(false);
      return;
    }

    try {
      if (initializedGoogleClientId === clientId) {
        setIsInitialized(true);
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          activeGoogleCredentialHandler?.(response.credential);
        },
      });
      initializedGoogleClientId = clientId;
      setIsInitialized(true);
    } catch (error) {
      setIsInitialized(false);
      console.error('Error initializing Google GIS:', error);
    }
  }, [clientId, scriptLoaded]);

  const renderButton = useCallback(function renderGoogleButton(
    elementId: string,
    options: GoogleButtonOptions = {},
  ) {
    if (!clientId) return;

    if (!scriptLoaded || !window.google || !isInitialized) {
      setTimeout(() => renderGoogleButton(elementId, options), 200);
      return;
    }
    const element = document.getElementById(elementId);
    if (!element) return;

    try {
      window.google.accounts.id.renderButton(element, {
        theme: 'outline',
        size: 'large',
        shape: 'pill',
        width: '100%',
        locale,
        ...options,
      });
    } catch (error) {
      console.error('Error rendering Google button:', error);
    }
  }, [clientId, isInitialized, locale, scriptLoaded]);

  const prompt = useCallback(() => {
    if (!clientId) return;

    if (!scriptLoaded || !window.google || !isInitialized) {
      setTimeout(() => prompt(), 200);
      return;
    }

    try {
      window.google.accounts.id.prompt();
    } catch (error) {
      console.error('Error showing Google prompt:', error);
    }
  }, [clientId, isInitialized, scriptLoaded]);

  return {
    scriptLoaded,
    isConfigured: Boolean(clientId),
    isInitialized,
    renderButton,
    prompt,
  };
}
