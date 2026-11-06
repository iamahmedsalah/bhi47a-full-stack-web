"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const Summary = dynamic(() =>
  import("./analytics-summary-widgets").then(
    (module) => module.AnalyticsSummaryWidgets,
  ),
);

/** Below-fold analytics must not compete with the initial dashboard requests. */
export function DeferredDashboardSection({
  children,
}: {
  children: React.ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container} className="min-h-32">
      {visible ? (
        children
      ) : (
        <div
          aria-hidden="true"
          className="h-32 animate-pulse rounded-2xl bg-muted/30"
        />
      )}
    </div>
  );
}

export function DeferredAnalyticsSummary(
  props: React.ComponentProps<typeof Summary>,
) {
  return (
    <DeferredDashboardSection>
      <Summary {...props} />
    </DeferredDashboardSection>
  );
}
