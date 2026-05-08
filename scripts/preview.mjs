import { runNewsletter } from "../src/run-newsletter.mjs";

const result = await runNewsletter({ mode: "preview", force: true });
console.log(formatResult(result));

function formatResult(result) {
  return JSON.stringify({
    outputDir: result.outputDir,
    itemCount: result.itemCount,
    sourceCount: result.sourceCount,
    sourceErrors: result.sourceErrors.length,
    send: result.send
  }, null, 2);
}
