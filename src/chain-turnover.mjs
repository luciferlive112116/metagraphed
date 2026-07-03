// Network-wide validator-set & registration turnover: rank every subnet by its
// churn between the window's global start/end neuron_daily snapshots and roll up
// network totals. Pure shaping (buildChainTurnover) + a thin D1 loader
// (loadChainTurnover); the Worker adds the REST envelope. The network companion
// of /subnets/{netuid}/turnover and the stability lens alongside chain/movers.
// Null-safe: a cold store or a single snapshot yields an empty ranked list (never
// throws), matching the sibling live tiers.

import {
  MOVERS_WINDOWS,
  DEFAULT_MOVERS_WINDOW,
  MOVERS_LIMIT_DEFAULT,
  MOVERS_LIMIT_MAX,
} from "./movers.mjs";
import { buildTurnover, TURNOVER_READ_COLUMNS } from "./turnover.mjs";

export {
  MOVERS_WINDOWS as CHAIN_TURNOVER_WINDOWS,
  DEFAULT_MOVERS_WINDOW as DEFAULT_CHAIN_TURNOVER_WINDOW,
  MOVERS_LIMIT_DEFAULT as CHAIN_TURNOVER_LIMIT_DEFAULT,
  MOVERS_LIMIT_MAX as CHAIN_TURNOVER_LIMIT_MAX,
} from "./movers.mjs";

export const CHAIN_TURNOVER_SORTS = [
  "stability",
  "churn",
  "validators_entered",
  "validators_exited",
  "uids_deregistered",
];
export const DEFAULT_CHAIN_TURNOVER_SORT = "stability";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizedNetuid(value) {
  const netuid = Number(value);
  return Number.isSafeInteger(netuid) && netuid >= 0 ? netuid : null;
}

function groupRowsByNetuid(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const netuid = normalizedNetuid(row?.netuid);
    if (netuid == null) continue;
    if (!map.has(netuid)) map.set(netuid, []);
    map.get(netuid).push(row);
  }
  return map;
}

function subnetTurnoverSummary(turnover) {
  return {
    netuid: turnover.netuid,
    comparable: turnover.comparable,
    stability_score: turnover.stability_score,
    validators_entered: turnover.validators_entered,
    validators_exited: turnover.validators_exited,
    validator_retention: turnover.validator_retention,
    uids_deregistered: turnover.uids_deregistered,
    neurons_start: turnover.neurons_start,
    neurons_end: turnover.neurons_end,
  };
}

function churnTotal(turnover) {
  return (
    toNumber(turnover.validators_entered) + toNumber(turnover.validators_exited)
  );
}

const SORT_KEY = {
  stability: (turnover) => turnover.stability_score ?? -1,
  churn: churnTotal,
  validators_entered: (turnover) => turnover.validators_entered,
  validators_exited: (turnover) => turnover.validators_exited,
  uids_deregistered: (turnover) => turnover.uids_deregistered,
};

// Shape every subnet's boundary snapshots into a ranked turnover leaderboard plus
// network rollups. Null-safe on cold/empty input.
export function buildChainTurnover(
  rows,
  {
    window = DEFAULT_MOVERS_WINDOW,
    startDate = null,
    endDate = null,
    sort = DEFAULT_CHAIN_TURNOVER_SORT,
    limit = MOVERS_LIMIT_DEFAULT,
  } = {},
) {
  const normalizedSort = CHAIN_TURNOVER_SORTS.includes(sort)
    ? sort
    : DEFAULT_CHAIN_TURNOVER_SORT;
  const normalizedWindow =
    window == null
      ? null
      : MOVERS_WINDOWS[window]
        ? window
        : DEFAULT_MOVERS_WINDOW;
  const flooredLimit = Math.floor(Number(limit));
  const normalizedLimit = Number.isFinite(flooredLimit)
    ? Math.max(0, Math.min(flooredLimit, MOVERS_LIMIT_MAX))
    : MOVERS_LIMIT_DEFAULT;

  const subnets = [];
  let validatorsEntered = 0;
  let validatorsExited = 0;
  let uidsDeregistered = 0;
  let stabilitySum = 0;
  let stabilityCount = 0;

  for (const [netuid, netuidRows] of groupRowsByNetuid(rows)) {
    const turnover = buildTurnover(netuidRows, netuid, {
      window: normalizedWindow,
      startDate,
      endDate,
    });
    if (!turnover.comparable) continue;
    subnets.push(subnetTurnoverSummary(turnover));
    validatorsEntered += turnover.validators_entered;
    validatorsExited += turnover.validators_exited;
    uidsDeregistered += turnover.uids_deregistered;
    if (turnover.stability_score != null) {
      stabilitySum += turnover.stability_score;
      stabilityCount += 1;
    }
  }

  const sortFn = SORT_KEY[normalizedSort] ?? SORT_KEY.stability;
  if (normalizedSort === "stability") {
    subnets.sort((a, b) => sortFn(a) - sortFn(b) || a.netuid - b.netuid);
  } else {
    subnets.sort((a, b) => sortFn(b) - sortFn(a) || a.netuid - b.netuid);
  }

  return {
    schema_version: 1,
    window: normalizedWindow,
    start_date: startDate,
    end_date: endDate,
    sort: normalizedSort,
    subnet_count: subnets.length,
    comparable_subnet_count: subnets.length,
    validators_entered: validatorsEntered,
    validators_exited: validatorsExited,
    uids_deregistered: uidsDeregistered,
    mean_stability_score:
      stabilityCount > 0 ? Math.round(stabilitySum / stabilityCount) : null,
    subnets: subnets.slice(0, normalizedLimit),
  };
}

// Network-wide turnover leaderboard: resolve the window's global boundary
// snapshot_dates (MIN/MAX over neuron_daily, anchored to the newest stored day),
// read every subnet's boundary rows, shape with buildChainTurnover. Cold/absent
// or single-snapshot D1 -> empty subnets.
export async function loadChainTurnover(
  d1,
  {
    windowLabel = DEFAULT_MOVERS_WINDOW,
    sort = DEFAULT_CHAIN_TURNOVER_SORT,
    limit = MOVERS_LIMIT_DEFAULT,
  } = {},
) {
  const days =
    MOVERS_WINDOWS[windowLabel] ?? MOVERS_WINDOWS[DEFAULT_MOVERS_WINDOW];
  const bounds = await d1(
    "SELECT MIN(snapshot_date) AS start_date, MAX(snapshot_date) AS end_date " +
      "FROM neuron_daily " +
      "WHERE snapshot_date >= (SELECT date(MAX(snapshot_date), ?) FROM neuron_daily)",
    [`-${days} days`],
  );
  const startDate = bounds?.[0]?.start_date ?? null;
  const endDate = bounds?.[0]?.end_date ?? null;
  let rows = [];
  if (startDate != null && endDate != null && startDate !== endDate) {
    rows = await d1(
      `SELECT netuid, ${TURNOVER_READ_COLUMNS} FROM neuron_daily ` +
        "WHERE snapshot_date IN (?, ?) ORDER BY netuid ASC, snapshot_date ASC, uid ASC",
      [startDate, endDate],
    );
  }
  return buildChainTurnover(rows, {
    window: windowLabel,
    startDate,
    endDate,
    sort,
    limit,
  });
}
