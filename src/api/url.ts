import { getApiBaseUrl } from "./config";

/**
 * Resolve API-relative paths against the configured base URL.
 * Absolute http(s) URLs (e.g. media on music.zr.wiki) are kept as-is,
 * including query parameters such as `rev`.
 */
export function resolveApiUrl(urlOrPath: string): string {
  const value = urlOrPath.trim();
  if (!value) {
    throw new Error("empty URL");
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  const base = getApiBaseUrl();
  try {
    return new URL(value, `${base}/`).toString();
  } catch {
    const path = value.startsWith("/") ? value : `/${value}`;
    return `${base}${path}`;
  }
}
