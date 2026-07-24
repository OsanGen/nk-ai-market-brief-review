# NK AI Market Newsletter MVP

Free, standalone internal market brief for NK. The MVP focuses only on AI plus fashion, beauty, e-commerce, agentic commerce, AI shopping, and AI agents or assistants used by major fashion, beauty, retail, and commerce platforms or brands.

## Free Default Mode

- No secrets required.
- No database.
- No LLM or OpenAI API.
- No paid RSS, search, or news APIs.
- No page scraping.
- Email sending is disabled by default.

## Local Commands

```bash
npm install
npm run preview
npm run daily
npm run weekly
npm run should:refresh
npm run check:live
npm run send
npm test
npm run build
npm run check:deploy
npm run logs:status
npm run logs:verify
npm run logs:query -- --run latest --level error
npm run logs:query -- --stream commands --run all --level error
```

Outputs:

- `.newsletter-outbox/YYYY-MM-DD/newsletter.html`
- `.newsletter-outbox/YYYY-MM-DD/newsletter.txt`
- `.newsletter-outbox/YYYY-MM-DD/run.json`
- `site/index.html` shareable static review page
- `site/newsletter.txt`
- `site/run.json`
- `.newsletter-logs/YYYY-MM-DD/<run-id>/events.jsonl`
- `.newsletter-logs/YYYY-MM-DD/<run-id>/run-manifest.json`
- `.newsletter-logs/YYYY-MM-DD/<run-id>/summary.json`
- `.newsletter-logs/commands.jsonl`
- `SHARE_WITH_CYRIL.md`

## Deployment

GitHub Actions runs from the default branch every day with redundant 4 a.m. America/New_York coverage:

- `2,7,12,17,22,27,32,37,42,47,52,57 8,9 * * *`
- `17 10,11,12 * * *`

The first schedule covers the DST and standard-time 4 a.m. window without hitting exactly `:00`; the second is a late watchdog. A cheap schedule gate checks the live `run.json` first, skips duplicate retries once today is fresh, and fails open by refreshing if live freshness cannot be fetched.

Scheduled/public refreshes use `npm run daily`, which forces `auto` mode with the normal daily lookback windows so GitHub cron delays do not publish a skipped page. Manual preview/build mode keeps the wider review lookback for stakeholder review.

After setup, no manual push is needed for normal refreshes. The scheduled workflow rebuilds the RSS brief when the live page is stale, runs tests and daily-mode deploy checks, verifies the exact machine-log run, uploads `.newsletter-outbox`, `.newsletter-logs`, and `site` with 30-day retention, deploys Pages when enabled, then verifies the live page is fresh. Final observability evidence uploads even when a build fails or the freshness gate skips work.

GitHub Pages is optional and only deploys when repository Settings -> Pages uses GitHub Actions and repository variable `DEPLOY_GITHUB_PAGES=true`.

Email is optional and only sends when all send gates pass. See `.env.example` and `docs/RUNBOOK.md`.

Preview mode cannot send. Explicit send requires `NEWSLETTER_SEND_ENABLED=true`, Resend API key, sender, at least one valid internal recipient, and enough selected items.

## Machine-Facing Logs

Logs are compact JSON/JSONL intended for agents and automation. Every newsletter run has a stable `runId`, ordered events, phase durations, health split into pipeline/content/deployment/live axes, exactly one terminal event, a SHA-256 event-stream digest, and an auto-discovered component list. New components become visible as soon as they emit a valid event; no central component list needs editing.

`.newsletter-logs/` is private, gitignored operational evidence. Public `site/run.json` is a recursively sanitized allowlist and never contains stories, raw errors, recipients, provider message IDs, or secret values. See `docs/RUNBOOK.md` for queries and the extension contract.
