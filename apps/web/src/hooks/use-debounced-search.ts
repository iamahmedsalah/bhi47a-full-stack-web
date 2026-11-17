'use client';

import { useEffect, useRef, useState } from 'react';

/** Keep typing immediate while ignoring delayed echoes of submitted URL values. */
export function useDebouncedSearch(value: string, onChange: (value: string) => void) {
  const [draft, setDraft] = useState({ source: value, value, submitted: [] as string[], reset: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const change = useRef(onChange);
  useEffect(() => { change.current = onChange; }, [onChange]);

  if (draft.source !== value) {
    const isEcho = draft.submitted.includes(value.trim());
    setDraft({ source: value, value: isEcho ? draft.value : value,
      submitted: isEcho ? draft.submitted.filter((sent) => sent !== value.trim()) : [], reset: draft.reset + (isEcho ? 0 : 1) });
  }

  useEffect(() => { clearTimeout(timer.current); }, [draft.reset]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const update = (next: string, immediate = false) => {
    setDraft((current) => ({ ...current, value: next }));
    clearTimeout(timer.current);
    const submit = () => {
      setDraft((current) => ({ ...current, submitted: [...current.submitted.slice(-99), next.trim()] }));
      change.current(next);
    };
    if (immediate) submit();
    else timer.current = setTimeout(submit, 300);
  };

  return [draft.value, update] as const;
}
