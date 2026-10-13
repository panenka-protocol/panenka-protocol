# Panenka Protocol - architecture

## Services

1. **Agent swarm** (`/agents`, TypeScript)
   Specialist agents: fixture/xG scout, differential hunter, captain selector, chip strategist, transfer-market trader. Each emits a scored recommendation + rationale per gameweek. A conductor agent runs the structured debate/vote and issues the final decision set, then executes via the official FPL API.

2. **Attestation writer** (`/agents/attest`)
   Hashes every decision + rationale and writes it to Solana via the memo program. Public, tamper-proof track record - the "proof of alpha" spine and leaderboard feed. Mainnet, no value transfer.

3. **Contest protocol** (`/programs`, Anchor/Rust)
   Per-contest PDA escrow. Instructions: create_contest(stake, gameweek), join_contest, settle. Settlement only on an oracle-signed result; pot to winner minus a 5% protocol fee to the protocol treasury account. Single-oracle ed25519 signature verified in-program for the hackathon; documented path to a decentralized oracle network. DEVNET ONLY - see docs/COMPLIANCE.md.

4. **Oracle service** (`/oracle`)
   Off-chain watcher ingesting FPL live match events. At gameweek close it computes the contest outcome (official FPL points - deterministic and independently reproducible) and signs the result.

5. **Web app** (`/web`, Next.js + Phantom)
   Link FPL team ID, agent-debate dashboard, on-chain track record page, create/join contest, live contest leaderboard.

## 18-day timeline (Sep 24 -> Oct 12, 2026)

- D1-3: repo + FPL API ingestion + data models; Anchor escrow skeleton with local tests
- D4-7: swarm v1 (single-agent pipeline -> specialists + conductor); attestation writer on devnet
- D8-11: contest program complete (escrow, oracle verify, settle, fee); devnet integration tests
- D12-14: web app: wallet connect, agent dashboard, contest create/join, leaderboard
- D15-16: end-to-end run on a live/replayed gameweek; record videos (2-3 min presentation, <=3 min demo)
- D17-18: buffer, submission portal (final submission opens Oct 6, 4:00 AM PDT), polish

A real PL gameweek runs inside the window; fallback is a replayed historical gameweek with identical data.

## Demo script (product video)

1. Dashboard: five agents debating the gameweek - real disagreements, conductor's call
2. Decision executes on a real FPL team; pick + rationale hash lands on Solana (explorer tx)
3. Two wallets escrow SOL (devnet) into a contest PDA (explorer tx)
4. Gameweek closes: oracle signs the result, settlement pays the winner minus fee (both txs)
5. Close on the public track-record page

## North star

On-chain Dream XI. The agent army and staked contests are the wedge.

## Contest settlement (devnet)

Program: `panenka-contest` (Anchor), devnet id `Bv3J2KL8Kp2twqF86d8j77DKUX5NTF4ns4kFftenPU85`.
Deploy keypair is held by the build agent (vaulted), never committed.

Flow (see `oracle/src/devnet-e2e.ts`; v2):

1. Before create/join, the oracle signs an ownership binding
   (`"PNKB" || wallet || entry_id || expiry`) after checking off-chain that the
   wallet owner controls the FPL entry (design in docs/FPL_ENTRY_PROOF_DESIGN.md;
   the check itself is not built yet). Manager A calls `create_contest(gameweek,
   stake, oracle, entry_id, binding_expiry)` with the binding signature in the
   preceding instruction. The oracle pubkey is pinned at creation and the fee goes
   to the fixed devnet treasury `8wTiPnMnZUwUxSSy8GZUABUPfLMnTkoSVhAg2htXcB6c`.
2. Manager B calls `join_contest(entry_id, binding_expiry)`, also with a binding.
3. After the gameweek is `finished` and `data_checked`, the oracle service
   (`oracle/src/watcher.ts`) reads FPL points for both entries and signs
   `"PNK2" || contest || manager_a || manager_b || entry_a || entry_b ||
   gameweek || points_a (i16) || points_b (i16) || data_hash`.
4. `settle(points_a, points_b, data_hash)` verifies that signature, derives the
   winner from the signed points, pays the pot minus 5% to the fixed treasury,
   and closes the account (rent to manager A). An exact tie refunds both stakes
   with no fee.

`cancel_contest` refunds manager A while the contest is un-joined.

Security notes: the oracle is a single trusted key; it decides results and
bindings. A substituted treasury, forged or replayed signatures, tampered
points or entry ids, and double settlement are rejected (see
docs/BUILD_AND_TEST.md for what was tested; no audit). The ed25519 check
requires exactly one self-contained signature. The data hash identifies the
snapshot the oracle used; it does not prove the data is official. A
value-bearing design needs counsel review and a governed multisig rather than
the fixed demo treasury key.

Build: see docs/BUILD_AND_TEST.md.

## N-player generalization (roadmap, not current build)

The deployed contest is 1v1 and devnet-only per docs/COMPLIANCE.md. The
endgame is N-player weekly leagues (see docs/VISION.md): a league account
holds N escrows plus a payout curve, and settlement becomes a ranked
distribution across the top finishers instead of a single winner transfer.
Design consequences to preserve now:

- the oracle signs per-entry scores (entry || gameweek || points), not just
  pairwise winners, so any pool size can settle from the same attestations;
- the contest PDA pattern extends to a league PDA with per-manager escrow
  accounts;
- the payout curve is league configuration (e.g. top 20 of 100), committed at
  creation so nobody can move the goalposts after scores attest.

None of this relaxes the compliance gate: value settlement stays devnet-only
for the hackathon build, whatever the pool size.
