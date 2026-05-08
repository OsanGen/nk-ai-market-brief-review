import { access } from "node:fs/promises";

import { runNewsletter } from "../src/run-newsletter.mjs";

const result = await runNewsletter({ mode: "preview", force: true });
await access("site/index.html");
console.log(JSON.stringify({
  outputDir: result.outputDir,
  itemCount: result.itemCount,
  sourceCount: result.sourceCount,
  sourceErrors: result.sourceErrors.length,
  send: result.send
}, null, 2));
