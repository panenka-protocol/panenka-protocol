// Ingestion job: pulls bootstrap-static + fixtures, normalizes into
// IngestedState, and writes a snapshot the specialist agents consume.
// Usage: npx tsx src/fpl/ingest.ts [out.json]

import { writeFile } from "node:fs/promises";
import { FplClient } from "./client.js";
import type {
  FplPlayer,
  FplTeam,
  FplFixture,
  FplGameweek,
  IngestedState,
} from "./models.js";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export async function ingest(): Promise<IngestedState> {
  const client = new FplClient();
  const [bootstrap, fixturesRaw] = await Promise.all([
    client.bootstrapStatic(),
    client.fixtures(),
  ]);

  const gameweeks: FplGameweek[] = bootstrap.events.map((e: any) => ({
    id: e.id,
    name: e.name,
    deadlineTime: e.deadline_time,
    isCurrent: !!e.is_current,
    isNext: !!e.is_next,
    finished: !!e.finished,
    averageScore: e.average_entry_score ?? null,
    highestScore: e.highest_score ?? null,
  }));

  const players: FplPlayer[] = bootstrap.elements.map((p: any) => ({
    id: p.id,
    webName: p.web_name,
    teamId: p.team,
    elementType: p.element_type,
    nowCost: num(p.now_cost),
    totalPoints: num(p.total_points),
    form: num(p.form),
    pointsPerGame: num(p.points_per_game),
    expectedGoals: num(p.expected_goals),
    expectedAssists: num(p.expected_assists),
    expectedGoalInvolvements: num(p.expected_goal_involvements),
    minutes: num(p.minutes),
    selectedByPercent: num(p.selected_by_percent),
    status: p.status ?? "a",
    chanceOfPlayingNextRound:
      p.chance_of_playing_next_round === null
        ? null
        : num(p.chance_of_playing_next_round),
  }));

  const teams: FplTeam[] = bootstrap.teams.map((t: any) => ({
    id: t.id,
    name: t.name,
    shortName: t.short_name,
    strengthAttackHome: num(t.strength_attack_home),
    strengthAttackAway: num(t.strength_attack_away),
    strengthDefenceHome: num(t.strength_defence_home),
    strengthDefenceAway: num(t.strength_defence_away),
  }));

  const fixtures: FplFixture[] = fixturesRaw.map((f: any) => ({
    id: f.id,
    event: f.event ?? null,
    teamH: f.team_h,
    teamA: f.team_a,
    teamHDifficulty: num(f.team_h_difficulty),
    teamADifficulty: num(f.team_a_difficulty),
    kickoffTime: f.kickoff_time ?? null,
    finished: !!f.finished,
    teamHScore: f.team_h_score ?? null,
    teamAScore: f.team_a_score ?? null,
  }));

  const current = gameweeks.find((g) => !g.finished) ?? gameweeks.find((g) => g.isNext) ?? gameweeks.find((g) => g.isCurrent) ?? null;

  return {
    fetchedAt: new Date().toISOString(),
    currentGameweek: current ? current.id : null,
    players,
    teams,
    fixtures,
    gameweeks,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? "fpl-state.json";
  const state = await ingest();
  await writeFile(out, JSON.stringify(state, null, 2));
  console.log(
    `ingested ${state.players.length} players, ${state.teams.length} teams, ` +
      `${state.fixtures.length} fixtures; current GW = ${state.currentGameweek}; wrote ${out}`,
  );
}
