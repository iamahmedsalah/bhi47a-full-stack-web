"use client";

import { useTranslations } from "next-intl";
import { Info, AlertTriangle, Eye, Calculator } from "lucide-react";

export function ControlHelpNotes({ scheme = false }: { scheme?: boolean }) {
  const t = useTranslations("control");
  const notes = [
    ...(scheme
      ? [
          {
            title: "schemeHelpTitle",
            body: "schemeHelpBody",
            icon: Calculator,
            color:
              "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
          },
        ]
      : []),
    {
      title: "entryHelpTitle",
      body: "entryHelpBody",
      icon: Info,
      color:
        "border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-200",
    },
    {
      title: "freezeHelpTitle",
      body: "freezeHelpBody",
      icon: AlertTriangle,
      color:
        "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    },
    {
      title: "visibilityHelpTitle",
      body: "visibilityHelpBody",
      icon: Eye,
      color:
        "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-200",
    },
  ];
  return (
    <div className="space-y-2">
      {notes.map(({ title, body, icon: Icon, color }) => (
        <div
          role="note"
          key={title}
          className={`flex gap-2 rounded-xl border p-3 text-xs leading-relaxed ${color}`}
        >
          <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">{t(title)}</p>
            <p className="whitespace-pre-line">{t(body)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
