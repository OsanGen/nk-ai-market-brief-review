import { runNewsletterCommand } from "./run-newsletter-command.mjs";

// Weekly review run (spec P1, section 40.3): runs the existing pipeline with the
// review lookback (NEWSLETTER_REVIEW_LOOKBACK_HOURS) and emits the REC-COVERAGE
// receipt for the computed ISO week. Sending is prohibited twice over: the env
// gate below stays hard-off exactly like scripts/daily.mjs, and the run-level
// weeklySendGuard in src/run-newsletter.mjs never invokes the send path for
// mode "weekly" regardless of environment.
process.env.NEWSLETTER_SEND_ENABLED = "false";

await runNewsletterCommand({ mode: "weekly", ensureSite: true });
