"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import { useAuth } from "@/providers/auth-provider";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getPasskeyCapabilities,
  getPasskeys,
  passkeyKeys,
  passkeyRegisterOptions,
  passkeyErrorKey,
  type PasskeyMetadata,
} from "@/features/auth/passkeys";

type Action =
  { type: "add" } | { type: "rename" | "remove"; credential: PasskeyMetadata };

export function PasskeyManager() {
  const t = useTranslations("passkeys");
  const locale = useLocale();
  const { user } = useAuth();
  const client = useQueryClient();
  const capabilities = useQuery({
    queryKey: passkeyKeys.capabilities,
    queryFn: getPasskeyCapabilities,
    retry: false,
    staleTime: 60000,
  });
  const key = passkeyKeys.list(user?._id ?? "");
  const list = useQuery({
    queryKey: key,
    queryFn: getPasskeys,
    enabled: Boolean(user && capabilities.data?.enabled),
    retry: false,
  });
  const [action, setAction] = useState<Action | null>(null);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [dialogMessage, setDialogMessage] = useState("");
  if (!capabilities.data?.enabled || !user) return null;

  const open = (next: Action) => {
    setPassword("");
    setName(next.type === "add" ? "" : next.credential.name);
    setDialogMessage("");
    setAction(next);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setDialogMessage("");
    try {
      if (
        action.type === "add" &&
        (!browserSupportsWebAuthn() || !window.isSecureContext)
      ) {
        setDialogMessage(t("unsupported"));
        return;
      }
      await api.post("/auth/passkeys/reauthenticate", { password, operation: action.type === 'add' ? 'register' : action.type, ...(action.type === 'add' ? {} : { credentialId: action.credential._id }) });
      setPassword("");
      if (action.type === "add") {
        const flow = await passkeyRegisterOptions();
        const response = await startRegistration({ optionsJSON: flow.options });
        await api.post("/auth/passkeys/register/verify", {
          flowId: flow.flowId,
          response,
          name: name.trim(),
        });
      } else if (action.type === "rename") {
        await api.patch(`/auth/passkeys/${action.credential._id}`, {
          name: name.trim(),
        });
      } else {
        await api.delete(`/auth/passkeys/${action.credential._id}`);
      }
      setAction(null);
      setMessage(t("saved"));
      await client.invalidateQueries({ queryKey: key });
    } catch (error) {
      setDialogMessage(t(passkeyErrorKey(error)));
    } finally {
      setPassword("");
      setBusy(false);
      inFlight.current = false;
    }
  };
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
      dateStyle: "medium",
      timeZone: "Africa/Cairo",
    }).format(new Date(value));

  return (
    <Card className="space-y-4 rounded-2xl p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <Button
        type="button"
        className="rounded-squircle"
        onClick={() => open({ type: "add" })}
        disabled={busy || user.mustChangePassword}
      >
        {t("add")}
      </Button>
      {list.isPending && <p role="status">{t("loading")}</p>}
      {list.isError && (
        <div role="alert">
          <p>{t("error")}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void list.refetch()}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      {list.data?.length === 0 && <p>{t("empty")}</p>}
      <ul className="space-y-3">
        {list.data?.map((credential) => (
          <li
            key={credential._id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
          >
            <div className="min-w-0">
              <p className="wrap-break-word font-medium">
                <bdi>{credential.name}</bdi>
              </p>
              <p className="text-xs text-muted-foreground">
                {t("created", { date: formatDate(credential.createdAt) })}
              </p>
              <p className="text-xs text-muted-foreground">
                {credential.lastUsedAt
                  ? t("lastUsed", { date: formatDate(credential.lastUsedAt) })
                  : t("neverUsed")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => open({ type: "rename", credential })}
              >
                {t("rename")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => open({ type: "remove", credential })}
              >
                {t("remove")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p role="status" aria-live="polite">
        {message}
      </p>
      <Dialog
        open={Boolean(action)}
        onOpenChange={(value) => {
          if (!value && !busy) {
            setAction(null);
            setPassword("");
          }
        }}
      >
        <DialogContent
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="rounded-2xl"
        >
          <DialogHeader className="text-start">
            <DialogTitle>{t(action?.type ?? "add")}</DialogTitle>
            <DialogDescription>
              {action?.type === "remove" ? t("removeConfirm") : t("reauth")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            {action?.type !== "remove" && (
              <div>
                <label htmlFor="passkey-name">{t("name")}</label>
                <Input
                  id="passkey-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  required
                  disabled={busy}
                />
              </div>
            )}
            <div>
              <label htmlFor="passkey-password">{t("password")}</label>
              <PasswordInput
                id="passkey-password"
                dir="ltr"
                className="text-left"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={256}
                required
                disabled={busy}
              />
            </div>
            <p role="alert" aria-live="polite">
              {dialogMessage}
            </p>
            <DialogFooter className="gap-2 rtl:sm:justify-start">
              <Button
                type="submit"
                disabled={
                  busy ||
                  !password ||
                  (action?.type !== "remove" && !name.trim())
                }
              >
                {busy ? t("working") : t("confirm")}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  setPassword("");
                }}
              >
                {t("cancel")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
