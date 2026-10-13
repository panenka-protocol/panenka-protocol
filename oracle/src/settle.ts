// Submits a settle transaction: [ed25519 oracle verify ix, settle ix].
// The program checks the oracle signature over the v2 message and derives the
// winner from the signed points (devnet-only value).

import { Buffer } from "node:buffer";
import nacl from "tweetnacl";
import { Connection, Ed25519Program, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { ContestResult } from "./result.js";
import { canonicalMessageBytes, canonicalMessageDisplay } from "./result.js";
import { settleIx } from "./client.js";

export interface SettleRecord { signature: string; explorerUrl: string; }

export async function submitSettlement(
  connection: Connection,
  oracle: Keypair, // must be the contest's oracle; also pays the tx fee
  treasury: PublicKey,
  result: ContestResult,
  cluster = "devnet",
): Promise<SettleRecord> {
  const msg = canonicalMessageBytes(result);
  const sig = nacl.sign.detached(new Uint8Array(msg), oracle.secretKey);
  const verifyIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: oracle.publicKey.toBuffer(), message: msg, signature: Buffer.from(sig),
  });
  const tx = new Transaction().add(verifyIx).add(settleIx(
    new PublicKey(result.managerA.wallet), new PublicKey(result.managerB.wallet), result.gameweek,
    result.managerA.points, result.managerB.points, Buffer.from(result.dataHash, "hex"), treasury,
  ));
  const signature = await sendAndConfirmTransaction(connection, tx, [oracle]);
  console.log("settled:", canonicalMessageDisplay(result));
  return { signature, explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${cluster}` };
}
