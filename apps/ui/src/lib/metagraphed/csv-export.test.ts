import { describe, expect, it, vi } from "vitest";

import { buildCsvExportUrl, triggerCsvDownload } from "./csv-export";

describe("buildCsvExportUrl", () => {
  it("appends format=csv to a relative path", () => {
    expect(buildCsvExportUrl("/api/v1/subnets")).toBe("/api/v1/subnets?format=csv");
  });

  it("preserves existing query params and overwrites format", () => {
    expect(buildCsvExportUrl("/api/v1/blocks?limit=50&sort=desc")).toBe(
      "/api/v1/blocks?limit=50&sort=desc&format=csv",
    );
    expect(buildCsvExportUrl("/api/v1/blocks?format=json&limit=10")).toBe(
      "/api/v1/blocks?format=csv&limit=10",
    );
  });

  it("keeps the hash fragment", () => {
    expect(buildCsvExportUrl("/api/v1/subnets?limit=5#tail")).toBe(
      "/api/v1/subnets?limit=5&format=csv#tail",
    );
  });

  it("handles absolute https URLs", () => {
    expect(buildCsvExportUrl("https://api.example/v1/subnets?netuid=7")).toBe(
      "https://api.example/v1/subnets?netuid=7&format=csv",
    );
  });
});

describe("triggerCsvDownload", () => {
  it("clicks a transient anchor with target=_blank", () => {
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = {
      href: "",
      target: "",
      rel: "",
      click,
      remove,
    } as unknown as HTMLAnchorElement;
    const appendChild = vi.fn().mockReturnValue(anchor);
    vi.stubGlobal("document", {
      createElement: vi.fn().mockReturnValue(anchor),
      body: { appendChild },
    });

    triggerCsvDownload("/api/v1/subnets?format=csv");

    expect(document.createElement).toHaveBeenCalledWith("a");
    expect(anchor.href).toBe("/api/v1/subnets?format=csv");
    expect(anchor.target).toBe("_blank");
    expect(anchor.rel).toBe("noopener noreferrer");
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
