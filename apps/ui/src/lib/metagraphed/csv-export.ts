/** Merge `format=csv` into `url`, preserving any existing query params and hash. */
export function buildCsvExportUrl(url: string): string {
  const parsed = new URL(url, "https://export.local");
  parsed.searchParams.set("format", "csv");
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return parsed.toString();
  }
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  return path.startsWith("/") ? path : `/${path}`;
}

/** Navigate to `exportUrl` via a transient anchor so the SPA view is preserved. */
export function triggerCsvDownload(exportUrl: string): void {
  if (typeof document === "undefined") return;
  const anchor = document.createElement("a");
  anchor.href = exportUrl;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
