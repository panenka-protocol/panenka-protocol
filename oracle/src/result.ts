// Result types for oracle outcomes. v2: the signed on-chain message commits to
// contest, both manager wallets, both FPL entry ids, gameweek, both point totals
// and a hash of the raw data the points were computed from (see client.ts).
// The hash proves which snapshot was signed, not that the snapshot is truthful.

import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { PublicKey } from "@solana/web3.js";
import { oracleMessage, type OracleMessageFields } from "./client.js";

export interface ContestResult {
  contestId: string; // contest PDA, base58
  gameweek: number;
  managerA: { entryId: number; wallet: string; points: number };
  managerB: { entryId: number; wallet: string; points: number };
  dataHash: string; // hex sha256 of canonical raw-data JSON
  computedAt: string;
  source: "fpl-official" | "synthetic-replay";
}

export function hashRawData(raw: unknown): Buffer {
  return createHash("sha256").update(JSON.stringify(raw)).digest();
}

export function messageFields(r: ContestResult): OracleMessageFields {
  return {
    contest: new PublicKey(r.contestId),
    managerA: new PublicKey(r.managerA.wallet), managerB: new PublicKey(r.managerB.wallet),
    entryA: r.managerA.entryId, entryB: r.managerB.entryId, gameweek: r.gameweek,
    pointsA: r.managerA.points, pointsB: r.managerB.points, dataHash: Buffer.from(r.dataHash, "hex"),
  };
}

export function canonicalMessageBytes(r: ContestResult): Buffer { return oracleMessage(messageFields(r)); }

export function canonicalMessageDisplay(r: ContestResult): string {
  return `${r.contestId} gw${r.gameweek} ${r.managerA.entryId}:${r.managerA.points} vs ${r.managerB.entryId}:${r.managerB.points} hash=${r.dataHash.slice(0, 12)}`;
}
