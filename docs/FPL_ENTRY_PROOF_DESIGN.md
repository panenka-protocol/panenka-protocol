# FPL entry ownership proof (design draft, not built)

Problem: the contest stores a wallet and an FPL entry id per manager. Nothing proves the wallet owner controls that FPL team, so someone could join as another person's entry (or an entry they do not own) and the oracle would sign that entry's points.

## Direction: challenge code in the FPL team name

Verified today (Oct 13): `GET https://fantasy.premierleague.com/api/entry/<id>/` is public and returns the team `name` and manager names, so the oracle can read it without credentials.

Flow:
1. Before `join_contest` / `create_contest`, the web app asks the user for their FPL entry id and the oracle service returns a challenge: `PNK-` + first 8 chars of base32(HMAC(oracle_secret, wallet || entry_id || nonce)), with an expiry (say 30 minutes).
2. The user temporarily adds the code to their FPL team name (FPL lets managers rename teams, subject to its own limits).
3. The oracle fetches the entry, checks the name contains the code, and signs a binding message `"PNKB" || wallet || entry_id || expiry` with the oracle key.
4. The program takes the binding signature (second ed25519 instruction) in create/join and stores entry_id only if it verifies for that wallet. Settlement already signs the entry ids, so a mismatch fails.
5. User restores the team name.

Why this works: only the entry owner can rename the team, and the code is bound to the wallet, so it cannot be reused for another wallet.

## Gaps and risks
- Trust: the oracle is the only verifier. A compromised oracle key can bind anything. Same single-oracle limit as settlement.
- FPL rename limits and profanity filters may block the code; fallback is a code in a mini-league name or manual review.
- Reliance on an unofficial public API that FPL can change or rate-limit. Needs caching, backoff, and a manual override path. Check FPL terms of use before any live product.
- Replay: include expiry and a nonce stored by the oracle; one binding per (wallet, entry, contest).
- One person with two entries or two wallets (self-play) is not prevented. Sybil resistance is out of scope here.
- Privacy: wallet-to-FPL-identity link becomes public on-chain.

## Build order
1. Oracle endpoint to issue and verify challenges, sign binding messages (TypeScript, local).
2. Program: accept and verify the binding signature in create/join (extend the ed25519 instruction parsing to index 0 or 1, same self-contained checks).
3. Tests: wrong wallet, expired, reused nonce, wrong entry, forged signer.
Estimate: 1 to 2 days with tests.
