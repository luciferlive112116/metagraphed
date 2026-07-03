import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  buildChainTurnover,
  loadChainTurnover,
  DEFAULT_CHAIN_TURNOVER_SORT,
} from "../src/chain-turnover.mjs";
import { handleRequest } from "../workers/api.mjs";
import { createLocalArtifactEnv } from "../scripts/lib.mjs";

const START = "2026-06-01";
const END = "2026-06-30";

const ROWS = [
  {
    netuid: 7,
    snapshot_date: START,
    uid: 0,
    hotkey: "V1",
    validator_permit: 1,
  },
  {
    netuid: 7,
    snapshot_date: START,
    uid: 1,
    hotkey: "V2",
    validator_permit: 1,
  },
  {
    netuid: 7,
    snapshot_date: END,
    uid: 0,
    hotkey: "V1",
    validator_permit: 1,
  },
  {
    netuid: 7,
    snapshot_date: END,
    uid: 1,
    hotkey: "V3",
    validator_permit: 1,
  },
  {
    netuid: 12,
    snapshot_date: START,
    uid: 0,
    hotkey: "A1",
    validator_permit: 1,
  },
  {
    netuid: 12,
    snapshot_date: END,
    uid: 0,
    hotkey: "A1",
    validator_permit: 1,
  },
];

describe("buildChainTurnover", () => {
  test("cold / empty / non-array inputs yield a schema-stable empty leaderboard", () => {
    for (const rows of [[], null, undefined]) {
      const data = buildChainTurnover(rows, {
        window: "30d",
        startDate: START,
        endDate: END,
      });
      assert.equal(data.schema_version, 1);
      assert.equal(data.subnet_count, 0);
      assert.equal(data.subnets.length, 0);
      assert.equal(data.mean_stability_score, null);
    }
  });

  test("ranks subnets and rolls up network churn totals", () => {
    const data = buildChainTurnover(ROWS, {
      window: "30d",
      startDate: START,
      endDate: END,
      sort: DEFAULT_CHAIN_TURNOVER_SORT,
      limit: 10,
    });
    assert.equal(data.subnet_count, 2);
    assert.equal(data.validators_entered, 1);
    assert.equal(data.validators_exited, 1);
    assert.equal(data.subnets.length, 2);
    assert.equal(data.subnets[0].netuid, 7);
    assert.ok(
      data.subnets[0].stability_score < data.subnets[1].stability_score,
    );
  });

  test("sort=churn ranks highest validator churn first", () => {
    const data = buildChainTurnover(ROWS, {
      window: "30d",
      startDate: START,
      endDate: END,
      sort: "churn",
    });
    assert.equal(data.sort, "churn");
    assert.equal(data.subnets[0].netuid, 7);
    assert.equal(data.subnets[1].validators_entered, 0);
  });

  test("clamps limit and ignores malformed netuid cells", () => {
    const data = buildChainTurnover(
      [...ROWS, { netuid: "nope", snapshot_date: START, uid: 0, hotkey: "X" }],
      { window: "7d", startDate: START, endDate: END, limit: 1 },
    );
    assert.equal(data.subnets.length, 1);
    assert.equal(data.window, "7d");
  });
});

describe("loadChainTurnover", () => {
  test("queries neuron_daily boundary rows without a netuid filter", async () => {
    const calls = [];
    const d1 = async (sql, params) => {
      calls.push({ sql, params });
      if (/MIN\(snapshot_date\)/.test(sql)) {
        return [{ start_date: START, end_date: END }];
      }
      return ROWS;
    };
    const data = await loadChainTurnover(d1, { windowLabel: "30d" });
    assert.equal(calls.length, 2);
    assert.doesNotMatch(calls[1].sql, /WHERE netuid/);
    assert.equal(data.subnet_count, 2);
    assert.equal(data.end_date, END);
  });

  test("single-snapshot store yields an empty leaderboard", async () => {
    const d1 = async (sql) => {
      if (/MIN\(snapshot_date\)/.test(sql)) {
        return [{ start_date: END, end_date: END }];
      }
      return [];
    };
    const data = await loadChainTurnover(d1, { windowLabel: "7d" });
    assert.equal(data.subnet_count, 0);
    assert.equal(data.subnets.length, 0);
  });
});

describe("GET /api/v1/chain/turnover", () => {
  function turnoverEnv(rows = []) {
    return {
      ...createLocalArtifactEnv(),
      METAGRAPH_HEALTH_DB: {
        prepare(sql) {
          return {
            bind() {
              return {
                all: () => {
                  if (/MIN\(snapshot_date\)/.test(sql)) {
                    return Promise.resolve({
                      results: [{ start_date: START, end_date: END }],
                    });
                  }
                  if (/FROM neuron_daily/.test(sql)) {
                    return Promise.resolve({ results: rows });
                  }
                  return Promise.resolve({ results: [] });
                },
              };
            },
          };
        },
      },
    };
  }

  const req = (q = "") =>
    new Request(`https://api.metagraph.sh/api/v1/chain/turnover${q}`);

  test("returns the network turnover leaderboard", async () => {
    const res = await handleRequest(req(), turnoverEnv(ROWS), {});
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.schema_version, 1);
    assert.equal(body.data.subnet_count, 2);
    assert.equal(body.meta.source, "metagraph-snapshot");
  });

  test("rejects an unsupported window with 400", async () => {
    const res = await handleRequest(req("?window=1y"), turnoverEnv(), {});
    assert.equal(res.status, 400);
  });

  test("rejects an unsupported sort with 400", async () => {
    const res = await handleRequest(req("?sort=bogus"), turnoverEnv(), {});
    assert.equal(res.status, 400);
  });

  test("returns an empty leaderboard on cold D1", async () => {
    const res = await handleRequest(req(), turnoverEnv([]), {});
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.data.subnet_count, 0);
  });
});
