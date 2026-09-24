// Transfer-market trader: price-change pressure and value. Buys risers before
// they rise, flags fallers before they fall, keeps team value compounding.

import type { Specialist, Recommendation } from "./types.js";
import { playerFixtureScore } from "./fixtureScout.js";

export const transferTrader: Specialist = {
  id: "transfer-trader",
  name: "Transfer-Market Trader",
  analyze(state) {
    const gw = state.currentGameweek ?? 1;
    // Proxy for price pressure: high form + rising ownership at a cheap price.
    const risers = [...state.players]
      .filter((p) => p.form >= 5 && p.selectedByPercent < 20 && p.nowCost < 90)
      .sort((a, b) => b.form * 2 + b.selectedByPercent - (a.form * 2 + a.selectedByPercent))
      .slice(0, 3);
    if (risers.length === 0) return [];
    const top = risers[0];
    return [
      {
        agentId: "transfer-trader",
        kind: "transfer",
        summary: `Buy the riser: ${top.webName} (£${(top.nowCost / 10).toFixed(1)}m) before the price move`,
        rationale:
          `${top.webName} is in ${top.form.toFixed(1)} form at £${(top.nowCost / 10).toFixed(1)}m with ` +
          `${top.selectedByPercent.toFixed(1)}% ownership - classic pre-rise profile. ` +
          `Model score ${playerFixtureScore(state, top, gw).toFixed(0)} backs the football case, not just the market case.`,
        score: 66,
        payload: { risers: risers.map((p) => ({ id: p.id, name: p.webName, cost: p.nowCost / 10 })) },
      },
    ];
  },
};
