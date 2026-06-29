/**
 * Routes absolute image URLs through the server-side proxy at /api/img
 * so raw Supabase Storage URLs never appear in page source.
 * Data URIs and relative paths are returned as-is.
 */
export function proxyUrl(src: string | null | undefined): string {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://")) {
    return `/api/img?url=${encodeURIComponent(src)}`;
  }
  return src;
}
