"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  formatStaffDisplayName,
  type Permission,
} from "@student-portal/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StaffPermissionFields } from "./staff-permission-fields";
import type { StaffMember } from "../types";

interface Props {
  staff: StaffMember;
  pending: boolean;
  onClose: () => void;
  onSave: (permissions: Permission[]) => Promise<void>;
}

export function StaffPermissionsDialog({
  staff,
  pending,
  onClose,
  onSave,
}: Props) {
  const t = useTranslations("staff");
  const locale = useLocale();
  const [selected, setSelected] = useState<Permission[]>(
    staff.permissions ?? [],
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="flex max-h-[88vh] max-w-3xl flex-col overflow-hidden border-border bg-card"
      >
        <DialogHeader>
          <DialogTitle>
            {t("permissions.title", {
              name: formatStaffDisplayName(staff, locale),
            })}
          </DialogTitle>
          <DialogDescription>{t("permissions.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto py-2">
          <StaffPermissionFields
            value={selected}
            onChange={setSelected}
            currentStaffType={staff.staffType}
            disabled={pending}
          />
        </div>
        <DialogFooter className="rtl:sm:justify-start">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            disabled={pending}
            onClick={() => onSave(selected)}
            className="gap-2"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
