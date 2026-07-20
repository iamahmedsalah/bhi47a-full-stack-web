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

type GoogleIdentityState = {
  scriptPromise?: Promise<void>;
  initializedClientId?: string;
  credentialHandler?: GoogleCredentialHandler;
};

type GoogleIdConfiguration = {
  client_id: string;
  callback: (response: { credential?: string }) => void;
  ux_mode?: 'popup' | 'redirect';
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
  itp_support?: boolean;
  use_fedcm_for_button?: boolean;
  button_auto_select?: boolean;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (
            element: HTMLElement | null,
            options: GoogleButtonOptions,
          ) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
          cancel?: () => void;
        };
      };
    };
    __bhiGoogleIdentityState?: GoogleIdentityState;
  }
}

const GOOGLE_SCRIPT_ID = 'google-gsi-client';

function getGoogleIdentityState(): GoogleIdentityState {
  window.__bhiGoogleIdentityState ??= {};
  return window.__bhiGoogleIdentityState;
}

function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  const state = getGoogleIdentityState();
  if (state.scriptPromise) return state.scriptPromise;

  state.scriptPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(
      GOOGLE_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    const handleLoad = () => resolve();
    const handleError = () => {
      state.scriptPromise = undefined;
      reject(new Error('Google Identity Services failed to load'));
    };

    if (existingScript) {
      existingScript.addEventListener('load', handleLoad, { once: true });
      existingScript.addEventListener('error', handleError, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.id = GOOGLE_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleLoad, { once: true });
    script.addEventListener('error', handleError, { once: true });
    document.head.appendChild(script);
  });

  return state.scriptPromise;
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
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  useEffect(() => {
    const state = getGoogleIdentityState();
    const handler: GoogleCredentialHandler = (credential) => {
      onSuccessRef.current(credential);
    };
    state.credentialHandler = handler;

    return () => {
      if (state.credentialHandler === handler) {
        state.credentialHandler = undefined;
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    void loadGoogleIdentityScript()
      .then(() => {
        if (active) setScriptLoaded(true);
      })
      .catch((error: unknown) => {
        if (active) setScriptLoaded(false);
        console.error('Error loading Google GIS:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!scriptLoaded || !window.google?.accounts?.id) return;

    if (!clientId) {
      console.warn(
        'Google Client ID is missing. Please set NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable.',
      );
      return;
    }

    const state = getGoogleIdentityState();
    if (state.initializedClientId === clientId) {
      queueMicrotask(() => setIsInitialized(true));
      return;
    }

    try {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response) => {
          if (response.credential) {
            getGoogleIdentityState().credentialHandler?.(response.credential);
          }
        },
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
        itp_support: true,
        use_fedcm_for_button: true,
        button_auto_select: false,
      });
      state.initializedClientId = clientId;
      queueMicrotask(() => setIsInitialized(true));
    } catch (error) {
      console.error('Error initializing Google GIS:', error);
    }
  }, [clientId, scriptLoaded]);

  const renderButton = useCallback(
    (elementId: string, options: GoogleButtonOptions = {}) => {
      if (!clientId || !scriptLoaded || !isInitialized) return;

      const element = document.getElementById(elementId);
      if (!element || !window.google?.accounts?.id) return;

      try {
        element.replaceChildren();
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
    },
    [clientId, isInitialized, locale, scriptLoaded],
  );

  const prompt = useCallback(() => {
    if (!clientId || !scriptLoaded || !isInitialized) return;

    try {
      window.google?.accounts?.id.prompt();
    } catch (error) {
      console.warn('Error showing Google prompt:', error);
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
