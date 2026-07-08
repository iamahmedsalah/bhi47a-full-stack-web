'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import {
  CustomDropdown,
  type CustomDropdownOption,
} from '@/components/ui/custom-dropdown';

interface SelectContextType {
  value?: string;
}

const SelectContext = React.createContext<SelectContextType | undefined>(
  undefined,
);

type SelectProps = {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  defaultValue?: string;
};

type SelectTriggerMarkerProps = React.ComponentPropsWithoutRef<'button'>;
type SelectContentMarkerProps = React.ComponentPropsWithoutRef<'div'> & {
  position?: string;
};
type SelectItemMarkerProps = React.ComponentPropsWithoutRef<'button'> & {
  value: string;
};

function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
    return getTextContent(node.props.children);
  }
  return '';
}

function extractPlaceholder(node: React.ReactNode): React.ReactNode {
  let placeholder: React.ReactNode;

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ placeholder?: React.ReactNode; children?: React.ReactNode }>(child)) return;

    if (child.type === SelectValue) {
      placeholder = child.props.placeholder;
      return;
    }

    const nestedPlaceholder = extractPlaceholder(child.props.children);
    if (nestedPlaceholder !== undefined) {
      placeholder = nestedPlaceholder;
    }
  });

  return placeholder;
}

function extractItems(node: React.ReactNode): CustomDropdownOption[] {
  const items: CustomDropdownOption[] = [];

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<SelectItemMarkerProps & { children?: React.ReactNode }>(child)) return;

    if (child.type === SelectItem) {
      items.push({
        value: child.props.value,
        label: child.props.children,
        disabled: child.props.disabled,
      });
      return;
    }

    items.push(...extractItems(child.props.children));
  });

  return items;
}

function findSelectPart<TProps>(
  children: React.ReactNode,
  type: React.ElementType,
): React.ReactElement<TProps> | undefined {
  let result: React.ReactElement<TProps> | undefined;

  React.Children.forEach(children, (child) => {
    if (result || !React.isValidElement<TProps>(child)) return;
    if (child.type === type) {
      result = child;
    }
  });

  return result;
}

const Select = ({
  children,
  value,
  onValueChange,
  defaultValue,
}: SelectProps) => {
  const [selectedValue, setSelectedValue] = React.useState(
    value ?? defaultValue ?? '',
  );
  const activeValue = value ?? selectedValue;

  const trigger = findSelectPart<SelectTriggerMarkerProps>(
    children,
    SelectTrigger,
  );
  const content = findSelectPart<SelectContentMarkerProps>(
    children,
    SelectContent,
  );
  const options = React.useMemo(
    () => extractItems(content?.props.children),
    [content?.props.children],
  );
  const placeholder = React.useMemo(
    () => extractPlaceholder(trigger?.props.children),
    [trigger?.props.children],
  );

  const handleValueChange = React.useCallback(
    (nextValue: string) => {
      setSelectedValue(nextValue);
      onValueChange?.(nextValue);
    },
    [onValueChange],
  );

  const triggerClassName = trigger?.props.className;
  const contentClassName = content?.props.className;
  const selectedText = getTextContent(
    options.find((option) => option.value === activeValue)?.label,
  );

  return (
    <SelectContext.Provider value={{ value: activeValue }}>
      <CustomDropdown
        value={activeValue}
        options={options}
        onValueChange={handleValueChange}
        placeholder={placeholder}
        ariaLabel={
          typeof placeholder === 'string'
            ? placeholder
            : selectedText || undefined
        }
        disabled={trigger?.props.disabled}
        className={cn(
          'w-full',
          triggerClassName?.replace(/bg-secondary(\/50)?/g, ''),
        )}
        menuClassName={contentClassName}
      />
    </SelectContext.Provider>
  );
};

const SelectGroup = ({ children }: { children: React.ReactNode }) => (
  <>{children}</>
);

const SelectValue = ({ placeholder }: { placeholder?: React.ReactNode }) => {
  const ctx = React.useContext(SelectContext);
  return (
    <span className="block min-w-0 truncate text-start">
      {ctx?.value ? null : placeholder}
    </span>
  );
};

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  SelectTriggerMarkerProps
>(({ children: _children, ..._props }, _ref) => null);
SelectTrigger.displayName = 'SelectTrigger';

const SelectScrollUpButton = () => null;
const SelectScrollDownButton = () => null;

const SelectContent = React.forwardRef<
  HTMLDivElement,
  SelectContentMarkerProps
>(({ children: _children, ..._props }, _ref) => null);
SelectContent.displayName = 'SelectContent';

const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ children }, _ref) => <>{children}</>);
SelectLabel.displayName = 'SelectLabel';

const SelectItem = React.forwardRef<HTMLButtonElement, SelectItemMarkerProps>(
  ({ children }, _ref) => <>{children}</>,
);
SelectItem.displayName = 'SelectItem';

const SelectSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>((_props, _ref) => null);
SelectSeparator.displayName = 'SelectSeparator';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
