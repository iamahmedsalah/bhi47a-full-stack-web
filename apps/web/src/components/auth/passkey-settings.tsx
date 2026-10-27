"use client";

import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/providers/auth-provider";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPasskeyCapabilities, passkeyKeys } from "@/features/auth/passkeys";

const settingsKey = ["passkeys", "settings"] as const;
type Settings = { studentLoginEnabled: boolean };

export function PasskeySettings() {
  const t = useTranslations("passkeySettings");
  const { user } = useAuth();
  const client = useQueryClient();
  const isAdmin = user?.role === "admin";
  const settings = useQuery({
    queryKey: settingsKey,
    queryFn: async () => (await api.get<Settings>("/auth/passkeys/settings")).data,
    enabled: isAdmin,
  });
  const capabilities = useQuery({
    queryKey: passkeyKeys.capabilities,
    queryFn: getPasskeyCapabilities,
    enabled: isAdmin,
  });
  const mutation = useMutation({
    mutationFn: async (studentLoginEnabled: boolean) =>
      (await api.patch<Settings>("/auth/passkeys/settings", { studentLoginEnabled })).data,
    onSuccess: async (data) => {
      client.setQueryData(settingsKey, data);
      await client.invalidateQueries({ queryKey: passkeyKeys.capabilities });
    },
  });
  const currentSettings = settings.data;

  if (!isAdmin) return null;

  return (
    <Card className="space-y-4 rounded-2xl p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      {settings.isPending && <p role="status">{t("loading")}</p>}
      {settings.isError && (
        <div role="alert" className="space-y-2">
          <p>{t("error")}</p>
          <Button variant="outline" onClick={() => void settings.refetch()}>{t("retry")}</Button>
        </div>
      )}
      {currentSettings && (
        <>
          <p>{t(currentSettings.studentLoginEnabled ? "enabled" : "disabled")}</p>
          {capabilities.data?.enabled === false && (
            <p className="text-sm text-muted-foreground">{t("serverDisabled")}</p>
          )}
          <Button
            type="button"
            className="rounded-squircle"
            variant="outline"
            disabled={mutation.isPending || settings.isFetching}
            onClick={() => mutation.mutate(!currentSettings.studentLoginEnabled)}
          >
            {t(mutation.isPending ? "saving" : currentSettings.studentLoginEnabled ? "hide" : "show")}
          </Button>
        </>
      )}
      {mutation.isError && <p role="alert">{t("error")}</p>}
      {mutation.isSuccess && <p role="status">{t("saved")}</p>}
    </Card>
  );
}
