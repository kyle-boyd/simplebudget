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

export function useTellerConnect(options: UseTellerConnectOptions) {
  const instanceRef = useRef<TellerConnectInstance | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const TELLER_CONNECT_URL = 'https://cdn.teller.io/connect/connect.js';
    const env = (import.meta as unknown as { env: Record<string, string> }).env;
    const appId = env.VITE_TELLER_APP_ID;
    const environment = env.VITE_TELLER_ENVIRONMENT || 'sandbox';

    const setup = () => {
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
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${TELLER_CONNECT_URL}"]`
    );

    if (existing) {
      existing.addEventListener('load', setup);
      return () => existing.removeEventListener('load', setup);
    }

    const script = document.createElement('script');
    script.src = TELLER_CONNECT_URL;
    script.onload = setup;
    document.head.appendChild(script);
  }, []);

  const open = useCallback(() => {
    instanceRef.current?.open();
  }, []);

  return { open };
}
