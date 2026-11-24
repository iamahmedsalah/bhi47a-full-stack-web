"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function stripOuterLayoutClasses(className?: string): string {
  if (!className) return "";
  return className
    .replace(/\b(?:sm:|md:|lg:)?p-(?:0|3|4|5|6|7|8)\b/g, "")
    .replace(/\b(?:sm:|md:|lg:)?px-(?:0|3|4|5|6|7|8)\b/g, "")
    .replace(/\b(?:sm:|md:|lg:)?py-(?:0|3|4|5|6|7|8)\b/g, "")
    .replace(/\boverflow-y-auto\b/g, "")
    .replace(/\boverflow-auto\b/g, "")
    .replace(/\bgrid\b/g, "")
    .trim();
}

function stripWrapperMarginClasses(className?: string): string {
  if (!className) return "";
  return className
    .replace(/\b(?:sm:|md:|lg:)?mt-(?:0|1|2|3|4|5|6|8)\b/g, "")
    .replace(/\b(?:sm:|md:|lg:)?mb-(?:0|1|2|3|4|5|6|8)\b/g, "")
    .trim();
}

function flattenFragments(children: React.ReactNode): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (child == null || typeof child === "boolean") return;
    if (
      React.isValidElement<{ children?: React.ReactNode }>(child) &&
      child.type === React.Fragment
    ) {
      result.push(...flattenFragments(child.props.children));
    } else {
      result.push(child);
    }
  });
  return result;
}

function matchesComponent(
  node: React.ReactNode,
  component: { displayName?: string },
): node is React.ReactElement {
  if (!React.isValidElement(node)) return false;
  if (node.type === component) return true;
  if (
    typeof node.type === "function" &&
    component.displayName &&
    (node.type as { displayName?: string }).displayName === component.displayName
  ) {
    return true;
  }
  return false;
}

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
AlertDialogOverlay.displayName = AlertDialogPrimitive.Overlay.displayName;

const AlertDialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "shrink-0 flex flex-col space-y-1.5 border-b border-border/70 bg-background/60 px-6 pt-5 pb-4 text-center sm:text-start rtl:sm:text-right",
      className,
    )}
    {...props}
  />
);
AlertDialogHeader.displayName = "AlertDialogHeader";

const AlertDialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex-1 overflow-y-auto px-6 py-4 space-y-3 min-h-0",
      className,
    )}
    {...props}
  />
);
AlertDialogBody.displayName = "AlertDialogBody";

const AlertDialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "shrink-0 flex flex-col-reverse gap-2 border-t border-border/70 bg-background/80 backdrop-blur-xs px-6 py-3.5 sm:flex-row sm:items-center sm:justify-end rtl:sm:justify-start",
      stripWrapperMarginClasses(className),
    )}
    {...props}
  />
);
AlertDialogFooter.displayName = "AlertDialogFooter";

function partitionAlertChildren(children: React.ReactNode): React.ReactNode {
  const items = flattenFragments(children);
  if (items.some((item) => matchesComponent(item, AlertDialogBody))) {
    return children;
  }

  const headers: React.ReactNode[] = [];
  const footers: React.ReactNode[] = [];
  const middle: React.ReactNode[] = [];

  for (const item of items) {
    if (matchesComponent(item, AlertDialogHeader)) {
      headers.push(item);
    } else if (matchesComponent(item, AlertDialogFooter)) {
      footers.push(item);
    } else {
      middle.push(item);
    }
  }

  return (
    <>
      {headers}
      {middle.length > 0 && <AlertDialogBody>{middle}</AlertDialogBody>}
      {footers}
    </>
  );
}

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-1.5rem)] sm:w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-0 p-0 overflow-hidden border border-border/80 bg-card shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-2xl sm:rounded-2xl max-h-[90vh] min-w-0",
        stripOuterLayoutClasses(className),
      )}
      {...props}
    >
      {partitionAlertChildren(children)}
    </AlertDialogPrimitive.Content>
  </AlertDialogPortal>
));
AlertDialogContent.displayName = AlertDialogPrimitive.Content.displayName;

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
AlertDialogTitle.displayName = AlertDialogPrimitive.Title.displayName;

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground leading-relaxed", className)}
    {...props}
  />
));
AlertDialogDescription.displayName =
  AlertDialogPrimitive.Description.displayName;

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants(), className)}
    {...props}
  />
));
AlertDialogAction.displayName = AlertDialogPrimitive.Action.displayName;

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "outline" }), "mt-0", className)}
    {...props}
  />
));
AlertDialogCancel.displayName = AlertDialogPrimitive.Cancel.displayName;

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
