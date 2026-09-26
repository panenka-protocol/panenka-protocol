import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { entryGameweekPoints, gameweekFinished } from "./scoring.js";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("official zero or negative points remain valid results", async () => {
  globalThis.fetch = async () => response({ entry_history: { points: 0 } });
  assert.equal(await entryGameweekPoints(10971178, 6), 0);
  globalThis.fetch = async () => response({ entry_history: { points: -2 } });
  assert.equal(await entryGameweekPoints(10971178, 6), -2);
});
test("missing or malformed points fail closed", async () => {
  for (const body of [{}, { entry_history: { points: "0" } }, { entry_history: { points: 1.5 } }]) {
    globalThis.fetch = async () => response(body);
    await assert.rejects(entryGameweekPoints(10971178, 6), /invalid points/);
  }
});
test("HTTP error fails closed", async () => {
  globalThis.fetch = async () => response({ error: true }, 503);
  await assert.rejects(entryGameweekPoints(10971178, 6), /503/);
  await assert.rejects(gameweekFinished(6), /503/);
});
test("gameweek status must exist and be boolean", async () => {
  globalThis.fetch = async () => response({ events: [{ id: 6, finished: false }] });
  assert.equal(await gameweekFinished(6), false);
  globalThis.fetch = async () => response({ events: [{ id: 6, finished: true }] });
  assert.equal(await gameweekFinished(6), true);
  globalThis.fetch = async () => response({ events: [] });
  await assert.rejects(gameweekFinished(6), /absent/);
});
