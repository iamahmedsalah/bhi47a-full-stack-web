"use client";

import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Eye, Loader2, MessagesSquare, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DataTableShell,
  type ColumnDef,
} from "@/components/ui/data-table-shell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FilterBar } from "@/components/ui/filter-bar";
import { PageSkeletonLoader } from "@/components/ui/page-suspense-fallback";
import { PageTitleBanner } from "@/components/ui/page-title-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableActionButton } from "@/components/ui/table-action-button";
import { TableCell } from "@/components/ui/table";
import {
  getAdminChatSession,
  listAdminChatSessions,
  type ChatAuditSessionSummary,
} from "@/features/ai/admin-api";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/cn";

function ChatAuditPageContent() {
  const t = useTranslations("chatAudit");
  const common = useTranslations("common");
  const locale = useLocale();
  const { user, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string>();
  const limit = 20;

  const sessionsQuery = useQuery({
    queryKey: ["admin-ai-chat-audit", page, search],
    queryFn: () =>
      listAdminChatSessions({
        page,
        limit,
        ...(search.trim() ? { search: search.trim() } : {}),
      }),
    enabled: user?.role === "admin",
  });

  const detailQuery = useQuery({
    queryKey: ["admin-ai-chat-audit", "detail", selectedSessionId],
    queryFn: () => getAdminChatSession(selectedSessionId!),
    enabled: Boolean(selectedSessionId),
  });

  const formatDate = (value?: string) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(value))
      : "—";

  const columns: ColumnDef<ChatAuditSessionSummary>[] = [
    {
      key: "student",
      header: t("student"),
      render: (session) => (
        <TableCell className="p-4">
          <p className="font-semibold text-foreground">
            {session.student.name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            {session.student.studentCode || "—"}
          </p>
        </TableCell>
      ),
    },
    {
      key: "messages",
      header: t("messages"),
      render: (session) => (
        <TableCell className="p-4 font-mono font-semibold">
          {session.messageCount}
        </TableCell>
      ),
    },
    {
      key: "preview",
      header: t("lastMessage"),
      render: (session) => (
        <TableCell className="max-w-sm p-4 text-muted-foreground">
          <p className="line-clamp-2">{session.lastMessage?.content || "—"}</p>
        </TableCell>
      ),
    },
    {
      key: "activity",
      header: t("lastActivity"),
      render: (session) => (
        <TableCell className="whitespace-nowrap p-4 text-xs text-muted-foreground">
          {formatDate(session.lastMessageAt || session.updatedAt)}
        </TableCell>
      ),
    },
    {
      key: "status",
      header: common("status"),
      render: (session) => (
        <TableCell className="p-4">
          <StatusBadge
            label={session.isActive ? t("active") : t("ended")}
            variant={session.isActive ? "success" : "neutral"}
          />
        </TableCell>
      ),
    },
    {
      key: "actions",
      header: common("actions"),
      render: (session) => (
        <TableCell className="p-4 text-center">
          <TableActionButton
            variant="primary"
            onClick={() => setSelectedSessionId(session._id)}
          >
            <Eye className="h-4 w-4" />
            {t("view")}
          </TableActionButton>
        </TableCell>
      ),
    },
  ];

  if (authLoading) return <PageSkeletonLoader />;

  if (user?.role !== "admin") {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <ShieldAlert className="h-10 w-10 text-danger" />
        <h1 className="text-xl font-bold">{t("adminOnly")}</h1>
      </div>
    );
  }

  const totalPages = Math.max(1, sessionsQuery.data?.totalPages ?? 1);

  return (
    <div className="animate-fade-in space-y-6 p-2 md:p-6">
      <PageTitleBanner
        title={t("title")}
        subtitle={t("description")}
        icon={<MessagesSquare className="h-5 w-5" />}
      />

      <FilterBar
        search={search}
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder={t("searchPlaceholder")}
      />

      <DataTableShell
        columns={columns}
        data={sessionsQuery.data?.items ?? []}
        keyExtractor={(session) => session._id}
        isLoading={sessionsQuery.isLoading}
        isError={sessionsQuery.isError}
        error={sessionsQuery.error}
        emptyMessage={t("empty")}
        loadingMessage={common("loading")}
        onRetry={() => void sessionsQuery.refetch()}
        retryLabel={common("retry")}
      />

      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/70 p-3">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1 || sessionsQuery.isLoading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          {common("previous")}
        </Button>
        <span className="font-mono text-sm text-muted-foreground">
          {t("page", { page, totalPages })}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages || sessionsQuery.isLoading}
          onClick={() =>
            setPage((current) => Math.min(totalPages, current + 1))
          }
        >
          {common("next")}
        </Button>
      </div>

      <Dialog
        open={Boolean(selectedSessionId)}
        onOpenChange={(open) => !open && setSelectedSessionId(undefined)}
      >
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{t("conversation")}</DialogTitle>
            <DialogDescription>
              {detailQuery.data
                ? `${detailQuery.data.student.name} · ${detailQuery.data.student.studentCode || "—"}`
                : t("loadingConversation")}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-border/70 bg-background/50 p-4">
            {detailQuery.isLoading ? (
              <div className="flex min-h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : detailQuery.isError ? (
              <p className="py-12 text-center text-sm text-danger">
                {t("loadError")}
              </p>
            ) : (
              (detailQuery.data?.messages ?? []).map((message, index) => (
                <div
                  key={`${message.timestamp}-${index}`}
                  className={cn(
                    "max-w-[85%] rounded-2xl border px-4 py-3",
                    message.role === "user"
                      ? "ms-auto border-primary/30 bg-primary/10"
                      : "me-auto border-border bg-card",
                  )}
                >
                  <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                    {message.role === "user"
                      ? t("studentRole")
                      : t("assistantRole")}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </p>
                  <time className="mt-2 block text-end text-[10px] text-muted-foreground">
                    {formatDate(message.timestamp)}
                  </time>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function ChatAuditPage() {
  return (
    <Suspense fallback={<PageSkeletonLoader />}>
      <ChatAuditPageContent />
    </Suspense>
  );
}
