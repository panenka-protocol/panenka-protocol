// Core FPL data models, normalized from the official FPL API.

export interface FplPlayer {
  id: number;
  webName: string;
  teamId: number;
  elementType: number; // 1=GKP 2=DEF 3=MID 4=FWD
  nowCost: number; // tenths of a million
  totalPoints: number;
  form: number;
  pointsPerGame: number;
  expectedGoals: number;
  expectedAssists: number;
  expectedGoalInvolvements: number;
  minutes: number;
  selectedByPercent: number;
  status: string; // a=available, d=doubtful, i=injured, s=suspended
  chanceOfPlayingNextRound: number | null;
}

export interface FplTeam {
  id: number;
  name: string;
  shortName: string;
  strengthAttackHome: number;
  strengthAttackAway: number;
  strengthDefenceHome: number;
  strengthDefenceAway: number;
}

export interface FplFixture {
  id: number;
  event: number | null; // gameweek
  teamH: number;
  teamA: number;
  teamHDifficulty: number;
  teamADifficulty: number;
  kickoffTime: string | null;
  finished: boolean;
  teamHScore: number | null;
  teamAScore: number | null;
}

export interface FplGameweek {
  id: number;
  name: string;
  deadlineTime: string;
  isCurrent: boolean;
  isNext: boolean;
  finished: boolean;
  averageScore: number | null;
  highestScore: number | null;
}

export interface IngestedState {
  fetchedAt: string;
  currentGameweek: number | null;
  players: FplPlayer[];
  teams: FplTeam[];
  fixtures: FplFixture[];
  gameweeks: FplGameweek[];
}
