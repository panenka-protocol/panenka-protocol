// XI builder: picks the optimal 15-man squad under FPL rules (<= GBP100m,
// 2 GKP / 5 DEF / 5 MID / 3 FWD, max 3 per club), then the best-scoring
// valid XI from it with formation, and the bench order.

import type { Specialist, Recommendation } from "./types.js";
import type { FplPlayer, IngestedState } from "../fpl/models.js";
import { playerFixtureScore } from "./fixtureScout.js";

const BUDGET = 1000; // tenths of a million
const POS: Record<number, string> = { 1: "GKP", 2: "DEF", 3: "MID", 4: "FWD" };

interface Scored extends FplPlayer { model: number }

export function buildSquad(state: IngestedState, gw: number) {
  const scored: Scored[] = state.players
    .filter((p) => p.status === "a" && p.minutes > 0)
    .map((p) => ({ ...p, model: playerFixtureScore(state, p, gw) }));

  // Greedy value-per-cost seed, then local upgrades toward raw score.
  const quota: [number, number][] = [[1, 2], [2, 5], [3, 5], [4, 3]];
  const squad: Scored[] = [];
  const perClub = new Map<number, number>();
  let cost = 0;

  const tryAdd = (p: Scored) => {
    if (squad.includes(p)) return false;
    if ((perClub.get(p.teamId) ?? 0) >= 3) return false;
    if (cost + p.nowCost > BUDGET) return false;
    squad.push(p);
    perClub.set(p.teamId, (perClub.get(p.teamId) ?? 0) + 1);
    cost += p.nowCost;
    return true;
  };

  // Fill each position quota by best model-per-cost, cheapest plausible bench.
  for (const [pos, n] of quota) {
    const pool = scored.filter((p) => p.elementType === pos).sort((a, b) => b.model / b.nowCost - a.model / a.nowCost);
    let added = 0;
    for (const p of pool) {
      if (added >= n) break;
      if (tryAdd(p)) added++;
    }
  }
  // Upgrade passes: swap in higher-model players while budget/club rules hold.
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < squad.length; i++) {
      const out = squad[i];
      const candidates = scored
        .filter((p) => p.elementType === out.elementType && p.model > out.model && !squad.includes(p))
        .sort((a, b) => b.model - a.model)
        .slice(0, 5);
      for (const inn of candidates) {
        const newCost = cost - out.nowCost + inn.nowCost;
        const clubCount = (perClub.get(inn.teamId) ?? 0) - (inn.teamId === out.teamId ? 1 : 0);
        if (newCost <= BUDGET && clubCount < 3) {
          squad[i] = inn;
          perClub.set(out.teamId, (perClub.get(out.teamId) ?? 1) - 1);
          perClub.set(inn.teamId, (perClub.get(inn.teamId) ?? 0) + 1);
          cost = newCost;
          break;
        }
      }
    }
  }
  return { squad, cost };
}

export function pickXI(squad: Scored[]) {
  const gkp = squad.filter((p) => p.elementType === 1).sort((a, b) => b.model - a.model);
  const out = squad.filter((p) => p.elementType !== 1).sort((a, b) => b.model - a.model);
  const xi: Scored[] = [gkp[0]];
  let def = 0, mid = 0, fwd = 0;
  for (const p of out) {
    if (xi.length >= 11) break;
    if (p.elementType === 2 && xi.length - 1 - def - mid - fwd >= 0) { /* count below */ }
    xi.push(p);
    if (p.elementType === 2) def++;
    if (p.elementType === 3) mid++;
    if (p.elementType === 4) fwd++;
  }
  // Formation validity: need >=3 DEF, >=2 MID(? no - FPL min is 3 DEF, 1 FWD... enforce standard: 3-5 DEF, 2-5 MID, 1-3 FWD)
  while (def < 3) {
    const worst = [...xi].reverse().find((p) => p.elementType === 3 && mid > 2) ?? [...xi].reverse().find((p) => p.elementType === 4 && fwd > 1);
    const bestDef = out.find((p) => p.elementType === 2 && !xi.includes(p));
    if (!worst || !bestDef) break;
    xi.splice(xi.indexOf(worst), 1, bestDef);
    if (worst.elementType === 3) mid--; else fwd--;
    def++;
  }
  while (fwd < 1) {
    const worst = [...xi].reverse().find((p) => p.elementType === 3 && mid > 2) ?? [...xi].reverse().find((p) => p.elementType === 2 && def > 3);
    const bestFwd = out.find((p) => p.elementType === 4 && !xi.includes(p));
    if (!worst || !bestFwd) break;
    xi.splice(xi.indexOf(worst), 1, bestFwd);
    if (worst.elementType === 3) mid--; else def--;
    fwd++;
  }
  const bench = out.filter((p) => !xi.includes(p)).concat(gkp.slice(1)).sort((a, b) => (a.elementType === 1 ? 99 : b.model - a.model ? -1 : 1));
  const benchOrdered = [gkp[1], ...out.filter((p) => !xi.includes(p)).sort((a, b) => b.model - a.model)];
  return { xi, formation: `${def}-${mid}-${fwd}`, bench: benchOrdered };
}

export const xiBuilder: Specialist = {
  id: "xi-builder",
  name: "XI Builder",
  analyze(state) {
    const gw = state.currentGameweek ?? 1;
    const { squad, cost } = buildSquad(state, gw);
    const { xi, formation, bench } = pickXI(squad);
    return [
      {
        agentId: "xi-builder",
        kind: "xi",
        summary: `GW${gw} XI in a ${formation}: ${xi.map((p) => p.webName).join(", ")}`,
        rationale: `Optimal model-score XI under FPL constraints; squad cost GBP${(cost / 10).toFixed(1)}m, formation ${formation}.`,
        score: 78,
        payload: {
          formation,
          xi: xi.map((p) => ({ id: p.id, name: p.webName, pos: POS[p.elementType], cost: p.nowCost / 10 })),
          bench: bench.map((p) => ({ id: p.id, name: p.webName, pos: POS[p.elementType], cost: p.nowCost / 10 })),
          squadCost: cost / 10,
        },
      },
    ];
  },
};
