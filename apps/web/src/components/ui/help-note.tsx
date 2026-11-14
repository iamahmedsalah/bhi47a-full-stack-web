"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronDown, Info } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function HelpNote({
  title,
  children,
  icon,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible.Root
      className={cn(
        "rounded-xl border border-primary/25 bg-primary/5 text-start",
        className,
      )}
    >
      <Collapsible.Trigger className="group flex min-h-10 w-full items-center gap-2 rounded-squircle px-3 py-2 text-start text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        {icon ?? <Info className="size-4 shrink-0" aria-hidden="true" />}
        <span className="flex-1">{title}</span>
        <ChevronDown
          className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </Collapsible.Trigger>
      <Collapsible.Content className="px-3 pb-3 text-xs leading-6" role="note">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
