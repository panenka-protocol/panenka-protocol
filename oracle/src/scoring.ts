// Scoring: official FPL gameweek points for an entry, from the public API.
// Deterministic - same gameweek, same entry, same number, forever.

const BASE = "https://fantasy.premierleague.com/api";

export async function entryGameweekPoints(entryId: number, gameweek: number): Promise<number> {
  const res = await fetch(`${BASE}/entry/${entryId}/event/${gameweek}/picks/`, {
    headers: { "User-Agent": "panenka-oracle/0.1 (hackathon build)" },
  });
  if (!res.ok) throw new Error(`FPL entry ${entryId} GW${gameweek} -> ${res.status}`);
  const data = await res.json();
  // entry_history.points = official GW points (incl. auto-subs, minus hits).
  return data.entry_history?.points ?? 0;
}

export async function gameweekFinished(gameweek: number): Promise<boolean> {
  const res = await fetch(`${BASE}/bootstrap-static/`, {
    headers: { "User-Agent": "panenka-oracle/0.1 (hackathon build)" },
  });
  const data = await res.json();
  const gw = data.events.find((e: any) => e.id === gameweek);
  return !!gw?.finished;
}
