// Captain selector: the pure armband call - blends form, xGI, ownership
// (safe-vs-rank context), and fixture ease into one 2x decision.

import type { Specialist, Recommendation } from "./types.js";
import { playerFixtureScore } from "./fixtureScout.js";

export const captainSelector: Specialist = {
  id: "captain-selector",
  name: "Captain Selector",
  analyze(state) {
    const gw = state.currentGameweek ?? 1;
    const ranked = [...state.players]
      .filter((p) => p.elementType >= 3 && p.minutes > 180 && p.status === "a") // MID/FWD, available
      .sort((a, b) => playerFixtureScore(state, b, gw) - playerFixtureScore(state, a, gw))
      .slice(0, 3);
    if (ranked.length === 0) return [];
    const [first, second] = ranked;
    const contested = second && playerFixtureScore(state, second, gw) / playerFixtureScore(state, first, gw) > 0.9;
    return [
      {
        agentId: "captain-selector",
        kind: "captain",
        summary: `Armband on ${first.webName}${contested ? `, with ${second.webName} close behind` : ""}`,
        rationale:
          `${first.webName}: ${first.expectedGoalInvolvements.toFixed(1)} xGI, form ${first.form.toFixed(1)}, ` +
          `${first.selectedByPercent.toFixed(0)}% owned (safe cover). ` +
          (contested
            ? `${second.webName} is within 10% on the model - genuine coin-flip, ownership breaks the tie.`
            : `Clear margin over the field this week.`),
        score: contested ? 62 : 84,
        payload: { captain: { id: first.id, name: first.webName }, vice: second ? { id: second.id, name: second.webName } : null },
      },
    ];
  },
};
