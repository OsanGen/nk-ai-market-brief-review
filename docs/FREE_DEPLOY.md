# Free Deploy

The default deployment uses GitHub Actions artifacts. GitHub Pages is supported and gated by a repository variable.

## Required Setup

1. Push this folder to a GitHub repository.
2. Enable GitHub Actions.
3. Do not add secrets for preview/artifact-only mode.
4. For a live page that refreshes without manual pushes, set repository Settings -> Pages -> Source to GitHub Actions and set repository variable `DEPLOY_GITHUB_PAGES=true`.

The workflow runs:

```bash
npm ci
npm test
npm run build
npm run check:deploy
```

Scheduled runs come from the latest default branch commit at 12:17 UTC and 13:17 UTC on weekdays. The runtime guard targets 8 a.m. America/New_York for `auto` mode. If `DEPLOY_GITHUB_PAGES` is false, output still appears as the `nk-ai-market-brief` GitHub Actions artifact.

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
- mode is `send`, or mode is `auto` inside the 8 a.m. America/New_York weekday target window
- item count is at least `NEWSLETTER_MIN_ITEMS`

Preview mode never sends, even if send variables are configured. Scheduled auto mode without secrets generates preview artifacts only. No recipient emails or API keys are hard-coded, and logs/report JSON never include full recipient lists or secret values.
