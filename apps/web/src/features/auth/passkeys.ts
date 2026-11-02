import api, { getApiErrorDetails } from "@/lib/api";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
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

export async function passkeyRegisterOptions() {
  const res = await api.post<{
    flowId: string;
    options: PublicKeyCredentialCreationOptionsJSON;
  }>("/auth/passkeys/register/options");
  return res.data;
}

export function passkeyErrorKey(error: unknown) {
  const details = getApiErrorDetails(error);
  if (
    details.code === "PASSKEY_ORIGIN_NOT_ALLOWED" ||
    details.message.includes("Passkey origin is not allowed")
  )
    return "originNotAllowed";
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  if (name === "InvalidStateError") return "duplicate";
  if (name === "NotSupportedError" || name === "SecurityError")
    return "unsupported";
  return "error";
}
