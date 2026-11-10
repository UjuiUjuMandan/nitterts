// Ambient declaration for the node:crypto subset used at runtime via the
// nodejs_compat flag. Kept minimal to avoid pulling in full @types/node,
// which conflicts with the generated Workers runtime types.
declare module "node:crypto" {
  export function createHmac(algorithm: string, key: string | Uint8Array): {
    update(data: string): { digest(encoding: "hex"): string };
  };
  export function createHash(algorithm: string): {
    update(data: string): {
      digest(encoding: "hex"): string;
      digest(): Uint8Array;
    };
  };
  export function randomBytes(size: number): {
    toString(encoding: "hex"): string;
  };
}
