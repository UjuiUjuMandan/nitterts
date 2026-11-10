// Node type-stripping loader hook: resolves extensionless relative imports
// (TS-style "../session") by retrying with ".ts" appended. Used only by the
// seed script so it can import src/ modules under plain `node`.
import { register } from "node:module";

register(new URL("./resolve-ts-hook.mjs", import.meta.url));