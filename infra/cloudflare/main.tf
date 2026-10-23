terraform {
  required_version = "= 1.16.5"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "= 5.27.0" }
    azurerm    = { source = "hashicorp/azurerm", version = "= 5.10.0" }
  }
}

# Credentials come only from CLOUDFLARE_API_TOKEN, never Terraform variables.
provider "cloudflare" {}

variable "account_id" { type = string }
variable "zone_id" { type = string }
variable "hostname" {
  type    = string
  default = "grakata.com"
}
variable "release" { type = string }
variable "clerk_jwt_key" {
  type    = string
  default = ""
}

locals {
  root = abspath("${path.module}/../..")
  name = "warframe-toolkit"
}

# Drop the records adopted from the previous zone without calling its API.
removed {
  from = cloudflare_dns_record.apex
  lifecycle { destroy = false }
}
removed {
  from = cloudflare_zone_setting.https
  lifecycle { destroy = false }
}

# Proxied placeholder. The app route matches every request, so Cloudflare
# never contacts this address.
resource "cloudflare_dns_record" "app" {
  zone_id = var.zone_id
  name    = var.hostname
  type    = "A"
  content = "192.0.2.1"
  proxied = true
  ttl     = 1
}

resource "cloudflare_zone_setting" "app_https" {
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
      html_handling       = "none"
      not_found_handling = "none"
      run_worker_first   = ["/api/*", "/", "/index.html", "/weapons", "/weapons/", "/warframes", "/warframes/", "/relics", "/relics/", "/droptables", "/droptables/", "/crafting", "/crafting/", "/modder", "/modder/", "/import", "/import/"]
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
    { name = "CLERK_JWT_KEY", type = "plain_text", text = var.clerk_jwt_key },
    { name = "RELEASE", type = "plain_text", text = var.release },
    { name = "WFM_RELAY_URL", type = "plain_text", text = "https://${azurerm_windows_function_app.market.default_hostname}" },
    { name = "WFM_RELAY_KEY", type = "secret_text", text = data.azurerm_function_app_host_keys.market.default_function_key },
  ]
  migrations = {
    # Both SQLite namespaces were provisioned by v1. The provider sends this
    # block on every update, so later uploads must preserve the existing tag
    # without replaying namespace creation.
    old_tag = "v1"
    new_tag = "v1"
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

resource "cloudflare_workers_route" "primary" {
  zone_id    = var.zone_id
  pattern    = "${var.hostname}/*"
  script     = cloudflare_workers_script.app.script_name
  depends_on = [cloudflare_dns_record.app, cloudflare_zone_setting.app_https, cloudflare_workers_script_subdomain.app]
}

output "url" { value = "https://${var.hostname}" }
output "database_id" { value = cloudflare_d1_database.accounts.id }
output "worker_name" { value = cloudflare_workers_script.app.script_name }
