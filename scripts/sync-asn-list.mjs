#!/usr/bin/env node
/**
 * Syncs the datacenter ASN blocklist from X4BNet/lists_vpn into
 * src/security-asns.json. Run manually: `node scripts/sync-asn-list.mjs`
 */
import { writeFileSync } from "node:fs";

const SOURCE = "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/input/datacenter/ASN.txt";
const TARGET = new URL("../src/security-asns.json", import.meta.url);

const text = await fetch(SOURCE).then((r) => {
  if (!r.ok) throw new Error(`fetch failed: ${r.status}`);
  return r.text();
});

const asns = [
  ...new Set(
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => Number(line.replace(/^AS/, "").split(/\s+/)[0]))
      .filter((n) => Number.isInteger(n) && n > 0 && n <= 4294967294)
  )
].sort((a, b) => a - b);

writeFileSync(TARGET, JSON.stringify({ source: SOURCE, count: asns.length, asns }, null, "\t") + "\n");
console.log(`wrote ${asns.length} ASNs to ${TARGET.pathname}`);
