# Panenka Protocol

An agent army that runs a Fantasy Premier League team, plus an escrow contract for head-to-head manager contests on Solana devnet.

**Status: early prototype, not deployed.** The contest program compiles to a Solana program and passes local tests on a local test validator. It has not been deployed to devnet or mainnet, audited, or used with real players. No attestation has been written. Demo runs use synthetic scores. See "What is and is not verified" below.

## What it is

1. **Agent army** (`/agents`, TypeScript): five specialist agents (fixture/xG scout, differential hunter, captain selector, chip strategist, transfer trader) each give a scored recommendation for a gameweek. A conductor agent runs a debate and vote and issues the final decision set. Data comes from the official FPL API.
2. **Decision attestation** (`/agents/src/conductor/attest.ts`): hashes each decision and rationale for writing to Solana through the memo program. Written, not yet run against a live network.
3. **Contest program** (`/programs/panenka-contest`, Anchor/Rust): two managers escrow SOL in a per-contest account. The oracle signs both managers' wallets and FPL entry ids, the gameweek, both point totals and a data hash. The program derives the winner from the signed points; an exact tie refunds both stakes. Wallet-to-entry bindings are oracle-signed at create and join. 5% protocol fee to a fixed treasury. Devnet only.
4. **Oracle** (`/oracle`, TypeScript): reads FPL points, picks the winner, signs the result.
5. **Web** (`/web`): not built. Placeholder only.

## What is and is not verified

Verified locally (Oct 13, 2026, local test validator, throwaway keys; see docs/BUILD_AND_TEST.md):
- The Anchor program builds with `cargo build-sbf`.
- End-to-end create, join, settle with an oracle-signed result; payouts, 5% fee and tie refunds are correct.
- Rejected as expected: forged oracle signature, tampered points, data hash, entry id or gameweek, cross-contest signature replay, wrong treasury, double settle, cancel and join misuse, zero stake, overflow stake, and ownership-binding failures (wrong signer, wallet, entry, expired, missing).
- `agents` and `oracle` TypeScript packages build; oracle scoring tests pass.

Not verified or not built:
- Nothing is deployed. No devnet run. Devnet attestor and treasury addresses hold 0 SOL.
- No audit, fuzzing or formal review.
- The oracle is a single trusted key. It decides results and signs wallet-to-FPL-entry bindings.
- The oracle-side challenge check that a wallet owner controls an FPL entry is designed (docs/FPL_ENTRY_PROOF_DESIGN.md), not built. The demo signs bindings unconditionally.
- The signed data hash identifies the snapshot the oracle used; it does not prove the data is official.
- Oracle reads the unofficial public FPL API; its terms of use are unchecked.
- Web app is a placeholder. The e2e script uses synthetic points.

## Network and value

Contest escrow and settlement are devnet-only. No real-value stakes or payouts. This is not legal advice or a claim that any real-money version would be permitted anywhere.

## Layout

`/programs` contest program, `/agents` swarm and conductor, `/oracle` scoring and signing, `/scripts` helpers, `/docs` architecture, build and test, entry-ownership design, `/web` placeholder.

## License

MIT
