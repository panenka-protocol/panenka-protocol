import type { IngestedState } from "../fpl/models.js";

export interface Recommendation {
  agentId: string;
  kind: "captain" | "transfer" | "chip" | "xi";
  summary: string; // human-readable call
  rationale: string; // why - this text gets hashed into the on-chain attestation
  score: number; // 0-100 confidence
  payload: Record<string, unknown>; // structured detail (player ids, etc.)
}

export interface Specialist {
  id: string;
  name: string;
  analyze(state: IngestedState): Recommendation[];
}
