/**
 * Human-readable “when was this HTML built” line for static pages, using the
 * **Node process** local timezone and a zone name/offset from `Intl` (not UTC-only).
 */
export function formatParallelDocsBuiltAtLocal(date: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "longOffset",
    }).format(date);
  } catch {
    return date.toISOString();
  }
}
