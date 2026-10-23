import type { IncomingMessage, ServerResponse } from "node:http";
import { createRequire } from "node:module";

// Vercel transpiles this ESM entry independently. Bundle the server first so
// extensionless TypeScript imports do not reach Node's native ESM resolver.
const runtime = createRequire(import.meta.url)("../dist-server/cloud.cjs") as {
  default: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};
export default runtime.default;

