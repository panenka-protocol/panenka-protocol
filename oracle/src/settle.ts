// Submits a settle transaction: [ed25519 oracle verify ix, settle ix].
// The program checks the oracle signature over contest||winner||gameweek
// before paying the winner minus the protocol fee (devnet-only value).

import { Buffer } from "node:buffer";
import nacl from "tweetnacl";
import {
  Connection,
  Ed25519Program,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import type { ContestResult } from "./result.js";
import { canonicalMessageBytes, canonicalMessageDisplay } from "./result.js";
import { settleIx } from "./client.js";

export interface SettleRecord {
  signature: string;
  winnerPubkey: string;
  explorerUrl: string;
}

export async function submitSettlement(
  connection: Connection,
  oracle: Keypair, // must be the contest's oracle; also pays the tx fee
  managerA: PublicKey,
  winnerEntryWallet: PublicKey,
  treasury: PublicKey,
  result: ContestResult,
): Promise<SettleRecord> {
  const msg = canonicalMessageBytes(result, winnerEntryWallet.toBase58());
  const sig = nacl.sign.detached(new Uint8Array(msg), oracle.secretKey);

  const verifyIx = Ed25519Program.createInstructionWithPublicKey({
    publicKey: oracle.publicKey.toBuffer(),
    message: msg,
    signature: Buffer.from(sig),
  });

  const tx = new Transaction()
    .add(verifyIx)
    .add(settleIx(managerA, result.gameweek, winnerEntryWallet, treasury));

  const signature = await sendAndConfirmTransaction(connection, tx, [oracle]);
  console.log("settled:", canonicalMessageDisplay(result, winnerEntryWallet.toBase58()));
  return {
    signature,
    winnerPubkey: winnerEntryWallet.toBase58(),
    explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=devnet`,
  };
}
