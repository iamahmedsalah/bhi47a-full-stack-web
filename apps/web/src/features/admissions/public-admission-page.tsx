"use client";
import { getAdmissionErrorMessage } from "./admission-error";
import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { AdmissionReceipt, AdmissionStatus } from "@student-portal/shared";
import { Button } from "@/components/ui/button";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GlassCard } from "@/components/ui/glass-card";
import {
  UserPlus,
  Search,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Printer,
  ExternalLink,
} from "lucide-react";
import { CopyButton } from "@/components/ui/copy-button";
import { ApplicantForm } from "./applicant-form";
import {
  publicAdmissionStatus,
  publicAdmissionSubmit,
  publicAdmissionValidate,
} from "./workflow-api";
import { AdmissionInput, Field, useAdmissionUI } from "./workflow-ui";
import { cn } from "@/lib/cn";

interface TurnstileAPI {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme?: "dark" | "light" | "auto";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
      language: string;
    },
  ) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
}
function turnstile(): TurnstileAPI | undefined {
  return (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
}
function AdmissionCaptcha({
  onToken,
  attempt,
}: {
  onToken: (token: string) => void;
  attempt: number;
}) {
  const { t, locale } = useAdmissionUI(),
    element = useRef<HTMLDivElement>(null),
    widgetIdRef = useRef<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [widgetError, setWidgetError] = useState(false),
    [retryCounter, setRetryCounter] = useState(0);
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!sitekey && process.env.NODE_ENV !== "production") {
      onToken("cf-turnstile-dummy-pass-token");
    }
  }, [sitekey, onToken]);

  useEffect(() => {
    const api = turnstile();
    if (!loaded || !api || !element.current || !sitekey) return;

    if (widgetIdRef.current) {
      try {
        api.remove(widgetIdRef.current);
      } catch {
        // ignore removal error
      }
      widgetIdRef.current = null;
    }

    setWidgetError(false);
    try {
      widgetIdRef.current = api.render(element.current, {
        sitekey,
        theme: "dark",
        action: "admission",
        language: locale,
        callback: (token) => {
          setWidgetError(false);
          onToken(token);
        },
        "expired-callback": () => {
          onToken("");
          setWidgetError(true);
        },
        "error-callback": () => {
          setWidgetError(true);
          if (widgetIdRef.current && api) {
            try {
              api.remove(widgetIdRef.current);
            } catch {
              // ignore
            }
            widgetIdRef.current = null;
          }
          if (element.current) {
            element.current.innerHTML = "";
          }
          onToken("");
        },
      });
    } catch {
      setWidgetError(true);
      onToken("");
    }

    return () => {
      if (widgetIdRef.current && api) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // ignore cleanup error
        }
        widgetIdRef.current = null;
      }
    };
  }, [loaded, sitekey, locale, onToken, attempt, retryCounter]);

  return (
    <div className="my-4 flex flex-col items-center justify-center rounded-2xl border border-border/60 bg-surface/40 p-4 shadow-xs">
      <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <span>{t("captcha.title")}</span>
      </div>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setLoaded(true)}
        onError={() => {
          setWidgetError(true);
          onToken("");
        }}
      />
      {widgetError && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl bg-danger/10 border border-danger/20 px-3.5 py-2 text-xs text-danger font-medium"
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>{t("captcha.failed")}</span>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onToken("");
              setRetryCounter((value) => value + 1);
            }}
          >
            {t("retry")}
          </Button>
        </div>
      )}
      <div
        ref={element}
        style={{ display: widgetError ? "none" : "flex" }}
        className="min-h-[65px] items-center justify-center overflow-hidden rounded-xl"
      />
      {!sitekey && !widgetError && (
        <p className="text-xs text-muted-foreground/80 mt-1">
          {process.env.NODE_ENV === "production"
            ? t("verificationUnavailable")
            : t("captcha.development")}
        </p>
      )}
    </div>
  );
}
export function PublicAdmissionPage() {
  const { t, dir, locale } = useAdmissionUI(),
    [session, setSession] = useState<{
      admissionSession: string;
      academicYear: string;
      name: string;
      nameAr?: string;
    } | null>(null),
    [receipt, setReceipt] = useState<AdmissionReceipt | null>(null),
    [qrToken, setQrToken] = useState(""),
    [accessId, setAccessId] = useState(""),
    [captcha, setCaptcha] = useState(""),
    [attempt, setAttempt] = useState(0),
    [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<string>("apply");
  const [statusPrefill, setStatusPrefill] = useState<{
    ref: string;
    secret: string;
  } | null>(null);
  const key = useRef("");

  const handlePrintReceipt = (rec: AdmissionReceipt) => {
    const printWindow = window.open("", "_blank");
    const isAr = locale === "ar";
    const content = `
      <!DOCTYPE html>
      <html dir="${isAr ? "rtl" : "ltr"}" lang="${locale}">
      <head>
        <meta charset="utf-8">
        <title>${isAr ? "إيصال تقديم طلب التحاق" : "Admission Application Receipt"}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #111; background: #fff; }
          .receipt-card { border: 2px solid #0d9488; border-radius: 16px; padding: 32px; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .header { text-align: center; border-bottom: 2px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px; }
          .logo { width: 80px; height: 80px; object-fit: contain; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: bold; color: #0f766e; margin: 0; }
          .subtitle { font-size: 14px; color: #4b5563; margin-top: 4px; }
          .badge { display: inline-block; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 4px 16px; font-weight: bold; font-size: 13px; margin-top: 12px; }
          .section { margin: 20px 0; }
          .field { margin-bottom: 16px; }
          .field-label { font-size: 12px; color: #6b7280; font-weight: 600; text-transform: uppercase; margin-bottom: 4px; }
          .field-value { font-family: monospace; font-size: 18px; font-weight: bold; background: #f3f4f6; padding: 10px 14px; border-radius: 8px; border: 1px solid #d1d5db; word-break: break-all; }
          .highlight { background: #f0fdfa; border-color: #5eead4; color: #0f766e; }
          .footer { border-top: 1px dashed #d1d5db; margin-top: 24px; padding-top: 16px; font-size: 12px; color: #6b7280; text-align: center; line-height: 1.6; }
        </style>
      </head>
      <body>
        <div class="receipt-card">
          <div class="header">
            <img src="/logo.webp" class="logo" alt="Logo" />
            <h1 class="title">${isAr ? "المعهد العالي للعلوم الإدارية المتقدمة والحاسبات (47 ك)" : "Higher Institute for Advanced Management Sciences & Computers (47A)"}</h1>
            <p class="subtitle">${isAr ? "إيصال استلام طلب الالتحاق الجديد" : "New Admission Application Receipt"}</p>
            <div class="badge">${isAr ? "تم استلام الطلب بنجاح" : "Application Received"}</div>
          </div>
          <div class="section">
            <div class="field">
              <div class="field-label">${isAr ? "مرجع طلب الالتحاق (Public Reference)" : "Public Reference"}</div>
              <div class="field-value highlight">${rec.publicReference}</div>
            </div>
            <div class="field">
              <div class="field-label">${isAr ? "الرمز السري للمتابعة (Tracking Secret)" : "Tracking Secret"}</div>
              <div class="field-value highlight">${rec.secret}</div>
            </div>
            <div class="field">
              <div class="field-label">${isAr ? "تاريخ التقديم" : "Submission Date"}</div>
              <div class="field-value" style="font-family: inherit; font-size: 14px;">${new Date().toLocaleString(isAr ? "ar-EG" : "en-GB", { timeZone: "Africa/Cairo" })}</div>
            </div>
          </div>
          <div class="footer">
            <p>${isAr ? "احتفظ بهذا الإيصال للمتابعة والاستعلام عن حالة القبول عبر بوابة المعهد." : "Keep this receipt to track and inquire about your admission status on the institute portal."}</p>
            <p>${isAr ? "يصدر كود الطالب الأكاديمي رسمياً بعد موافقة إدارة شؤون الطلاب واستيفاء الأوراق." : "Student code will be issued officially after admission review and documents verification."}</p>
          </div>
        </div>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;
    if (!printWindow) {
      window.print();
      return;
    }
    printWindow.document.write(content);
    printWindow.document.close();
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const tab = sp.get("tab");
      const ref = sp.get("ref");
      const sec = sp.get("secret");
      if (tab === "status" || ref) {
        setActiveTab("status");
        if (ref) setStatusPrefill({ ref, secret: sec ?? "" });
      }
    }
  }, []);
  const schema = z.object({
    pin: z.string().trim().regex(/^\d{8,12}$/, t("pinHint")),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { pin: "" },
  });
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    setAccessId(params.get("access") ?? "");
    setQrToken(params.get("token") ?? "");
    // Admission secrets stay out of HTTP URLs, referrers and browser persistence.
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
    key.current = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, "0"),
    ).join("");
  }, []);
  const validate = async (pin?: string) => {
    setError("");
    try {
      setSession(
        await publicAdmissionValidate({
          accessId: pin ? undefined : accessId || undefined,
          ...(pin ? { pin } : { token: qrToken }),
        }),
      );
      setQrToken("");
    } catch (e) {
      setError(getAdmissionErrorMessage(e, t));
    }
  };
  return (
    <main
      className="mx-auto min-h-[75vh] max-w-4xl space-y-8 px-4 py-8 md:py-12"
      dir={dir}
    >
      <div className="flex flex-col items-center justify-center text-center space-y-3 pb-2">
        <img
          src="/logo.webp"
          alt="Institute Logo"
          width={84}
          height={84}
          className="h-20 w-20 object-contain drop-shadow-md"
        />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-teal-400/90 tracking-wide">
            {locale === "ar"
              ? "المعهد العالي للعلوم الإدارية المتقدمة والحاسبات (47 ك)"
              : "Higher Institute for Advanced Management Sciences & Computers (47A)"}
          </h2>
          <h1 className="text-3xl font-black text-foreground">
            {t("publicTitle")}
          </h1>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        dir={dir}
        className="w-full"
      >
        <TabsList className="grid w-full grid-cols-2 h-12 p-1 bg-surface/50 border border-border/50 rounded-xl mb-6">
          <TabsTrigger
            value="apply"
            className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold transition-all"
          >
            <UserPlus className="h-4 w-4" />
            <span>{t("apply")}</span>
          </TabsTrigger>
          <TabsTrigger
            value="status"
            className="gap-2 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-semibold transition-all"
          >
            <Search className="h-4 w-4" />
            <span>{t("track")}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="apply">
          <div className="space-y-5 rounded-2xl border border-border/60 bg-card/80 p-5 sm:p-8 shadow-sm backdrop-blur-sm">
            {receipt ? (
              <div className="space-y-5" role="status">
                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                  <CheckCircle2 className="h-7 w-7 shrink-0 text-emerald-400" />
                  <div>
                    <h2 className="text-lg font-bold text-foreground">
                      {t("submitted")}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("keepReceipt")}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 p-4 rounded-xl border border-border/70 bg-surface/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("reference")}:
                    </span>
                    <CopyButton
                      value={receipt.publicReference}
                      className="rounded-squircle h-7 w-7 p-1"
                    />
                  </div>
                  <div
                    className="p-3 rounded-lg border border-primary/30 bg-primary/5 font-mono text-base font-bold text-primary tracking-wider"
                    dir="ltr"
                  >
                    {receipt.publicReference}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {t("trackingSecret")}:
                    </span>
                    <CopyButton
                      value={receipt.secret}
                      className="rounded-squircle h-7 w-7 p-1"
                    />
                  </div>
                  <div
                    className="p-3 rounded-lg border border-border/80 bg-background font-mono text-sm font-bold text-foreground tracking-wider break-all"
                    dir="ltr"
                  >
                    {receipt.secret}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    className="gap-2 rounded-squircle"
                    onClick={() => handlePrintReceipt(receipt)}
                  >
                    <Printer className="h-4 w-4" />
                    <span>
                      {locale === "ar"
                        ? "طباعة / حفظ الإيصال"
                        : "Print / Save Receipt"}
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2 rounded-squircle"
                    onClick={() => {
                      setStatusPrefill({
                        ref: receipt.publicReference,
                        secret: receipt.secret,
                      });
                      setActiveTab("status");
                    }}
                  >
                    <Search className="h-4 w-4" />
                    <span>
                      {locale === "ar"
                        ? "متابعة حالة الطلب الآن"
                        : "Track Status Now"}
                    </span>
                  </Button>
                </div>
              </div>
            ) : !session ? (
              <div className="space-y-5">
                <div className="rounded-xl bg-teal-500/10 border border-teal-500/20 p-4 text-center">
                  <p className="text-sm font-medium text-teal-300">
                    {t("invitationPrompt")}
                  </p>
                </div>
                {qrToken ? (
                  <div className="flex justify-center pt-2">
                    <Button
                      onClick={() => validate()}
                      className="gap-2 rounded-squircle px-8 h-11"
                    >
                      <KeyRound className="h-4 w-4" />
                      <span>{t("openInvitation")}</span>
                    </Button>
                  </div>
                ) : (
                  <form
                    className="space-y-4 max-w-md mx-auto"
                    onSubmit={form.handleSubmit(async (values) =>
                      validate(values.pin),
                    )}
                  >
                    <Field
                      label={t("fields.pin")}
                      error={form.formState.errors.pin?.message}
                    >
                      <AdmissionInput
                        {...form.register("pin")}
                        dir="ltr"
                        className="text-center font-mono text-xl tracking-widest h-12"
                        inputMode="numeric"
                        maxLength={12}
                        placeholder="••••••••"
                        autoComplete="off"
                      />
                    </Field>
                    <Button
                      disabled={form.formState.isSubmitting}
                      className="w-full rounded-squircle h-11"
                    >
                      {t("openInvitation")}
                    </Button>
                  </form>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-border/50">
                  <h2 className="text-lg font-bold text-foreground">
                    {locale === "ar"
                      ? session.nameAr || session.name
                      : session.name}{" "}
                    ·{" "}
                    <bdi className="text-primary font-mono">
                      {session.academicYear}
                    </bdi>
                  </h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setSession(null);
                      setCaptcha("");
                      setAccessId("");
                      setQrToken("");
                      form.reset();
                    }}
                  >
                    {t("changeInvitation")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("sessionHint")}
                </p>
                <ApplicantForm
                  publicForm
                  disabled={!captcha}
                  onSave={async (values) => {
                    try {
                      setReceipt(
                        await publicAdmissionSubmit({
                          ...values,
                          admissionSession: session.admissionSession,
                          submissionKey: key.current,
                          captchaToken: captcha,
                        }),
                      );
                      setSession(null);
                    } finally {
                      setCaptcha("");
                      setAttempt((value) => value + 1);
                    }
                  }}
                >
                  <AdmissionCaptcha onToken={setCaptcha} attempt={attempt} />
                  <p className="text-xs text-muted-foreground text-center">
                    {t("privacyHint")}
                  </p>
                </ApplicantForm>
              </>
            )}
            {error && (
              <p
                role="alert"
                className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl"
              >
                {error}
              </p>
            )}
          </div>
        </TabsContent>
        <TabsContent value="status">
          <PublicStatusForm
            initialReference={statusPrefill?.ref}
            initialSecret={statusPrefill?.secret}
          />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function PublicStatusForm({
  initialReference = "",
  initialSecret = "",
}: {
  initialReference?: string;
  initialSecret?: string;
}) {
  const { t, dir, locale } = useAdmissionUI(),
    [result, setResult] = useState<AdmissionStatus | null>(null),
    [error, setError] = useState("");
  const schema = z.object({
    publicReference: z
      .string()
      .trim()
      .regex(/^ADM-[A-F0-9]{24}$/, t("invalid")),
    secret: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{43}$/, t("invalid")),
  });
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      publicReference: initialReference,
      secret: initialSecret,
    },
  });

  useEffect(() => {
    if (initialReference) {
      form.setValue("publicReference", initialReference);
    }
    if (initialSecret) {
      form.setValue("secret", initialSecret);
    }
    if (initialReference && initialSecret) {
      form.handleSubmit(async (values) => {
        setError("");
        setResult(null);
        try {
          setResult(await publicAdmissionStatus(values));
        } catch (e) {
          setError(getAdmissionErrorMessage(e, t));
        }
      })();
    }
  }, [initialReference, initialSecret]);

  return (
    <form
      className="space-y-5 rounded-2xl border border-border/60 bg-card/80 p-5 sm:p-8 shadow-sm backdrop-blur-sm max-w-xl mx-auto"
      onSubmit={form.handleSubmit(async (values) => {
        setError("");
        setResult(null);
        try {
          setResult(await publicAdmissionStatus(values));
        } catch (e) {
          setError(getAdmissionErrorMessage(e, t));
        }
      })}
    >
      <div className="space-y-1 text-center pb-2">
        <h3 className="text-lg font-bold text-foreground flex items-center justify-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          <span>{t("track")}</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          {t("trackPrompt") ||
            (dir === "rtl"
              ? "أدخل مرجع الطلب والرمز السري لمعرفة حالة طلبك"
              : "Enter your public reference and secret to check status")}
        </p>
      </div>

      <Field
        label={t("reference")}
        error={form.formState.errors.publicReference?.message}
      >
        <AdmissionInput
          {...form.register("publicReference")}
          dir="ltr"
          placeholder="ADM-..."
          className="text-left font-mono h-11"
          autoComplete="off"
        />
      </Field>
      <Field
        label={t("trackingSecret")}
        error={form.formState.errors.secret?.message}
      >
        <AdmissionInput
          {...form.register("secret")}
          dir="ltr"
          placeholder="•••••••••••••••••••••••••••••••••••••••••••"
          className="text-left font-mono h-11"
          autoComplete="off"
        />
      </Field>
      <Button
        disabled={form.formState.isSubmitting}
        className="w-full rounded-squircle h-11 font-semibold"
      >
        {t("track")}
      </Button>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl"
        >
          {error}
        </p>
      )}
      {result && (
        <div
          role="status"
          className="space-y-3 rounded-xl border border-border/60 bg-surface/40 p-4"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              {t("statusLabel")}:
            </span>
            <span
              className={cn(
                "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold",
                result.status === "APPROVED" &&
                  "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
                result.status === "REJECTED" &&
                  "bg-rose-500/10 text-rose-400 border border-rose-500/20",
                result.status === "WAITLISTED" &&
                  "bg-amber-500/10 text-amber-400 border border-amber-500/20",
                result.status === "PENDING" &&
                  "bg-sky-500/10 text-sky-400 border border-sky-500/20",
                result.status === "CANCELLED" &&
                  "bg-slate-500/10 text-slate-400 border border-slate-500/20",
              )}
            >
              {t(`status.${result.status}`)}
            </span>
          </div>

          {result.status === "APPROVED" && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                <span>
                  {locale === "ar"
                    ? "مبروك! تمت الموافقة على طلب الالتحاق الخاص بك"
                    : "Congratulations! Your admission request has been approved"}
                </span>
              </div>
              {result.studentCode ? (
                <div className="mt-2 p-3 rounded-lg bg-surface/70 border border-emerald-500/30 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground block mb-0.5">
                      {t("studentCode")}:
                    </span>
                    <bdi className="font-mono text-2xl font-bold tracking-wider text-emerald-300">
                      {result.studentCode}
                    </bdi>
                  </div>
                  <CopyButton
                    value={result.studentCode}
                    className="rounded-squircle h-8 w-8 p-1.5"
                  />
                </div>
              ) : (
                <p className="text-xs text-emerald-300/80">
                  {locale === "ar"
                    ? "جارٍ استكمال إجراءات القيد وإصدار كود الطالب الأكاديمي."
                    : "Enrollment is being finalized and student code will be issued shortly."}
                </p>
              )}
            </div>
          )}

          {result.status === "REJECTED" && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
                <span>
                  {locale === "ar"
                    ? "نأسف، لم تتم الموافقة على طلب الالتحاق"
                    : "Admission request not accepted"}
                </span>
              </div>
              {result.rejection && (
                <div className="mt-1 p-2.5 rounded-lg bg-surface/50 border border-rose-500/20 text-xs space-y-1">
                  <span className="font-bold text-rose-400 block">
                    {t(`reasons.${result.rejection.reasonCode}`)}
                  </span>
                  <p>{result.rejection.explanation}</p>
                </div>
              )}
            </div>
          )}

          {result.status === "WAITLISTED" && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <Clock className="h-5 w-5 text-amber-400 shrink-0" />
                <span>
                  {locale === "ar"
                    ? "طلبك مدرج حالياً في قائمة الانتظار"
                    : "Your application is currently waitlisted"}
                </span>
              </div>
              {result.waitlistPosition && (
                <p className="text-xs">
                  {t("waitlistPosition", {
                    position: result.waitlistPosition,
                  })}
                </p>
              )}
            </div>
          )}

          {result.status === "PENDING" && (
            <div className="p-3 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-300 text-xs flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-sky-400" />
              <span>
                {locale === "ar"
                  ? "طلبك قيد المراجعة والتدقيق حالياً من قبل إدارة شؤون الطلاب."
                  : "Your application is currently under review by the admissions team."}
              </span>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
