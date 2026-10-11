terraform {
  required_version = "= 1.16.5"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.27.0" }
  }
}

# Credentials come only from CLOUDFLARE_API_TOKEN, never Terraform variables.
provider "cloudflare" {}

variable "account_id" { type = string }
variable "zone_id" { type = string }
variable "hostname" {
  type    = string
  default = "bahasadri.com"
}
variable "existing_apex_record_id" {
  type    = string
  default = "dc887e7ed77bc60d13db709223741791"
}
variable "apex_cname" {
  type    = string
  default = "02fe8370-92dd-462b-bfd8-f16dc1bf2564.cfargotunnel.com"
}
variable "release" { type = string }

locals {
  root = abspath("${path.module}/../..")
  name = "warframe-toolkit"
}

# Adopt the existing record unchanged. The route serves all requests without
# contacting the tunnel; removing the route restores its previous destination.
import {
  to = cloudflare_dns_record.apex
  id = "${var.zone_id}/${var.existing_apex_record_id}"
}
resource "cloudflare_dns_record" "apex" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "CNAME"
  content = var.apex_cname
  proxied = true
  ttl     = 1
  lifecycle { prevent_destroy = true }
}

import {
  to = cloudflare_zone_setting.https
  id = "${var.zone_id}/always_use_https"
}
resource "cloudflare_zone_setting" "https" {
  zone_id    = var.zone_id
  setting_id = "always_use_https"
  value      = "on"
}

resource "cloudflare_d1_database" "accounts" {
  account_id       = var.account_id
  name             = "${local.name}-accounts"
  read_replication = { mode = "disabled" }
  lifecycle { prevent_destroy = true }
}

# Terraform owns schema deployment too. Wrangler only executes ordered SQL
# migrations against this Terraform-created D1 database; it deploys no resources.
resource "terraform_data" "schema" {
  triggers_replace = {
    database_id = cloudflare_d1_database.accounts.id
    migrations  = sha256(join("", [for file in sort(tolist(fileset("${local.root}/cloudflare/migrations", "*.sql"))) : filesha256("${local.root}/cloudflare/migrations/${file}")]))
    runner      = filesha256("${local.root}/scripts/cloudflare-migrate.mjs")
  }
  provisioner "local-exec" {
    working_dir = local.root
    command     = "node scripts/cloudflare-migrate.mjs"
    environment = {
      CLOUDFLARE_ACCOUNT_ID = var.account_id
      TOOLKIT_DATABASE_ID   = cloudflare_d1_database.accounts.id
    }
  }
}

resource "cloudflare_workers_script" "app" {
  account_id          = var.account_id
  script_name         = local.name
  main_module         = "worker.js"
  content_file        = "${local.root}/build/cloudflare/worker.js"
  content_sha256      = filesha256("${local.root}/build/cloudflare/worker.js")
  compatibility_date  = "2026-10-01"
  compatibility_flags = ["nodejs_compat"]
  assets = {
    directory = "${local.root}/dist"
    config = {
      not_found_handling = "single-page-application"
      run_worker_first   = ["/api/*"]
      headers            = <<-HEADERS
        /*
          X-Content-Type-Options: nosniff
          Referrer-Policy: no-referrer
          X-Frame-Options: DENY
      HEADERS
    }
  }
  bindings = [
    { name = "ASSETS", type = "assets" },
    { name = "DB", type = "d1", id = cloudflare_d1_database.accounts.id },
    { name = "ACCOUNTS", type = "durable_object_namespace", class_name = "AccountGateway" },
    { name = "DROPS", type = "durable_object_namespace", class_name = "DropTables" },
    { name = "ACCOUNTS_ORIGIN", type = "plain_text", text = "https://${var.hostname}" },
    { name = "RELEASE", type = "plain_text", text = var.release },
  ]
  migrations = {
    new_tag            = "v1"
    new_sqlite_classes = ["AccountGateway", "DropTables"]
  }
  depends_on = [terraform_data.schema]
  lifecycle { prevent_destroy = true }
}

resource "cloudflare_workers_cron_trigger" "drops" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.app.script_name
  # Clock ticks bootstrap without visitors and recover missed alarms. The
  # object checks next_attempt; upstream data is fetched at most once an hour.
  schedules = [{ cron = "*/5 * * * *" }]
}

resource "cloudflare_workers_script_subdomain" "app" {
  account_id       = var.account_id
  script_name      = cloudflare_workers_script.app.script_name
  enabled          = false
  previews_enabled = false
}

resource "cloudflare_workers_route" "app" {
  zone_id    = var.zone_id
  pattern    = "${var.hostname}/*"
  script     = cloudflare_workers_script.app.script_name
  depends_on = [cloudflare_dns_record.apex, cloudflare_zone_setting.https, cloudflare_workers_script_subdomain.app]
}

output "url" { value = "https://${var.hostname}" }
output "database_id" { value = cloudflare_d1_database.accounts.id }
output "worker_name" { value = cloudflare_workers_script.app.script_name }
