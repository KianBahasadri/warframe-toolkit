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

resource "azurerm_storage_container" "market" {
  name                  = "function-releases"
  storage_account_id    = azurerm_storage_account.market.id
  container_access_type = "private"
}

resource "azurerm_service_plan" "market" {
  name                = "warframe-toolkit-wfm"
  resource_group_name = azurerm_resource_group.market.name
  location            = azurerm_resource_group.market.location
  os_type             = "Linux"
  sku_name            = "FC1"
}

resource "azurerm_function_app_flex_consumption" "market" {
  name                = "grakata-wfm-${local.market_suffix}"
  resource_group_name = azurerm_resource_group.market.name
  location            = azurerm_resource_group.market.location
  service_plan_id     = azurerm_service_plan.market.id

  storage_container_type      = "blobContainer"
  storage_container_endpoint  = "${azurerm_storage_account.market.primary_blob_endpoint}${azurerm_storage_container.market.name}"
  storage_authentication_type = "StorageAccountConnectionString"
  storage_access_key          = azurerm_storage_account.market.primary_access_key
  runtime_name                = "node"
  runtime_version             = "24"
  instance_memory_in_mb       = 512
  maximum_instance_count      = 1
  http_concurrency            = 1
  https_only                  = true
  zip_deploy_file             = local.market_zip
  app_settings = {
    AzureWebJobsStorage = azurerm_storage_account.market.primary_connection_string
  }
  # No always_ready block: scale to zero when the shared cache needs no requests.
  site_config { minimum_tls_version = "1.2" }
}

data "azurerm_function_app_host_keys" "market" {
  name                = azurerm_function_app_flex_consumption.market.name
  resource_group_name = azurerm_resource_group.market.name
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
