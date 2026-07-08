'use client';

import {
  type ChangeEvent,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import * as React from 'react';
import { cn } from '@/lib/cn';
import { CustomDropdown, type CustomDropdownOption } from './custom-dropdown';

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label ? <FieldLabel>{label}</FieldLabel> : null}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldLabel({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('block text-xs font-semibold text-muted', className)}
      {...props}
    />
  );
}

const controlClass =
  'w-full rounded-xl border border-input-border bg-input px-3 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-input-focus disabled:cursor-not-allowed disabled:opacity-60';

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlClass, 'min-h-24 resize-y leading-relaxed', className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const options = parseNativeOptions(children);
  const activeValue = String(value ?? defaultValue ?? options[0]?.value ?? '');

  return (
    <CustomDropdown
      value={activeValue}
      options={options}
      disabled={disabled}
      ariaLabel={props['aria-label']}
      className={cn(controlClass, 'px-3 py-2.5', className)}
      onValueChange={(nextValue) => {
        onChange?.({
          target: { value: nextValue },
          currentTarget: { value: nextValue },
        } as ChangeEvent<HTMLSelectElement>);
      }}
    />
  );
}

function parseNativeOptions(children: React.ReactNode): CustomDropdownOption[] {
  const options: CustomDropdownOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<React.OptionHTMLAttributes<HTMLOptionElement>>(child)) return;

    if (child.type === 'option') {
      const value = String(child.props.value ?? child.props.children ?? '');
      options.push({
        value,
        label: child.props.children,
        disabled: child.props.disabled,
      });
      return;
    }

    options.push(...parseNativeOptions(child.props.children));
  });

  return options;
}
