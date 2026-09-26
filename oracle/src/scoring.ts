// Official FPL gameweek points for an entry. Missing or malformed upstream
// data must fail closed: zero is a valid score, not a safe fallback for errors.

const BASE = "https://fantasy.premierleague.com/api";

export async function entryGameweekPoints(entryId: number, gameweek: number): Promise<number> {
  if (!Number.isSafeInteger(entryId) || entryId <= 0 || !Number.isSafeInteger(gameweek) || gameweek <= 0) {
    throw new Error("entry ID and gameweek must be positive integers");
  }
  const res = await fetch(`${BASE}/entry/${entryId}/event/${gameweek}/picks/`, {
    headers: { "User-Agent": "panenka-oracle/0.1 (hackathon build)" },
  });
  if (!res.ok) throw new Error(`FPL entry ${entryId} GW${gameweek} -> ${res.status}`);
  const data: unknown = await res.json();
  const points = (data as { entry_history?: { points?: unknown } } | null)?.entry_history?.points;
  if (!Number.isSafeInteger(points)) {
    throw new Error(`FPL entry ${entryId} GW${gameweek} has missing or invalid points`);
  }
  return points as number; // official GW points (auto-subs and transfer hits included)
}

export async function gameweekFinished(gameweek: number): Promise<boolean> {
  if (!Number.isSafeInteger(gameweek) || gameweek <= 0) {
    throw new Error("gameweek must be a positive integer");
  }
  const res = await fetch(`${BASE}/bootstrap-static/`, {
    headers: { "User-Agent": "panenka-oracle/0.1 (hackathon build)" },
  });
  if (!res.ok) throw new Error(`FPL bootstrap-static -> ${res.status}`);
  const data: unknown = await res.json();
  const events = (data as { events?: unknown } | null)?.events;
  if (!Array.isArray(events)) throw new Error("FPL bootstrap-static has no events array");
  const gw = events.find((e) => e?.id === gameweek);
  if (!gw || typeof gw.finished !== "boolean") {
    throw new Error(`FPL GW${gameweek} is absent or has no finished flag`);
  }
  return gw.finished;
}
