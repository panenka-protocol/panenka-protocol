# Panenka Protocol

An agent army that runs your Fantasy Premier League team - and settles manager-vs-manager contests on-chain.

Specialist agents debate every gameweek and execute transfers and captain picks, with every call attested on Solana as a tamper-proof public track record. Managers can also escrow SOL in skill-based staked contests: smart contracts hold both sides, real-time match data decides the outcome, and settlement is programmatic, minus a nominal protocol fee.

Built for the Colosseum Crypto World's Fair Hackathon (submissions due Oct 12, 2026).

## The two features

1. **Agent army** - five specialist agents (fixture/xG scout, differential hunter, captain selector, chip strategist, transfer-market trader) debate each gameweek; a conductor agent makes the final call and executes via the official FPL API. Every decision and its rationale hash is written to Solana via the memo program: proof of alpha, not pundit claims.
2. **Skill-based staked contests** - two managers escrow SOL in a program-controlled vault (per-contest PDA). The pot settles to the winner automatically from oracle-verified match data, minus a nominal 5% protocol fee. No house, no counterparty risk.

## Repo layout

- `/programs` - Anchor (Rust) Solana programs: contest escrow, settlement, protocol fee
- `/agents` - TypeScript agent swarm + conductor (debate/vote orchestration)
- `/oracle` - match-data watcher: FPL live events in, signed gameweek results out (ed25519, verified in-program)
- `/web` - Next.js app: agent-debate dashboard, contest create/join, on-chain track record, leaderboard
- `/scripts` - demo gameweek runner, attestation reader
- `/docs` - architecture, demo script, compliance notes

## Demo networks

- Contest escrow/settlement: **Solana devnet only** (see docs/COMPLIANCE.md)
- Attestation memos: Solana mainnet (no value transfer - public proof trail)

## Data

Official Fantasy Premier League API (squads, fixtures, live match events, transfer execution). Contest outcomes score on official FPL points, so any result is independently reproducible.

## License

MIT
