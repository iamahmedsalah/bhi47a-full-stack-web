"use client";

import React, { useMemo } from "react";
import QRCode from "qrcode";

export type QrErrorCorrectionLevel = "L" | "M" | "Q" | "H";

interface QRProps {
  value: string;
  size?: number;
  level?: QrErrorCorrectionLevel;
  className?: string;
  bgColor?: string;
  fgColor?: string;
}

export function QRCodeSVG({
  value,
  size = 280,
  level = "M",
  className = "",
  bgColor = "#ffffff",
  fgColor = "#042f2e", // Dark teal matching BH47A brand
}: QRProps) {
  const qrData = useMemo(() => {
    if (!value) return null;
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: level });
      const moduleCount = qr.modules.size;
      const padding = 2; // quiet zone in modules
      const totalModules = moduleCount + padding * 2;

      // Build compact SVG path for dark modules to keep DOM lightweight and render lightning fast
      let path = "";
      for (let r = 0; r < moduleCount; r++) {
        for (let c = 0; c < moduleCount; c++) {
          if (qr.modules.get(r, c)) {
            path += `M${c + padding} ${r + padding}h1v1h-1z `;
          }
        }
      }
      return { totalModules, path };
    } catch (e) {
      console.error("Failed to generate QR code matrix", e);
      return null;
    }
  }, [value, level]);

  if (!qrData) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center bg-muted/40 rounded-xl text-xs text-muted-foreground"
      >
        QR Error
      </div>
    );
  }

  return (
    <div
      className={`inline-block rounded-2xl p-4 border border-border bg-white ${className}`}
      style={{ width: size + 32, height: size + 32 }}
    >
      <svg
        viewBox={`0 0 ${qrData.totalModules} ${qrData.totalModules}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
      >
        <rect width={qrData.totalModules} height={qrData.totalModules} fill={bgColor} />
        <path d={qrData.path} fill={fgColor} />
      </svg>
    </div>
  );
}
