// Differential hunter: low-ownership players with strong underlying numbers.
// Wins mini-leagues when it hits, eats blame when it doesn't. Filed regardless.

import type { Specialist, Recommendation } from "./types.js";
import { playerFixtureScore } from "./fixtureScout.js";

export const differentialHunter: Specialist = {
  id: "differential-hunter",
  name: "Differential Hunter",
  analyze(state) {
    const gw = state.currentGameweek ?? 1;
    const ranked = [...state.players]
      .filter((p) => p.selectedByPercent > 0.5 && p.selectedByPercent < 8 && p.minutes > 180)
      .sort((a, b) => playerFixtureScore(state, b, gw) - playerFixtureScore(state, a, gw))
      .slice(0, 3);
    if (ranked.length === 0) return [];
    const top = ranked[0];
    return [
      {
        agentId: "differential-hunter",
        kind: "transfer",
        summary: `Differential transfer target: ${top.webName} (${top.selectedByPercent.toFixed(1)}% owned)`,
        rationale:
          `${top.webName} combines ${top.expectedGoalInvolvements.toFixed(1)} xGI and form ${top.form.toFixed(1)} ` +
          `with only ${top.selectedByPercent.toFixed(1)}% ownership - ranking upside if the haul lands.`,
        score: Math.min(80, 40 + (8 - top.selectedByPercent) * 4 + top.form * 2),
        payload: { targets: ranked.map((p) => ({ id: p.id, name: p.webName, owned: p.selectedByPercent })) },
      },
    ];
  },
};
