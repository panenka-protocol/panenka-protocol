// Watcher: tracks a contest through its gameweek and, once the gameweek is
// officially finished, computes the result and signs it with the oracle
// keypair. The signed payload feeds the contest program's settle instruction
// (devnet-only contest value - docs/COMPLIANCE.md).
//
// Usage: npx tsx src/watcher.ts <contestPda> <gameweek> <entryA> <entryB>

import { readFile } from "node:fs/promises";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { entryGameweekPoints, gameweekFinished } from "./scoring.js";
import type { ContestResult } from "./result.js";
import { canonicalMessageBytes, canonicalMessageDisplay } from "./result.js";

const POLL_MS = 15 * 60 * 1000; // gameweeks close slowly; no hot polling

async function loadOracleKeypair(path: string): Promise<Keypair> {
  const raw = await readFile(path, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
}

export async function watchAndSign(
  contestPda: string,
  gameweek: number,
  entryA: number,
  entryB: number,
  keypairPath: string,
): Promise<void> {
  console.log(`watching contest ${contestPda} for GW${gameweek}: entry ${entryA} vs entry ${entryB}`);
  for (;;) {
    if (await gameweekFinished(gameweek)) break;
    console.log(`${new Date().toISOString()} GW${gameweek} still live; next check in ${POLL_MS / 60000}m`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  const [pointsA, pointsB] = await Promise.all([
    entryGameweekPoints(entryA, gameweek),
    entryGameweekPoints(entryB, gameweek),
  ]);

  const result: ContestResult = {
    contestId: contestPda,
    gameweek,
    managerA: { entryId: entryA, points: pointsA },
    managerB: { entryId: entryB, points: pointsB },
    winnerEntryId: pointsA === pointsB ? null : pointsA > pointsB ? entryA : entryB,
    computedAt: new Date().toISOString(),
    source: "fpl-official",
  };
  console.log("result:", JSON.stringify(result));

  if (result.winnerEntryId === null) {
    console.log("exact tie - settlement path TBD (split-pot instruction, D8-11)");
    return;
  }

  // Winner pubkey mapping happens at contest-creation time (entry -> wallet);
  // for the watcher CLI the winner wallet pubkey is passed by the caller env.
  const winnerPubkey = process.env.WINNER_PUBKEY ?? "<winner-wallet-pubkey>";
  const oracle = await loadOracleKeypair(keypairPath);
  const msgBytes = canonicalMessageBytes(result, winnerPubkey);
  const sig = nacl.sign.detached(new Uint8Array(msgBytes), oracle.secretKey);
  console.log("signed message:", canonicalMessageDisplay(result, winnerPubkey));
  console.log("oracle pubkey:", oracle.publicKey.toBase58());
  console.log("signature (base64):", Buffer.from(sig).toString("base64"));

  if (process.env.SUBMIT === "1") {
    const { Connection, PublicKey } = await import("@solana/web3.js");
    const { submitSettlement } = await import("./settle.js");
    const rpc = process.env.PANENKA_RPC ?? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY ?? ""}`;
    const managerA = new PublicKey(process.env.MANAGER_A ?? (() => { throw new Error("MANAGER_A required"); })());
    const treasury = new PublicKey(process.env.TREASURY ?? (() => { throw new Error("TREASURY required"); })());
    const rec = await submitSettlement(new Connection(rpc, "confirmed"), oracle, managerA, new PublicKey(winnerPubkey), treasury, result);
    console.log("settlement tx:", rec.explorerUrl);
  } else {
    console.log("SUBMIT=1 to push settlement on-chain (set MANAGER_A, TREASURY, WINNER_PUBKEY)");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [contestPda, gw, entryA, entryB] = process.argv.slice(2);
  if (!contestPda || !gw || !entryA || !entryB) {
    console.error("usage: watcher.ts <contestPda> <gameweek> <entryA> <entryB>");
    process.exit(1);
  }
  await watchAndSign(contestPda, Number(gw), Number(entryA), Number(entryB), process.env.ORACLE_KEY ?? "./.keys/oracle-devnet.json");
}
