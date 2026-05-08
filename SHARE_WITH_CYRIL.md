# Share NK AI Market Brief Review Page

## Local Preview

Open:

```text
site/index.html
```

The text-only companion file is:

```text
site/newsletter.txt
```

## GitHub Actions Artifact

Use this path in GitHub:

```text
Actions -> NK AI Market Brief -> latest run -> artifact nk-ai-market-brief
```

The artifact contains both `.newsletter-outbox` and `site`.

After repository setup, normal refreshes do not require manual pushes. The scheduled GitHub Actions workflow rebuilds the page from the default branch on weekdays at 12:17 UTC and 13:17 UTC, with the runtime guard targeting 8 a.m. America/New_York.

## Live Review Link

The private source repository's current GitHub plan does not support Pages for that private repo. To keep the source repo private, the live page is published from a public workflow-capable Pages repository that rebuilds from RSS on schedule.

Live review page:

```text
https://osangen.github.io/nk-ai-market-brief-review/
```

Site-only repo:

```text
https://github.com/OsanGen/nk-ai-market-brief-review
```

## Enable GitHub Pages On A Supported Repo

1. Open repository settings.
2. Go to Pages.
3. Set Source to GitHub Actions.
4. Set repository variable:

```text
DEPLOY_GITHUB_PAGES=true
```

If `DEPLOY_GITHUB_PAGES` is false, the generated output remains available through the GitHub Actions artifact.

Expected live link format:

```text
https://<github-user-or-org>.github.io/<repo-name>/
```

For the private source repository, the expected format would be:

```text
https://osangen.github.io/nk-ai-market-newsletter/
```

## What To Send Cyril

- Share only when `site/run.json` has `"reviewReady": true`.
- Confirm `site/run.json` has `"automationConfigured": true` for auto-refresh proof.
- The live review link: `https://osangen.github.io/nk-ai-market-brief-review/`
- If Pages is not enabled yet, send the latest `nk-ai-market-brief` GitHub Actions artifact.
- The short copy/paste message below.

## What Not To Send Cyril

- API keys or environment variables.
- Recipient lists.
- Internal QA logs unless specifically requested.
- Raw generated files outside the review page/artifact package.

Email is intentionally disabled until preview approval and recipient confirmation.

## Copy/Paste Message

Hi Cyril,

I have the first review page for the NK AI Market Brief MVP ready.

It is currently running in preview mode, with email intentionally disabled.

Review link:
https://osangen.github.io/nk-ai-market-brief-review/

What it shows:
- AI + fashion
- AI + beauty
- AI + e-commerce
- agentic commerce
- AI shopping and brand/platform AI-agent moves

It excludes generic fashion, generic e-commerce, and generic AI news.

The page is static and free to host through GitHub Pages. Once the source set looks right, we can either keep this as the review link or enable email delivery for the internal recipient list.

Please confirm:
1. Source set is right for v1.
2. Any domains you want added.
3. Whether you want this as a page only or also emailed at 8 a.m. weekdays.
