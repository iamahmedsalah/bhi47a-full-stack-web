'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface CustomDropdownOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  group?: string;
}

interface DropdownPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const customDropdownOpenEvent = 'custom-dropdown:open';

interface CustomDropdownProps {
  value: string;
  options: CustomDropdownOption[];
  onValueChange: (value: string) => void;
  ariaLabel?: string;
  triggerId?: string;
  invalid?: React.AriaAttributes['aria-invalid'];
  placeholder?: React.ReactNode;
  className?: string;
  menuClassName?: string;
  disabled?: boolean;
  stopPropagation?: boolean;
  maxVisibleItems?: number;
}

function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getTextContent(node.props.children);
  }
  return '';
}

function getDropdownPosition(
  trigger: HTMLButtonElement,
  optionsCount: number,
  labelWidth: number,
  maxVisibleItems: number,
): DropdownPosition {
  const rect = trigger.getBoundingClientRect();
  const padding = 12;
  const width = Math.min(Math.max(rect.width, 168, labelWidth), window.innerWidth - padding * 2);
  const visibleItemCount = Math.min(Math.max(optionsCount, 1), maxVisibleItems);
  const desiredHeight = Math.max(120, visibleItemCount * 40 + 18);
  const availableBelow = window.innerHeight - rect.bottom - padding;
  const availableAbove = rect.top - padding;
  const opensUp = availableBelow < desiredHeight + 8 && availableAbove > availableBelow;
  const available = opensUp ? availableAbove : availableBelow;
  const maxHeight = Math.max(120, Math.min(desiredHeight, available - 8));

  return {
    left: Math.min(Math.max(padding, rect.left), window.innerWidth - width - padding),
    top: opensUp ? Math.max(padding, rect.top - maxHeight - 8) : rect.bottom + 6,
    width,
    maxHeight,
  };
}

function samePosition(a: DropdownPosition | null, b: DropdownPosition) {
  return a?.left === b.left && a.top === b.top && a.width === b.width && a.maxHeight === b.maxHeight;
}

function stopEvent(event: React.SyntheticEvent) {
  event.stopPropagation();
}

export function CustomDropdown({
  value,
  options,
  onValueChange,
  ariaLabel,
  triggerId,
  invalid,
  placeholder,
  className,
  menuClassName,
  disabled,
  stopPropagation = true,
  maxVisibleItems = 7,
}: CustomDropdownProps) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<DropdownPosition | null>(null);
  const dropdownId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const selected = options.find((option) => option.value === value);

  // Memoize label width to avoid recalculating text content length on every scroll/resize event
  const labelWidth = React.useMemo(() => {
    const longestLabel = options.reduce(
      (longest, option) => Math.max(longest, getTextContent(option.label).length),
      0,
    );
    return longestLabel > 0 ? longestLabel * 7.5 + 72 : 0;
  }, [options]);

  const optionsLength = options.length;

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const next = getDropdownPosition(triggerRef.current, optionsLength, labelWidth, maxVisibleItems);
    setPosition((current) => (samePosition(current, next) ? current : next));
  }, [maxVisibleItems, optionsLength, labelWidth]);

  const openMenu = React.useCallback(() => {
    if (disabled) return;
    setOpen((current) => !current);
  }, [disabled]);

  React.useEffect(() => {
    if (open) {
      window.dispatchEvent(
        new CustomEvent(customDropdownOpenEvent, { detail: dropdownId }),
      );
      updatePosition();
    }
  }, [open, dropdownId, updatePosition]);

  React.useEffect(() => {
    const closeSiblingDropdown = (event: Event) => {
      const detail = event instanceof CustomEvent ? event.detail : undefined;
      if (detail !== dropdownId) {
        setTimeout(() => {
          setOpen(false);
        }, 0);
      }
    };

    window.addEventListener(customDropdownOpenEvent, closeSiblingDropdown);
    return () => {
      window.removeEventListener(customDropdownOpenEvent, closeSiblingDropdown);
    };
  }, [dropdownId]);

  React.useEffect(() => {
    if (!open) return undefined;

    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target as Node;
      const triggerContains = triggerRef.current?.contains(target);
      const menuContains = target instanceof Element && Boolean(target.closest('[data-custom-dropdown-menu="true"]'));

      if (!triggerContains && !menuContains) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsidePointer);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePointer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const menu =
    open && position && typeof document !== 'undefined'
      ? createPortal(
          <div
            data-custom-dropdown-menu="true"
            role="listbox"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
              pointerEvents: 'auto',
            }}
            onClick={stopPropagation ? stopEvent : undefined}
            onMouseDown={stopPropagation ? stopEvent : undefined}
            className={cn(
              'custom-scroll fixed z-[9999] pointer-events-auto overflow-y-auto overscroll-contain rounded-2xl border border-border/80 bg-card/95 p-1 text-foreground shadow-[0_24px_80px_rgb(0_0_0_/_0.45)] backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 ease-out',
              menuClassName,
            )}
          >
            <div className="p-1">
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const previousGroup = index > 0 ? options[index - 1]?.group : undefined;
                const showGroupHeader = Boolean(
                  option.group && option.group !== previousGroup,
                );

                return (
                  <React.Fragment key={option.value}>
                    {showGroupHeader && (
                      <div
                        role="presentation"
                        className={cn(
                          'px-3 pb-1 text-[10px] font-semibold tracking-wide text-muted-foreground/80 select-none',
                          index > 0
                            ? 'mt-1.5 border-t border-border/50 pt-2'
                            : 'pt-1',
                        )}
                      >
                        {option.group}
                      </div>
                    )}
                    <button
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={option.disabled}
                      onClick={(event) => {
                        if (stopPropagation) event.stopPropagation();
                        if (!option.disabled) {
                          onValueChange(option.value);
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        'relative flex min-h-9 w-full cursor-pointer select-none items-start rounded-squircle py-2 pl-8 pr-3 text-start text-sm leading-snug text-foreground outline-none transition-colors hover:bg-surface/85 focus:bg-surface/85 disabled:cursor-not-allowed disabled:opacity-50',
                        isSelected && 'bg-primary/10 text-primary',
                      )}
                    >
                      <span className="absolute left-2.5 top-3 flex h-3.5 w-3.5 items-center justify-center">
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                      </span>
                      <span className="min-w-0 whitespace-normal break-words">{option.label}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      className="relative w-full"
      onClick={stopPropagation ? stopEvent : undefined}
      onMouseDown={stopPropagation ? stopEvent : undefined}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        id={triggerId}
        data-invalid={invalid === true || invalid === "true" ? "" : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={openMenu}
        className={cn(
          'flex h-10 w-full cursor-pointer items-center justify-between gap-2.5 rounded-squircle border border-border bg-surface/50 px-3.5 py-2 text-start text-sm font-normal text-foreground hover:bg-surface/70 focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-danger',
          className,
        )}
      >
        <span className="block min-w-0 truncate text-start" title={getTextContent(selected?.label ?? placeholder)}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform duration-200 ease-in-out', open && 'rotate-180')}
        />
      </button>
      {menu}
    </div>
  );
}
