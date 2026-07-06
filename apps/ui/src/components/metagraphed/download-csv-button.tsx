import { Download } from "lucide-react";
import { classNames } from "@/lib/metagraphed/format";

interface Props {
  /** Filtered/sorted list endpoint; `format=csv` is appended on click. */
  url: string;
  /** Optional hint only — the server sets the real filename via Content-Disposition. */
  filename?: string;
  label?: string;
  className?: string;
}

/**
 * Append `format=csv` to `url`, preserving any existing query params.
 * Exported for unit tests (no DOM).
 */
export function buildCsvExportUrl(url: string, baseUrl = "https://example.com"): string {
  const parsed = new URL(url, baseUrl);
  parsed.searchParams.set("format", "csv");
  if (/^https?:\/\//i.test(url)) {
    return parsed.href;
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function DownloadCsvButton({ url, label = "Download CSV", className }: Props) {
  const onClick = () => {
    if (typeof window === "undefined") return;
    window.location.href = buildCsvExportUrl(url, window.location.origin);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={classNames(
        "inline-flex items-center gap-1.5 rounded border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-ink hover:border-ink/30 transition-colors",
        className,
      )}
    >
      <Download className="size-3" aria-hidden />
      {label}
    </button>
  );
}
