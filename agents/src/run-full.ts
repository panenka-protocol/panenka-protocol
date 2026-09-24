import { ingest } from "./fpl/ingest.js";
import { runDebate } from "./conductor/debate.js";
const debate = runDebate(await ingest());
console.log(JSON.stringify(debate, null, 1));
