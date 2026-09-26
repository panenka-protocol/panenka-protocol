// End-to-end devnet demo: two managers escrow stakes, the oracle signs the
// gameweek outcome, the program settles on-chain. This demo uses synthetic
// points rather than an independently verified FPL result. The video must
// label it as a replay; it cannot claim oracle-verified official points.
// DEVNET-ONLY value (docs/COMPLIANCE.md).
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
import { createContestIx, joinContestIx, contestPda, settleIx, oracleMessage, DEVNET_TREASURY } from "./client.js";
import nacl from "tweetnacl";
import { Ed25519Program } from "@solana/web3.js";
import { submitSettlement } from "./settle.js";
import type { ContestResult } from "./result.js";

const RPC = process.env.PANENKA_RPC ?? (process.env.HELIUS_API_KEY
  ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
  : "https://api.devnet.solana.com");
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
const [managerA, managerB, oracle] = await Promise.all([
  loadOrCreate("demo-manager-a.json"),
  loadOrCreate("demo-manager-b.json"),
  loadOrCreate("oracle-devnet.json"),
]);

console.log("manager A:", managerA.publicKey.toBase58());
console.log("manager B:", managerB.publicKey.toBase58());
console.log("oracle:  ", oracle.publicKey.toBase58());
console.log("treasury:", DEVNET_TREASURY.toBase58());

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

// 2. Synthetic replay: points supplied by the demo operator, not the FPL API.
//    For a live contest, watcher.ts fetches official points after GW close.
const result: ContestResult = {
  contestId: contest.toBase58(),
  gameweek,
  managerA: { entryId: 10971178, points: pointsArg[0] },
  managerB: { entryId: 0, points: pointsArg[1] },
  winnerEntryId: pointsArg[0] === pointsArg[1] ? null : pointsArg[0] > pointsArg[1] ? 10971178 : 0,
  computedAt: new Date().toISOString(),
  source: "synthetic-replay",
};
console.log("REPLAY ONLY: synthetic points, not official FPL scoring");
if (result.winnerEntryId === null) throw new Error("tie - split-pot path is post-hackathon work");

const winner = result.winnerEntryId === result.managerA.entryId ? managerA.publicKey : managerB.publicKey;

// 3. settle
// Security probe: a caller-supplied fee destination must be rejected. Simulate
// the exact signed result with a substituted treasury before real settlement.
const wrongTreasury = Keypair.generate().publicKey;
const message = oracleMessage(contest, winner, gameweek);
const signature = nacl.sign.detached(new Uint8Array(message), oracle.secretKey);
const rejection = new Transaction().add(
  Ed25519Program.createInstructionWithPublicKey({
    publicKey: oracle.publicKey.toBuffer(), message, signature: Buffer.from(signature),
  }),
  settleIx(managerA.publicKey, gameweek, winner, wrongTreasury),
);
rejection.feePayer = oracle.publicKey;
rejection.recentBlockhash = (await c.getLatestBlockhash()).blockhash;
rejection.sign(oracle);
const simulation = await c.simulateTransaction(rejection);
if (!simulation.value.err || !simulation.value.logs?.some((log) => log.includes("WrongTreasury"))) {
  throw new Error(`treasury substitution was not rejected as expected: ${JSON.stringify(simulation.value)}`);
}
console.log("security probe: substituted treasury rejected by program");

const rec = await submitSettlement(c, oracle, managerA.publicKey, winner, DEVNET_TREASURY, result);
console.log(JSON.stringify(rec, null, 2));
