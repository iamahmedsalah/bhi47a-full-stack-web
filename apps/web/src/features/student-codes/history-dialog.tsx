"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
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
            {!query.data?.items.length && (
              <p className="rounded-xl border p-3 text-sm text-muted-foreground">
                {t(
                  query.data?.existingIdentity || query.data?.entry
                    ? "existingHistoryHint"
                    : "noHistory",
                )}
              </p>
            )}
            {query.data?.assignments?.map((assignment, index) => (
              <div
                key={`${assignment.studentId}-${index}`}
                className="rounded-xl border bg-secondary/30 p-3 text-sm space-y-1"
              >
                <p>
                  {t("source")}: {t(`sources.${assignment.source}`)}
                </p>
                <p>
                  {t("previousStudent")}:{" "}
                  <bdi>
                    {(locale === "ar"
                      ? assignment.studentNameAr || assignment.studentName
                      : assignment.studentName) || t("unknownStudent")}
                  </bdi>
                </p>
                <p>
                  {t("observedAt")}:{" "}
                  {new Intl.DateTimeFormat(
                    locale === "ar" ? "ar-EG" : "en-GB",
                    { timeZone: "Africa/Cairo", dateStyle: "medium" },
                  ).format(
                    new Date(assignment.assignedAt ?? assignment.observedAt),
                  )}
                </p>
              </div>
            ))}
            {query.data?.items.map((event) => (
              <article
                key={event._id}
                className="space-y-2 rounded-xl border p-3 text-sm"
              >
                <p className="font-semibold">
                  {t.has(`events.${event.action}`)
                    ? t(`events.${event.action}`)
                    : t("unknownEvent")}
                </p>
                <p>
                  {t("actor")}:{" "}
                  {locale === "ar"
                    ? event.actorNameAr || event.actorName || t("unknownActor")
                    : event.actorName || t("unknownActor")}
                </p>
                <p>
                  {t("source")}:{" "}
                  {event.source && t.has(`sources.${event.source}`)
                    ? t(`sources.${event.source}`)
                    : t("sources.unknown")}
                </p>
                <p className="flex flex-wrap items-center gap-1.5">
                  {event.from && t.has(`statuses.${event.from}`) ? (
                    <>
                      <span>{t(`statuses.${event.from}`)}</span>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 text-primary rtl:rotate-180"
                        aria-hidden="true"
                      />
                    </>
                  ) : null}
                  <span>
                    {t.has(`statuses.${event.to}`)
                      ? t(`statuses.${event.to}`)
                      : t("recorded")}
                  </span>
                </p>
                {event.details && (
                  <div className="space-y-1 rounded-lg border p-2 text-xs">
                    {event.details.reportedOrigin && (
                      <p>
                        {t("reportedOrigin")}:{" "}
                        {t(`sources.${event.details.reportedOrigin}`)} /{" "}
                        {t("adminConfirmedOrigin")}
                      </p>
                    )}
                    {event.details.sourceFile && (
                      <p>
                        {t("sourceFile")}: <bdi>{event.details.sourceFile}</bdi>
                      </p>
                    )}
                    {event.details.batchId && (
                      <p>
                        {t("batchId")}: <bdi>{event.details.batchId}</bdi>
                      </p>
                    )}
                    {Boolean(event.details.rowNumber) &&
                      !event.reason.startsWith("Spreadsheet row ") && (
                        <p>
                          {t("importRow", { row: event.details.rowNumber! })}
                        </p>
                      )}
                    {event.details.previousAcademicYear && (
                      <p>
                        {t("registryYear")}:{" "}
                        <bdi>{event.details.previousAcademicYear}</bdi>
                      </p>
                    )}
                    {event.details.archivedRecords && (
                      <>
                        <p>{t("archivedRecords")}</p>
                        {Object.entries(event.details.archivedRecords).map(
                          ([name, count]) => (
                            <p key={name}>
                              {t.has(`archiveCollections.${name}`)
                                ? t(`archiveCollections.${name}`)
                                : t("otherRecords")}
                              : {count}
                            </p>
                          ),
                        )}
                      </>
                    )}
                  </div>
                )}
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
                  {event.reason === "Manually added student."
                    ? t("manualCreatedReason")
                    : event.reason.startsWith("Spreadsheet row ")
                      ? t("importRow", { row: event.reason.slice(16) })
                      : event.reason ===
                          "Administrator confirmed deletion from student management."
                        ? t("systemReasons.deleted")
                        : event.reason === "Authorized admission approval."
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
