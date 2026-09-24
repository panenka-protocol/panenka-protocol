// The conductor: runs the weekly debate. Each specialist files its call with
// a score; the conductor resolves conflicts by kind (captain vs captain) with
// score-weighted vote, assembles the final decision set, and produces the
// attestation payload (decision + rationale hashes).

import { createHash } from "node:crypto";
import type { IngestedState } from "../fpl/models.js";
import type { Recommendation, Specialist } from "../agents/types.js";
import { fixtureScout } from "../agents/fixtureScout.js";
import { differentialHunter } from "../agents/differentialHunter.js";
import { captainSelector } from "../agents/captainSelector.js";
import { chipStrategist } from "../agents/chipStrategist.js";
import { transferTrader } from "../agents/transferTrader.js";

export const SWARM: Specialist[] = [
  fixtureScout,
  differentialHunter,
  captainSelector,
  chipStrategist,
  transferTrader,
];

export interface Decision {
  kind: Recommendation["kind"];
  winner: Recommendation;
  dissent: Recommendation[]; // losing positions, kept for the debate trail
}

export interface DebateResult {
  gameweek: number | null;
  decidedAt: string;
  decisions: Decision[];
  transcript: Recommendation[]; // every filed position
  attestationHash: string; // sha256 over the canonical decision payload
}

const KIND_PRIORITY: Recommendation["kind"][] = ["captain", "transfer", "chip", "xi"];

export function runDebate(state: IngestedState): DebateResult {
  const transcript = SWARM.flatMap((s) => s.analyze(state));

  const decisions: Decision[] = [];
  for (const kind of KIND_PRIORITY) {
    const positions = transcript.filter((r) => r.kind === kind);
    if (positions.length === 0) continue;
    const sorted = [...positions].sort((a, b) => b.score - a.score);
    decisions.push({ kind, winner: sorted[0], dissent: sorted.slice(1) });
  }

  const canonical = JSON.stringify({
    gameweek: state.currentGameweek,
    decisions: decisions.map((d) => ({
      kind: d.kind,
      agent: d.winner.agentId,
      summary: d.winner.summary,
      rationale: d.winner.rationale,
      score: d.winner.score,
      payload: d.winner.payload,
    })),
  });

  return {
    gameweek: state.currentGameweek,
    decidedAt: new Date().toISOString(),
    decisions,
    transcript,
    attestationHash: createHash("sha256").update(canonical).digest("hex"),
  };
}
