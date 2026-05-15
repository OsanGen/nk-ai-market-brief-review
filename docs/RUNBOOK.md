# Runbook

## Local Preview

```bash
npm install
npm run preview
```

Open `site/index.html` or the dated HTML file under `.newsletter-outbox/`.

For Cyril/Faneeza/Norma review, use `site/index.html` as the shareable review page and `SHARE_WITH_CYRIL.md` for the handoff note.

Preview/build mode uses `NEWSLETTER_REVIEW_LOOKBACK_HOURS` and defaults to 168 hours so the review page can show a representative set of current qualifying signals.

For the public daily refresh path, use:

```bash
npm run daily
NEWSLETTER_EXPECT_MODE=auto NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84 NEWSLETTER_EXPECT_FRESH_DATE=true npm run check:deploy
```

`npm run daily` forces `auto` mode so delayed GitHub scheduled runs still publish a fresh page, but it keeps sending disabled and uses the tighter daily windows: `NEWSLETTER_LOOKBACK_HOURS=36` and `NEWSLETTER_MONDAY_LOOKBACK_HOURS=84`.

## Build

```bash
npm run build
npm run check:deploy
```

`npm run build` is intentionally review-oriented and writes `mode: "preview"` with the wider review lookback. Do not use it as the final public scheduled output.

## Automatic Refresh

The GitHub Actions workflow runs from the default branch every day with redundant 4 a.m. America/New_York coverage:

- `2,7,12,17,22,27,32,37,42,47,52,57 8,9 * * *`
- `17 10,11,12 * * *`

The 8/9 UTC runs cover 4 a.m. Eastern across daylight saving time and standard time. The 10/11/12 UTC runs are watchdog recovery checks. Manual `workflow_dispatch` remains available for test runs.

The workflow runs `npm run should:refresh` before dependency install on scheduled `auto` events. It checks the live `run.json`; if today's live page is already fresh, the retry run exits without rebuilding. If the live freshness check cannot be fetched, the gate fails open and refreshes.

Scheduled workflow runs execute `npm run daily` and then enforce:

```bash
NEWSLETTER_EXPECT_MODE=auto NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84 NEWSLETTER_EXPECT_FRESH_DATE=true npm run check:deploy
```

This prevents a preview-mode, 168-hour review page from being deployed as the daily public page.

When Pages deploy is enabled, the workflow runs `npm run check:live` after deployment. That live checker retries the public `run.json` and passes only when `generatedAt` is today in America/New_York, `mode` is `auto`, `config.activeLookbackHours <= 84`, automation is configured, and `send.sent` is false.

After setup, no manual push is needed for normal refreshes. To publish the live page automatically, configure repository Settings -> Pages -> Source: GitHub Actions, then set repository variable `DEPLOY_GITHUB_PAGES=true`. If that variable is false, the workflow still uploads `.newsletter-outbox` and `site` as the `nk-ai-market-brief` artifact.

## Filter Behavior

An item is included if it has a high-priority phrase, or if it has at least one AI/agentic term and one fashion, beauty, retail, shopping, ecommerce, commerce, or brand term.

Generic fashion, generic beauty, generic e-commerce, and generic AI stories are excluded.

## Email

Email is disabled by default. `npm run send` fails safely unless every gate is present and valid:

- `NEWSLETTER_SEND_ENABLED=true`
- `RESEND_API_KEY`
- `NEWSLETTER_FROM`
- `NEWSLETTER_TO` with at least one valid comma-separated internal address
- selected item count at least `NEWSLETTER_MIN_ITEMS`

`npm run preview` never sends. `npm run daily` also keeps `NEWSLETTER_SEND_ENABLED=false` for public page generation. Explicit send remains isolated to `npm run send` and fails safely unless every gate is configured.

Do not log secrets. Do not hard-code recipients. Keep the recipient list internal.

Safe explicit-send failure check:

```bash
NEWSLETTER_SEND_ENABLED=true npm run send || true
```

Expected result: nonzero send path, clear skipped reason such as `missing_resend_api_key`, and no secret or recipient list printed.

## Troubleshooting

- If one RSS source fails, the run continues and records the source error in `run.json`.
- If no qualifying items are found, static files are still generated.
- If the public page looks stale, check `site/run.json` or the live `run.json` first. Scheduled public output should show `"mode": "auto"` and `config.activeLookbackHours` of `36` on normal days or `84` on Mondays.
- If `site/run.json` has `"reviewReady": false`, do not share the live review page until sources or filters are tuned. For local debugging only, `ALLOW_NOT_READY_REVIEW=true npm run check:deploy` bypasses this guard.
- If `check:deploy` fails, confirm `site/index.html`, `site/newsletter.txt`, `site/run.json`, `.env.example`, workflow, and `FULL_TECH_BUILD.txt` exist.
