# Sunday Signal: start here

An installable NFL expert picks PWA for GitHub Pages. No paid API keys, account integrations, build tools, or npm install required.

## Get it online

1. Create a **public GitHub repository** named `SundaySignal`. Choose **Add a README file** so the default `main` branch exists.
2. In the repository, open **Settings → Pages**. Under **Build and deployment → Source**, select **GitHub Actions**.
3. Unpack this ZIP. Open the extracted `sunday-signal` folder. Upload **everything inside that folder** into the root of your repository. `index.html` must be at the top level, not inside another folder. Include the **`.github` folder** because it contains the automatic updater. Replace GitHub's starter README if asked.
4. Open **Actions → Update NFL picks and deploy**. If the upload has already started a run, let it finish. Otherwise choose **Run workflow → Run workflow**. Enable Actions if GitHub asks.
5. When the run is green, visit **Settings → Pages** for your link. It normally looks like `https://YOUR-USERNAME.github.io/SundaySignal/`.

**If the updater is missing from Actions:** confirm `.github/workflows/update-and-deploy.yml` exists in your repository. ZIP contents with leading dots must be uploaded too. With Git installed, committing the entire extracted folder is an alternative to browser upload.

**If “git push” is denied:** open **Settings → Actions → General → Workflow permissions**, choose **Read and write permissions**, save, then rerun the workflow. Organization policies and branch protection can override this. A personal public repository with the default main branch is the simplest setup.

**If your default branch is not `main`:** edit `branches: [main]` inside `.github/workflows/update-and-deploy.yml` to match before upload. Scheduled runs use the default branch.

## Install it on your phone

- **Android / Chrome:** open your Pages link and tap **Install app**, or use the browser menu → **Add to Home screen**.
- **iPhone / Safari:** open the link, then **Share → Add to Home Screen**. Enable **Open as Web App** if shown.
- **Desktop Chrome / Edge:** use the browser's install button or app menu.

The ZIP includes ordinary icons at 192 and 512 pixels, dedicated maskable icons at 192 and 512 pixels, a 180-pixel Apple touch icon, and a favicon. The maskable icons use a solid background and keep the artwork within the safe area. The manifest declares `any` and `maskable` purposes separately for better control over each appearance.

## What updates automatically

GitHub Actions fetches the two publisher RSS feeds hourly at minute 17, records the refreshed edition in `data/picks.json`, and publishes the site. It runs even if nobody has the app open. Every push and a manual **Run workflow** also run an update. No ChatGPT automation or subscription is required.

The app checks for the newly deployed edition on opening, every five minutes while visible, on returning to the app, or when you tap **Check update**. That button fetches the last published JSON. It cannot force the GitHub workflow to run immediately.

The included data is a real initial feed snapshot, not demonstration picks. It will become old until you enable the workflow. The app warns when the last successful feed update is more than three hours old.

## Honest limits of “evergreen”

There are no hardcoded seasons, week numbers, matchup lists, or yearly dates to replace. Publication dates drive the rolling feed, and the app works during playoffs and offseason as new material becomes available. Team labels use the current 32 franchises; future franchise rebrands can require an edit.

Publishers can change, block, or remove feeds. GitHub can delay scheduled runs. Public repositories can have scheduled workflows disabled after 60 days without repository activity. Check the Actions page if updates stop; re-enable the workflow as necessary. This is automatic ongoing operation, not a promise that third-party services will never need maintenance.

If one source fails, the other continues and recent cached articles from the failed source are retained with a warning. If both fail, the latest check and source warnings are still published, while the last successful refresh date stays unchanged. Cached articles older than 14 days are removed. If a publisher simply has no recent NFL betting content during the offseason, its feed can be marked unavailable with that explanation.

## What the picks mean

- Publishers: **Sports Betting Dime** and **BettingPros**, configurable in `sources.json`.
- Every article retains its original URL, publication time, publisher and byline.
- The parser extracts only short labelled picks or selection headings, up to three per article. It deliberately leaves ordinary prose, generic odds tables and ambiguous statements alone. It can miss valid picks; use **All analysis** to read the originals.
- The author shown is the article's byline. Roundtable or guest selections may have a different individual contributor identified in the original article.
- These are **published selections and article lines**, not live sportsbook odds. Picks are not auto-graded or ranked by win rate.
- Article recency is not game status. Games may have already started or finished, even in a recent article. Check kickoff, matchup and current odds yourself. Articles over 48 hours old are visibly marked.
- There are no generated picks, invented records, prediction confidence percentages, or claimed expert consensus.
- Original publisher writing and trademarks remain theirs. Only limited selection text and linked article metadata are shown; this is not a licensed full-content feed or a paywall workaround.

## Offline and saved picks

After the first online visit, the app shell and most recently fetched edition are cached. Use stars to save article cards on this device. Saved cards remain after they leave the rolling feed. Offline reading shows metadata and extracted selections; external full articles still need internet. Browser data clearing removes saved picks. There is no cross-device account sync.

## Optional local preview

From the extracted folder, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. Opening `index.html` directly with `file://` will not load JSON or install the service worker reliably. GitHub Pages supplies the HTTPS required for installation.

## Change the app later

- `index.html`: structure and text.
- `styles.css`: appearance and mobile layout.
- `app.js`: filters, saving and reading editions.
- `sources.json`: publisher feeds.
- `scripts/update_picks.py`: feed updater and selection parser; Python standard library only.
- `sw.js`: offline caching. Increment `APP_VERSION` when changing app assets.
- `manifest.webmanifest`: install details and `any` / `maskable` icons.
- `.github/workflows/update-and-deploy.yml`: hourly updates and Pages deployment.

Run parser checks with `python -m unittest discover -s tests -v`. To fetch a new edition locally, run `python scripts/update_picks.py`.

The workflow publishes only web assets and data, not the scripts or documentation. Relative paths support both repository Pages URLs and a custom domain.

## References

- GitHub Pages workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- Scheduled workflow behavior and limitations: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
