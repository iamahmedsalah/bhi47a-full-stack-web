'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Bot, MessageSquare, Send, X, Loader2, Sparkles, User, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendChatMessage } from '../api';
import { cn } from '@/lib/cn';
import { useAuth } from '@/providers/auth-provider';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const PRESET_PROMPTS = [
  { label: '📚 Recommeded Courses', query: 'What courses should I register for next to graduate on time?' },
  { label: '📊 GPA & Status', query: 'What is my current GPA and academic standing?' },
  { label: '🛠 Submit Complaint', query: 'How do I submit a technical support or academic complaint?' },
  { label: '🎓 Graduation Plan', query: 'How many credit hours do I need to graduate?' },
];

export function StudentChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Only render for students
  if (user?.role && user.role !== 'student') {
    return null;
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend ?? input).trim();
    if (!query || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res = await sendChatMessage(query, sessionId);
      if (res.sessionId) setSessionId(res.sessionId);

      const botMsg: ChatMessage = {
        id: `bot-${Date.now()}`,
        sender: 'assistant',
        text: res.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'assistant',
          text: 'Sorry, I encountered an issue connecting to the AI Academic Advisor. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 start-6 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl border border-primary/30 bg-[#0b1720]/95 shadow-[var(--shadow-glow)] backdrop-blur-md sm:w-[420px]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/80 bg-gradient-to-r from-primary/20 via-teal-900/30 to-transparent px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-primary/20 text-primary">
                  <Bot className="h-5 w-5" />
                  <span className="absolute bottom-0 end-0 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-[#0b1720]" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm flex items-center gap-1.5">
                    Academic AI Advisor
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                  </h3>
                  <p className="text-[10px] text-muted-foreground">Powered by Google Gemini 2.0 Flash</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Chat Messages Body */}
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-xs">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col justify-center text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 text-primary">
                    <Bot className="h-6 w-6" />
                  </div>
                  <h4 className="font-bold text-foreground text-sm">Hello, {user?.name ?? 'Student'}! 👋</h4>
                  <p className="mt-1 px-4 text-muted-foreground leading-relaxed">
                    I am your AI Academic Advisor. Ask me anything about course prerequisites, registration rules, GPA, or academic policies.
                  </p>

                  <div className="mt-6 space-y-2 text-start">
                    <p className="px-1 font-semibold text-[10px] text-muted-foreground uppercase">Suggested Questions:</p>
                    <div className="grid gap-1.5">
                      {PRESET_PROMPTS.map((prompt) => (
                        <button
                          key={prompt.label}
                          type="button"
                          onClick={() => handleSend(prompt.query)}
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-surface/40 px-3 py-2 text-start font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 cursor-pointer"
                        >
                          <span>{prompt.label}</span>
                          <Sparkles className="h-3 w-3 text-primary opacity-60" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex gap-2 max-w-[85%]',
                      msg.sender === 'user' ? 'ms-auto flex-row-reverse' : 'me-auto'
                    )}
                  >
                    <div
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold',
                        msg.sender === 'user' ? 'bg-primary/20 text-primary' : 'bg-teal-500/20 text-teal-300'
                      )}
                    >
                      {msg.sender === 'user' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                    </div>
                    <div
                      className={cn(
                        'rounded-2xl px-3.5 py-2.5 leading-relaxed',
                        msg.sender === 'user'
                          ? 'bg-primary text-primary-foreground font-medium rounded-tr-none'
                          : 'bg-card border border-border/80 text-foreground rounded-tl-none whitespace-pre-wrap'
                      )}
                    >
                      <p>{msg.text}</p>
                      <span className="mt-1 block text-[9px] opacity-60 text-end">{msg.timestamp}</span>
                    </div>
                  </div>
                ))
              )}
              {loading && (
                <div className="flex gap-2 max-w-[85%] me-auto">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-teal-500/20 text-teal-300">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="rounded-2xl rounded-tl-none bg-card border border-border/80 px-3.5 py-2 text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>Thinking & analyzing academic records...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <div className="border-t border-border/80 bg-background/50 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleSend();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask your academic advisor..."
                  className="h-10 text-xs bg-surface/50 border-border/80 rounded-xl focus:ring-primary"
                />
                <Button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="h-10 w-10 shrink-0 rounded-xl p-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Action Button */}
      <Button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-full shadow-[var(--shadow-glow)] transition-all duration-300 cursor-pointer',
          isOpen ? 'bg-secondary text-foreground hover:bg-secondary/80' : 'bg-primary text-primary-foreground hover:scale-105'
        )}
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <>
            <Bot className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-background"></span>
            </span>
          </>
        )}
      </Button>
    </div>
  );
}
