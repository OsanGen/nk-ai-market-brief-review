import path from "node:path";

export function resolvePrivateLogRoot(logRoot, cwd = process.cwd()) {
  if (typeof logRoot !== "string" || logRoot.trim() === "") throw new Error("NEWSLETTER_LOG_DIR must be a non-empty path");
  const workspaceRoot = path.resolve(cwd);
  const resolved = path.resolve(workspaceRoot, logRoot);
  const filesystemRoot = path.parse(resolved).root;
  const publicRoot = path.join(workspaceRoot, "site");
  if (resolved === filesystemRoot || resolved === workspaceRoot) {
    throw new Error("NEWSLETTER_LOG_DIR is too broad");
  }
  if (resolved === publicRoot || resolved.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error("NEWSLETTER_LOG_DIR must not be inside public site output");
  }
  return resolved;
}
