"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  Clock,
  ExternalLink,
  Globe,
  Info,
  Loader2,
  LogOut,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import api, { getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DeviceIcon, NetworkIcon, PlatformIcon } from "./security-icons";

export interface Session {
  _id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
  ip?: string;
  device?: "mobile" | "tablet" | "computer" | "unknown";
  browser?: string;
  os?: string;
  location?: string;
  country?: string;
  networkType?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;
  locationSource?: string;
}

export function SessionManager() {
  const t = useTranslations("authSecurity");
  const locale = useLocale();
  const isAr = locale === "ar";
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Session | null>(null);
  const queryKey = ["authSessions", user?._id];
  const query = useQuery({
    queryKey,
    queryFn: async () => (await api.get<Session[]>("/auth/sessions")).data,
    enabled: Boolean(user),
    retry: false,
  });

  if (!user) return null;

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(isAr ? "ar-EG" : "en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Cairo",
    }).format(new Date(value));
  const location = (session: Session) => {
    const country =
      session.country && /^[A-Z]{2}$/.test(session.country)
        ? new Intl.DisplayNames([locale], { type: "region" }).of(
            session.country,
          )
        : undefined;
    return (
      [session.location, country].filter(Boolean).join(isAr ? "، " : ", ") ||
      t("unavailable")
    );
  };
  const network = (value?: string) => {
    switch (value) {
      case "wifi":
        return t("wifi");
      case "cellular":
        return t("cellular");
      case "ethernet":
        return t("ethernet");
      case "bluetooth":
        return t("bluetooth");
      case "wimax":
        return "WiMAX";
      default:
        return t("unavailable");
    }
  };
  const hasCoordinates = (session: Session) =>
    typeof session.latitude === "number" &&
    typeof session.longitude === "number" &&
    Number.isFinite(session.latitude) &&
    Number.isFinite(session.longitude) &&
    Math.abs(session.latitude) <= 90 &&
    Math.abs(session.longitude) <= 180;
  const revoke = async (session?: Session) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (session) await api.delete(`/auth/sessions/${session._id}`);
      else await api.post("/auth/logout-all");
      if (!session || session.current) await logout();
      else await queryClient.invalidateQueries({ queryKey });
    } catch (cause) {
      setError(getApiErrorMessage(cause, t("failed")));
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  };
  const sessions = [...(query.data ?? [])].sort(
    (a, b) => Number(b.current) - Number(a.current),
  );

  return (
    <>
      <Card className="@container min-w-0 space-y-5 rounded-2xl border-border/60 bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 border-b border-border/60 pb-5 @lg:flex-row @lg:items-start @lg:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="size-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">
                {t("sessions")}
                {query.data && (
                  <span className="rounded-squircle bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {new Intl.NumberFormat(locale).format(sessions.length)}
                  </span>
                )}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                {t("sessionsDescription")}
              </p>
            </div>
          </div>
          {sessions.length > 0 && (
            <ConfirmDialog
              dir={isAr ? "rtl" : "ltr"}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  className="rounded-squircle self-start shrink-0 gap-2 border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive @lg:self-auto"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  {t("signOutAll")}
                </Button>
              }
              title={t("signOutAll")}
              description={t("signOutAllDescription")}
              confirmLabel={t("confirm")}
              cancelLabel={t("cancel")}
              destructive
              onConfirm={() => void revoke()}
              disabled={busy}
            />
          )}
        </div>

        {query.isPending && (
          <div
            role="status"
            className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {t("loading")}
          </div>
        )}
        {query.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <span>{t("loadFailed")}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              {t("retry")}
            </Button>
          </div>
        )}
        {query.data?.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        )}

        <div className="grid gap-4 @2xl:grid-cols-2">
          {sessions.map((session) => (
            <article
              key={session._id}
              aria-label={`${session.browser || t("unknownBrowser")} · ${session.os || t("unknownOs")}`}
              className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border ${session.current ? "border-primary/40 bg-primary/[0.045]" : "border-border/70 bg-secondary/20"}`}
            >
              {session.current && (
                <div className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
              )}
              <div className="flex items-start gap-3 p-4 sm:p-5">
                <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                  <DeviceIcon device={session.device} className="size-6" />
                  <span className="absolute -bottom-1 -end-1 flex size-5 items-center justify-center rounded-squircle border border-border bg-card">
                    <PlatformIcon os={session.os} className="size-3" />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold">
                      <bdi>{session.os || t("unknownOs")}</bdi>
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-squircle px-2 py-1 text-[11px] font-medium ${session.current ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}
                    >
                      {session.current && (
                        <Check className="size-3" aria-hidden="true" />
                      )}
                      {t(session.current ? "current" : "other")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    <bdi>{session.browser || t("unknownBrowser")}</bdi>
                    <span className="mx-1.5" aria-hidden="true">
                      ·
                    </span>
                    {t(`device_${session.device || "unknown"}`)}
                  </p>
                </div>
              </div>
              <dl className="mx-4 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-border/50 py-4 sm:mx-5">
                <div className="min-w-0">
                  <dt className="mb-1.5 text-[11px] text-muted-foreground">
                    {t("ipAddress")}
                  </dt>
                  <dd
                    className={`break-all text-xs font-medium ${session.ip ? "font-mono" : ""}`}
                  >
                    <bdi dir="ltr">{session.ip || t("unavailable")}</bdi>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="mb-1.5 text-[11px] text-muted-foreground">
                    {t("connection")}
                  </dt>
                  <dd className="flex items-center gap-1.5 text-xs font-medium">
                    <NetworkIcon
                      network={session.networkType}
                      className="size-3.5 shrink-0 text-primary"
                    />
                    {network(session.networkType)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="mb-1.5 text-[11px] text-muted-foreground">
                    {t("approximateLocation")}
                  </dt>
                  <dd className="flex items-start gap-1.5 text-xs font-medium">
                    <MapPin
                      className="size-3.5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <bdi>{location(session)}</bdi>
                  </dd>
                </div>
              </dl>
              <div className="mt-auto space-y-4 p-4 sm:p-5">
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                  <Clock
                    className="mt-0.5 size-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>
                    {t("signedIn", { date: formatDate(session.createdAt) })}
                  </span>
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected(session)}
                    className="rounded-squircle gap-1 px-2 text-xs text-primary"
                  >
                    {t("sessionDetails")}
                    <ArrowUpRight
                      className="size-3.5 rtl:-rotate-90"
                      aria-hidden="true"
                    />
                  </Button>
                  <ConfirmDialog
                    dir={isAr ? "rtl" : "ltr"}
                    trigger={
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        className="rounded-squircle gap-1.5 text-xs hover:border-destructive/30 hover:text-destructive"
                      >
                        <LogOut className="size-3.5" aria-hidden="true" />
                        {t("signOut")}
                      </Button>
                    }
                    title={t("signOut")}
                    description={t(
                      session.current
                        ? "signOutCurrentDescription"
                        : "signOutDescription",
                    )}
                    confirmLabel={t("confirm")}
                    cancelLabel={t("cancel")}
                    destructive
                    disabled={busy}
                    onConfirm={() => void revoke(session)}
                  />
                </div>
              </div>
            </article>
          ))}
        </div>
        {sessions.length > 0 && (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {t("locationHint")}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </Card>

      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-card"
        >
          <DialogHeader className="text-start pe-6">
            <DialogTitle className="flex items-center gap-2 text-base leading-relaxed">
              <Globe
                className="size-5 shrink-0 text-primary"
                aria-hidden="true"
              />
              {t("locationDetails")}
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed">
              {t("locationHint")}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-secondary/30 p-4">
                <DeviceIcon
                  device={selected.device}
                  className="size-6 shrink-0 text-primary"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <bdi>{selected.os || t("unknownOs")}</bdi>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <bdi>{selected.browser || t("unknownBrowser")}</bdi>
                  </p>
                </div>
              </div>
              <dl className="divide-y divide-border/50 text-sm">
                {[
                  [
                    t("approximateLocation"),
                    <bdi key="location">{location(selected)}</bdi>,
                  ],
                  [
                    t("ipAddress"),
                    <bdi
                      key="ip"
                      dir="ltr"
                      className={`break-all text-xs ${selected.ip ? "font-mono" : ""}`}
                    >
                      {selected.ip || t("unavailable")}
                    </bdi>,
                  ],
                  [
                    t("connection"),
                    <span
                      key="network"
                      className="inline-flex items-center gap-1.5"
                    >
                      <NetworkIcon
                        network={selected.networkType}
                        className="size-4 text-primary"
                      />
                      {network(selected.networkType)}
                    </span>,
                  ],
                  [
                    t("provider"),
                    <bdi key="provider">
                      {selected.isp || t("unavailable")}
                    </bdi>,
                  ],
                  [
                    t("coordinates"),
                    <bdi
                      key="coords"
                      dir="ltr"
                      className={`text-xs ${hasCoordinates(selected) ? "font-mono" : ""}`}
                    >
                      {hasCoordinates(selected)
                        ? `${selected.latitude!.toFixed(3)}, ${selected.longitude!.toFixed(3)}`
                        : t("unavailable")}
                    </bdi>,
                  ],
                  [t("signedInLabel"), formatDate(selected.createdAt)],
                  [
                    t("source"),
                    selected.locationSource === "vercel"
                      ? t("vercelLocation")
                      : selected.locationSource === "ipwhois"
                        ? "IPWhois"
                        : t("unavailable"),
                  ],
                ].map(([label, value], index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-start gap-4 py-3"
                  >
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="min-w-0 break-words text-end text-xs font-medium">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="rounded-xl bg-secondary/40 p-3 text-xs leading-relaxed text-muted-foreground">
                {t("networkHint")}
              </p>
              <DialogFooter className="gap-2 rtl:sm:justify-start">
                {hasCoordinates(selected) && (
                  <Button asChild size="sm" className="rounded-squircle gap-2">
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${selected.latitude},${selected.longitude}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="size-4" aria-hidden="true" />
                      {t("viewMap")}
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(null)}
                  className="rounded-squircle"
                >
                  {t("close")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
