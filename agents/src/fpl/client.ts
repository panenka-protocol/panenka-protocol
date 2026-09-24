// Thin client over the official Fantasy Premier League API.
// Public endpoints, no auth needed for bootstrap/fixtures/live data.

const BASE = "https://fantasy.premierleague.com/api";

export interface BootstrapStatic {
  elements: any[];
  teams: any[];
  events: any[];
  element_types: any[];
}

export class FplClient {
  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "User-Agent": "panenka-protocol/0.1 (hackathon build)" },
    });
    if (!res.ok) throw new Error(`FPL API ${path} -> ${res.status}`);
    return (await res.json()) as T;
  }

  bootstrapStatic(): Promise<BootstrapStatic> {
    return this.get("/bootstrap-static/");
  }

  fixtures(event?: number): Promise<any[]> {
    return this.get(event ? `/fixtures/?event=${event}` : "/fixtures/");
  }

  liveEvent(event: number): Promise<any> {
    return this.get(`/event/${event}/live/`);
  }

  entry(entryId: number): Promise<any> {
    return this.get(`/entry/${entryId}/`);
  }

  entryPicks(entryId: number, event: number): Promise<any> {
    return this.get(`/entry/${entryId}/event/${event}/picks/`);
  }
}
