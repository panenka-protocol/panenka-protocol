# Vision

*Captured from founder notes (Raghu Chandra), Sept 24-25, 2026. This document is directional; it guides GTM and judging narratives. Build scope for the hackathon is unchanged.*

## The endgame

A decentralized version of Fantasy Premier League: the fantasy game itself, rebuilt as an open protocol - owned by its players, settled by code, verified on-chain.

## How it has to feel

- **Chess.com-grade UX.** Extremely seamless. No wallet jargon, no crypto friction in the loop. The protocol is plumbing; the user sees a game.
- **Chess.com-grade stickiness.** The reason people come back weekly is the same reason chess players come back: competition against real people, a rating that means something, and a history that is yours.

## The loop

- **Weekly PvP contests** - against your friends, or global matchmade players at your level.
- **ELO manager ratings** - win head-to-head, gain rating. A manager's FPL history seeds their starting rating, placement-match style, so veterans and newcomers land at fair levels from day one.
- Rating, record, and rivalry history live on-chain: portable, public, and impossible to fake.

## What the hackathon build actually is

The three primitives of that endgame, built and demoed end-to-end:

1. **The agent army** - AI managers that research, debate, and field a squad every gameweek. Today they run one team; at scale they are the always-on opposition that keeps matchmaking instant at any hour, at any rating.
2. **The contest protocol** - skill-based staked contests with programmatic settlement and a protocol fee. Head-to-head and small-group PvP, escrowed and paid out by code, not by a company. (Contest value stays devnet-only for the hackathon - see docs/COMPLIANCE.md.)
3. **The attestation spine** - every decision, lineup, and result hashed and anchored on Solana. This is what makes ELO ratings and contest outcomes trustless: the record cannot be rewritten.

## The hard problem we are naming now

Premier League player data is licensed IP. A decentralized FPL cannot simply republish official player data, fixtures, or stats - that is what the license is for. The endgame needs its own data rights (or its own sport). So the strategy is: **wedge first, licensing later.** The wedge - agent managers, contest protocol, attestation spine - runs on publicly available fantasy data within fair use for a demo, and proves demand, retention, and settlement before any licensing conversation is worth having.

## What this means for judging

Panenka Protocol is not "an AI that plays FPL for you." It is the first playable slice of the protocol that fantasy sports eventually run on - with the agent army as the acquisition wedge, staked PvP as the retention engine, and attestations as the trust layer that makes ratings and payouts credible without a central operator.
