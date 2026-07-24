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

## Machine-Facing Observability

The agent-readable source of truth is `.newsletter-logs/`, not console prose:

- `LATEST.json`: pointer to the latest finalized run
- `event-catalog.json`: versioned event-envelope contract
- `YYYY-MM-DD/<run-id>/events.jsonl`: ordered compact events
- `YYYY-MM-DD/<run-id>/run-manifest.json`: components, terminal state, file pointers, byte count, and SHA-256 digest
- `YYYY-MM-DD/<run-id>/summary.json`: compact health and outcome
- `commands.jsonl`: scheduler decisions, CLI completion/failure, deploy verification, log verification, and live verification

Use:

```bash
npm run logs:status
npm run logs:verify
npm run logs:verify -- --run <run-id>
npm run logs:query -- --run latest --level error
npm run logs:query -- --run latest --component feed_fetch
npm run logs:query -- --run latest --event source.fetch.summary
npm run logs:query -- --stream commands --run all --level error
npm run logs:query -- --stream all --run <run-id>
```

`logs:verify` checks the selected run ID, required envelope fields, schema/event versions, sequence, unique IDs, one start event, exactly one final terminal event, manifest/summary agreement, byte count, digest, command-stream structure, and accidental secret/email/token exposure. In GitHub Actions it uses the freshness gate's exact `NEWSLETTER_RUN_ID`, so an old successful `LATEST.json` cannot make a failed current run look green. `logs:status` overlays correlated command evidence so later deployment/live checks are visible without rewriting the immutable run manifest.

Health is intentionally split:

- `pipelineStatus`: source collection and processing validity
- `contentStatus`: `ready`, `limited`, or valid zero-result `empty_valid`
- `deploymentStatus`: build-time deployment evidence only
- `liveStatus`: hosted-surface evidence only

All configured sources failing is `pipelineStatus=failed` and makes the command, deploy check, and live freshness check fail. Some source failures produce a degraded run. Successful sources with zero qualifying stories are a valid empty content result, not a source failure.

To instrument a future component without changing the logger registry, emit through the current run context:

```js
import { currentTelemetry } from "./observability/telemetry.mjs";

await currentTelemetry()?.event({
  event: "component.operation.completed",
  component: "component",
  phase: "component.operation",
  status: "completed",
  attributes: { itemCount }
});
```

Use `telemetry.phase(...)` for started/completed/failed lifecycle pairs. Event, component, and phase names use lowercase machine identifiers. Attribute values are recursively redacted, bounded, and newline-safe, but callers must still avoid raw external payloads. Configure a different private root with `NEWSLETTER_LOG_DIR`; never point it inside `site/`.

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

When Pages deploy is enabled, the workflow runs `npm run check:live` after deployment. That live checker retries the public `run.json` and passes only when its `runId` matches the exact current workflow run, `generatedAt` is today in America/New_York, `mode` is `auto`, `config.activeLookbackHours <= 84`, automation is configured, pipeline health did not fail, all sources did not fail, and `send.sent` is false. If Pages deployment is disabled, the exact-run check fails rather than treating an older same-day page as proof of deployment.

After setup, no manual push is needed for normal refreshes. To publish the live page automatically, configure repository Settings -> Pages -> Source: GitHub Actions, then set repository variable `DEPLOY_GITHUB_PAGES=true`. If that variable is false, the workflow still uploads `.newsletter-outbox`, `.newsletter-logs`, and `site` as the `nk-ai-market-brief` artifact. A separate final observability artifact is retained for 30 days and runs under `always()`, including scheduler skips and failed builds.

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

- If one RSS source fails, the run continues as degraded and records only a stable error code/fingerprint; raw provider errors are never published.
- If every configured RSS source fails, the run is failed even if static files were written. Inspect `npm run logs:status` and query `source.fetch.failed` plus `source.fetch.summary`.
- If no qualifying items are found, static files are still generated.
- If the public page looks stale, check `site/run.json` or the live `run.json` first. Scheduled public output should show `"mode": "auto"` and `config.activeLookbackHours` of `36` on normal days or `84` on Mondays.
- If `site/run.json` has `"reviewReady": false`, do not share the live review page until sources or filters are tuned. For local debugging only, `ALLOW_NOT_READY_REVIEW=true npm run check:deploy` bypasses this guard.
- If `check:deploy` fails, confirm `site/index.html`, `site/newsletter.txt`, `site/run.json`, `.env.example`, workflow, and `FULL_TECH_BUILD.txt` exist.
- If `logs:verify` fails, rerun it with the exact run ID from the command output and inspect its `errors` array. Do not replace a failed run with an older `latest` result.
