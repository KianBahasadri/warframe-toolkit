# Shared production state. Credentials are supplied in the environment.
terraform {
  backend "s3" {
    bucket = "warframe-toolkit-terraform"
    key    = "production/terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://3d463c39c94a3084cea36fc6ffde8931.r2.cloudflarestorage.com"
    }
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }
}
