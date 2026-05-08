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
npm test
npm run build
npm run check:deploy
```

Outputs:

- `.newsletter-outbox/YYYY-MM-DD/newsletter.html`
- `.newsletter-outbox/YYYY-MM-DD/newsletter.txt`
- `.newsletter-outbox/YYYY-MM-DD/run.json`
- `site/index.html` shareable static review page
- `site/newsletter.txt`
- `site/run.json`
- `SHARE_WITH_CYRIL.md`

## Deployment

GitHub Actions runs from the default branch on weekdays at 12:17 UTC and 13:17 UTC. The runtime time guard targets 8 a.m. America/New_York for `auto` mode, while preview/build mode uses the wider review lookback for the share page.

After setup, no manual push is needed for normal refreshes. The scheduled workflow rebuilds the RSS brief, runs tests and deploy checks, and uploads `.newsletter-outbox` plus `site` as the `nk-ai-market-brief` artifact.

GitHub Pages is optional and only deploys when repository Settings -> Pages uses GitHub Actions and repository variable `DEPLOY_GITHUB_PAGES=true`.

Email is optional and only sends when all send gates pass. See `.env.example` and `docs/RUNBOOK.md`.

Preview mode cannot send. Explicit send requires `NEWSLETTER_SEND_ENABLED=true`, Resend API key, sender, at least one valid internal recipient, and enough selected items.
