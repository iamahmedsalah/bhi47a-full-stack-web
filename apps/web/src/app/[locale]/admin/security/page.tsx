import { PasskeyManager } from "@/components/auth/passkey-manager";
import { SessionManager } from "@/components/auth/session-manager";
import { PasskeySettings } from "@/components/auth/passkey-settings";
import { getTranslations } from "next-intl/server";
import { ShieldCheck } from "lucide-react";

export default async function AccountSecurityPage() {
  const t = await getTranslations("authSecurity");
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
          <ShieldCheck className="size-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("overview")}
          </p>
        </div>
      </div>
      <PasskeySettings />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <SessionManager />
        <PasskeyManager />
      </div>
    </div>
  );
}
