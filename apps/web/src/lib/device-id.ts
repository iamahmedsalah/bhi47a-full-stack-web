/**
 * Client device binding helper for Smart Attendance.
 *
 * Generates and persists a stable, cryptographically random UUID in local storage.
 * Used to enforce "1 physical device = 1 student per attendance session", preventing
 * proxy attendance / multiple logins from the same handset.
 */

const DEVICE_ID_STORAGE_KEY = "bh47a_attendance_device_uuid_v1";

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
