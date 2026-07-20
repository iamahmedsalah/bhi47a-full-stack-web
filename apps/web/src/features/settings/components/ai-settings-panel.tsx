"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  KeyRound,
  Loader2,
  Power,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getApiErrorMessage } from "@/lib/api";
import {
  getAiSettings,
  settingsKeys,
  updateAiSettings,
} from "@/features/settings/api";

export function AiSettingsPanel({ locale }: { locale: string }) {
  const t = useTranslations("settings.ai");
  const queryClient = useQueryClient();
  const numberFormatter = new Intl.NumberFormat(
    locale === "ar" ? "ar-EG" : "en-US",
  );
  const settings = useQuery({
    queryKey: settingsKeys.aiSettings,
    queryFn: getAiSettings,
  });
  const toggle = useMutation({
    mutationFn: updateAiSettings,
    onSuccess: (updated) => {
      queryClient.setQueryData(settingsKeys.aiSettings, updated);
      toast.success(
        updated.studentAdvisorEnabled ? t("enabledToast") : t("disabledToast"),
      );
    },
    onError: (error) =>
      toast.error(getApiErrorMessage(error, t("updateFailed"))),
  });

  if (settings.isLoading) {
    return (
      <div className="flex min-h-56 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!settings.data || settings.isError) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
        <AlertTriangle className="h-6 w-6 text-amber-400" />
        <p>{t("loadFailed")}</p>
        <Button variant="outline" onClick={() => void settings.refetch()}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  const data = settings.data;
  const usage = data.usage;
  const hasBudget = usage.monthlyTokenBudget !== null;

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-secondary/15 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-bold">{t("advisorTitle")}</h2>
              <span
                className={
                  data.studentAdvisorEnabled
                    ? "rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-semibold text-emerald-400"
                    : "rounded-full bg-red-500/15 px-2 py-1 text-xs font-semibold text-red-400"
                }
              >
                {data.studentAdvisorEnabled ? t("enabled") : t("disabled")}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("advisorDescription")}
            </p>
          </div>
        </div>
        <Button
          variant={data.studentAdvisorEnabled ? "destructive" : "default"}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(!data.studentAdvisorEnabled)}
          className="min-w-36"
        >
          {toggle.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Power className="h-4 w-4" />
          )}
          {data.studentAdvisorEnabled ? t("turnOff") : t("turnOn")}
        </Button>
      </section>

      <section className="rounded-2xl border border-border bg-secondary/15 p-5">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-bold">
              <Cpu className="h-5 w-5 text-primary" />
              {t("usageTitle")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("providerModel", {
                provider: data.provider,
                model: data.model,
              })}
            </p>
          </div>
          <span
            className={
              data.apiKeyConfigured
                ? "flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-400"
                : "flex items-center gap-1 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-400"
            }
          >
            {data.apiKeyConfigured ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <KeyRound className="h-3.5 w-3.5" />
            )}
            {data.apiKeyConfigured ? t("apiConfigured") : t("apiMissing")}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UsageCard
            label={t("remainingTokens")}
            value={
              usage.remainingTokens === null
                ? t("notConfigured")
                : numberFormatter.format(usage.remainingTokens)
            }
          />
          <UsageCard
            label={t("usedThisMonth")}
            value={numberFormatter.format(usage.currentMonthTokens)}
          />
          <UsageCard
            label={t("allTimeTokens")}
            value={numberFormatter.format(usage.allTimeTokens)}
          />
          <UsageCard
            label={t("allTimeRequests")}
            value={numberFormatter.format(usage.allTimeRequests)}
          />
        </div>

        <div className="mt-5 rounded-xl border border-border/70 bg-background/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-3 text-xs">
            <span className="font-semibold">{t("monthlyUsage")}</span>
            <span className="text-muted-foreground">
              {hasBudget
                ? t("usedOfBudget", {
                    used: numberFormatter.format(usage.currentMonthTokens),
                    budget: numberFormatter.format(
                      usage.monthlyTokenBudget ?? 0,
                    ),
                  })
                : t("budgetMissing")}
            </span>
          </div>
          <Progress
            value={usage.usagePercent ?? 0}
            dir="ltr"
            aria-label={t("monthlyUsage")}
            className="h-3"
          />
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {hasBudget ? t("usageNote") : t("configureBudget")}
          </p>
        </div>
      </section>
    </div>
  );
}

function UsageCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-border/70 bg-background/40 p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <strong className="mt-2 block text-xl font-bold text-primary">
        {value}
      </strong>
    </article>
  );
}
