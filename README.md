# Scoreboard

A static, no-backend web app that shows **live scores**, **upcoming schedules**,
and **recent results** across major sports leagues — plus a pinned **favorite
team** bar. Built to run entirely on **GitHub Pages** with **zero API keys**.

## How it avoids API keys

It calls ESPN's public `site.api.espn.com` scoreboard/summary/team endpoints
directly from the browser. These are the same read-only endpoints ESPN's own
site/app use, they're free, and they don't require a signup, token, or key.
There is no backend or serverless function — everything runs client-side.

Coverage is defined in `js/api.js` (`LEAGUES` array): NFL, NBA, MLB, NHL,
Premier League, Champions League, La Liga, MLS, and NCAA Men's Basketball.
Add or remove leagues by editing that list — any league ESPN publishes a
scoreboard for (`site.api.espn.com/apis/site/v2/sports/{sport}/{league}`)
will work the same way.

> ESPN doesn't publish or version these endpoints officially, so treat them as
> "public but unofficial." If ESPN changes them, only `js/api.js` needs updating
> — the rest of the app consumes normalized objects, not raw ESPN shapes.

## Features

- **Live tab** — all currently in-progress games, auto-refreshing every 20s.
- **Upcoming tab** — scheduled games for the next 7 days.
- **History tab** — results from the last 7 days, most recent first.
- **League filter chips** — narrow the grid to one or more leagues.
- **Game detail** — tap any game for a box-score-style breakdown (score by
  period/quarter/inning, records, venue, kickoff time).
- **Favorite team** — search and pick a team; it's pinned in a ticker bar at
  the top showing their live game, next game, or last result. Stored in
  `localStorage`, so it's private to your browser (no login, no server).

## Project structure

```
sports-live/
├── index.html   # everything — markup, styles, and JS, all in one file
└── README.md
```

Everything is inlined into a single `index.html` (styles in a `<style>` tag,
logic in a `<script>` tag) on purpose: it means there are no relative paths
to break and nothing else to deploy — just this one file works anywhere you
put it, including opened directly from disk.

No build step, no `npm install`, no bundler.

## Run locally

Just open `index.html` in a browser (double-click it, or drag it into a
browser tab). A local server also works if you prefer:

```bash
cd sports-live
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `scoreboard`).
2. Push these files to the repo root (or to a `docs/` folder — see below):
   ```bash
   git init
   git add .
   git commit -m "Initial commit: live scoreboard app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Build and deployment → Source** = "Deploy
   from a branch", **Branch** = `main` (or `master`), folder = `/ (root)`.
4. Save. GitHub gives you a URL like
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

That's it — no secrets, no environment variables, no server to manage.

## Notes & limitations

- ESPN's scoreboard for some leagues returns "current week" rather than a
  literal day for certain sports (e.g. NFL); the app requests specific dates
  via `?dates=YYYYMMDD` for Upcoming/History, which ESPN generally honors,
  but coverage can vary slightly by league.
- Because everything runs client-side, all requests come from the visitor's
  own browser — there's no shared rate limit or server cost to you as the
  developer, but a visitor on a very restrictive network/firewall could see
  requests blocked.
- This is unauthenticated, best-effort public data — not suitable for
  anything mission-critical (e.g. betting, official results).
