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
export const DEVNET_TREASURY = new PublicKey("8wTiPnMnZUwUxSSy8GZUABUPfLMnTkoSVhAg2htXcB6c");

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
  entryId: number,
  bindingExpiry: number,
): TransactionInstruction {
  const [contest] = contestPda(managerA, gameweek);
  const data = Buffer.alloc(8 + 2 + 8 + 32 + 4 + 8);
  discriminator("create_contest").copy(data, 0);
  data.writeUInt16LE(gameweek, 8);
  data.writeBigUInt64LE(stakeLamports, 10);
  oracle.toBuffer().copy(data, 18);
  data.writeUInt32LE(entryId, 50);
  data.writeBigInt64LE(BigInt(bindingExpiry), 54);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: managerA, isSigner: true, isWritable: true },
      { pubkey: contest, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function joinContestIx(managerB: PublicKey, managerA: PublicKey, gameweek: number, entryId: number, bindingExpiry: number): TransactionInstruction {
  const [contest] = contestPda(managerA, gameweek);
  const data = Buffer.alloc(20);
  discriminator("join_contest").copy(data, 0);
  data.writeUInt32LE(entryId, 8);
  data.writeBigInt64LE(BigInt(bindingExpiry), 12);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: managerB, isSigner: true, isWritable: true },
      { pubkey: contest, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
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
  managerB: PublicKey,
  gameweek: number,
  pointsA: number,
  pointsB: number,
  dataHash: Buffer,
  treasury: PublicKey,
): TransactionInstruction {
  const [contest] = contestPda(managerA, gameweek);
  const data = Buffer.alloc(8 + 2 + 2 + 32);
  discriminator("settle").copy(data, 0);
  data.writeInt16LE(pointsA, 8);
  data.writeInt16LE(pointsB, 10);
  dataHash.copy(data, 12);
  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: contest, isSigner: false, isWritable: true },
      { pubkey: managerB, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: managerA, isSigner: false, isWritable: true },
      { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export interface OracleMessageFields {
  contest: PublicKey; managerA: PublicKey; managerB: PublicKey;
  entryA: number; entryB: number; gameweek: number;
  pointsA: number; pointsB: number; dataHash: Buffer; // 32 bytes
}

/// Oracle message v2. Must match oracle_message() in lib.rs byte for byte:
/// "PNK2" || contest || manager_a || manager_b || entry_a u32 || entry_b u32 ||
/// gameweek u16 || points_a u16 || points_b u16 || data_hash[32] (all LE).
export function oracleMessage(f: OracleMessageFields): Buffer {
  const n = Buffer.alloc(14);
  n.writeUInt32LE(f.entryA, 0); n.writeUInt32LE(f.entryB, 4);
  n.writeUInt16LE(f.gameweek, 8); n.writeInt16LE(f.pointsA, 10); n.writeInt16LE(f.pointsB, 12);
  return Buffer.concat([Buffer.from("PNK2"), f.contest.toBuffer(), f.managerA.toBuffer(), f.managerB.toBuffer(), n.subarray(0, 8), n.subarray(8), f.dataHash]);
}

export interface OnChainContest {
  managerA: PublicKey; managerB: PublicKey; oracle: PublicKey;
  entryA: number; entryB: number; gameweek: number; stake: bigint; state: number;
}
/// Decode a Contest account: 8 disc || manager_a || manager_b || oracle || entry_a u32 || entry_b u32 || gw u16 || stake u64 || state u8 || bump u8.
export function decodeContest(d: Buffer): OnChainContest {
  return {
    managerA: new PublicKey(d.subarray(8, 40)), managerB: new PublicKey(d.subarray(40, 72)), oracle: new PublicKey(d.subarray(72, 104)),
    entryA: d.readUInt32LE(104), entryB: d.readUInt32LE(108), gameweek: d.readUInt16LE(112), stake: d.readBigUInt64LE(114), state: d[122],
  };
}

/// Ownership binding message: "PNKB" || wallet || entry_id u32 || expiry i64 (LE).
/// The oracle signs this only after verifying off-chain that the wallet owner
/// controls the FPL entry (see docs/FPL_ENTRY_PROOF_DESIGN.md).
export function bindingMessage(wallet: PublicKey, entryId: number, expiryUnix: number): Buffer {
  const n = Buffer.alloc(12);
  n.writeUInt32LE(entryId, 0);
  n.writeBigInt64LE(BigInt(expiryUnix), 4);
  return Buffer.concat([Buffer.from("PNKB"), wallet.toBuffer(), n]);
}
