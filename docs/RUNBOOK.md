# Runbook

## Local Preview

```bash
npm install
npm run preview
```

Open `site/index.html` or the dated HTML file under `.newsletter-outbox/`.

For Cyril/Faneeza/Norma review, use `site/index.html` as the shareable review page and `SHARE_WITH_CYRIL.md` for the handoff note.

Preview/build mode uses `NEWSLETTER_REVIEW_LOOKBACK_HOURS` and defaults to 168 hours so the review page can show a representative set of current qualifying signals. Scheduled `auto` mode keeps the tighter daily windows: `NEWSLETTER_LOOKBACK_HOURS=36` and `NEWSLETTER_MONDAY_LOOKBACK_HOURS=84`.

## Build

```bash
npm run build
npm run check:deploy
```

## Automatic Refresh

The GitHub Actions workflow runs from the default branch on weekdays at:

- `17 12 * * 1-5`
- `17 13 * * 1-5`

Those UTC runs bracket 8 a.m. America/New_York across daylight saving time. Manual `workflow_dispatch` remains available for test runs.

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

`npm run preview` never sends. `auto` mode only attempts send inside the weekday 8 a.m. America/New_York target window; without send secrets it writes artifacts and records a safe skipped send state.

Do not log secrets. Do not hard-code recipients. Keep the recipient list internal.

Safe explicit-send failure check:

```bash
NEWSLETTER_SEND_ENABLED=true npm run send || true
```

Expected result: nonzero send path, clear skipped reason such as `missing_resend_api_key`, and no secret or recipient list printed.

## Troubleshooting

- If one RSS source fails, the run continues and records the source error in `run.json`.
- If no qualifying items are found, static files are still generated.
- If `site/run.json` has `"reviewReady": false`, do not share the live review page until sources or filters are tuned. For local debugging only, `ALLOW_NOT_READY_REVIEW=true npm run check:deploy` bypasses this guard.
- If `check:deploy` fails, confirm `site/index.html`, `site/newsletter.txt`, `site/run.json`, `.env.example`, workflow, and `FULL_TECH_BUILD.txt` exist.
