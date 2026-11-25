import api, { getApiErrorDetails } from "@/lib/api";
import {
  platformAuthenticatorIsAvailable,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

export const passkeyUnlockMethods = [
  "unspecified",
  "touchId",
  "faceId",
  "windowsHello",
  "fingerprint",
  "securityKey",
  "devicePin",
] as const;
export type PasskeyUnlockMethod = (typeof passkeyUnlockMethods)[number];

export const passkeyPreferredAuthenticators = [
  "localDevice",
  "securityKey",
  "remoteDevice",
] as const;
export type PasskeyPreferredAuthenticator =
  (typeof passkeyPreferredAuthenticators)[number];

export interface PasskeyMetadata {
  _id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
  backedUp: boolean;
  deviceType: string;
  /** User-selected label. This is not a detected biometric or security assertion. */
  unlockMethod?: PasskeyUnlockMethod;
}

export const passkeyKeys = {
  capabilities: ["passkeys", "capabilities"] as const,
  list: (userId: string) => ["passkeys", userId] as const,
};

export async function getPasskeyCapabilities() {
  const res = await api.get<{ enabled: boolean; studentLoginEnabled: boolean }>(
    "/auth/passkeys/capabilities",
  );
  return res.data;
}

export async function getPasskeys() {
  const res = await api.get<PasskeyMetadata[]>("/auth/passkeys");
  return res.data;
}

export async function passkeyLoginOptions(
  area: "student" | "management" = "student",
) {
  const res = await api.post<{
    flowId: string;
    flowToken: string;
    options: PublicKeyCredentialRequestOptionsJSON;
  }>("/auth/passkeys/login/options", { area });
  return res.data;
}

export async function passkeyRegisterOptions(
  preferredAuthenticatorType?: PasskeyPreferredAuthenticator,
) {
  const res = await api.post<{
    flowId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>(
    "/auth/passkeys/register/options",
    preferredAuthenticatorType ? { preferredAuthenticatorType } : undefined,
  );
  return res.data;
}

export async function detectPlatformAuthenticator(): Promise<boolean> {
  if (typeof window === "undefined" || !window.isSecureContext) {
    return false;
  }
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export function passkeyErrorKey(
  error: unknown,
  mode: "login" | "manage" = "manage",
) {
  const details = getApiErrorDetails(error);
  if (
    details.code === "PASSKEY_ORIGIN_NOT_ALLOWED" ||
    details.message.includes("Passkey origin is not allowed")
  ) {
    return "originNotAllowed";
  }
  if (details.code === "SESSION_COOKIE_NOT_STORED") {
    return "cookieBlocked";
  }
  if (details.code === "STUDENT_LOGIN_MAINTENANCE") {
    return "maintenance";
  }
  if (details.code === "PASSKEY_REAUTH_REQUIRED") {
    return "reauthExpired";
  }
  if (details.statusCode === 429) {
    return "rateLimited";
  }
  const name = error instanceof Error ? error.name : "";
  if (name === "ConstraintError") return "constraintUnsupported";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  if (name === "InvalidStateError") return "duplicate";
  if (name === "NotSupportedError" || name === "SecurityError") {
    return "unsupported";
  }
  return mode === "login" ? "signInFailed" : "error";
}
