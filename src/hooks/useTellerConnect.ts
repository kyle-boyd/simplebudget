import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    TellerConnect: {
      setup: (config: TellerConnectSetupConfig) => TellerConnectInstance;
    };
  }
}

interface TellerConnectInstance {
  open: () => void;
}

export interface TellerAuthorization {
  accessToken: string;
  user: { id: string };
  enrollment: { id: string };
  signatures: string[];
}

interface TellerConnectSetupConfig {
  applicationId: string;
  environment: string;
  onSuccess: (authorization: TellerAuthorization) => void;
  onExit?: () => void;
  onFailure?: (error: { type: string; message: string }) => void;
}

export interface UseTellerConnectOptions {
  onSuccess: (authorization: TellerAuthorization) => void;
  onExit?: () => void;
  onFailure?: (error: { type: string; message: string }) => void;
}

const TELLER_CONNECT_URL = 'https://cdn.teller.io/connect/connect.js';

export function useTellerConnect(options: UseTellerConnectOptions) {
  const instanceRef = useRef<TellerConnectInstance | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const appId = import.meta.env.VITE_TELLER_APP_ID;
  const environment = import.meta.env.VITE_TELLER_ENVIRONMENT || 'sandbox';

  useEffect(() => {
    if (!appId) return;

    let cancelled = false;

    const setup = () => {
      if (cancelled || instanceRef.current || !window.TellerConnect) return;
      instanceRef.current = window.TellerConnect.setup({
        applicationId: appId,
        environment,
        onSuccess: (auth) => optionsRef.current.onSuccess(auth),
        onExit: () => optionsRef.current.onExit?.(),
        onFailure: (err) => optionsRef.current.onFailure?.(err),
      });
    };

    if (window.TellerConnect) {
      setup();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TELLER_CONNECT_URL}"]`
    );

    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = TELLER_CONNECT_URL;
      script.async = true;
      document.head.appendChild(script);
    }

    script.addEventListener('load', setup);
    script.addEventListener('error', () =>
      optionsRef.current.onFailure?.({
        type: 'script_error',
        message: 'Could not load Teller Connect.',
      })
    );

    return () => {
      cancelled = true;
      script.removeEventListener('load', setup);
    };
  }, [appId, environment]);

  const open = useCallback(() => {
    if (!appId) {
      optionsRef.current.onFailure?.({
        type: 'configuration_error',
        message: 'Bank connections are not configured (VITE_TELLER_APP_ID is missing).',
      });
      return;
    }
    if (!instanceRef.current) {
      optionsRef.current.onFailure?.({
        type: 'not_ready',
        message: 'Teller Connect is still loading. Please try again in a moment.',
      });
      return;
    }
    instanceRef.current.open();
  }, [appId]);

  return { open, available: !!appId };
}
