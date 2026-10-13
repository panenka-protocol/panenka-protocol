// Local-only tests for panenka-contest v2 (signed points + data hash + entry ids).
//   PANENKA_RPC=http://localhost:8899 npx tsx src/negative-tests.ts
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, Ed25519Program, sendAndConfirmTransaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { createContestIx, joinContestIx, cancelContestIx, settleIx, contestPda, oracleMessage, bindingMessage, DEVNET_TREASURY } from "./client.js";

const c = new Connection(process.env.PANENKA_RPC ?? "http://localhost:8899", "confirmed");
let pass = 0, fail = 0;
const fund = async (k: Keypair, sol = 2) => { await c.confirmTransaction(await c.requestAirdrop(k.publicKey, sol * LAMPORTS_PER_SOL), "confirmed"); };
async function expectFail(name: string, p: Promise<unknown>, needle?: string) {
  try { await p; console.log("FAIL (succeeded):", name); fail++; }
  catch (e: any) {
    const m = String(e?.message ?? e) + JSON.stringify(e?.logs ?? e?.transactionLogs ?? "");
    if (needle && !m.includes(needle)) { console.log("FAIL (wrong error):", name, m.slice(0, 300)); fail++; } else { console.log("ok:", name); pass++; }
  }
}
async function expectOk(name: string, p: Promise<unknown>) { try { await p; console.log("ok:", name); pass++; } catch (e: any) { console.log("FAIL:", name, String(e?.message).slice(0, 300)); fail++; } }
const send = (ixs: any[], s: Keypair[]) => sendAndConfirmTransaction(c, new Transaction().add(...ixs), s);
const bal = (k: PublicKey) => c.getBalance(k);
const FUT = Math.floor(Date.now() / 1000) + 3600;
const bind = (k: Keypair, w: PublicKey, entry: number, exp = FUT) => sig(k, bindingMessage(w, entry, exp));
const cx = (a: Keypair, gw: number, stake: bigint, orc: PublicKey, entry: number, signer: Keypair, bEntry = entry, exp = FUT) =>
  [bind(signer, a.publicKey, bEntry, exp), createContestIx(a.publicKey, gw, stake, orc, entry, exp)];
const jx = (signer: Keypair, b: PublicKey, a: PublicKey, gw: number, entry: number, bEntry = entry, exp = FUT) =>
  [bind(signer, b, bEntry, exp), joinContestIx(b, a, gw, entry, exp)];
const H = createHash("sha256").update("fpl-live-gw6-snapshot").digest();

async function mk(gw: number, stake = 0.1) {
  const [a, b, oracle, payer] = [Keypair.generate(), Keypair.generate(), Keypair.generate(), Keypair.generate()];
  await Promise.all([a, b, oracle, payer].map((k) => fund(k)));
  await send(cx(a, gw, BigInt(stake * LAMPORTS_PER_SOL), oracle.publicKey, 111, oracle), [a]);
  return { a, b, oracle, payer, gw, contest: contestPda(a.publicKey, gw)[0] };
}
const join = (x: any, entry = 222) => send(jx(x.oracle, x.b.publicKey, x.a.publicKey, x.gw, entry), [x.b]);
const fields = (x: any, pa: number, pb: number, over: any = {}) => ({ contest: x.contest, managerA: x.a.publicKey, managerB: x.b.publicKey, entryA: 111, entryB: 222, gameweek: x.gw, pointsA: pa, pointsB: pb, dataHash: H, ...over });
const sig = (k: Keypair, msg: Buffer) => Ed25519Program.createInstructionWithPublicKey({ publicKey: k.publicKey.toBuffer(), message: msg, signature: Buffer.from(nacl.sign.detached(new Uint8Array(msg), k.secretKey)) });
// signed = what the oracle signed; sent = what the caller passes to settle
const settle = (x: any, signed: any, sentPa: number, sentPb: number, signer = x.oracle, sentHash = H, treasury = DEVNET_TREASURY) =>
  send([sig(signer, oracleMessage(signed)), settleIx(x.a.publicKey, x.b.publicKey, x.gw, sentPa, sentPb, sentHash, treasury)], [x.payer]);

