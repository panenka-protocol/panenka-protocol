# Build and test (verified locally Oct 13, 2026; 2 GB RAM Linux workspace)

Everything below runs offline of any real network except the toolchain downloads. Nothing here deploys or spends devnet SOL.

## Toolchain
- Rust via rustup (stable 1.99 worked for `cargo check`).
- Solana/Agave CLI 1.18.26 (provides `cargo build-sbf`, `solana-test-validator`):
  `https://github.com/anza-xyz/agave/releases/download/v1.18.26/solana-release-x86_64-unknown-linux-gnu.tar.bz2`
  then add `solana-release/bin` to PATH. Its bundled Rust is 1.75.
- Node 20+ with `npm ci` in `oracle/` and `agents/`.

## Program
Required `programs/panenka-contest/Cargo.toml` changes (not in the public repo yet; the repo head does not compile without the first one):
- `solana-program = "=1.18.26"` (the `pubkey!` macro needs it as a direct dependency)
- `rust-version = "1.75"`
Cargo.lock must be version 3 and pin crates that need newer Rust: `cargo update blake3 --precise 1.5.5`, `indexmap@2.14.2 --precise 2.6.0`, `borsh@1.8.1 --precise 1.5.1`, `proc-macro-crate@3.5.0 --precise 3.1.0`, `borsh-derive@1.5.7 --precise 1.5.1`; then `sed -i 's/^version = 4$/version = 3/' Cargo.lock`. A working lockfile is saved alongside.
Build: `cd programs/panenka-contest && cargo build-sbf` -> `programs/target/deploy/panenka_contest.so` (about 279 KB).

## Local validator tests
Load the program at its declared id:
`solana-test-validator --reset --limit-ledger-size 10000 --bpf-program Bv3J2KL8Kp2twqF86d8j77DKUX5NTF4ns4kFftenPU85 programs/target/deploy/panenka_contest.so`
- Full happy path with synthetic replay: `cd oracle && PANENKA_RPC=http://localhost:8899 npx tsx src/devnet-e2e.ts` (ignore the "devnet" in printed explorer links; it is local).
- Negative suite: `PANENKA_RPC=http://localhost:8899 npx tsx src/negative-tests.ts`. On a 2 GB machine the validator runs out of memory partway; restart it between sections.
- Oracle TypeScript: `npx tsc --noEmit -p tsconfig.json`; scoring tests `npx tsx --test src/scoring.test.ts`.

## Results (v2 program with ownership binding)
- e2e: create/join with oracle-signed bindings, substituted treasury rejected, settle with signed points + data hash: pass.
- Negative suite: forged signer, tampered points/hash/entry/gameweek, cross-contest replay, wrong treasury, cancel and join misuse, double settle, zero stake, u64::MAX stake, zero oracle, and 6 binding failures (non-oracle, wrong entry, wrong wallet, expired, missing, mismatched join): all rejected. Winner A, winner B, negative points, tie refund, cancel refund payouts correct.
- Not covered: audit, fuzzing, concurrency, real devnet or mainnet behavior, the FPL challenge-code oracle endpoint (not built).
