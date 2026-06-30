// Shared chain-signers D1 loader for REST + MCP parity (#2342). Pure
// orchestration over extrinsics-tier rows + buildChainSigners; REST handlers keep
// edge-cache + envelope wiring.

import { DAY_MS } from "../workers/config.mjs";
import { buildChainFees, buildChainSigners } from "./chain-analytics.mjs";

// Windowed most-active-account leaderboard (#2342): signers ranked by extrinsic
// count over the window (ties broken by signer ASC for stable ordering).
// Optional call_module scopes to one pallet.
export async function loadChainSigners(
  d1Runner,
  { windowLabel, windowDays, observedAt = null, limit = 50, callModule = null },
) {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const moduleClause = callModule ? " AND call_module = ?" : "";
  const params = callModule ? [cutoff, callModule, limit] : [cutoff, limit];
  const rows = await d1Runner(
    `SELECT signer,
            COUNT(*) AS tx_count,
            SUM(COALESCE(fee_tao, 0)) AS total_fee_tao,
            SUM(COALESCE(tip_tao, 0)) AS total_tip_tao,
            MAX(block_number) AS last_tx_block
     FROM extrinsics
     WHERE observed_at >= ? AND signer IS NOT NULL${moduleClause}
     GROUP BY signer
     ORDER BY tx_count DESC, signer ASC
     LIMIT ?`,
    params,
  );
  const data = buildChainSigners({
    window: windowLabel,
    observedAt,
    rows,
  });
  return { data, rows };
}

// Fee/tip market analytics shared by REST + MCP parity (#2381): a per-UTC-day
// fee series (totals + averages) plus a windowed top-fee-payer list. COALESCE
// keeps NULL fees/tips out of the SUMs. Optional call_module scopes both the
// daily series and the payer list to one pallet. Returns the built payload plus
// the raw row sets so REST callers can flag a D1 fallback.
export async function loadChainFees(
  d1Runner,
  { windowLabel, windowDays, observedAt = null, limit = 25, callModule = null },
) {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const moduleClause = callModule ? " AND call_module = ?" : "";
  const [dailyRows, payerRows] = await Promise.all([
    d1Runner(
      `SELECT strftime('%Y-%m-%d', observed_at / 1000, 'unixepoch') AS day,
              COUNT(*) AS extrinsic_count,
              SUM(COALESCE(fee_tao, 0)) AS total_fee_tao,
              SUM(COALESCE(tip_tao, 0)) AS total_tip_tao
       FROM extrinsics
       WHERE observed_at >= ?${moduleClause}
       GROUP BY day`,
      callModule ? [cutoff, callModule] : [cutoff],
    ),
    d1Runner(
      `SELECT signer,
              SUM(COALESCE(fee_tao, 0)) AS total_fee_tao,
              SUM(COALESCE(tip_tao, 0)) AS total_tip_tao,
              COUNT(*) AS extrinsic_count
       FROM extrinsics
       WHERE observed_at >= ? AND signer IS NOT NULL${moduleClause}
       GROUP BY signer
       ORDER BY total_fee_tao DESC
       LIMIT ?`,
      callModule ? [cutoff, callModule, limit] : [cutoff, limit],
    ),
  ]);
  const data = buildChainFees({
    window: windowLabel,
    observedAt,
    dailyRows,
    payerRows,
  });
  return { data, dailyRows, payerRows };
}
