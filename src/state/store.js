/** Application state. Plain object, no framework: pages read it, app.js mutates it. */
import { createSetupState } from '../pages/setup-validation.js';

export const state = {
  view: 'home',
  loading: true,
  storageError: null,
  matches: [],            // hydrated matches (same objects as `match` when active)
  match: null,            // the match currently open in Live / Scorecard
  setup: createSetupState(),
  scorecardMatchId: null,
  updateReady: false,
  authUser: null,
  cloudSyncStatus: 'idle'
};

export function upsertMatch(match) {
  const i = state.matches.findIndex((m) => m.matchId === match.matchId);
  if (i === -1) state.matches.push(match); else state.matches[i] = match;
}
export const activeMatches = () => state.matches.filter((m) => m.status === 'active').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
export const completedMatches = () => state.matches.filter((m) => m.status === 'completed').sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
