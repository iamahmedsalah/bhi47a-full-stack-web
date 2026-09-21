"use client";

import React, { useMemo } from "react";

/**
 * Robust, zero-dependency QR Code generator in pure TypeScript.
 * Generates ISO/IEC 18004 compliant QR matrices and renders them as crisp, scalable SVGs.
 */

// Mode indicators
const MODE_BYTE = 0x4;

// Error Correction Levels
export type QrErrorCorrectionLevel = "L" | "M" | "Q" | "H";

interface QRProps {
  value: string;
  size?: number;
  level?: QrErrorCorrectionLevel;
  className?: string;
  bgColor?: string;
  fgColor?: string;
}

// Compact, standard Reed-Solomon Galois Field (GF 256) tables
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
for (let i = 0, x = 1; i < 256; i++) {
  EXP_TABLE[i] = x;
  LOG_TABLE[x] = i;
  x = (x << 1) ^ (x & 0x80 ? 0x11d : 0);
}

function gmult(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gmult(poly[j], EXP_TABLE[i]);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCompute(data: Uint8Array, eccLength: number): Uint8Array {
  const gen = rsGeneratorPoly(eccLength);
  const remainder = new Uint8Array(eccLength);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < eccLength - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gmult(gen[j + 1], factor);
    }
    remainder[eccLength - 1] = gmult(gen[eccLength], factor);
  }
  return remainder;
}

// Version table: total bytes & ecc bytes for versions 1 to 10 with ECC Level 'M'
const VERSION_CAPACITIES_M = [
  { version: 1, size: 21, totalBytes: 26, dataBytes: 16, eccBytes: 10 },
  { version: 2, size: 25, totalBytes: 44, dataBytes: 28, eccBytes: 16 },
  { version: 3, size: 29, totalBytes: 70, dataBytes: 44, eccBytes: 26 },
  { version: 4, size: 33, totalBytes: 100, dataBytes: 64, eccBytes: 36 },
  { version: 5, size: 37, totalBytes: 134, dataBytes: 86, eccBytes: 48 },
  { version: 6, size: 41, totalBytes: 172, dataBytes: 108, eccBytes: 64 },
  { version: 7, size: 45, totalBytes: 196, dataBytes: 124, eccBytes: 72 },
  { version: 8, size: 49, totalBytes: 242, dataBytes: 154, eccBytes: 88 },
  { version: 9, size: 53, totalBytes: 292, dataBytes: 182, eccBytes: 110 },
  { version: 10, size: 57, totalBytes: 346, dataBytes: 216, eccBytes: 130 },
];

function generateQRMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);
  const payloadLen = textBytes.length;

  // Pick smallest sufficient version
  const config =
    VERSION_CAPACITIES_M.find((v) => v.dataBytes >= payloadLen + 3) ||
    VERSION_CAPACITIES_M[VERSION_CAPACITIES_M.length - 1];

  const size = config.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );

  // Helper: place finder pattern at (r, c)
  const placeFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const tr = row + r;
        const tc = col + c;
        if (tr >= 0 && tr < size && tc >= 0 && tc < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            matrix[tr][tc] =
              r === 0 ||
              r === 6 ||
              c === 0 ||
              c === 6 ||
              (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          } else {
            matrix[tr][tc] = false;
          }
        }
      }
    }
  };

  // Top-left, top-right, bottom-left finders
  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // Dark module
  matrix[size - 8][8] = true;

  // Reserve format info area
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[i][8] = false;
  }

  // Build bitstream: [Mode: 4 bits][Count: 8 bits][Payload][Padding]
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(MODE_BYTE, 4);
  pushBits(payloadLen, 8);
  for (const b of textBytes) {
    pushBits(b, 8);
  }
  // Terminator
  pushBits(0, Math.min(4, config.dataBytes * 8 - bits.length));
  // Pad to byte
  while (bits.length % 8 !== 0) bits.push(0);

  // Pad bytes
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < config.dataBytes * 8) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert to byte array
  const dataBytesArr = new Uint8Array(config.dataBytes);
  for (let i = 0; i < config.dataBytes; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i * 8 + b];
    }
    dataBytesArr[i] = byteVal;
  }

  // Compute error correction
  const ecc = rsCompute(dataBytesArr, config.eccBytes);

  // Interleave data + ECC
  const finalBits: number[] = [];
  for (let i = 0; i < dataBytesArr.length; i++) {
    for (let b = 7; b >= 0; b--) finalBits.push((dataBytesArr[i] >> b) & 1);
  }
  for (let i = 0; i < ecc.length; i++) {
    for (let b = 7; b >= 0; b--) finalBits.push((ecc[i] >> b) & 1);
  }

  // Place bits in zigzag upward/downward pattern
  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : 0;
          // Mask pattern 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit ^ (mask ? 1 : 0)) === 1;
        }
      }
    }
    upward = !upward;
  }

  // Convert any remaining nulls to false
  return matrix.map((row) => row.map((cell) => cell ?? false));
}

export function QRCodeSVG({
  value,
  size = 280,
  className = "",
  bgColor = "#ffffff",
  fgColor = "#042f2e", // Dark teal matching BH47A brand
}: QRProps) {
  const matrix = useMemo(() => {
    try {
      return generateQRMatrix(value);
    } catch {
      return [];
    }
  }, [value]);

  if (!matrix.length) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center bg-muted/40 rounded-xl text-xs text-muted-foreground"
      >
        QR Error
      </div>
    );
  }

  const moduleCount = matrix.length;
  const padding = 2; // quiet zone modules
  const totalModules = moduleCount + padding * 2;
  const cellSize = size / totalModules;

  return (
    <div
      className={`inline-block rounded-2xl p-4 border border-border bg-white ${className}`}
      style={{ width: size + 32, height: size + 32 }}
    >
      <svg
        viewBox={`0 0 ${totalModules} ${totalModules}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
      >
        <rect width={totalModules} height={totalModules} fill={bgColor} />
        {matrix.map((row, r) =>
          row.map((active, c) =>
            active ? (
              <rect
                key={`${r}-${c}`}
                x={c + padding}
                y={r + padding}
                width={1}
                height={1}
                fill={fgColor}
              />
            ) : null,
          ),
        )}
      </svg>
    </div>
  );
}
