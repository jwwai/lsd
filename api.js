/*
 * api.js
 * -----------------------------------------------------------------------
 * Thin wrapper around ESPN's public "site.api.espn.com" endpoints.
 * These are the same endpoints ESPN's own website/app use for scoreboards.
 * They are read-only, free, and require NO API key or signup.
 *
 * If ESPN ever changes/blocks these endpoints, swap BASE_URL and the
 * path builders below — everything else in the app consumes the
 * normalized shapes returned by normalizeEvent()/normalizeTeam(), so a
 * future alternate provider only needs to be adapted here.
 * -----------------------------------------------------------------------
 */

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// Curated set of leagues to pull. Add/remove entries to change coverage.
const LEAGUES = [
  { id: 'nfl',      sport: 'football',   league: 'nfl',                    name: 'NFL',              short: 'NFL'  },
  { id: 'nba',      sport: 'basketball', league: 'nba',                    name: 'NBA',              short: 'NBA'  },
  { id: 'mlb',      sport: 'baseball',   league: 'mlb',                    name: 'MLB',              short: 'MLB'  },
  { id: 'nhl',      sport: 'hockey',     league: 'nhl',                    name: 'NHL',              short: 'NHL'  },
  { id: 'eng.1',    sport: 'soccer',     league: 'eng.1',                  name: 'Premier League',   short: 'EPL'  },
  { id: 'uefa.champions', sport: 'soccer', league: 'uefa.champions',       name: 'Champions League', short: 'UCL'  },
  { id: 'esp.1',    sport: 'soccer',     league: 'esp.1',                  name: 'La Liga',          short: 'LALIGA' },
  { id: 'usa.1',    sport: 'soccer',     league: 'usa.1',                  name: 'MLS',              short: 'MLS'  },
  { id: 'mens-college-basketball', sport: 'basketball', league: 'mens-college-basketball', name: 'NCAA Basketball (M)', short: 'NCAAB' },
];

function leagueById(id) {
  return LEAGUES.find(l => l.id === id);
}

function scoreboardUrl(lg, dateStr) {
  let url = `${ESPN_BASE}/${lg.sport}/${lg.league}/scoreboard?limit=100`;
  if (dateStr) url += `&dates=${dateStr}`;
  return url;
}

function summaryUrl(lg, eventId) {
  return `${ESPN_BASE}/${lg.sport}/${lg.league}/summary?event=${eventId}`;
}

function teamsUrl(lg) {
  return `${ESPN_BASE}/${lg.sport}/${lg.league}/teams?limit=200`;
}

function teamScheduleUrl(lg, teamId, season) {
  let url = `${ESPN_BASE}/${lg.sport}/${lg.league}/teams/${teamId}/schedule`;
  if (season) url += `?season=${season}`;
  return url;
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
  return res.json();
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Normalize one ESPN scoreboard "event" into a shape the UI understands. */
function normalizeEvent(raw, lg) {
  const comp = raw.competitions && raw.competitions[0];
  const competitors = (comp && comp.competitors) || [];
  const home = competitors.find(c => c.homeAway === 'home') || competitors[0];
  const away = competitors.find(c => c.homeAway === 'away') || competitors[1];
  const status = raw.status || {};
  const state = status.type ? status.type.state : 'pre'; // 'pre' | 'in' | 'post'

  const mapTeam = (c) => c && {
    id: c.id,
    name: c.team ? (c.team.shortDisplayName || c.team.displayName) : 'TBD',
    fullName: c.team ? c.team.displayName : 'TBD',
    abbrev: c.team ? c.team.abbreviation : '',
    logo: c.team && c.team.logo,
    score: c.score,
    winner: !!c.winner,
    record: (c.records && c.records[0] && c.records[0].summary) || '',
  };

  return {
    id: raw.id,
    leagueId: lg.id,
    leagueName: lg.name,
    leagueShort: lg.short,
    name: raw.name || raw.shortName,
    date: raw.date,
    state,                                   // pre | in | post
    statusDetail: status.type ? status.type.shortDetail : '',
    statusName: status.type ? status.type.name : '',
    clock: status.displayClock,
    period: status.period,
    venue: comp && comp.venue && comp.venue.fullName,
    home: mapTeam(home),
    away: mapTeam(away),
  };
}

/** Fetch + normalize a scoreboard for one league on one date (optional). */
async function getLeagueScoreboard(leagueId, dateStr) {
  const lg = leagueById(leagueId);
  const data = await fetchJson(scoreboardUrl(lg, dateStr));
  const events = data.events || [];
  return events.map(e => normalizeEvent(e, lg));
}

/** Fetch a scoreboard across ALL configured leagues for a single date (or "today" if omitted). Failures in one league don't kill the rest. */
async function getAllLeaguesScoreboard(dateStr) {
  const results = await Promise.allSettled(
    LEAGUES.map(lg => fetchJson(scoreboardUrl(lg, dateStr)).then(data => (data.events || []).map(e => normalizeEvent(e, lg))))
  );
  let all = [];
  results.forEach(r => { if (r.status === 'fulfilled') all = all.concat(r.value); });
  return all;
}

/** Pull a window of dates (for History / Upcoming) across all leagues. dayOffsets e.g. [-1,-2,-3] or [1,2,3]. */
async function getAllLeaguesForDays(dayOffsets) {
  const today = new Date();
  const dateStrs = dayOffsets.map(off => {
    const d = new Date(today);
    d.setDate(d.getDate() + off);
    return fmtDate(d);
  });
  const batches = await Promise.all(dateStrs.map(ds => getAllLeaguesScoreboard(ds)));
  return batches.flat();
}

async function getEventSummary(leagueId, eventId) {
  const lg = leagueById(leagueId);
  return fetchJson(summaryUrl(lg, eventId));
}

async function getLeagueTeams(leagueId) {
  const lg = leagueById(leagueId);
  const data = await fetchJson(teamsUrl(lg));
  const list = (data.sports && data.sports[0] && data.sports[0].leagues && data.sports[0].leagues[0] && data.sports[0].leagues[0].teams) || [];
  return list.map(t => ({
    id: t.team.id,
    name: t.team.displayName,
    abbrev: t.team.abbreviation,
    logo: t.team.logos && t.team.logos[0] && t.team.logos[0].href,
    leagueId,
  }));
}

async function getTeamSchedule(leagueId, teamId) {
  const lg = leagueById(leagueId);
  const data = await fetchJson(teamScheduleUrl(lg, teamId));
  const events = data.events || [];
  return events.map(e => normalizeEvent(e, lg));
}
