import { access } from "node:fs/promises";

import { runNewsletter } from "../src/run-newsletter.mjs";

process.env.NEWSLETTER_SEND_ENABLED = "false";

const result = await runNewsletter({ mode: "auto", force: true });
await access("site/index.html");
console.log(JSON.stringify({
  outputDir: result.outputDir,
  mode: result.mode,
  activeLookbackHours: result.config.activeLookbackHours,
  itemCount: result.itemCount,
  sourceCount: result.sourceCount,
  sourceErrors: result.sourceErrors.length,
  send: result.send
}, null, 2));
