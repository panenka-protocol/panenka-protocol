// Minimal TS client for the panenka-contest program (manual borsh encoding -
// no Anchor IDL needed). Mirrors programs/panenka-contest/src/lib.rs.

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_INSTRUCTIONS_PUBKEY,
  TransactionInstruction,
} from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("Bv3J2KL8Kp2twqF86d8j77DKUX5NTF4ns4kFftenPU85");
export const DEVNET_TREASURY = new PublicKey("4ARCvqyV9CY3G3v3ZsSxPe6zeaWaRfBakfiY7GvorF3Y");

function discriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export function contestPda(managerA: PublicKey, gameweek: number): [PublicKey, number] {
  const gw = Buffer.alloc(2);
  gw.writeUInt16LE(gameweek);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("contest"), managerA.toBuffer(), gw],
    PROGRAM_ID,
  );
}

export function createContestIx(
  managerA: PublicKey,
  gameweek: number,
  stakeLamports: bigint,
  oracle: PublicKey,
): TransactionInstruction {
  const [contest] = contestPda(managerA, gameweek);
  const data = Buffer.alloc(8 + 2 + 8 + 32);
  discriminator("create_contest").copy(data, 0);
  data.writeUInt16LE(gameweek, 8);
  data.writeBigUInt64LE(stakeLamports, 10);
  oracle.toBuffer().copy(data, 18);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: managerA, isSigner: true, isWritable: true },
      { pubkey: contest, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function joinContestIx(managerB: PublicKey, managerA: PublicKey, gameweek: number): TransactionInstruction {
  const [contest] = contestPda(managerA, gameweek);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: managerB, isSigner: true, isWritable: true },
      { pubkey: contest, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: discriminator("join_contest"),
  });
}

export function cancelContestIx(managerA: PublicKey, gameweek: number): TransactionInstruction {
  const [contest] = contestPda(managerA, gameweek);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: managerA, isSigner: true, isWritable: true },
      { pubkey: contest, isSigner: false, isWritable: true },
    ],
    data: discriminator("cancel_contest"),
  });
}

export function settleIx(
  managerA: PublicKey,
  gameweek: number,
  winner: PublicKey,
  treasury: PublicKey,
): TransactionInstruction {
  const [contest] = contestPda(managerA, gameweek);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: contest, isSigner: false, isWritable: true },
      { pubkey: winner, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: managerA, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: discriminator("settle"),
  });
}

/// Canonical oracle message bytes: contest || winner || gameweek (LE u16).
/// Must match oracle_message() in lib.rs exactly.
export function oracleMessage(contest: PublicKey, winner: PublicKey, gameweek: number): Buffer {
  const gw = Buffer.alloc(2);
  gw.writeUInt16LE(gameweek);
  return Buffer.concat([contest.toBuffer(), winner.toBuffer(), gw]);
}