let x = await mk(1); await join(x);
await expectFail("forged: non-oracle signer", settle(x, fields(x, 72, 58), 72, 58, Keypair.generate()), "WrongOracle");
await expectFail("tampered points: oracle signed 58-72, caller sends 72-58", settle(x, fields(x, 58, 72), 72, 58), "OracleMessageMismatch");
await expectFail("tampered data hash", settle(x, fields(x, 72, 58), 72, 58, x.oracle, Buffer.alloc(32, 1)), "OracleMessageMismatch");
await expectFail("signed wrong entry id", settle(x, fields(x, 72, 58, { entryB: 999 }), 72, 58), "OracleMessageMismatch");
await expectFail("signed wrong gameweek", settle(x, fields(x, 72, 58, { gameweek: 9 }), 72, 58), "OracleMessageMismatch");
const y = await mk(2); await join(y);
await expectFail("replay: sig from contest 2 on contest 1", send([sig(y.oracle, oracleMessage(fields(y, 72, 58))), settleIx(x.a.publicKey, x.b.publicKey, 1, 72, 58, H, DEVNET_TREASURY)], [x.payer]));
await expectFail("substituted treasury", settle(x, fields(x, 72, 58), 72, 58, x.oracle, H, Keypair.generate().publicKey), "WrongTreasury");
const z = await mk(3);
await expectFail("settle while Open", settle(z, fields(z, 72, 58), 72, 58));
await expectFail("cancel by non-manager", send([cancelContestIx(z.a.publicKey, 3)], [z.b]));
await expectFail("self join (same entry id)", send(jx(z.oracle, z.b.publicKey, z.a.publicKey, 3, 111), [z.b]), "SameManager");
await expectFail("cancel locked", send([cancelContestIx(x.a.publicKey, 1)], [x.a]), "NotOpen");
await join(z);
await expectFail("second join", send(jx(z.oracle, x.payer.publicKey, z.a.publicKey, 3, 5), [x.payer]));
const w = await mk(4); const b0 = await bal(w.a.publicKey);
await expectOk("cancel open", send([cancelContestIx(w.a.publicKey, 4)], [w.a]));
console.log("  refund delta:", (await bal(w.a.publicKey)) - b0);
// valid: A wins
const t0 = await bal(DEVNET_TREASURY), a0 = await bal(x.a.publicKey), b1 = await bal(x.b.publicKey);
await expectOk("valid settle A wins 72-58", settle(x, fields(x, 72, 58), 72, 58));
console.log("  fee:", (await bal(DEVNET_TREASURY)) - t0, "(expect 10000000); A delta:", (await bal(x.a.publicKey)) - a0, "B delta:", (await bal(x.b.publicKey)) - b1);
await expectFail("double settle", settle(x, fields(x, 72, 58), 72, 58));
// B wins
const v = await mk(5); await join(v); const vb = await bal(v.b.publicKey);
await expectOk("valid settle B wins 40-60", settle(v, fields(v, 40, 60), 40, 60));
console.log("  B delta (expect 190000000):", (await bal(v.b.publicKey)) - vb);
// tie refunds both, no fee
const u = await mk(6); await join(u); const ta = await bal(u.a.publicKey), tb = await bal(u.b.publicKey), tt = await bal(DEVNET_TREASURY);
await expectOk("tie 50-50 refunds", settle(u, fields(u, 50, 50), 50, 50));
console.log("  tie deltas A,B,fee:", (await bal(u.a.publicKey)) - ta, (await bal(u.b.publicKey)) - tb, (await bal(DEVNET_TREASURY)) - tt);
const nn = await mk(10); await join(nn); const nb = await bal(nn.a.publicKey);
await expectOk("negative points: -2 beats -5", settle(nn, fields(nn, -2, -5), -2, -5));
console.log("  A delta (expect >=190000000):", (await bal(nn.a.publicKey)) - nb);
const q = Keypair.generate(); await fund(q);
await expectFail("zero stake", send(cx(q, 7, 0n, q.publicKey, 1, q), [q]), "ZeroStake");
await expectFail("u64::MAX stake", send(cx(q, 8, 2n ** 64n - 1n, q.publicKey, 1, q), [q]));
await expectFail("default oracle", send(cx(q, 9, 1000n, PublicKey.default, 1, q), [q]));
// ownership binding negatives
const o2 = Keypair.generate(), m1 = Keypair.generate(), m2 = Keypair.generate(); await fund(m1); await fund(m2);
const gwB = 20;
await expectFail("binding: signed by non-oracle", send(cx(m1, gwB, 1000000n, o2.publicKey, 111, m2), [m1]), "WrongOracle");
await expectFail("binding: for a different entry id", send(cx(m1, gwB, 1000000n, o2.publicKey, 111, o2, 222), [m1]), "BindingMismatch");
await expectFail("binding: for a different wallet", send([bind(o2, m2.publicKey, 111), createContestIx(m1.publicKey, gwB, 1000000n, o2.publicKey, 111, FUT)], [m1]), "BindingMismatch");
await expectFail("binding: expired", send(cx(m1, gwB, 1000000n, o2.publicKey, 111, o2, 111, 1000), [m1]), "BindingExpired");
await expectFail("binding: missing (no ed25519 ix before create)", send([createContestIx(m1.publicKey, gwB, 1000000n, o2.publicKey, 111, FUT)], [m1]), "MissingBinding");
await expectFail("binding: join with binding for other entry", (async () => { await send(cx(m1, gwB, 1000000n, o2.publicKey, 111, o2), [m1]); await send(jx(o2, m2.publicKey, m1.publicKey, gwB, 222, 333), [m2]); })(), "BindingMismatch");
await expectOk("binding: valid join after failed attempt", send(jx(o2, m2.publicKey, m1.publicKey, gwB, 222), [m2]));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
