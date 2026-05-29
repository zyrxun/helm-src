#!/usr/bin/env node
// Usage: HELM_LICENSE_SECRET=<secret> node scripts/generate-key.js <email>
const crypto = require('crypto');

const email  = process.argv[2];
const secret = process.env.HELM_LICENSE_SECRET;

if (!email || !secret) {
  console.error('Usage: HELM_LICENSE_SECRET=<secret> node scripts/generate-key.js <email>');
  process.exit(1);
}

const nonce        = crypto.randomBytes(4).toString('hex');
const encodedEmail = Buffer.from(email).toString('base64url');
const message      = `HLM:${encodedEmail}:${nonce}`;
const hmac         = crypto.createHmac('sha256', secret).update(message).digest('hex');

console.log(`HLM-${encodedEmail}-${nonce}-${hmac}`);
