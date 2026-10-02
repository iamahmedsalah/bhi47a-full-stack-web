export function getDevicePresentation(deviceInfo?: string) {
  const label = (deviceInfo || "").replace(/[📱💻]/gu, "").trim();
  const kind = /ipad|tablet/i.test(label)
    ? "tablet"
    : /android|iphone|mobile/i.test(label)
      ? "phone"
      : /windows|macos|linux|pc/i.test(label)
        ? "computer"
        : "unknown";
  return { label, kind };
}

export function distanceFromHall(
  location: { latitude: number; longitude: number } | undefined,
  hall: { latitude: number; longitude: number } | undefined,
): number | null {
  if (
    !location ||
    !hall ||
    ![
      location.latitude,
      location.longitude,
      hall.latitude,
      hall.longitude,
    ].every(Number.isFinite)
  )
    return null;
  const radians = (angle: number) => (angle * Math.PI) / 180;
  const a =
    Math.sin(radians(hall.latitude - location.latitude) / 2) ** 2 +
    Math.cos(radians(location.latitude)) *
      Math.cos(radians(hall.latitude)) *
      Math.sin(radians(hall.longitude - location.longitude) / 2) ** 2;
  return Math.round(
    6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))),
  );
}
