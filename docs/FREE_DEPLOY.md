# Free Deploy

The default deployment uses GitHub Actions artifacts. GitHub Pages is supported and gated by a repository variable.

## Required Setup

1. Push this folder to a GitHub repository.
2. Enable GitHub Actions.
3. Do not add secrets for preview/artifact-only mode.
4. For a live page that refreshes without manual pushes, set repository Settings -> Pages -> Source to GitHub Actions and set repository variable `DEPLOY_GITHUB_PAGES=true`.

The workflow runs:

```bash
npm run should:refresh
npm ci
npm test
npm run daily
NEWSLETTER_EXPECT_MODE=auto NEWSLETTER_MAX_ACTIVE_LOOKBACK_HOURS=84 NEWSLETTER_EXPECT_FRESH_DATE=true npm run check:deploy
npm run check:live
```

Scheduled runs come from the latest default branch commit every day. The workflow fires repeatedly around 4 a.m. America/New_York using `2,7,12,17,22,27,32,37,42,47,52,57 8,9 * * *`, then runs watchdog checks at `17 10,11,12 * * *`. The schedule gate skips duplicates once today's live `run.json` is already fresh and refreshes if the live freshness check cannot be reached. The public scheduled path forces `auto` mode with daily lookback windows so GitHub cron delays do not publish a skipped or broad preview page. If `DEPLOY_GITHUB_PAGES` is false, output still appears as the `nk-ai-market-brief` GitHub Actions artifact.

## Optional GitHub Pages

Set repository variable:

```text
DEPLOY_GITHUB_PAGES=true
```

The workflow will publish `site/`. Treat Pages output as public.

The review page is `site/index.html`. It includes noindex metadata and is meant for internal review links, not public SEO.

No manual push is needed after Pages setup. The scheduled workflow rebuilds the page and deploys the generated `site/` artifact.

## Optional Email

Email stays off unless all send gates pass:

- `NEWSLETTER_SEND_ENABLED=true`
- `RESEND_API_KEY` exists as a secret
- `NEWSLETTER_FROM` exists as a secret
- `NEWSLETTER_TO` exists as a secret with at least one valid internal email
- mode is explicit `send`, or non-forced `auto` inside the 4 a.m. America/New_York daily target window
- item count is at least `NEWSLETTER_MIN_ITEMS`

Preview mode never sends, even if send variables are configured. The scheduled daily page path keeps sending disabled and generates page artifacts only. No recipient emails or API keys are hard-coded, and logs/report JSON never include full recipient lists or secret values.
