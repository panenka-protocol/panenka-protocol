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
