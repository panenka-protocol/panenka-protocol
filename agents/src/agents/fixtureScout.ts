// Fixture & xG scout: ranks players by upcoming fixture ease + underlying
// expected involvement. The "form is temporary, fixtures are forever" agent.

import type { Specialist, Recommendation } from "./types.js";
import type { FplPlayer, IngestedState } from "../fpl/models.js";

function upcomingDifficulty(state: IngestedState, teamId: number, gw: number, n = 3): number {
  const games = state.fixtures
    .filter((f) => f.event !== null && f.event >= gw && f.event < gw + n)
    .filter((f) => f.teamH === teamId || f.teamA === teamId);
  if (games.length === 0) return 3;
  const avg = games.reduce((s, f) => s + (f.teamH === teamId ? f.teamHDifficulty : f.teamADifficulty), 0) / games.length;
  return avg; // 2 easy .. 5 brutal
}

export function playerFixtureScore(state: IngestedState, p: FplPlayer, gw: number): number {
  const ease = 6 - upcomingDifficulty(state, p.teamId, gw); // higher = easier run
  const xgi = p.expectedGoalInvolvements || p.expectedGoals + p.expectedAssists;
  const availability = p.status === "a" ? 1 : (p.chanceOfPlayingNextRound ?? 50) / 100;
  return ease * 10 + xgi * 2 + p.form * 3 + availability * 10;
}

export const fixtureScout: Specialist = {
  id: "fixture-scout",
  name: "Fixture & xG Scout",
  analyze(state) {
    const gw = state.currentGameweek ?? 1;
    const ranked = [...state.players]
      .filter((p) => p.minutes > 90)
      .sort((a, b) => playerFixtureScore(state, b, gw) - playerFixtureScore(state, a, gw))
      .slice(0, 5);
    if (ranked.length === 0) return [];
    const top = ranked[0];
    return [
      {
        agentId: "fixture-scout",
        kind: "captain",
        summary: `Captain ${top.webName} - best fixture/xG profile for GW${gw}`,
        rationale:
          `${top.webName} leads the fixture-adjusted model: ${top.expectedGoalInvolvements.toFixed(1)} xGI, ` +
          `form ${top.form.toFixed(1)}, favorable upcoming run. Alternates: ${ranked.slice(1, 3).map((p) => p.webName).join(", ")}.`,
        score: Math.min(95, 55 + top.expectedGoalInvolvements * 5),
        payload: { picks: ranked.map((p) => ({ id: p.id, name: p.webName, score: playerFixtureScore(state, p, gw) })) },
      },
    ];
  },
};
