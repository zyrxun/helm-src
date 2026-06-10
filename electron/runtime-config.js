// Runtime configuration for the shipped client.
//
// Everything in this file is PUBLIC by design — it gets shipped inside the
// asar, anyone can read it with `npx asar extract`. Do not add credentials,
// signing keys, or anything that grants write access to a service.
//
// Build-time secrets (Apple credentials, R2 keys, Resend keys for server-side
// sends, etc.) belong in `.env` — which is NOT bundled (see package.json
// build.files, and `scripts/audit-release.sh` guards against regressions).

module.exports = {
  // Val.town license activation endpoint. Public URL by design.
  activationEndpoint: 'https://zyrxun--0bc048205afb11f19093ee650bb23af1.web.val.run',

  // Stripe Checkout link. Public URL.
  stripeUrl: 'https://buy.stripe.com/fZudR8fDe0YJbdK3sObQY00',

  // Sentry DSN. Write-only by design per Sentry docs — embedding in clients
  // is the standard pattern. Worst case is fake event spam against quota.
  sentryDsn: 'https://3809bec31f69a789cc31c7ecc5448ee2@o4511476566392832.ingest.us.sentry.io/4511476572422144',

  // Val.town feedback endpoint. Holds RESEND_API_KEY server-side so no email
  // credentials ship in the client bundle.
  feedbackEndpoint: 'https://zyrxun--2f856d02645711f1ab1b1607ee4eb77e.web.val.run',

  // Ed25519 public key used to verify license signatures locally. The matching
  // private key lives only in the Val.town `helmCheckout` env (the minter);
  // `helmActivate` holds just this public key. Anyone who sees this key can
  // verify a signature; only the private-key holder can mint a new valid one.
  licensePublicKey: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAKGseX/ZWvKeZYjWaB3RiWzjVf8hhoshfGfB5lpBcqWU=
-----END PUBLIC KEY-----`,
};
