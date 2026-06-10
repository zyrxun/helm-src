#!/usr/bin/env node
// Mint an Ed25519-signed Helm license key.
//
// Usage:
//   HELM_LICENSE_PRIVATE_KEY="$(cat private.pem)" \
//     node scripts/generate-key.js <email>
//
// The private key is a PEM-encoded Ed25519 PRIVATE KEY (PKCS#8).
// The matching public key lives in electron/runtime-config.js.

const crypto = require('crypto');

const email      = process.argv[2];
const privatePem = process.env.HELM_LICENSE_PRIVATE_KEY;

if (!email || !privatePem) {
  console.error('Usage: HELM_LICENSE_PRIVATE_KEY=<pem> node scripts/generate-key.js <email>');
  process.exit(1);
}

const privateKey = crypto.createPrivateKey(privatePem);

const nonce        = crypto.randomBytes(4).toString('hex');
const encodedEmail = Buffer.from(email).toString('base64url');
const message      = Buffer.from(`HLM:${encodedEmail}:${nonce}`);
const signature    = crypto.sign(null, message, privateKey).toString('base64url');

// '.' is not a base64url character, so splitting on it is unambiguous.
console.log(`HLM.${encodedEmail}.${nonce}.${signature}`);
