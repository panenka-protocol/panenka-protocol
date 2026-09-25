// Attestation writer: posts the debate's attestation hash to Solana via the
// memo program, creating a tamper-proof public decision trail.
//
// Networks (per docs/COMPLIANCE.md): devnet during the build; mainnet for the
// real proof-of-alpha trail (memo = no value transfer). Never contest money.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { DebateResult } from "./debate.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export interface AttestationRecord {
  network: string;
  signature: string;
  attestationHash: string;
  gameweek: number | null;
  decidedAt: string;
  explorerUrl: string;
}

async function loadOrCreatePayer(path: string): Promise<Keypair> {
  try {
    const raw = await readFile(path, "utf8");
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  } catch {
    const kp = Keypair.generate();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify([...kp.secretKey]), { mode: 0o600 });
    return kp;
  }
}

export async function attest(
  debate: DebateResult,
  opts: { rpc: string; keypairPath: string; cluster: "devnet" | "mainnet-beta" },
): Promise<AttestationRecord> {
  const connection = new Connection(opts.rpc, "confirmed");
  const payer = await loadOrCreatePayer(opts.keypairPath);

  let balance = await connection.getBalance(payer.publicKey);
  if (balance < 0.001 * LAMPORTS_PER_SOL) {
    if (opts.cluster !== "devnet") {
      throw new Error(`attestation payer ${payer.publicKey.toBase58()} unfunded on ${opts.cluster}`);
    }
    await connection.requestAirdrop(payer.publicKey, 0.05 * LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 2000));
    balance = await connection.getBalance(payer.publicKey);
  }

  const memo = `panenka:gw${debate.gameweek}:${debate.attestationHash}`;
  const tx = new Transaction().add(
    new TransactionInstruction({ keys: [], programId: MEMO_PROGRAM_ID, data: Buffer.from(memo, "utf8") }),
  );
  const signature = await sendAndConfirmTransaction(connection, tx, [payer]);

  return {
    network: opts.cluster,
    signature,
    attestationHash: debate.attestationHash,
    gameweek: debate.gameweek,
    decidedAt: debate.decidedAt,
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${opts.cluster}`,
  };
}

// CLI: npx tsx src/conductor/attest.ts  (devnet dry-run of the full pipeline)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { ingest } = await import("../fpl/ingest.js");
  const { runDebate } = await import("./debate.js");
  const debate = runDebate(await ingest());
  const rec = await attest(debate, {
    rpc: process.env.PANENKA_RPC ?? (process.env.HELIUS_API_KEY
      ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : "https://api.devnet.solana.com"),
    keypairPath: new URL("../../.keys/attestor-devnet.json", import.meta.url).pathname,
    cluster: "devnet",
  });
  console.log(JSON.stringify(rec, null, 2));
}
