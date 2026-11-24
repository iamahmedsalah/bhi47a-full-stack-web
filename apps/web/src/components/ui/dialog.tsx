"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

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

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "shrink-0 flex flex-col space-y-1.5 border-b border-border/70 bg-background/60 px-6 pt-5 pb-4 pe-12 text-center sm:text-start rtl:sm:text-right",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0",
      className,
    )}
    {...props}
  />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({
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
DialogFooter.displayName = "DialogFooter";

function partitionDialogChildren(children: React.ReactNode): React.ReactNode {
  const items = flattenFragments(children);

  if (items.some((item) => matchesComponent(item, DialogBody))) {
    return children;
  }

  const headers: React.ReactNode[] = [];
  const footers: React.ReactNode[] = [];
  const middle: React.ReactNode[] = [];

  for (const item of items) {
    if (matchesComponent(item, DialogHeader)) {
      headers.push(item);
    } else if (matchesComponent(item, DialogFooter)) {
      footers.push(item);
    } else {
      middle.push(item);
    }
  }

  // Handle modals whose <DialogFooter> (or <DialogHeader>) is nested inside a <form> or wrapper <div>
  if (footers.length === 0) {
    const wrapperIdx = middle.findIndex((item) => {
      if (
        !React.isValidElement<{ children?: React.ReactNode; className?: string }>(
          item,
        )
      ) {
        return false;
      }
      if (item.type !== "form" && item.type !== "div") return false;
      const inner = flattenFragments(item.props.children);
      return inner.some(
        (child) =>
          matchesComponent(child, DialogFooter) ||
          matchesComponent(child, DialogHeader),
      );
    });

    if (wrapperIdx !== -1) {
      const wrapper = middle[wrapperIdx] as React.ReactElement<{
        children?: React.ReactNode;
        className?: string;
      }>;
      const beforeWrapper = middle.slice(0, wrapperIdx);
      const afterWrapper = middle.slice(wrapperIdx + 1);
      const innerItems = flattenFragments(wrapper.props.children);

      const innerHeaders: React.ReactNode[] = [];
      const innerFooters: React.ReactNode[] = [];
      const innerBody: React.ReactNode[] = [];

      for (const child of innerItems) {
        if (matchesComponent(child, DialogHeader)) {
          innerHeaders.push(child);
        } else if (matchesComponent(child, DialogFooter)) {
          innerFooters.push(child);
        } else {
          innerBody.push(child);
        }
      }

      if (wrapper.type === "form") {
        const clonedForm = React.cloneElement(
          wrapper,
          {
            className: "flex flex-1 flex-col min-h-0 overflow-hidden",
          },
          <>
            {innerHeaders}
            <DialogBody className={stripOuterLayoutClasses(wrapper.props.className)}>
              {innerBody}
            </DialogBody>
            {innerFooters}
          </>,
        );

        return (
          <>
            {headers}
            {beforeWrapper.length > 0 && (
              <div className="shrink-0 px-6 pt-4 space-y-3">{beforeWrapper}</div>
            )}
            {clonedForm}
            {afterWrapper.length > 0 && (
              <div className="shrink-0 px-6 pb-4 space-y-3">{afterWrapper}</div>
            )}
          </>
        );
      }

      return (
        <>
          {headers}
          {innerHeaders}
          <DialogBody className={stripOuterLayoutClasses(wrapper.props.className)}>
            {beforeWrapper}
            {innerBody}
            {afterWrapper}
          </DialogBody>
          {innerFooters}
        </>
      );
    }
  }

  return (
    <>
      {headers}
      {middle.length > 0 && <DialogBody>{middle}</DialogBody>}
      {footers}
    </>
  );
}

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  /**
   * Opt into explicit flex-column composition (`DialogHeader`, `DialogBody`, `DialogFooter`)
   * without automatic child partitioning.
   */
  flush?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, flush = false, ...props }, ref) => {
  const isExplicitFlush = flush || /\bp-0\b/.test(className ?? "");
  const contentClassName = isExplicitFlush
    ? className
    : stripOuterLayoutClasses(className);

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-1.5rem)] sm:w-full max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-0 p-0 overflow-hidden border border-border/80 bg-card shadow-2xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-2xl sm:rounded-2xl max-h-[90vh] min-w-0",
          contentClassName,
        )}
        {...props}
      >
        {isExplicitFlush ? children : partitionDialogChildren(children)}
        <DialogPrimitive.Close className="absolute end-4 top-4 z-30 flex size-8 items-center justify-center rounded-squircle text-muted-foreground opacity-80 ring-offset-background transition-all hover:bg-muted/60 hover:text-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none cursor-pointer">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
