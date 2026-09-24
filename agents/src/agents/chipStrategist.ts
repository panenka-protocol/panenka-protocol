// Chip strategist: when to fire wildcard, free hit, bench boost, triple captain.
// Conservative by design - chips are one-use, so the bar to recommend is high.

import type { Specialist, Recommendation } from "./types.js";

export const chipStrategist: Specialist = {
  id: "chip-strategist",
  name: "Chip Strategist",
  analyze(state) {
    const gw = state.currentGameweek ?? 1;
    const gws = [...state.gameweeks].sort((a, b) => a.id - b.id);
    const remaining = gws.filter((g) => g.id >= gw && !g.finished);
    if (remaining.length === 0) return [];
    // Heuristic: hold chips unless a blank/double gameweek is visible in the
    // fixture calendar (teams with 0 or 2 fixtures in a GW).
    const fixtureCount = new Map<string, number>();
    for (const f of state.fixtures) {
      if (f.event === null || f.finished) continue;
      fixtureCount.set(`${f.event}-${f.teamH}`, (fixtureCount.get(`${f.event}-${f.teamH}`) ?? 0) + 1);
      fixtureCount.set(`${f.event}-${f.teamA}`, (fixtureCount.get(`${f.event}-${f.teamA}`) ?? 0) + 1);
    }
    const doubles = [...fixtureCount.entries()].filter(([, c]) => c >= 2);
    if (doubles.length > 0 && gw > 3) {
      const [dgw] = doubles[0][0].split("-");
      return [
        {
          agentId: "chip-strategist",
          kind: "chip",
          summary: `Hold chips - double gameweek detected around GW${dgw}, plan bench boost / free hit there`,
          rationale: `Fixture calendar shows ${doubles.length} double-game slots starting GW${dgw}. Chips earn their keep on doubles; firing one now wastes the leverage.`,
          score: 70,
          payload: { doubleGameweek: Number(dgw), doubleSlots: doubles.length },
        },
      ];
    }
    return [
      {
        agentId: "chip-strategist",
        kind: "chip",
        summary: "Hold all chips this week",
        rationale: "No blank/double structure in the visible calendar and no squad emergency flagged. Discipline beats impulse.",
        score: 75,
        payload: {},
      },
    ];
  },
};
