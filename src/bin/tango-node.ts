#!/usr/bin/env node
/**
 * Console-script entry point for the `tango-node` CLI.
 *
 * Compiled to `dist/bin/tango-node.js` and wired up via the `bin` field in
 * package.json so `npx tango-node webhooks ...` and global installs work.
 *
 * Errors thrown from any command bubble up here; we log them and exit 1.
 */
import { main } from "../webhooks/cli.js";

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`tango-node: ${msg}\n`);
  process.exit(1);
});
