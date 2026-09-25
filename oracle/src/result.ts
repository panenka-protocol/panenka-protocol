// Result types for the oracle: a signed, deterministic gameweek outcome.
// Settlement inputs come ONLY from official FPL points, so anyone can
// independently recompute and verify what the oracle signed.

import { PublicKey } from "@solana/web3.js";
import { oracleMessage } from "./client.js";

export interface ContestResult {
  contestId: string; // contest PDA, base58
  gameweek: number;
  managerA: { entryId: number; points: number };
  managerB: { entryId: number; points: number };
  winnerEntryId: number | null; // null on exact tie
  computedAt: string;
  source: "fpl-official";
}

// Canonical signing payload: exactly the bytes the contest program's ed25519
// check verifies (contest pubkey || winner pubkey || gameweek LE).
export function canonicalMessageBytes(r: ContestResult, winnerPubkey: string): Buffer {
  return oracleMessage(new PublicKey(r.contestId), new PublicKey(winnerPubkey), r.gameweek);
}

// Human-readable form for logs and the demo video.
export function canonicalMessageDisplay(r: ContestResult, winnerPubkey: string): string {
  return `${r.contestId}:${winnerPubkey}:gw${r.gameweek}`;
}
