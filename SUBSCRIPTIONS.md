# Helm — Subscriptions & Cost Tracking

## Active Subscriptions

| Service | Cost | Billing | Limit / Notes |
|---------|------|---------|---------------|
| Apple Developer Program | $99 USD/year | Annual | Renews yearly — required for code signing + notarization |
| Cloudflare domain (get-helm.app) | ~$10 USD/year | Annual | Domain registration via Cloudflare |
| Cloudflare R2 | $0 + usage | Monthly | Free: 10GB storage, 1M Class A ops, 10M Class B ops/month |

## R2 Free Tier Limits (helm-updates bucket)

| Metric | Free Limit | Overage Cost | Expected Usage |
|--------|-----------|--------------|----------------|
| Storage | 10 GB/month | $0.015/GB | ~50MB per release × 10 releases = ~500MB — well within free |
| Class A ops (writes) | 1M/month | $4.50/million | ~10 uploads/month — negligible |
| Class B ops (reads) | 10M/month | $0.36/million | ~1k downloads × 4 files = ~4k reads — negligible |

**Verdict:** R2 will stay free indefinitely at Helm's scale. Only triggers cost if you have 200+ users downloading updates every day.

## How to Check Usage

- **R2:** dash.cloudflare.com → R2 Object Storage → helm-updates → Metrics
- **Apple Dev:** developer.apple.com → Account → Membership (expiry date shown)
- **Cloudflare domain:** dash.cloudflare.com → Domains → get-helm.app (renewal date shown)

## Alerts to Set

- [ ] Set a Cloudflare R2 usage alert at 80% of free tier: dash.cloudflare.com → Notifications
- [ ] Calendar reminder for Apple Developer renewal (check current expiry date)
- [ ] Calendar reminder for domain renewal (check current expiry date)
