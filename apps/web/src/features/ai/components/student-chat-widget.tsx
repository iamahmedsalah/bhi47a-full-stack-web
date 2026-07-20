"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot, Loader2, Send, Sparkles, User, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/auth-provider";
import {
  getChatStatus,
  sendChatMessage,
  StudentChatDisabledError,
  StudentChatRateLimitError,
} from "../api";

interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}

function messageId(sender: ChatMessage["sender"]) {
  return `${sender}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function StudentChatWidget() {
  const t = useTranslations("studentChat");
  const locale = useLocale() as "ar" | "en";
  const { user, loading: authLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [remainingMessages, setRemainingMessages] = useState<number>();
  const [quotaResetAt, setQuotaResetAt] = useState<string>();
  const [advisorEnabled, setAdvisorEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const presetPrompts = [
    { label: t("presets.courses"), query: t("queries.courses") },
    { label: t("presets.gpa"), query: t("queries.gpa") },
    { label: t("presets.complaint"), query: t("queries.complaint") },
    { label: t("presets.faqs"), query: t("queries.faqs") },
  ];

  useEffect(() => {
    if (authLoading || user?.role !== "student") return;
    let active = true;
    void getChatStatus()
      .then((status) => {
        if (active) setAdvisorEnabled(status.enabled);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authLoading, user?.role]);

  useEffect(() => {
    if (!isOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    inputRef.current?.focus();
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  useEffect(() => {
    if (remainingMessages !== 0 || !quotaResetAt) return;
    const delay = Math.max(0, new Date(quotaResetAt).getTime() - Date.now());
    const timer = window.setTimeout(() => {
      setRemainingMessages(undefined);
      setQuotaResetAt(undefined);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [quotaResetAt, remainingMessages]);

  if (authLoading || user?.role !== "student") return null;

  const timestamp = () =>
    new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading || remainingMessages === 0 || !advisorEnabled) return;

    setMessages((current) => [
      ...current,
      {
        id: messageId("user"),
        sender: "user",
        text: query,
        timestamp: timestamp(),
      },
    ]);
    setInput("");
    setLoading(true);

    try {
      const response = await sendChatMessage(query, sessionId, locale);
      setSessionId(response.sessionId);
      setRemainingMessages(response.rateLimit?.remaining);
      setQuotaResetAt(response.rateLimit?.resetAt);
      setMessages((current) => [
        ...current,
        {
          id: messageId("assistant"),
          sender: "assistant",
          text: response.answer,
          timestamp: timestamp(),
        },
      ]);
    } catch (error) {
      const isRateLimited = error instanceof StudentChatRateLimitError;
      const isDisabled = error instanceof StudentChatDisabledError;
      if (isRateLimited) {
        setRemainingMessages(0);
        setQuotaResetAt(error.resetAt);
      }
      if (isDisabled) setAdvisorEnabled(false);
      setMessages((current) => [
        ...current,
        {
          id: messageId("assistant"),
          sender: "assistant",
          text: isRateLimited
            ? t("limitReached")
            : isDisabled
              ? t("disabledMessage")
              : t("connectionError"),
          timestamp: timestamp(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 inset-s-4 z-50 sm:bottom-6 sm:inset-s-6">
      <AnimatePresence>
        {isOpen ? (
          <motion.section
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            role="dialog"
            aria-modal="false"
            aria-labelledby="student-chat-title"
            className="mb-3 flex h-[min(34rem,calc(100vh-7rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-primary/30 bg-background/95 shadow-2xl backdrop-blur-md"
          >
            <header className="flex items-center justify-between border-b border-border bg-primary/10 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Bot className="h-5 w-5" aria-hidden="true" />
                  <span
                    className={cn(
                      "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                      advisorEnabled ? "bg-emerald-400" : "bg-red-400",
                    )}
                  />
                </span>
                <div>
                  <h2
                    id="student-chat-title"
                    className="flex items-center gap-1.5 text-sm font-bold"
                  >
                    {t("title")}
                    <Sparkles
                      className="h-3.5 w-3.5 text-primary"
                      aria-hidden="true"
                    />
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    {advisorEnabled ? t("status") : t("disabledStatus")}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                aria-label={t("close")}
                className="h-8 w-8 rounded-full"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </header>

            <div
              className="flex-1 space-y-3 overflow-y-auto p-4 text-sm"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="flex min-h-full flex-col justify-center text-center">
                  <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                    <Bot className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <h3 className="font-bold">
                    {t("welcome", { name: user.name })}
                  </h3>
                  <p className="mt-1 px-4 text-xs leading-relaxed text-muted-foreground">
                    {t("description")}
                  </p>
                  <div className="mt-5 space-y-2 text-start">
                    <p className="px-1 text-[11px] font-semibold uppercase text-muted-foreground">
                      {t("suggestedQuestions")}
                    </p>
                    {presetPrompts.map((prompt) => (
                      <button
                        key={prompt.label}
                        type="button"
                        disabled={
                          loading || remainingMessages === 0 || !advisorEnabled
                        }
                        onClick={() => void handleSend(prompt.query)}
                        className="flex w-full items-center justify-between rounded-xl border border-border bg-card/60 px-3 py-2.5 text-start text-xs font-medium transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-50"
                      >
                        <span>{prompt.label}</span>
                        <Sparkles
                          className="h-3.5 w-3.5 text-primary"
                          aria-hidden="true"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex max-w-[88%] gap-2",
                      message.sender === "user"
                        ? "ms-auto flex-row-reverse"
                        : "me-auto",
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      {message.sender === "user" ? (
                        <User className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2.5 leading-relaxed",
                        message.sender === "user"
                          ? "rounded-se-none bg-primary text-primary-foreground"
                          : "rounded-ss-none border border-border bg-card whitespace-pre-wrap",
                      )}
                    >
                      <p>{message.text}</p>
                      <time className="mt-1 block text-end text-[10px] opacity-60">
                        {message.timestamp}
                      </time>
                    </div>
                  </div>
                ))
              )}
              {loading ? (
                <div className="me-auto flex max-w-[88%] gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div className="flex items-center gap-2 rounded-2xl rounded-ss-none border border-border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin text-primary"
                      aria-hidden="true"
                    />
                    <span>{t("thinking")}</span>
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSend();
              }}
              className="border-t border-border bg-card/40 p-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={input}
                  maxLength={2000}
                  disabled={remainingMessages === 0 || !advisorEnabled}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={
                    !advisorEnabled
                      ? t("disabledShort")
                      : remainingMessages === 0
                        ? t("limitReachedShort")
                        : t("placeholder")
                  }
                  aria-label={t("placeholder")}
                  className="h-10 rounded-xl bg-background text-sm"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={
                    loading ||
                    !input.trim() ||
                    remainingMessages === 0 ||
                    !advisorEnabled
                  }
                  aria-label={t("send")}
                  className="h-10 w-10 shrink-0 rounded-xl"
                >
                  {loading ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Send
                      className="h-4 w-4 rtl:rotate-180"
                      aria-hidden="true"
                    />
                  )}
                </Button>
              </div>
              {remainingMessages !== undefined ? (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  {t("limitStatus", { remaining: remainingMessages })}
                  {remainingMessages === 0 && quotaResetAt
                    ? ` · ${t("resetsAt", {
                        time: new Intl.DateTimeFormat(locale, {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(quotaResetAt)),
                      })}`
                    : ""}
                </p>
              ) : null}
            </form>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <Button
        type="button"
        size="icon"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? t("close") : t("open")}
        aria-expanded={isOpen}
        aria-controls="student-chat-title"
        className="relative h-14 w-14 rounded-full shadow-xl transition-transform hover:scale-105"
      >
        {isOpen ? (
          <X className="h-6 w-6" aria-hidden="true" />
        ) : (
          <Bot className="h-6 w-6" aria-hidden="true" />
        )}
        {!isOpen ? (
          <span
            className={cn(
              "absolute right-0 top-0 h-3.5 w-3.5 rounded-full border-2 border-background",
              advisorEnabled ? "bg-emerald-500" : "bg-red-500",
            )}
          />
        ) : null}
      </Button>
    </div>
  );
}
