// Node type-stripping resolve hook for the seed script: retries extensionless
// relative imports (TS-style "../session") with ".ts" appended.
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && !specifier.endsWith(".ts")) {
    try {
      return await nextResolve(`${specifier}.ts`, context);
    } catch {
      // fall through to the default resolution
    }
  }
  return nextResolve(specifier, context);
}