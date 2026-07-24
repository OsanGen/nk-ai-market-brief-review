import { runNewsletterCommand } from "./run-newsletter-command.mjs";

await runNewsletterCommand({ mode: "preview", ensureSite: true });
