// End-to-end devnet demo: two managers escrow stakes, the oracle signs the
// gameweek outcome, the program settles on-chain. This is the script the
// D15-16 demo video records. DEVNET-ONLY value (docs/COMPLIANCE.md).
//
// Usage: npx tsx src/devnet-e2e.ts [--points 72,58] [--stake 0.05]
// Requires: funded manager/oracle keypairs (created + airdropped by this
// script on first run) and the program deployed at PROGRAM_ID.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { createContestIx, joinContestIx, contestPda } from "./client.js";
import { submitSettlement } from "./settle.js";
import type { ContestResult } from "./result.js";

const RPC = process.env.PANENKA_RPC ??
  `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY ?? ""}`;
const KEYS = new URL("../.keys/", import.meta.url).pathname;

async function loadOrCreate(name: string): Promise<Keypair> {
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(KEYS + name, "utf8"))));
  } catch {
    const kp = Keypair.generate();
    await mkdir(dirname(KEYS + name), { recursive: true });
    await writeFile(KEYS + name, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
    return kp;
  }
}

async function ensureFunded(c: Connection, kp: Keypair, min: number): Promise<void> {
  let bal = await c.getBalance(kp.publicKey);
  if (bal >= min) return;
  const sig = await c.requestAirdrop(kp.publicKey, min);
  await c.confirmTransaction(sig, "confirmed");
  bal = await c.getBalance(kp.publicKey);
  console.log(`funded ${kp.publicKey.toBase58()}: ${bal / LAMPORTS_PER_SOL} SOL`);
}

const args = process.argv.slice(2);
const pointsArg = args[args.indexOf("--points") + 1]?.split(",").map(Number) ?? [72, 58];
const stakeSol = Number(args[args.indexOf("--stake") + 1] ?? 0.05);
const gameweek = Number(args[args.indexOf("--gameweek") + 1] ?? 6);

const c = new Connection(RPC, "confirmed");
const [managerA, managerB, oracle, treasury] = await Promise.all([
  loadOrCreate("demo-manager-a.json"),
  loadOrCreate("demo-manager-b.json"),
  loadOrCreate("oracle-devnet.json"),
  loadOrCreate("treasury-devnet.json"),
]);

console.log("manager A:", managerA.publicKey.toBase58());
console.log("manager B:", managerB.publicKey.toBase58());
console.log("oracle:  ", oracle.publicKey.toBase58());
console.log("treasury:", treasury.publicKey.toBase58());

for (const kp of [managerA, managerB, oracle]) {
  await ensureFunded(c, kp, Math.ceil((stakeSol + 0.01) * LAMPORTS_PER_SOL));
}

const stake = BigInt(Math.round(stakeSol * LAMPORTS_PER_SOL));
const [contest] = contestPda(managerA.publicKey, gameweek);
console.log("contest PDA:", contest.toBase58());

// 1. create + join (skip if already locked on-chain)
const acct = await c.getAccountInfo(contest);
if (!acct) {
  const tx = new Transaction()
    .add(createContestIx(managerA.publicKey, gameweek, stake, oracle.publicKey))
    .add(joinContestIx(managerB.publicKey, managerA.publicKey, gameweek));
  const sig = await sendAndConfirmTransaction(c, tx, [managerA, managerB]);
  console.log("created+joined:", `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
} else {
  console.log("contest already exists on-chain; skipping create/join");
}

// 2. oracle computes the result (demo: points passed in; watcher does this
//    live from the FPL API once the gameweek finishes)
const result: ContestResult = {
  contestId: contest.toBase58(),
  gameweek,
  managerA: { entryId: 10971178, points: pointsArg[0] },
  managerB: { entryId: 0, points: pointsArg[1] },
  winnerEntryId: pointsArg[0] === pointsArg[1] ? null : pointsArg[0] > pointsArg[1] ? 10971178 : 0,
  computedAt: new Date().toISOString(),
  source: "fpl-official",
};
if (result.winnerEntryId === null) throw new Error("tie - split-pot path is post-hackathon work");

const winner = result.winnerEntryId === result.managerA.entryId ? managerA.publicKey : managerB.publicKey;

// 3. settle
const rec = await submitSettlement(c, oracle, managerA.publicKey, winner, treasury.publicKey, result);
console.log(JSON.stringify(rec, null, 2));
