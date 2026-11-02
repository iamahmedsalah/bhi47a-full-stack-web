"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getCodeHistory } from "./api";

export function CodeHistoryDialog({
  code,
  close,
}: {
  code: string;
  close: () => void;
}) {
  const [page, setPage] = useState(1);
  const t = useTranslations("studentCodes");
  const locale = useLocale();
  const query = useQuery({
    queryKey: ["student-code-history", code, page],
    queryFn: () => getCodeHistory(code, page),
    retry: false,
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        dir={locale === "ar" ? "rtl" : "ltr"}
        className="max-h-[90vh] overflow-y-auto rounded-2xl"
      >
        <DialogHeader className="text-start">
          <DialogTitle>
            {t("history")} <bdi>{code}</bdi>
          </DialogTitle>
        </DialogHeader>
        {query.isLoading ? (
          <p>{t("loading")}</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{t("errors.load")}</p>
            <Button
              variant="outline"
              onClick={() => {
                void query.refetch();
              }}
            >
              {t("retry")}
            </Button>
          </div>
        ) : (
          <>
            {!query.data?.items.length && <p>{t("noHistory")}</p>}
            {query.data?.items.map((event) => (
              <article
                key={event._id}
                className="space-y-2 rounded-xl border p-3 text-sm"
              >
                <p className="font-semibold">{t(`events.${event.action}`)}</p>
                <p>
                  {new Intl.DateTimeFormat(
                    locale === "ar" ? "ar-EG" : "en-GB",
                    {
                      timeZone: "Africa/Cairo",
                      dateStyle: "medium",
                      timeStyle: "short",
                    },
                  ).format(new Date(event.at))}
                </p>
                <p>
                  {event.reason === "Authorized admission approval."
                    ? t("systemReasons.assigned")
                    : event.reason ===
                        "Existing identity or academic records reference this code."
                      ? t("systemReasons.references")
                      : event.reason}
                </p>

              </article>
            ))}
            <div className="flex justify-between">
              <Button
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage(page - 1)}
              >
                {t("previous")}
              </Button>
              <Button
                variant="outline"
                disabled={
                  page >= (query.data?.totalPages ?? 1) || query.isFetching
                }
                onClick={() => setPage(page + 1)}
              >
                {t("next")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
