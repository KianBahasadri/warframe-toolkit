# Clerk's production instance for grakata.com. These must stay DNS-only so
# Clerk can verify the domain and issue its certificates.
locals {
  clerk_cnames = {
    "clerk"           = "frontend-api.clerk.services"
    "accounts"        = "accounts.clerk.services"
    "clkmail"         = "mail.t7p8kmgqlno0.clerk.services"
    "clk._domainkey"  = "dkim1.t7p8kmgqlno0.clerk.services"
    "clk2._domainkey" = "dkim2.t7p8kmgqlno0.clerk.services"
  }
}

resource "cloudflare_dns_record" "clerk" {
  for_each = local.clerk_cnames
  zone_id  = var.zone_id
  name     = "${each.key}.${var.hostname}"
  type     = "CNAME"
  content  = each.value
  proxied  = false
  ttl      = 1
}
