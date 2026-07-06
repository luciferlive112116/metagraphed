import { describe, expect, it } from "vitest";

import { buildCsvExportUrl } from "./download-csv-button";

describe("buildCsvExportUrl", () => {
  it("appends format=csv to a path with no query string", () => {
    expect(buildCsvExportUrl("/api/v1/blocks")).toBe("/api/v1/blocks?format=csv");
  });

  it("preserves existing filters and adds format=csv", () => {
    expect(buildCsvExportUrl("/api/v1/subnets?limit=25&sort=netuid")).toBe(
      "/api/v1/subnets?limit=25&sort=netuid&format=csv",
    );
  });

  it("overwrites an existing format param with csv", () => {
    expect(buildCsvExportUrl("/api/v1/extrinsics?format=json&limit=50")).toBe(
      "/api/v1/extrinsics?format=csv&limit=50",
    );
  });

  it("keeps absolute URLs absolute", () => {
    expect(buildCsvExportUrl("https://api.metagraph.sh/api/v1/blocks?limit=10")).toBe(
      "https://api.metagraph.sh/api/v1/blocks?limit=10&format=csv",
    );
  });
});
