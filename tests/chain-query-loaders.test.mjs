import assert from "node:assert/strict";
import { describe, test } from "vitest";
import {
  loadChainFees,
  loadChainSigners,
} from "../src/chain-query-loaders.mjs";

describe("loadChainSigners", () => {
  test("builds a ranked leaderboard from extrinsic rows", async () => {
    const calls = [];
    const d1Runner = async (sql, params) => {
      calls.push({ sql, params });
      return [
        {
          signer: "5G9hfkx9wGB1CLMT9WXkpHSAiYzjZb5o1Boyq4KAdDhjwrc5",
          tx_count: 8,
          total_fee_tao: 2,
          total_tip_tao: 0.5,
          last_tx_block: 100,
        },
      ];
    };
    const { data, rows } = await loadChainSigners(d1Runner, {
      windowLabel: "30d",
      windowDays: 30,
      observedAt: "2026-06-01T00:00:00.000Z",
      limit: 10,
      callModule: "Balances",
    });
    assert.equal(rows.length, 1);
    assert.equal(data.window, "30d");
    assert.equal(data.signer_count, 1);
    assert.equal(data.signers[0].tx_count, 8);
    assert.match(calls[0].sql, /call_module = \?/);
    assert.equal(calls[0].params[1], "Balances");
    assert.equal(calls[0].params[2], 10);
  });

  test("omits the module clause when callModule is null", async () => {
    let sql = "";
    let params;
    await loadChainSigners(
      async (query, bound) => {
        sql = query;
        params = bound;
        return [];
      },
      { windowLabel: "7d", windowDays: 7, limit: 5 },
    );
    assert.doesNotMatch(sql, /call_module/);
    assert.equal(params.length, 2);
    assert.equal(params[1], 5);
    assert.equal(typeof params[0], "number");
  });

  test("orders equal tx_count rows by signer ASC in SQL", async () => {
    let sql = "";
    await loadChainSigners(
      async (query) => {
        sql = query;
        return [];
      },
      { windowLabel: "7d", windowDays: 7, limit: 5 },
    );
    assert.match(sql, /ORDER BY tx_count DESC, signer ASC/);
  });
});

describe("loadChainFees", () => {
  // The loader runs the daily series and the payer list in parallel; the mock
  // returns the right rows per query by inspecting the SQL.
  function feesRunner(calls) {
    return async (sql, params) => {
      calls.push({ sql, params });
      if (/GROUP BY day/.test(sql)) {
        return [
          {
            day: "2026-06-29",
            extrinsic_count: 4,
            total_fee_tao: 2,
            total_tip_tao: 0.4,
          },
        ];
      }
      return [
        {
          signer: "5G9hfkx9wGB1CLMT9WXkpHSAiYzjZb5o1Boyq4KAdDhjwrc5",
          total_fee_tao: 1.5,
          total_tip_tao: 0.25,
          extrinsic_count: 3,
        },
      ];
    };
  }

  test("builds a daily series and payer list; scopes both queries by call_module", async () => {
    const calls = [];
    const { data, dailyRows, payerRows } = await loadChainFees(
      feesRunner(calls),
      {
        windowLabel: "30d",
        windowDays: 30,
        observedAt: "2026-06-01T00:00:00.000Z",
        limit: 10,
        callModule: "Balances",
      },
    );
    assert.equal(dailyRows.length, 1);
    assert.equal(payerRows.length, 1);
    assert.equal(data.window, "30d");
    assert.equal(data.day_count, 1);
    assert.equal(data.daily[0].avg_fee_tao, 0.5);
    assert.equal(data.top_fee_payers[0].total_fee_tao, 1.5);
    // Both queries carry the module clause and "Balances" bind.
    assert.equal(calls.length, 2);
    for (const c of calls) {
      assert.match(c.sql, /call_module = \?/);
      assert.equal(c.params[1], "Balances");
    }
  });

  test("omits the module clause and bounds the payer list by limit when callModule is null", async () => {
    const calls = [];
    await loadChainFees(feesRunner(calls), {
      windowLabel: "7d",
      windowDays: 7,
      limit: 25,
    });
    const daily = calls.find((c) => /GROUP BY day/.test(c.sql));
    const payers = calls.find((c) => /ORDER BY total_fee_tao DESC/.test(c.sql));
    assert.doesNotMatch(daily.sql, /call_module/);
    assert.equal(daily.params.length, 1);
    assert.doesNotMatch(payers.sql, /call_module/);
    assert.match(payers.sql, /LIMIT \?/);
    assert.equal(payers.params[1], 25);
  });
});
