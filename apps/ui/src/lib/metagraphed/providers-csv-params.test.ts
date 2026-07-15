import { describe, expect, it } from "vitest";
import { providersCsvParams, providersCsvIsBroaderThanView } from "./providers-csv-params";

describe("providersCsvParams", () => {
  it("always requests the csv format", () => {
    expect(providersCsvParams({})).toEqual({ format: "csv" });
  });

  it("forwards the filters the providers collection actually registers", () => {
    expect(providersCsvParams({ kind: "subnet-team", authority: "official" })).toEqual({
      format: "csv",
      kind: "subnet-team",
      authority: "official",
    });
  });

  it("drops q: providers registers no search_keys, so the API would ignore it and return every row", () => {
    expect(providersCsvParams({ q: "academia", kind: "indexer" })).toEqual({
      format: "csv",
      kind: "indexer",
    });
  });

  it("drops the 'high' authority alias, which spans two real authority values", () => {
    expect(providersCsvParams({ authority: "high" })).toEqual({
      format: "csv",
    });
  });

  it("forwards sort=name (the only page sort the API also supports)", () => {
    expect(providersCsvParams({ sort: "name" })).toEqual({
      format: "csv",
      sort: "name",
    });
  });

  it.each(["surfaces", "endpoints", "subnets", "updated"])(
    "drops the client-side-only %s sort",
    (sort) => {
      expect(providersCsvParams({ sort })).toEqual({ format: "csv" });
    },
  );

  it("ignores empty-string search state", () => {
    expect(providersCsvParams({ q: "", kind: "", authority: "", sort: "" })).toEqual({
      format: "csv",
    });
  });
});

describe("providersCsvIsBroaderThanView", () => {
  it("flags a text-filtered view, whose rows the export cannot reproduce", () => {
    expect(providersCsvIsBroaderThanView({ q: "academia" })).toBe(true);
  });

  it("flags the 'high' authority shortcut", () => {
    expect(providersCsvIsBroaderThanView({ authority: "high" })).toBe(true);
  });

  it("does not flag a view the export reproduces exactly", () => {
    expect(providersCsvIsBroaderThanView({ authority: "official" })).toBe(false);
    expect(providersCsvIsBroaderThanView({})).toBe(false);
  });
});
