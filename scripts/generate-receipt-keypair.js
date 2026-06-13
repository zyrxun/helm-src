#!/usr/bin/env node
// Generates the Ed25519 keypair used for SF-2 activation receipts.
//
// This keypair is SEPARATE from the license-signing keypair:
//   - PRIVATE key  → set as HELM_RECEIPT_PRIVATE_KEY env on the helmActivate val
//                    (Val.town). It signs receipts; never ships in the client.
//   - PUBLIC key   → paste into electron/runtime-config.js `receiptPublicKey`.
//                    The client verifies receipts with it.
//
// Run:  node scripts/generate-receipt-keypair.js
// Then: redeploy helmActivate with the new env var, set receiptPublicKey, rebuild
//       the client. Until BOTH are in place, receiptPublicKey stays null and the
//       client uses the legacy offline grace (rollout-safe).
//
// Treat the private key like any other secret: do NOT commit it. Store it in
// .secrets/ (gitignored) if you keep a local copy.
const { generateKeyPairSync } = require("crypto");

const { publicKey, privateKey } = generateKeyPairSync("ed25519");

const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();
const pub  = publicKey.export({ type: "spki", format: "pem" }).toString().trim();

console.log("\n=== HELM_RECEIPT_PRIVATE_KEY (set on helmActivate val — keep secret) ===\n");
console.log(priv);
console.log("\n=== receiptPublicKey (paste into electron/runtime-config.js) ===\n");
console.log("`" + pub + "`");
console.log("");
