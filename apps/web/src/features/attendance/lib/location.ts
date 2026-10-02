interface PositionRequestOptions {
  signal?: AbortSignal;
  onProgress?: (position: GeolocationPosition) => void;
  onError?: (code: number) => void;
}

// Wait for a fresh GPS fix rather than treating the first coarse reading as final.
export function getAttendancePosition(
  geolocation: Geolocation,
  targetAccuracy = 50,
  timeoutMs = 12000,
  options: PositionRequestOptions = {},
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
      options.signal?.removeEventListener("abort", cancel);
      if (watchId !== undefined) geolocation.clearWatch(watchId);
      resolve(best);
    };
    const cancel = () => {
      best = null;
      finish();
    };
    const timer = setTimeout(finish, timeoutMs);
    if (options.signal?.aborted) {
      cancel();
      return;
    }
    options.signal?.addEventListener("abort", cancel, { once: true });
    try {
      watchId = geolocation.watchPosition(
        (position) => {
          if (settled) return;
          const { latitude, longitude, accuracy } = position.coords;
          if (
            !Number.isFinite(position.timestamp) ||
            position.timestamp < startedAt - 5000 ||
            !Number.isFinite(latitude) ||
            Math.abs(latitude) > 90 ||
            !Number.isFinite(longitude) ||
            Math.abs(longitude) > 180 ||
            !Number.isFinite(accuracy) ||
            accuracy < 0
          )
            return;
          if (!best || accuracy < best.coords.accuracy) {
            best = position;
            options.onProgress?.(position);
          }
          if (accuracy <= targetAccuracy) finish();
        },
        (error) => {
          if (settled) return;
          options.onError?.(error.code);
          // A temporary unavailable fix can recover before the overall deadline.
          if (error.code === 1) {
            best = null;
            finish();
          }
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

export async function getHallPosition(
  geolocation: Geolocation,
  isArabic: boolean,
  options: PositionRequestOptions & { timeoutMs?: number } = {},
) {
  let errorCode: number | undefined;
  const position = await getAttendancePosition(
    geolocation,
    50,
    options.timeoutMs ?? 30000,
    {
      ...options,
      onError: (code) => {
        errorCode = code;
        options.onError?.(code);
      },
    },
  );
  if (options.signal?.aborted)
    throw new Error(
      isArabic ? "تم إلغاء تحديد الموقع." : "Location request cancelled.",
    );
  if (errorCode === 1) {
    throw new Error(
      isArabic
        ? "الوصول للموقع محظور. اسمح بالموقع لهذا الموقع في المتصفح وفعّل خدمات الموقع في إعدادات الجهاز، ثم أعد المحاولة."
        : "Location access is blocked. Allow location for this site and enable location services in your device settings, then retry.",
    );
  }
  if (!position) {
    throw new Error(
      isArabic
        ? "لم يرسل الجهاز موقعاً صالحاً. فعّل خدمات الموقع والموقع الدقيق، ثم أعد المحاولة أو أدخل الإحداثيات يدوياً."
        : "Your device did not provide a location. Enable location services and precise location, then retry or enter coordinates manually.",
    );
  }
  if (position.coords.accuracy > 100) {
    const accuracy = Math.round(position.coords.accuracy);
    throw new Error(
      isArabic
        ? `أفضل دقة أرسلها الجهاز ±${accuracy} متر (المطلوب 100 متر أو أقل). استخدم هاتفاً مع GPS والموقع الدقيق أو أدخل الإحداثيات يدوياً. لم يتم تغيير موقع القاعة.`
        : `Best device accuracy is ±${accuracy} m (100 m or better required). Use a phone with GPS and precise location, or enter coordinates manually. Hall coordinates were kept.`,
    );
  }
  return position;
}
