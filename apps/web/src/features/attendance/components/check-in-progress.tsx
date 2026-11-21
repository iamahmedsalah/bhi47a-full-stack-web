"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, MapPin, ShieldCheck, Smartphone } from "lucide-react";

export type CheckInPhase = "device" | "location" | "verification";

export function CheckInProgress({
  phase,
  isArabic,
}: {
  phase: CheckInPhase;
  isArabic: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const steps = [
    {
      id: "device",
      Icon: Smartphone,
      label: isArabic ? "تجهيز الجهاز" : "Preparing device",
    },
    {
      id: "location",
      Icon: MapPin,
      label: isArabic ? "تحديد الموقع" : "Getting location",
    },
    {
      id: "verification",
      Icon: ShieldCheck,
      label: isArabic ? "التحقق وتسجيل الحضور" : "Verifying attendance",
    },
  ];
  const current = steps.findIndex((step) => step.id === phase);
  const { Icon, label } = steps[current];

  return (
    <motion.div
      initial={reducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 py-7 text-center"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="relative mx-auto flex size-24 items-center justify-center"
        aria-hidden="true"
      >
        <div className="absolute inset-0 rounded-full border-4 border-primary/10" />
        <motion.div
          className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary border-e-primary/40"
          animate={reducedMotion ? { rotate: 0 } : { rotate: 360 }}
          transition={{
            duration: 1.6,
            repeat: reducedMotion ? 0 : Infinity,
            ease: "linear",
          }}
        />
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phase}
              initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reducedMotion ? 0 : 0.18 }}
            >
              <Icon className="size-7" />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <div className="space-y-2">
        <h3 className="text-base font-bold text-foreground">{label}</h3>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">
          {phase === "location"
            ? isArabic
              ? "ننتظر موقع هاتفك للتحقق من مكان الحضور. قد يستغرق ذلك بضع ثوانٍ."
              : "Waiting for your phone’s location. This may take a few seconds."
            : isArabic
              ? "لحظات وهنعرض لك نتيجة تسجيل الحضور."
              : "Your attendance result will appear shortly."}
        </p>
      </div>
      <ol className="space-y-2 text-start" aria-hidden="true">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-xs ${index === current ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground"}`}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current/20">
              {index < current ? (
                <Check className="size-3.5" />
              ) : (
                <step.Icon className="size-3.5" />
              )}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </motion.div>
  );
}
