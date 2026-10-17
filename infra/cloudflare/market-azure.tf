provider "azurerm" {
  features {}
  # CI has access only to this app's resource group. Subscription registration
  # is a one-time prerequisite handled by the subscription owner.
  resource_provider_registrations = "none"
}

data "azurerm_client_config" "current" {}

locals {
  market_suffix = substr(sha256(data.azurerm_client_config.current.subscription_id), 0, 8)
  market_zip    = "../../build/azure-market-${trimspace(file("${local.root}/build/azure-market.sha256"))}.zip"
}

resource "azurerm_resource_group" "market" {
  name     = "warframe-toolkit-wfm"
  location = "eastus"
}

resource "azurerm_storage_account" "market" {
  name                            = "grakatawfm${local.market_suffix}"
  resource_group_name             = azurerm_resource_group.market.name
  location                        = azurerm_resource_group.market.location
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
}

resource "azurerm_service_plan" "market_consumption" {
  name                = "warframe-toolkit-wfm-consumption"
  resource_group_name = azurerm_resource_group.market.name
  location            = azurerm_resource_group.market.location
  os_type             = "Windows"
  sku_name            = "Y1"
}

resource "azurerm_windows_function_app" "market" {
  name                = "grakata-market-${local.market_suffix}"
  resource_group_name = azurerm_resource_group.market.name
  location            = azurerm_resource_group.market.location
  service_plan_id     = azurerm_service_plan.market_consumption.id

  storage_account_name       = azurerm_storage_account.market.name
  storage_account_access_key = azurerm_storage_account.market.primary_access_key
  # Azure disables executions after this daily compute quota is exhausted.
  # At $0.000016/GB-s, 31 full days are $2.48 before grants/credits, excluding
  # storage, bandwidth and invocation fees (bounded separately in Cloudflare).
  daily_memory_time_quota                  = 5000
  builtin_logging_enabled                  = false
  ftp_publish_basic_authentication_enabled = false
  https_only                               = true
  zip_deploy_file                          = local.market_zip
  app_settings = {
    WEBSITE_RUN_FROM_PACKAGE = "1"
  }
  site_config {
    always_on           = false
    app_scale_limit     = 1
    use_32_bit_worker   = false
    minimum_tls_version = "1.2"
    ftps_state          = "Disabled"
    application_stack { node_version = "~24" }
  }
}

data "azurerm_function_app_host_keys" "market" {
  name                = azurerm_windows_function_app.market.name
  resource_group_name = azurerm_resource_group.market.name
  depends_on          = [azurerm_windows_function_app.market]
}

# GitHub authenticates with an ephemeral OIDC token; no Azure password is stored.
resource "azurerm_user_assigned_identity" "deploy" {
  name                = "warframe-toolkit-deploy"
  resource_group_name = azurerm_resource_group.market.name
  location            = azurerm_resource_group.market.location
}

resource "azurerm_federated_identity_credential" "deploy" {
  name                      = "github-production"
  user_assigned_identity_id = azurerm_user_assigned_identity.deploy.id
  audience                  = ["api://AzureADTokenExchange"]
  issuer                    = "https://token.actions.githubusercontent.com"
  subject                   = "repo:KianBahasadri/warframe-toolkit:environment:production"
}

resource "azurerm_role_assignment" "deploy" {
  scope                = azurerm_resource_group.market.id
  role_definition_name = "Contributor"
  principal_id         = azurerm_user_assigned_identity.deploy.principal_id
  principal_type       = "ServicePrincipal"
}

output "azure_client_id" { value = azurerm_user_assigned_identity.deploy.client_id }
output "azure_tenant_id" { value = data.azurerm_client_config.current.tenant_id }
output "azure_subscription_id" { value = data.azurerm_client_config.current.subscription_id }
