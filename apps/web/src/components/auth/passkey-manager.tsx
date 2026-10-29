"use client";

import React, { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import {
  KeyRound,
  Fingerprint,
  Plus,
  Pencil,
  Trash2,
  Shield,
  Calendar,
  Clock,
  Loader2,
  CheckCircle2,
  ScanFace,
  Hash,
  ChevronDown,
  Check,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import api, { getApiErrorDetails } from "@/lib/api";
import { WindowsIcon } from "./security-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Card } from "@/components/ui/card";
import * as Select from "@radix-ui/react-select";
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
  passkeyUnlockMethods,
  type PasskeyUnlockMethod,
} from "@/features/auth/passkeys";

type Action =
  { type: "add" } | { type: "rename" | "remove"; credential: PasskeyMetadata };

export function PasskeyManager() {
  const t = useTranslations("passkeys");
  const locale = useLocale();
  const isAr = locale === "ar";
  const { user } = useAuth();
  const client = useQueryClient();

  const capabilities = useQuery({
    queryKey: passkeyKeys.capabilities,
    queryFn: getPasskeyCapabilities,
    retry: false,
    staleTime: 60000,
  });

  const queryKey = passkeyKeys.list(user?._id ?? "");
  const list = useQuery({
    queryKey,
    queryFn: getPasskeys,
    enabled: Boolean(user && capabilities.data?.enabled),
    retry: false,
  });

  const [action, setAction] = useState<Action | null>(null);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [unlockMethod, setUnlockMethod] =
    useState<PasskeyUnlockMethod>("unspecified");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState("");
  const [dialogMessage, setDialogMessage] = useState("");

  if (!capabilities.data?.enabled || !user) return null;

  const open = (next: Action) => {
    setPassword("");
    setName(next.type === "add" ? "" : next.credential.name);
    setUnlockMethod(
      next.type === "add"
        ? "unspecified"
        : (next.credential.unlockMethod ?? "unspecified"),
    );
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

      await api.post("/auth/passkeys/reauthenticate", {
        password,
        operation: action.type === "add" ? "register" : action.type,
        ...(action.type === "add"
          ? {}
          : { credentialId: action.credential._id }),
      });

      setPassword("");
      if (action.type === "add") {
        const flow = await passkeyRegisterOptions();
        const response = await startRegistration({ optionsJSON: flow.options });
        await api.post("/auth/passkeys/register/verify", {
          flowId: flow.flowId,
          response,
          name: name.trim(),
          unlockMethod,
        });
      } else if (action.type === "rename") {
        await api.patch(`/auth/passkeys/${action.credential._id}`, {
          name: name.trim(),
          unlockMethod,
        });
      } else {
        await api.delete(`/auth/passkeys/${action.credential._id}`);
      }

      setAction(null);
      setMessage(t("saved"));
      await client.invalidateQueries({ queryKey });
    } catch (error: unknown) {
      const details = getApiErrorDetails(error);
      if (details.message.includes("Password verification failed")) {
        setDialogMessage(t("incorrectPassword"));
      } else {
        setDialogMessage(t(passkeyErrorKey(error)));
      }
    } finally {
      setPassword("");
      setBusy(false);
      inFlight.current = false;
    }
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    }).format(new Date(value));

  return (
    <Card className="@container min-w-0 rounded-2xl border border-border/60 bg-card p-4 sm:p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex flex-col @lg:flex-row @lg:items-start @lg:justify-between gap-3 border-b border-border/50 pb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <KeyRound className="h-4.5 w-4.5" />
            </div>
            <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">
              {t("title")}
              {list.data && (
                <span className="rounded-squircle bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {new Intl.NumberFormat(locale).format(list.data.length)}
                </span>
              )}
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground mt-2">
            {t("description")}
          </p>
        </div>

        {/* Add Passkey Button */}
        <Button
          type="button"
          onClick={() => open({ type: "add" })}
          disabled={busy || user.mustChangePassword}
          className="w-full @lg:w-auto rounded-squircle shrink-0 bg-primary font-semibold text-white hover:bg-primary-hover gap-1.5 cursor-pointer shadow-sm text-xs h-auto min-h-11 whitespace-normal py-2.5 px-3.5"
        >
          <Plus className="h-4 w-4" />
          <span>{t("add")}</span>
        </Button>
      </div>

      <div
        role="group"
        className="grid gap-2 @sm:grid-cols-3"
        aria-label={t("supportedMethods")}
      >
        {[
          {
            label: "Touch ID",
            Icon: Fingerprint,
            method: "fingerprint" as const,
          },
          { label: "Face ID", Icon: ScanFace, method: "face" as const },
          {
            label: "Windows Hello",
            Icon: WindowsIcon,
            method: "deviceUnlock" as const,
          },
        ].map(({ label, Icon, method }) => (
          <div
            key={label}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-secondary/20 p-3 @sm:flex-col @sm:text-center"
          >
            <Icon className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-semibold">
                <bdi>{label}</bdi>
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {t(method)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* This deployment does not reliably receive the authenticator's exact UV method. */}
      <div className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
        <Shield className="h-4 w-4 shrink-0 text-teal-500" />
        <span>{t("methodHint")}</span>
      </div>

      {/* List States */}
      {list.isPending && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-teal-500" />
          <span>{t("loading")}</span>
        </div>
      )}

      {list.isError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-xs text-rose-500">
          <span>{t("error")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void list.refetch()}
            className="rounded-squircle text-xs"
          >
            {t("retry")}
          </Button>
        </div>
      )}

      {list.data?.length === 0 && !list.isPending && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/60 text-muted-foreground mb-2.5">
            <Fingerprint className="h-6 w-6" />
          </div>
          <p className="text-xs sm:text-sm font-medium text-foreground">
            {t("empty")}
          </p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            {t("emptyHint")}
          </p>
        </div>
      )}

      {/* Passkey Cards Grid (2 Columns Responsive Grid as requested) */}
      <div className="grid grid-cols-1 @2xl:grid-cols-2 gap-4">
        {list.data?.map((credential) => {
          const method = credential.unlockMethod ?? "unspecified";
          const MethodIcon =
            method === "windowsHello"
              ? WindowsIcon
              : method === "faceId"
                ? ScanFace
                : method === "touchId" || method === "fingerprint"
                  ? Fingerprint
                  : method === "securityKey"
                    ? KeyRound
                    : method === "devicePin"
                      ? Hash
                      : CheckCircle2;
          return (
            <article
              key={credential._id}
              aria-label={credential.name || t("personalPasskey")}
              className="@container/key min-w-0 flex flex-col justify-between gap-4 rounded-2xl border border-border/60 bg-secondary/20 hover:border-teal-500/30 p-3.5 sm:p-4 transition-all duration-200"
            >
              {/* Credential Details */}
              <div className="flex items-start gap-3.5">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400">
                  <MethodIcon className="h-5 w-5" aria-hidden="true" />
                </div>

                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-foreground wrap-anywhere">
                      <bdi>{credential.name || t("personalPasskey")}</bdi>
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {t(`unlockMethods.${method}`)}
                  </p>
                  {method !== "unspecified" && (
                    <p className="text-[11px] text-muted-foreground">
                      {t("labelSelectedByYou")}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-squircle text-[11px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                  <Shield className="h-3 w-3 shrink-0" />
                  <span>
                    {t(
                      credential.deviceType === "singleDevice"
                        ? "singleDevice"
                        : "multiDevice",
                    )}
                  </span>
                </span>

                {/* Backup Pill */}
                {credential.backedUp && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-squircle text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>{t("backedUp")}</span>
                  </span>
                )}
              </div>

              <div className="grid gap-2 text-xs leading-relaxed text-muted-foreground">
                <p className="flex items-start gap-2">
                  <Calendar className="mt-1 h-3 w-3 shrink-0" />
                  <time dateTime={credential.createdAt}>
                    {t("created", { date: formatDate(credential.createdAt) })}
                  </time>
                </p>
                <p className="flex items-start gap-2">
                  <Clock className="mt-1 h-3 w-3 shrink-0" />
                  <span>
                    {credential.lastUsedAt
                      ? t("lastUsed", {
                          date: formatDate(credential.lastUsedAt),
                        })
                      : t("neverUsed")}
                  </span>
                </p>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 @sm/key:grid-cols-2 gap-2 border-t border-border/40 pt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => open({ type: "rename", credential })}
                  className="h-auto min-h-11 whitespace-normal py-2 px-3 rounded-squircle text-xs gap-2 cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("editAction")}</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => open({ type: "remove", credential })}
                  className="h-auto min-h-11 whitespace-normal py-2 px-3 rounded-squircle text-xs gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/30 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{t("removeAction")}</span>
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {message && (
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-teal-600 dark:text-teal-400 font-medium"
        >
          {message}
        </p>
      )}

      {/* Action Dialog (Add / Rename / Remove) */}
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
          dir={isAr ? "rtl" : "ltr"}
          className="max-w-md rounded-2xl border-border bg-card p-6 shadow-xl"
        >
          <DialogHeader className={isAr ? "sm:text-start" : ""}>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <DialogTitle className="text-base font-bold">
                {t(action?.type ?? "add")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {action?.type === "remove" ? t("removeConfirm") : t("reauth")}
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(event) => void submit(event)}
            className="space-y-4 py-2"
          >
            {action?.type !== "remove" && (
              <>
                <div className="space-y-1.5">
                  <label
                    htmlFor="passkey-name"
                    className="text-xs font-semibold text-foreground"
                  >
                    {t("name")}
                  </label>
                  <Input
                    id="passkey-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("namePlaceholder")}
                    maxLength={80}
                    required
                    disabled={busy}
                    className="h-9 rounded-squircle text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <label
                    htmlFor="passkey-unlock-method"
                    className="text-xs font-semibold"
                  >
                    {t("unlockLabel")}
                  </label>
                  <Select.Root
                    dir={isAr ? "rtl" : "ltr"}
                    value={unlockMethod}
                    onValueChange={(value) =>
                      setUnlockMethod(value as PasskeyUnlockMethod)
                    }
                    disabled={busy}
                  >
                    <Select.Trigger
                      id="passkey-unlock-method"
                      aria-describedby="passkey-unlock-hint"
                      className="flex min-h-11 w-full items-center justify-between gap-2 rounded-squircle border border-input bg-background px-3 text-start text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                    >
                      <Select.Value />
                      <Select.Icon>
                        <ChevronDown className="size-4" />
                      </Select.Icon>
                    </Select.Trigger>
                    <Select.Portal>
                      <Select.Content
                        dir={isAr ? "rtl" : "ltr"}
                        position="popper"
                        sideOffset={4}
                        className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-xl"
                      >
                        <Select.Viewport>
                          {passkeyUnlockMethods.map((method) => (
                            <Select.Item
                              key={method}
                              value={method}
                              className="flex cursor-pointer items-center gap-2 rounded-squircle px-3 py-2.5 text-xs outline-none data-highlighted:bg-accent"
                            >
                              <Select.ItemText>
                                {t(`unlockMethods.${method}`)}
                              </Select.ItemText>
                              <Select.ItemIndicator>
                                <Check className="size-4" />
                              </Select.ItemIndicator>
                            </Select.Item>
                          ))}
                        </Select.Viewport>
                      </Select.Content>
                    </Select.Portal>
                  </Select.Root>
                  <p
                    id="passkey-unlock-hint"
                    className="text-xs leading-relaxed text-muted-foreground"
                  >
                    {t("unlockLabelHint")}
                  </p>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="passkey-password"
                className="text-xs font-semibold text-foreground"
              >
                {t("password")}
              </label>
              <PasswordInput
                id="passkey-password"
                dir="ltr"
                className="text-left h-9 rounded-squircle text-xs"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                maxLength={256}
                required
                disabled={busy}
              />
            </div>

            {dialogMessage && (
              <p
                role="alert"
                aria-live="polite"
                className="text-xs text-rose-500 font-medium"
              >
                {dialogMessage}
              </p>
            )}

            <DialogFooter className="gap-2 rtl:sm:justify-start pt-2">
              <Button
                type="submit"
                disabled={
                  busy ||
                  !password ||
                  (action?.type !== "remove" && !name.trim())
                }
                className="rounded-squircle text-xs font-semibold bg-primary text-white hover:bg-primary-hover"
              >
                {busy ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{t("working")}</span>
                  </span>
                ) : (
                  t("confirm")
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  setPassword("");
                }}
                className="rounded-squircle text-xs"
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
