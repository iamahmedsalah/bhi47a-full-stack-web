/** Login history used to be cleared to the Unix epoch on logout. */
export function formatLoginDateTime(
  value: string | Date | undefined | null,
  locale: string,
  unavailable: string,
) {
  if (!value) return unavailable;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getTime() <= 0)
    return unavailable;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Cairo",
  }).format(date);
}

interface NetworkNavigator {
  connection?: { type?: string };
  mozConnection?: { type?: string };
  webkitConnection?: { type?: string };
}

/** effectiveType describes speed; it cannot identify a Wi-Fi or cable link. */
export function reportedNetworkType(browser: NetworkNavigator) {
  const type = (
    browser.connection ??
    browser.mozConnection ??
    browser.webkitConnection
  )?.type;
  return type &&
    ["wifi", "cellular", "ethernet", "bluetooth", "wimax"].includes(type)
    ? type
    : undefined;
}

/** Keep the lookup's provider name, with a familiar Egyptian brand when matched. */
export function formatInternetProvider(isp?: string, country?: string) {
  if (!isp || country?.toUpperCase() !== "EG") return isp;
  const providers: [RegExp, string][] = [
    [/\b(?:telecom\s*egypt|te[\s-]*data)\b/i, "WE"],
    [/\bvodafone\b/i, "Vodafone"],
    [/\betisalat\b/i, "e& / Etisalat"],
    [/\borange\b|\blink\s*dot\s*net\b/i, "Orange"],
  ];
  const brand = providers.find(([pattern]) => pattern.test(isp))?.[1];
  return brand && brand !== isp ? `${brand} · ${isp}` : isp;
}
