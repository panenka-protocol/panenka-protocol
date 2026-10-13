// Official FPL gameweek points for an entry. Missing or malformed upstream
// data must fail closed: zero is a valid score, not a safe fallback for errors.

const BASE = "https://fantasy.premierleague.com/api";

export async function entryGameweekPoints(entryId: number, gameweek: number): Promise<number> {
  return (await entryGameweekData(entryId, gameweek)).points;
}

/** Points plus the raw FPL entry_history used, for hashing into the signed message. */
export async function entryGameweekData(entryId: number, gameweek: number): Promise<{ points: number; raw: unknown }> {
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
  if ((points as number) < -32768 || (points as number) > 32767) throw new Error("points out of i16 range");
  return { points: points as number, raw: (data as { entry_history: unknown }).entry_history }; // official GW points (auto-subs and transfer hits included)
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

/** Stricter than gameweekFinished: FPL points can still change (bonus points, corrections) until data_checked. */
export async function gameweekDataChecked(gameweek: number): Promise<boolean> {
  const res = await fetch(`${BASE}/bootstrap-static/`, { headers: { "User-Agent": "panenka-oracle/0.1 (hackathon build)" } });
  if (!res.ok) throw new Error(`FPL bootstrap-static -> ${res.status}`);
  const events = ((await res.json()) as { events?: unknown }).events;
  const gw = Array.isArray(events) ? events.find((e) => e?.id === gameweek) : undefined;
  if (!gw || typeof gw.finished !== "boolean" || typeof gw.data_checked !== "boolean") throw new Error(`FPL GW${gameweek} missing finished/data_checked flags`);
  return gw.finished && gw.data_checked;
}
