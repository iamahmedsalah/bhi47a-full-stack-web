'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

export function ComplaintSearchInput({ value, onValueChange, placeholder, className }: {
  value: string; onValueChange: (value: string) => void; placeholder?: string; className?: string;
}) {
  const [draft, setDraft] = useState({ source: value, value });
  if (draft.source !== value) setDraft({ source: value, value });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const change = useRef(onValueChange);
  useEffect(() => { change.current = onValueChange; }, [onValueChange]);
  useEffect(() => { clearTimeout(timer.current); }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return <Input value={draft.value} placeholder={placeholder} aria-label={placeholder} className={className} onChange={(event) => {
    const next = event.target.value;
    setDraft({ source: value, value: next });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => change.current(next), 300);
  }} />;
}
