import type { QueryParams } from "./client";

/**
 * Map the /providers page's search state onto the params `GET /api/v1/providers`
 * actually honours, for the CSV export (#5665).
 *
 * Deliberately NOT a blind `{ ...search, format: "csv" }` spread. The providers
 * collection registers `filters: [id, kind, authority]`, `search_keys: []`, and
 * `sort_fields: [authority, id, kind, name]` (src/contracts.mjs), so:
 *
 * - `q` is a client-side-only filter here (unlike the subnets collection, whose
 *   search_keys are populated). Forwarding it would be silently ignored by the
 *   API and hand back every provider — a CSV that contradicts the filtered rows
 *   on screen. It is dropped, and the button is labelled as a full export.
 * - `surfaces`/`endpoints`/`subnets`/`updated` are computed client-side and are
 *   not sortable server-side; only `name` overlaps, so only `name` is forwarded.
 * - `authority: "high"` is a nav shortcut for "official + provider-claimed", not
 *   a real authority value, so it cannot be pushed down to a single-value filter.
 */
export function providersCsvParams(search: {
  q?: string;
  kind?: string;
  authority?: string;
  sort?: string;
}): QueryParams {
  const params: QueryParams = { format: "csv" };
  if (search.kind) params.kind = search.kind;
  // "high" is a UI-only alias spanning two authority values -- not pushable.
  if (search.authority && search.authority !== "high") {
    params.authority = search.authority;
  }
  if (search.sort === "name") params.sort = "name";
  return params;
}

/**
 * True when the current view has filters the export cannot reproduce, i.e. the
 * CSV would be broader than what the user is looking at.
 */
export function providersCsvIsBroaderThanView(search: { q?: string; authority?: string }): boolean {
  return Boolean(search.q) || search.authority === "high";
}
