import { runNewsletterCommand } from "./run-newsletter-command.mjs";

process.env.NEWSLETTER_SEND_ENABLED = "false";

await runNewsletterCommand({ mode: "auto", ensureSite: true });
