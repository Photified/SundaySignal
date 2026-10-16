# Sunday Signal v3 update

Unzip this package. Upload its contents into the root of your existing SundaySignal GitHub repository, replacing the matching files. Keep the scripts, tests and data folder structure. Do not upload the ZIP itself or put these files inside an extra enclosing folder.

Your existing .github workflow and icons remain in place. No workflow change or API key is required. Commit the upload and let the existing Actions deployment finish. Reopen the app online to load its new service worker.

## What's included

- Eight publishers: Sports Betting Dime, BettingPros, CBS Sports, Covers, Sports Chat Place, Sportsbook Review, Sporting News and RotoWire.
- Publishers tab with Follow / Following buttons. All publishers start followed. Preferences persist on the same browser/device and filter Explore, Parlays and consensus. Saved picks remain saved. A newly added publisher starts followed.
- Consensus homepage: at least two named analysts backing the same scheduled game, market and exact line, with more supporters than tracked opponents. Open the card to inspect names and original sources. These counts describe agreement, not a win probability.
- Expert parlays with the original published legs and combined odds. They are not labeled popular because these sources do not provide verified betting-volume data.
- Decimal default, American and fractional options, compact odds without repeated format labels.
- Upcoming and Recent views. Older selections and unverified kickoff times do not qualify for the consensus homepage. RotoWire currently contributes recent selections; upcoming coverage depends on what it publishes.

## Updating and source health

The existing GitHub Actions schedule runs the updater hourly. Public pages and RSS feeds supply attributed selections; ESPN supplies game times. The app checks the resulting JSON every five minutes while open. GitHub may delay scheduled runs. Sources show connection status; outages retain recent cached articles and stale schedules pause upcoming consensus recommendations.

Public page layouts can change and require parser maintenance. The updater discovers new weekly article URLs automatically; no week or year is hardcoded. It does not bypass paywalls. Missing source odds remain blank instead of being invented.

## Verification

18 Python parser tests pass, along with JavaScript checks for exact-line consensus, duplicate analysts, opposing selections, odds conversion, app loading, follow filtering and preference persistence. All eight sources returned usable selections in the packaging-time live fetch. No visual browser/device QA was available in this environment.

Changed files: index.html, styles.css, app.js, sw.js, sources.json, scripts/update_picks.py, data/picks.json and tests. This note is optional to upload.
