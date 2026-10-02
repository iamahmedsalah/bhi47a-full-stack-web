// Wait for a fresh GPS fix rather than treating the first coarse reading as final.
export function getAttendancePosition(
  geolocation: Geolocation,
  targetAccuracy = 50,
  timeoutMs = 12000,
): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    let best: GeolocationPosition | null = null;
    let watchId: number | undefined;
    let settled = false;
    const startedAt = Date.now();
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (watchId !== undefined) geolocation.clearWatch(watchId);
      resolve(best);
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      watchId = geolocation.watchPosition(
        (position) => {
          if (settled) return;
          const { latitude, longitude, accuracy } = position.coords;
          if (
            position.timestamp < startedAt ||
            !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
            !Number.isFinite(longitude) || Math.abs(longitude) > 180 ||
            !Number.isFinite(accuracy) || accuracy < 0
          ) return;
          if (!best || accuracy < best.coords.accuracy) best = position;
          if (accuracy <= targetAccuracy) finish();
        },
        (error) => {
          // A temporary unavailable fix can recover before the overall deadline.
          if (error.code === 1) finish();
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
      );
      // Also clean up if a mocked/provider callback ran synchronously.
      if (settled) geolocation.clearWatch(watchId);
    } catch {
      finish();
    }
  });
}

export async function getHallPosition(geolocation: Geolocation, isArabic: boolean) {
  const position = await getAttendancePosition(geolocation);
  if (!position) {
    throw new Error(isArabic
      ? "تعذر تحديد الموقع. فعّل GPS والموقع الدقيق للمتصفح ثم أعد المحاولة."
      : "Could not get your location. Enable GPS and precise browser location, then retry.");
  }
  if (position.coords.accuracy > 100) {
    const accuracy = Math.round(position.coords.accuracy);
    throw new Error(isArabic
      ? `دقة الموقع ±${accuracy} متر؛ لا يمكن استخدامها لتحديد القاعة. فعّل الموقع الدقيق وحاول قرب نافذة أو في مكان مفتوح.`
      : `Location accuracy is ±${accuracy} m; it cannot locate the hall reliably. Enable precise location and retry near a window or outdoors.`);
  }
  return position;
}
