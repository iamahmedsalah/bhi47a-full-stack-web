"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { getApiErrorDetails } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import {
  getPasskeyCapabilities,
  passkeyErrorKey,
  passkeyKeys,
  passkeyLoginOptions,
} from "@/features/auth/passkeys";

const PREFETCH_FRESHNESS_MS = 120_000;

interface PreparedLoginFlow {
  flowId: string;
  flowToken: string;
  options: PublicKeyCredentialRequestOptionsJSON;
  expiresAt: number;
}

export function PasskeyLoginButton({
  returnUrl,
  area = "student",
}: {
  returnUrl?: string | null;
  area?: "student" | "management";
}) {
  const t = useTranslations("passkeys");
  const { login } = useAuth();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const prefetchInFlight = useRef(false);
  const prefetchedFlowRef = useRef<PreparedLoginFlow | null>(null);
  const [message, setMessage] = useState("");
  const capabilities = useQuery({
    queryKey: passkeyKeys.capabilities,
    queryFn: getPasskeyCapabilities,
    retry: false,
    staleTime: 5 * 60_000,
  });

  const isPasskeyAvailable = Boolean(
    capabilities.data?.enabled &&
      (area !== "student" || capabilities.data.studentLoginEnabled),
  );

  const refreshPrefetch = useCallback(async () => {
    if (
      !isPasskeyAvailable ||
      prefetchInFlight.current ||
      typeof window === "undefined" ||
      !window.isSecureContext ||
      !browserSupportsWebAuthn()
    ) {
      return;
    }
    prefetchInFlight.current = true;
    try {
      const flow = await passkeyLoginOptions(area);
      prefetchedFlowRef.current = {
        ...flow,
        expiresAt: Date.now() + PREFETCH_FRESHNESS_MS,
      };
    } catch {
      prefetchedFlowRef.current = null;
    } finally {
      prefetchInFlight.current = false;
    }
  }, [area, isPasskeyAvailable]);

  useEffect(() => {
    if (!isPasskeyAvailable) {
      prefetchedFlowRef.current = null;
      return;
    }

    void refreshPrefetch();

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      const current = prefetchedFlowRef.current;
      if (!current || Date.now() >= current.expiresAt) {
        void refreshPrefetch();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isPasskeyAvailable, refreshPrefetch]);

  if (!isPasskeyAvailable) return null;

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

      const cached = prefetchedFlowRef.current;
      const hasFreshCache = Boolean(cached && Date.now() < cached.expiresAt);
      let flow: {
        flowId: string;
        flowToken: string;
        options: PublicKeyCredentialRequestOptionsJSON;
      };

      if (hasFreshCache && cached) {
        prefetchedFlowRef.current = null;
        flow = cached;
      } else {
        prefetchedFlowRef.current = null;
        flow = await passkeyLoginOptions(area);
      }

      const response = await startAuthentication({ optionsJSON: flow.options });
      await login(
        "passkey",
        { flowId: flow.flowId, flowToken: flow.flowToken, response },
        { returnUrl },
      );
    } catch (error) {
      const details = getApiErrorDetails(error);
      if (details.code === "STUDENT_LOGIN_MAINTENANCE" && details.message) {
        setMessage(details.message);
      } else {
        setMessage(t(passkeyErrorKey(error, "login")));
      }
      void refreshPrefetch();
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
        className="w-full rounded-squircle min-h-11"
        disabled={busy}
        onClick={() => void signIn()}
      >
        {busy ? t("working") : t("signIn")}
      </Button>
      <p className="text-xs text-muted-foreground">{t("fallback")}</p>
      {message && (
        <p role="status" aria-live="polite" className="text-xs font-medium text-rose-400">
          {message}
        </p>
      )}
    </div>
  );
}
