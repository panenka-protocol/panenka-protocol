// Watcher: tracks a contest through its gameweek and, once the gameweek is
// officially finished, computes the result and signs it with the oracle
// keypair. The signed payload feeds the contest program's settle instruction
// (devnet-only contest value - docs/COMPLIANCE.md).
//
// Usage: npx tsx src/watcher.ts <contestPda> <gameweek> <entryA> <entryB>

import { readFile } from "node:fs/promises";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { decodeContest } from "./client.js";
import { entryGameweekData, gameweekDataChecked } from "./scoring.js";
import type { ContestResult } from "./result.js";
import { canonicalMessageDisplay, hashRawData } from "./result.js";

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
    if (await gameweekDataChecked(gameweek)) break;
    console.log(`${new Date().toISOString()} GW${gameweek} still live; next check in ${POLL_MS / 60000}m`);
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  const rpc = process.env.PANENKA_RPC ?? "https://api.devnet.solana.com";
  const conn = new Connection(rpc, "confirmed");
  const acct = await conn.getAccountInfo(new PublicKey(contestPda));
  if (!acct) throw new Error("contest account not found");
  const onchain = decodeContest(acct.data);
  // The on-chain entry ids are what the program will verify; refuse to sign if the caller's differ.
  if (onchain.entryA !== entryA || onchain.entryB !== entryB || onchain.gameweek !== gameweek) {
    throw new Error("entry ids or gameweek do not match the on-chain contest; refusing to sign");
  }
  const oracle = await loadOracleKeypair(keypairPath);
  if (!onchain.oracle.equals(oracle.publicKey)) throw new Error("this oracle key is not the contest's pinned oracle");

  const [da, db] = await Promise.all([entryGameweekData(entryA, gameweek), entryGameweekData(entryB, gameweek)]);
  const result: ContestResult = {
    contestId: contestPda, gameweek,
    managerA: { entryId: entryA, wallet: onchain.managerA.toBase58(), points: da.points },
    managerB: { entryId: entryB, wallet: onchain.managerB.toBase58(), points: db.points },
    dataHash: hashRawData({ gameweek, a: da.raw, b: db.raw }).toString("hex"),
    computedAt: new Date().toISOString(),
    source: "fpl-official",
  };
  console.log("result:", JSON.stringify(result));
  console.log("signing:", canonicalMessageDisplay(result), "| oracle:", oracle.publicKey.toBase58());
  // Equal points settle on-chain as a stake refund with no fee.

  if (process.env.SUBMIT === "1") {
    const { submitSettlement } = await import("./settle.js");
    const treasury = new PublicKey(process.env.TREASURY ?? (() => { throw new Error("TREASURY required"); })());
    const rec = await submitSettlement(conn, oracle, treasury, result);
    console.log("settlement tx:", rec.explorerUrl);
  } else {
    console.log("SUBMIT=1 TREASURY=<pubkey> to push settlement on-chain");
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
