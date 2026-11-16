"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  browserSupportsWebAuthn,
  startAuthentication,
} from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/providers/auth-provider";
import {
  getPasskeyCapabilities,
  passkeyErrorKey,
  passkeyKeys,
  passkeyLoginOptions,
} from "@/features/auth/passkeys";

export function PasskeyLoginButton({
  returnUrl,
  area = 'student',
}: {
  returnUrl?: string | null;
  area?: 'student' | 'management';
}) {
  const t = useTranslations("passkeys");
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const capabilities = useQuery({
    queryKey: passkeyKeys.capabilities,
    queryFn: getPasskeyCapabilities,
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (!capabilities.data?.enabled || (area === 'student' && !capabilities.data.studentLoginEnabled)) return null;

  const signIn = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (!browserSupportsWebAuthn() || !window.isSecureContext) {
        setMessage(t("unsupported"));
        return;
      }
      const flow = await passkeyLoginOptions(area);
      const response = await startAuthentication({ optionsJSON: flow.options });
      await login(
        "passkey",
        { flowId: flow.flowId, flowToken: flow.flowToken, response },
        { returnUrl },
      );
    } catch (error) {
      setMessage(t(passkeyErrorKey(error)));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };

  return (
    <div className="w-full space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full rounded-squircle"
        disabled={busy}
        onClick={() => void signIn()}
      >
        {busy ? t("working") : t("signIn")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("fallback")}</p>
      <p role="status" aria-live="polite" className="text-sm">
        {message}
      </p>
    </div>
  );
}
