// Weekly run: ingest -> debate -> print the decision set + attestation hash.
// Usage: npx tsx src/conductor/run.ts
// D8-11 wires the attestation writer to post the hash to Solana.

import { ingest } from "../fpl/ingest.js";
import { runDebate } from "./debate.js";

const state = await ingest();
const debate = runDebate(state);

console.log(`GW${debate.gameweek} debate - ${debate.transcript.length} positions filed\n`);
for (const d of debate.decisions) {
  console.log(`[${d.kind.toUpperCase()}] ${d.winner.summary} (score ${d.winner.score.toFixed(0)}, ${d.winner.agentId})`);
  for (const alt of d.dissent) {
    console.log(`  dissent: ${alt.summary} (score ${alt.score.toFixed(0)}, ${alt.agentId})`);
  }
}
console.log(`\nattestation hash: ${debate.attestationHash}`);
