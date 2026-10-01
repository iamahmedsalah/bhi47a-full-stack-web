/**
 * Client device binding and hardware fingerprinting for Smart Attendance.
 *
 * 1. Generates and persists a stable UUID in localStorage.
 * 2. Computes an immutable hardware/GPU/screen fingerprint that remains
 *    identical EVEN IF the student switches browsers (e.g. Chrome to Firefox/Edge)
 *    or uses Incognito mode on the same physical device.
 * 3. Extracts a human-readable device label (e.g. "Windows PC • Chrome", "Apple iPhone • Safari")
 *    for live presenter inspection.
 */

const DEVICE_ID_STORAGE_KEY = "bh47a_attendance_device_uuid_v1";

/**
 * Generates or retrieves the per-browser localStorage UUID.
 */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    let deviceId = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId || deviceId.trim().length === 0) {
      if (typeof window.crypto?.randomUUID === "function") {
        deviceId = window.crypto.randomUUID();
      } else {
        deviceId = "dev-" + Math.random().toString(36).slice(2, 11) + "-" + Date.now();
      }
      window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
  } catch (error) {
    console.warn("Could not access localStorage for device ID", error);
    return "";
  }
}

/**
 * Extracts GPU Renderer & Vendor via WebGL unmasked debug info.
 * This hardware descriptor is identical across Chrome, Firefox, Edge, and Incognito on the same physical machine.
 */
function getWebGlHardwareSignature(): { vendor: string; renderer: string } {
  if (typeof document === "undefined") {
    return { vendor: "", renderer: "" };
  }
  try {
    const canvas = document.createElement("canvas");
    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext | null);

    if (!gl) return { vendor: "", renderer: "" };

    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    if (!debugInfo) return { vendor: "", renderer: "" };

    const vendor = (gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string) || "";
    const renderer = (gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string) || "";
    return { vendor: vendor.trim(), renderer: renderer.trim() };
  } catch {
    return { vendor: "", renderer: "" };
  }
}

/**
 * Simple fast 64-bit string hash (Murmur/FNV style) for fallback when SubtleCrypto is unavailable.
 */
function fastHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

/**
 * Computes a cross-browser hardware fingerprint that persists across different browsers
 * and incognito sessions on the exact same physical phone or computer.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return "";
  }

  try {
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
    const pixelRatio = window.devicePixelRatio || 1;
    const cpuCores = navigator.hardwareConcurrency || 0;
    const touchPoints = navigator.maxTouchPoints || 0;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";

    const { vendor: gpuVendor, renderer: gpuRenderer } = getWebGlHardwareSignature();

    // Determine OS family from platform/userAgent
    const ua = navigator.userAgent || "";
    let osFamily = "UnknownOS";
    if (/Windows/i.test(ua)) osFamily = "Windows";
    else if (/iPhone|iPad|iPod/i.test(ua)) osFamily = "iOS";
    else if (/Android/i.test(ua)) osFamily = "Android";
    else if (/Macintosh|Mac OS X/i.test(ua)) osFamily = "macOS";
    else if (/Linux/i.test(ua)) osFamily = "Linux";

    // Combine stable hardware properties (avoiding browser-specific strings)
    const rawSignature = [
      osFamily,
      screenInfo,
      pixelRatio,
      cpuCores,
      touchPoints,
      timezone,
      gpuVendor,
      gpuRenderer,
    ].join("|#|");

    // Hash signature with crypto.subtle if available
    if (window.crypto?.subtle && typeof TextEncoder !== "undefined") {
      const msgUint8 = new TextEncoder().encode(rawSignature);
      const hashBuffer = await window.crypto.subtle.digest("SHA-256", msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      return `hw_${hashHex.slice(0, 24)}`;
    }

    return `hw_${fastHash(rawSignature)}`;
  } catch (error) {
    console.warn("Could not compute device hardware fingerprint", error);
    return "";
  }
}

/**
 * Returns human-readable device model, operating system, and browser for staff monitor.
 * Examples: "Windows PC • Chrome", "Apple iPhone • Mobile Safari", "Samsung Galaxy • Chrome"
 */
export function getDeviceInfo(): string {
  if (typeof navigator === "undefined") {
    return "Unknown Device";
  }

  const ua = navigator.userAgent;

  // OS detection
  let os = "Unknown OS";
  let isMobile = false;

  if (/iPhone/i.test(ua)) {
    os = "iPhone";
    isMobile = true;
  } else if (/iPad/i.test(ua)) {
    os = "iPad";
    isMobile = true;
  } else if (/Android/i.test(ua)) {
    os = "Android";
    isMobile = true;
    const match = ua.match(/Android\s+([0-9\.]+)/i);
    if (match) os = `Android ${match[1]}`;
  } else if (/Windows NT 10.0/i.test(ua)) {
    os = "Windows 10/11";
  } else if (/Windows/i.test(ua)) {
    os = "Windows";
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    os = "macOS";
  } else if (/Linux/i.test(ua)) {
    os = "Linux";
  }

  // Browser detection
  let browser = "Browser";
  if (/Edg\//i.test(ua)) {
    browser = "Edge";
  } else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) {
    browser = "Chrome";
  } else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) {
    browser = "Safari";
  } else if (/Firefox\//i.test(ua)) {
    browser = "Firefox";
  } else if (/OPR\//i.test(ua) || /Opera\//i.test(ua)) {
    browser = "Opera";
  }

  const deviceType = isMobile ? "📱" : "💻";
  return `${deviceType} ${os} • ${browser}`;
}

export interface DeviceIdentity {
  deviceId: string;
  deviceFingerprint: string;
  deviceInfo: string;
}

/**
 * Master helper returning complete device identity for check-in submission.
 */
export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  const deviceId = getOrCreateDeviceId();
  const deviceFingerprint = await getDeviceFingerprint();
  const deviceInfo = getDeviceInfo();

  return {
    deviceId,
    deviceFingerprint,
    deviceInfo,
  };
}
