import { runNewsletter } from "../src/run-newsletter.mjs";

const result = await runNewsletter({ mode: "send", force: true });
console.log(JSON.stringify({
  outputDir: result.outputDir,
  itemCount: result.itemCount,
  sourceCount: result.sourceCount,
  sourceErrors: result.sourceErrors.length,
  send: result.send
}, null, 2));

if (!result.send.sent) process.exitCode = 1;
if (!result.send.sent) {
  console.error(`Send skipped safely: ${result.send.skippedReason}`);
}
