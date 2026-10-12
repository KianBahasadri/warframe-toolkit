# Private Terraform state shared by local deployments and GitHub Actions.
resource "cloudflare_r2_bucket" "terraform" {
  account_id    = var.account_id
  name          = "warframe-toolkit-terraform"
  jurisdiction  = "default"
  storage_class = "Standard"
  lifecycle { prevent_destroy = true }
}

resource "cloudflare_r2_managed_domain" "terraform" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.terraform.name
  enabled     = false
}
