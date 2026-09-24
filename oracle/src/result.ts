// Result types for the oracle: a signed, deterministic gameweek outcome.
// Settlement inputs come ONLY from official FPL points, so anyone can
// independently recompute and verify what the oracle signed.

export interface ContestResult {
  contestId: string; // contest PDA, base58
  gameweek: number;
  managerA: { entryId: number; points: number };
  managerB: { entryId: number; points: number };
  winnerEntryId: number | null; // null on exact tie
  computedAt: string;
  source: "fpl-official";
}

// Canonical signing payload: the contest program's ed25519 check verifies
// exactly these bytes (contest pubkey || winner pubkey || gameweek).
export function canonicalMessage(r: ContestResult, winnerPubkey: string): string {
  return `${r.contestId}:${winnerPubkey}:gw${r.gameweek}`;
}
