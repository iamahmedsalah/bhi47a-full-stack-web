'use client';

import { useDebouncedSearch } from '@/hooks/use-debounced-search';
import { Input } from '@/components/ui/input';

export function ComplaintSearchInput({ value, onValueChange, placeholder, className }: {
  value: string; onValueChange: (value: string) => void; placeholder?: string; className?: string;
}) {
  const [draft, update] = useDebouncedSearch(value, onValueChange);
  return <Input value={draft} placeholder={placeholder} aria-label={placeholder} className={className} onChange={(event) => update(event.target.value)} />;
}
