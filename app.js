/*
 * app.js — wires up the UI: tabs (Live/Upcoming/History), league filter
 * chips, the game grid, the game detail overlay, and the favorite-team
 * picker. All data comes from api.js (ESPN public endpoints, no key).
 */

const state = {
  tab: 'live',
  activeLeagues: new Set(LEAGUES.map(l => l.id)), // all on by default
  events: [],
  loading: false,
};

let refreshTimer = null;

// ---------------------------------------------------------------- chips
function renderLeagueChips() {
  const wrap = document.getElementById('leagueFilter');
  wrap.innerHTML = '';
  LEAGUES.forEach(lg => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (state.activeLeagues.has(lg.id) ? ' active' : '');
    chip.textContent = lg.short;
    chip.setAttribute('aria-pressed', state.activeLeagues.has(lg.id));
    chip.addEventListener('click', () => {
      if (state.activeLeagues.has(lg.id)) state.activeLeagues.delete(lg.id);
      else state.activeLeagues.add(lg.id);
      renderLeagueChips();
      renderGrid();
    });
    wrap.appendChild(chip);
  });
}

// ---------------------------------------------------------------- tabs
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  state.tab = btn.dataset.tab;
  loadTab();
});

async function loadTab() {
  clearInterval(refreshTimer);
  const statusLine = document.getElementById('statusLine');
  const grid = document.getElementById('gameGrid');
  state.loading = true;
  statusLine.textContent = 'Loading…';
  grid.innerHTML = '';

  try {
    if (state.tab === 'live') {
      state.events = await getAllLeaguesScoreboard(); // today, all leagues
      // keep only actually-live, but also show today's pre/post as context is nice — spec says Live tab = live games
      state.events = state.events.filter(e => e.state === 'in');
      refreshTimer = setInterval(async () => {
        try {
          const fresh = await getAllLeaguesScoreboard();
          state.events = fresh.filter(e => e.state === 'in');
          renderGrid();
          renderFavoriteBar();
        } catch (_) { /* silent retry next tick */ }
      }, 20000);
    } else if (state.tab === 'upcoming') {
      state.events = await getAllLeaguesForDays([0, 1, 2, 3, 4, 5, 6]);
      state.events = state.events.filter(e => e.state === 'pre');
      state.events.sort((a, b) => new Date(a.date) - new Date(b.date));
    } else if (state.tab === 'history') {
      state.events = await getAllLeaguesForDays([0, -1, -2, -3, -4, -5, -6]);
      state.events = state.events.filter(e => e.state === 'post');
      state.events.sort((a, b) => new Date(b.date) - new Date(a.date)); // latest first
    }
    statusLine.textContent = `Last updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    statusLine.textContent = 'Could not load data — check your connection and try again.';
  }
  state.loading = false;
  renderGrid();
}

// ---------------------------------------------------------------- grid
function renderGrid() {
  const grid = document.getElementById('gameGrid');
  const fav = getFavoriteTeam();
  const filtered = state.events.filter(e => state.activeLeagues.has(e.leagueId));

  if (!filtered.length) {
    grid.innerHTML = `<div class="empty-state">${emptyMessage()}</div>`;
    return;
  }

  grid.innerHTML = '';
  filtered.forEach(ev => grid.appendChild(buildGameCard(ev, fav)));
}

function emptyMessage() {
  if (state.tab === 'live') return 'No games are live right now. Check Upcoming for what\'s next.';
  if (state.tab === 'upcoming') return 'No upcoming games found for the selected leagues.';
  return 'No recent results found for the selected leagues.';
}

function buildGameCard(ev, fav) {
  const card = document.createElement('div');
  card.className = 'game-card' + (isFavGame(ev, fav) ? ' is-favorite' : '');
  card.tabIndex = 0;
  card.addEventListener('click', () => openGameDetail(ev.leagueId, ev.id));
  card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openGameDetail(ev.leagueId, ev.id); });

  const top = document.createElement('div');
  top.className = 'card-top';
  const pill = ev.state === 'in' ? 'live' : (ev.state === 'pre' ? 'pre' : 'post');
  const pillText = ev.state === 'in' ? 'LIVE' : (ev.state === 'pre' ? 'UPCOMING' : 'FINAL');
  top.innerHTML = `<span>${ev.leagueShort}</span><span class="status-pill ${pill}">${pillText}</span>`;
  card.appendChild(top);

  const matchup = document.createElement('div');
  matchup.className = 'matchup';
  matchup.appendChild(teamRow(ev.away, ev.state));
  matchup.appendChild(teamRow(ev.home, ev.state));
  card.appendChild(matchup);

  const bottom = document.createElement('div');
  bottom.className = 'card-bottom';
  const left = ev.state === 'in' ? (ev.statusDetail || 'In progress') : formatWhen(ev);
  bottom.innerHTML = `<span>${left}</span><span>${ev.venue ? escapeHtml(ev.venue) : ''}</span>`;
  card.appendChild(bottom);

  return card;
}

function teamRow(team, state_) {
  const row = document.createElement('div');
  row.className = 'team-row';
  const idWrap = document.createElement('div');
  idWrap.className = 'team-id';
  const logo = document.createElement('img');
  logo.className = 'team-logo';
  logo.src = (team && team.logo) || '';
  logo.alt = '';
  logo.onerror = () => { logo.style.visibility = 'hidden'; };
  const name = document.createElement('span');
  name.className = 'team-name' + (state_ === 'post' && team && team.winner ? ' winner' : '');
  name.textContent = team ? team.name : 'TBD';
  idWrap.appendChild(logo);
  idWrap.appendChild(name);
  row.appendChild(idWrap);

  const score = document.createElement('span');
  score.className = 'team-score';
  score.textContent = (team && team.score != null && state_ !== 'pre') ? team.score : (state_ === 'pre' ? '' : '0');
  row.appendChild(score);
  return row;
}

function formatWhen(ev) {
  const d = new Date(ev.date);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function isFavGame(ev, fav) {
  if (!fav) return false;
  return (ev.home && ev.home.id === fav.id) || (ev.away && ev.away.id === fav.id);
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ---------------------------------------------------------------- detail overlay
async function openGameDetail(leagueId, eventId) {
  const overlay = document.getElementById('detailOverlay');
  const content = document.getElementById('detailContent');
  overlay.classList.remove('hidden');
  content.innerHTML = '<div class="loader">Loading game…</div>';

  try {
    const data = await getEventSummary(leagueId, eventId);
    content.innerHTML = renderDetailHtml(data, leagueId);
  } catch (e) {
    content.innerHTML = '<div class="loader">Could not load game details.</div>';
  }
}

function renderDetailHtml(data, leagueId) {
  const lg = leagueById(leagueId);
  const header = data.header || {};
  const comp = header.competitions && header.competitions[0];
  const competitors = (comp && comp.competitors) || [];
  const home = competitors.find(c => c.homeAway === 'home');
  const away = competitors.find(c => c.homeAway === 'away');
  const statusType = comp && comp.status && comp.status.type;
  const state_ = statusType ? statusType.state : 'pre';
  const statusText = statusType ? statusType.detail : '';

  const teamBlock = (c) => {
    if (!c) return '';
    const t = c.team || {};
    const rec = (c.record && c.record[0] && c.record[0].summary) || '';
    return `
      <div class="detail-team">
        <div class="detail-team-id">
          <img class="detail-logo" src="${t.logo || ''}" alt="" onerror="this.style.visibility='hidden'">
          <div>
            <div class="detail-team-name">${escapeHtml(t.displayName || 'TBD')}</div>
            <div class="detail-team-record">${escapeHtml(rec)}</div>
          </div>
        </div>
        <div class="detail-score">${state_ !== 'pre' ? (c.score || '0') : ''}</div>
      </div>`;
  };

  let linescoreHtml = '';
  const lineComp = competitors.filter(c => c.linescores && c.linescores.length);
  if (lineComp.length === 2 && state_ !== 'pre') {
    const periods = lineComp[0].linescores.length;
    let headCells = '<th>Team</th>';
    for (let i = 1; i <= periods; i++) headCells += `<th>${i}</th>`;
    headCells += '<th>T</th>';
    const rows = lineComp.map(c => {
      const t = c.team || {};
      let cells = `<td>${escapeHtml(t.abbreviation || t.shortDisplayName || '')}</td>`;
      c.linescores.forEach(ls => { cells += `<td>${ls.displayValue ?? '-'}</td>`; });
      cells += `<td>${c.score ?? '-'}</td>`;
      return `<tr>${cells}</tr>`;
    }).join('');
    linescoreHtml = `<table class="linescore-table"><thead><tr>${headCells}</tr></thead><tbody>${rows}</tbody></table>`;
  }

  const venue = comp && comp.venue && comp.venue.fullName;
  const dateStr = header.competitions && header.competitions[0] && header.competitions[0].date
    ? new Date(header.competitions[0].date).toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '';

  let noteHtml = '';
  if (data.article && data.article.headline) {
    noteHtml = `<div class="detail-note">${escapeHtml(data.article.headline)}</div>`;
  }

  return `
    <div class="detail-league">${escapeHtml(lg ? lg.name : '')}</div>
    <div class="detail-status ${state_}">${state_ === 'in' ? '● LIVE — ' : ''}${escapeHtml(statusText || '')}</div>
    <div class="detail-matchup">
      ${teamBlock(away)}
      ${teamBlock(home)}
    </div>
    ${linescoreHtml}
    <div class="detail-meta">
      ${dateStr ? `<div>${escapeHtml(dateStr)}</div>` : ''}
      ${venue ? `<div class="detail-venue">${escapeHtml(venue)}</div>` : ''}
    </div>
    ${noteHtml}
  `;
}

document.getElementById('closeDetail').addEventListener('click', () => {
  document.getElementById('detailOverlay').classList.add('hidden');
});
document.getElementById('detailOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'detailOverlay') e.currentTarget.classList.add('hidden');
});

// ---------------------------------------------------------------- favorite picker
let favTeamsCache = {}; // leagueId -> team list
let favSelectedLeague = LEAGUES[0].id;

function renderFavLeagueChips() {
  const wrap = document.getElementById('favLeagueSelect');
  wrap.innerHTML = '';
  LEAGUES.forEach(lg => {
    const chip = document.createElement('button');
    chip.className = 'chip' + (favSelectedLeague === lg.id ? ' active' : '');
    chip.textContent = lg.short;
    chip.addEventListener('click', () => {
      favSelectedLeague = lg.id;
      renderFavLeagueChips();
      loadFavTeams();
    });
    wrap.appendChild(chip);
  });
}

async function loadFavTeams() {
  const results = document.getElementById('teamResults');
  results.innerHTML = '<div class="loader">Loading teams…</div>';
  try {
    if (!favTeamsCache[favSelectedLeague]) {
      favTeamsCache[favSelectedLeague] = await getLeagueTeams(favSelectedLeague);
    }
    renderTeamResults(favTeamsCache[favSelectedLeague]);
  } catch (e) {
    results.innerHTML = '<div class="loader">Could not load teams.</div>';
  }
}

function renderTeamResults(teams) {
  const q = document.getElementById('teamSearch').value.trim().toLowerCase();
  const filtered = q ? teams.filter(t => t.name.toLowerCase().includes(q) || (t.abbrev || '').toLowerCase().includes(q)) : teams;
  const results = document.getElementById('teamResults');
  results.innerHTML = '';
  if (!filtered.length) {
    results.innerHTML = '<div class="loader">No teams match your search.</div>';
    return;
  }
  filtered.forEach(t => {
    const row = document.createElement('div');
    row.className = 'team-result-row';
    row.innerHTML = `
      <img class="team-result-logo" src="${t.logo || ''}" alt="" onerror="this.style.visibility='hidden'">
      <span class="team-result-name">${escapeHtml(t.name)}</span>
      <span class="team-result-league">${escapeHtml(leagueById(t.leagueId).short)}</span>
    `;
    row.addEventListener('click', () => {
      setFavoriteTeam(t);
      document.getElementById('favOverlay').classList.add('hidden');
      renderFavoriteBar();
      renderGrid();
    });
    results.appendChild(row);
  });
}

document.getElementById('pickFavoriteBtn').addEventListener('click', () => {
  document.getElementById('favOverlay').classList.remove('hidden');
  renderFavLeagueChips();
  loadFavTeams();
});
document.getElementById('closeFavPicker').addEventListener('click', () => {
  document.getElementById('favOverlay').classList.add('hidden');
});
document.getElementById('favOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'favOverlay') e.currentTarget.classList.add('hidden');
});
document.getElementById('teamSearch').addEventListener('input', () => {
  if (favTeamsCache[favSelectedLeague]) renderTeamResults(favTeamsCache[favSelectedLeague]);
});

// ---------------------------------------------------------------- init
document.addEventListener('DOMContentLoaded', () => {
  renderLeagueChips();
  renderFavoriteBar();
  loadTab();
});
