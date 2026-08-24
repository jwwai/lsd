/*
 * favorites.js
 * Handles storing the user's favorite team (localStorage — no account
 * needed) and rendering the pinned ticker bar with that team's most
 * relevant game (live > next upcoming > most recent finished).
 */

const FAV_KEY = 'scoreboard.favoriteTeam';

function getFavoriteTeam() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setFavoriteTeam(team) {
  localStorage.setItem(FAV_KEY, JSON.stringify(team));
}

function clearFavoriteTeam() {
  localStorage.removeItem(FAV_KEY);
}

/** Pick the most relevant game from a team's schedule: live first, else soonest upcoming, else most recent past. */
function pickRelevantGame(events) {
  const live = events.find(e => e.state === 'in');
  if (live) return live;

  const now = Date.now();
  const upcoming = events
    .filter(e => e.state === 'pre' && new Date(e.date).getTime() >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  if (upcoming[0]) return upcoming[0];

  const past = events
    .filter(e => e.state === 'post')
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  return past[0] || null;
}

async function renderFavoriteBar() {
  const bar = document.getElementById('favoriteBar');
  const fav = getFavoriteTeam();
  if (!fav) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');

  document.getElementById('favLogo').src = fav.logo || '';
  document.getElementById('favLogo').alt = fav.name;
  document.getElementById('favName').textContent = fav.name;
  document.getElementById('favDetail').textContent = 'Loading…';
  document.getElementById('favScore').textContent = '';
  document.getElementById('favDot').classList.remove('live');

  try {
    const events = await getTeamSchedule(fav.leagueId, fav.id);
    const game = pickRelevantGame(events);
    if (!game) {
      document.getElementById('favDetail').textContent = 'No games found';
      return;
    }
    const isFavHome = game.home && game.home.id === fav.id;
    const opp = isFavHome ? game.away : game.home;
    const mine = isFavHome ? game.home : game.away;

    if (game.state === 'in') {
      document.getElementById('favDot').classList.add('live');
      document.getElementById('favDetail').textContent = `LIVE vs ${opp ? opp.name : 'TBD'} · ${game.statusDetail || ''}`;
      document.getElementById('favScore').textContent = `${mine.score ?? '0'}–${opp ? (opp.score ?? '0') : '0'}`;
    } else if (game.state === 'pre') {
      const d = new Date(game.date);
      document.getElementById('favDetail').textContent = `Next: vs ${opp ? opp.name : 'TBD'} · ${d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
      document.getElementById('favScore').textContent = '';
    } else {
      const result = mine.winner ? 'W' : (opp && opp.winner ? 'L' : 'T');
      document.getElementById('favDetail').textContent = `Last: ${result} vs ${opp ? opp.name : 'TBD'}`;
      document.getElementById('favScore').textContent = `${mine.score ?? ''}–${opp ? (opp.score ?? '') : ''}`;
    }

    bar.onclick = (ev) => {
      if (ev.target.id === 'favClear') return;
      openGameDetail(game.leagueId, game.id);
    };
  } catch (e) {
    document.getElementById('favDetail').textContent = 'Could not load team data';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('favClear').addEventListener('click', (e) => {
    e.stopPropagation();
    clearFavoriteTeam();
    renderFavoriteBar();
  });
});
