#!/bin/bash

# =============================================================================
# Opik Helm Template Resolution Script
# =============================================================================
# This script resolves the helm-values-azure-nginx-template.yaml with all
# necessary environment variables without requiring the full deployment script.
#
# It reads from .env.azure-nginx and queries Azure to get authentication
# variables that would normally be populated during deployment.
#
# Usage:
#   ./resolve-helm-template.sh
#   ./resolve-helm-template.sh --output custom-values.yaml
# =============================================================================

set -e

# =============================================================================
# OUTPUT FORMATTING FUNCTIONS  
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to print colored output
print_step() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_header() {
    echo ""
    echo -e "${GREEN}===============================================${NC}"
    echo -e "${GREEN} $1${NC}"
    echo -e "${GREEN}===============================================${NC}"
}

# =============================================================================
# SCRIPT CONFIGURATION
# =============================================================================

# Default output file
OUTPUT_FILE="helm-values-resolved.yaml"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --output|-o)
            OUTPUT_FILE="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--output OUTPUT_FILE]"
            echo ""
            echo "Resolves helm-values-azure-nginx-template.yaml with all environment variables."
            echo ""
            echo "Options:"
            echo "  --output, -o FILE    Output file name (default: helm-values-resolved.yaml)"
            echo "  --help, -h          Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_header "Opik Helm Template Resolution Script"

# =============================================================================
# PREREQUISITES CHECK
# =============================================================================

print_step "🔍 Checking prerequisites"

# Check if helm-values-azure-nginx-template.yaml exists
if [ ! -f "helm-values-azure-nginx-template.yaml" ]; then
    print_error "helm-values-azure-nginx-template.yaml not found in current directory"
    print_info "Please run this script from the deployment directory"
    exit 1
fi

# Check if .env.azure-nginx exists
if [ ! -f ".env.azure-nginx" ]; then
    print_error ".env.azure-nginx not found in current directory"
    print_info "Please ensure .env.azure-nginx is present in the deployment directory"
    exit 1
fi

# Check if Azure CLI is installed and logged in
if ! command -v az &> /dev/null; then
    print_error "Azure CLI is not installed"
    exit 1
fi

# Check if logged into Azure
if ! az account show &> /dev/null; then
    print_error "Not logged into Azure CLI. Run 'az login' first"
    exit 1
fi

# Check if envsubst is installed (for environment variable substitution)
if ! command -v envsubst &> /dev/null; then
    print_error "envsubst is not installed"
    print_info "On macOS: brew install gettext && brew link --force gettext"
    print_info "On Ubuntu/Debian: apt-get install gettext-base"
    exit 1
fi

print_success "All prerequisites check passed"

# =============================================================================
# LOAD ENVIRONMENT VARIABLES FROM .env.azure-nginx
# =============================================================================

print_step "📋 Loading environment variables from .env.azure-nginx"

# Source the environment file
source .env.azure-nginx

# Validate required variables from .env.azure-nginx
REQUIRED_ENV_VARS=(
    "RESOURCE_GROUP"
    "ACR_NAME"
    "NAMESPACE"
    "DOMAIN_NAME"
    "OPIK_VERSION"
    "OPIK_APP_NAME"
    "ENABLE_AUTO_SSL"
)

for var in "${REQUIRED_ENV_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        print_error "Required variable $var is not set in .env.azure-nginx"
        exit 1
    fi
done

print_success "Loaded environment variables from .env.azure-nginx"

# =============================================================================
# DERIVE COMPUTED VARIABLES
# =============================================================================

print_step "🔧 Computing derived variables"

# ACR Login Server
export ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
print_info "ACR_LOGIN_SERVER: $ACR_LOGIN_SERVER"

# OPIK Host
export OPIK_HOST="$DOMAIN_NAME"
print_info "OPIK_HOST: $OPIK_HOST"

# SSL Configuration
if [ "${ENABLE_AUTO_SSL:-true}" = "true" ]; then
    export SSL_ENABLED="true"
    export SSL_ISSUER="letsencrypt-prod"
else
    export SSL_ENABLED="false"
    export SSL_ISSUER=""
fi
print_info "SSL_ENABLED: $SSL_ENABLED"
print_info "SSL_ISSUER: $SSL_ISSUER"

# Export basic variables that are set in .env.azure-nginx
export RESOURCE_GROUP
export NAMESPACE
export OPIK_VERSION

print_success "Derived variables computed"

# =============================================================================
# RETRIEVE AZURE AD AUTHENTICATION VARIABLES
# =============================================================================

print_step "🔐 Retrieving Azure AD authentication variables"

# Get tenant ID
TENANT_ID=$(az account show --query tenantId -o tsv)
if [ -z "$TENANT_ID" ] || [ "$TENANT_ID" = "null" ]; then
    print_error "Could not retrieve Azure tenant ID"
    exit 1
fi
export TENANT_ID
print_info "TENANT_ID: $TENANT_ID"

# Find App Registration
print_info "Looking for App Registration: $OPIK_APP_NAME"
APP_ID=$(az ad app list --display-name "$OPIK_APP_NAME" --query "[0].appId" -o tsv)

if [ -z "$APP_ID" ] || [ "$APP_ID" = "null" ]; then
    print_error "App Registration '$OPIK_APP_NAME' not found"
    print_info "Please ensure the app registration exists or run the full deploy script first"
    exit 1
fi
export APP_ID
print_info "APP_ID: $APP_ID"

# Try to get authentication variables from Kubernetes secrets (if available)
print_info "Attempting to retrieve authentication secrets from Kubernetes..."

# Check if kubectl is available and cluster is accessible
if command -v kubectl &> /dev/null && kubectl cluster-info &> /dev/null; then
    print_info "Kubernetes cluster is accessible, attempting to retrieve secrets"

    # Try to get OAuth2 proxy secrets
    if kubectl get secret opik-oauth2-proxy -n "$NAMESPACE" &> /dev/null; then
        CLIENT_SECRET=$(kubectl get secret opik-oauth2-proxy -n "$NAMESPACE" -o jsonpath='{.data.client-secret}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
        OAUTH2_COOKIE_SECRET=$(kubectl get secret opik-oauth2-proxy -n "$NAMESPACE" -o jsonpath='{.data.cookie-secret}' 2>/dev/null | base64 -d 2>/dev/null || echo "")
        
        # Check if secrets contain placeholder values (indicates they weren't properly resolved during deployment)
        # Also check if cookie secret is wrong length (OAuth2 proxy needs exactly 16, 24, or 32 bytes)
        if [[ "$CLIENT_SECRET" == *"CLIENT_SECRET"* ]] || [[ "$OAUTH2_COOKIE_SECRET" == *"OAUTH2_COOKIE_SECRET"* ]] || [ ${#OAUTH2_COOKIE_SECRET} -ne 32 ]; then
            print_warning "Kubernetes secret contains placeholder or invalid values, attempting to regenerate"
            if [ ${#OAUTH2_COOKIE_SECRET} -ne 32 ]; then
                print_warning "Cookie secret is ${#OAUTH2_COOKIE_SECRET} bytes, but OAuth2 proxy requires exactly 32 bytes"
            fi
            CLIENT_SECRET=""
            OAUTH2_COOKIE_SECRET=""
        elif [ -n "$CLIENT_SECRET" ] && [ -n "$OAUTH2_COOKIE_SECRET" ]; then
            print_success "Retrieved authentication secrets from Kubernetes"
            export CLIENT_SECRET
            export OAUTH2_COOKIE_SECRET
        else
            print_warning "Could not retrieve secrets from Kubernetes, they may be empty"
        fi
    else
        print_warning "OAuth2 proxy secret not found in Kubernetes"
    fi
else
    print_info "Kubernetes cluster not accessible, will prompt for secrets"
fi

# If we don't have CLIENT_SECRET, try to regenerate it from Azure
if [ -z "${CLIENT_SECRET:-}" ]; then
    print_warning "CLIENT_SECRET not found in Kubernetes secrets"
    print_info "Attempting to regenerate client secret from Azure App Registration"
    
    if [ -n "$APP_ID" ] && [ "$APP_ID" != "null" ]; then
        # Try to regenerate client secret
        CLIENT_SECRET=$(az ad app credential reset --id "$APP_ID" --query "password" -o tsv 2>/dev/null || echo "")
        
        if [ -n "$CLIENT_SECRET" ] && [ "$CLIENT_SECRET" != "null" ]; then
            export CLIENT_SECRET
            print_success "Regenerated client secret from Azure App Registration"
            print_warning "⚠️  New client secret generated - save this value securely!"
        else
            print_error "Failed to regenerate client secret from Azure"
            print_info "You have several options:"
            echo "  1. Run the full deploy-azure_nginx.sh script to setup authentication"
            echo "  2. Manually set CLIENT_SECRET environment variable"
            echo "  3. Continue with placeholder (template will have placeholder values)"
            echo ""
            read -p "Do you want to continue with placeholder values? [y/N]: " -r
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_info "Please run the deployment script first or set CLIENT_SECRET manually"
                exit 1
            fi
            
            export CLIENT_SECRET="\${CLIENT_SECRET_PLACEHOLDER}"
            print_warning "Using placeholder for CLIENT_SECRET"
        fi
    else
        print_error "APP_ID not available - cannot regenerate client secret"
        export CLIENT_SECRET="\${CLIENT_SECRET_PLACEHOLDER}"
        print_warning "Using placeholder for CLIENT_SECRET"
    fi
fi

# Generate OAuth2 cookie secret if not available
if [ -z "${OAUTH2_COOKIE_SECRET:-}" ]; then
    if command -v openssl &> /dev/null; then
        # Generate exactly 32 bytes for AES cipher (not base64 encoded)
        OAUTH2_COOKIE_SECRET=$(openssl rand -hex 16)
        export OAUTH2_COOKIE_SECRET
        print_info "Generated new OAuth2 cookie secret (32 bytes)"
    else
        export OAUTH2_COOKIE_SECRET="\${OAUTH2_COOKIE_SECRET_PLACEHOLDER}"
        print_warning "Using placeholder for OAUTH2_COOKIE_SECRET (openssl not available)"
    fi
fi

# Find Azure AD group for access control
print_info "Looking for Azure AD group: ${OPIK_ACCESS_GROUP_NAME:-Opik Users}"
if [ -n "${OPIK_ACCESS_GROUP_NAME:-}" ]; then
    OPIK_ACCESS_GROUP_ID=$(az ad group list --display-name "$OPIK_ACCESS_GROUP_NAME" --query "[0].id" -o tsv 2>/dev/null || echo "")
    
    if [ -n "$OPIK_ACCESS_GROUP_ID" ] && [ "$OPIK_ACCESS_GROUP_ID" != "null" ]; then
        export OPIK_ACCESS_GROUP_ID
        print_info "OPIK_ACCESS_GROUP_ID: $OPIK_ACCESS_GROUP_ID"
    else
        print_warning "Azure AD group '$OPIK_ACCESS_GROUP_NAME' not found"
        export OPIK_ACCESS_GROUP_ID="\${OPIK_ACCESS_GROUP_ID_PLACEHOLDER}"
    fi
else
    print_warning "OPIK_ACCESS_GROUP_NAME not specified in .env.azure-nginx"
    export OPIK_ACCESS_GROUP_ID="\${OPIK_ACCESS_GROUP_ID_PLACEHOLDER}"
fi

print_success "Azure AD authentication variables retrieved"

# =============================================================================
# VALIDATE ALL REQUIRED VARIABLES
# =============================================================================

print_step "✅ Validating all template variables"

# List of all variables required by the template
TEMPLATE_VARS=(
    "ACR_LOGIN_SERVER"
    "APP_ID" 
    "CLIENT_SECRET"
    "NAMESPACE"
    "OAUTH2_COOKIE_SECRET"
    "OPIK_ACCESS_GROUP_ID"
    "OPIK_HOST"
    "OPIK_VERSION"
    "RESOURCE_GROUP"
    "SSL_ENABLED"
    "SSL_ISSUER"
    "TENANT_ID"
)

print_info "Template variables status:"
for var in "${TEMPLATE_VARS[@]}"; do
    value="${!var}"
    if [ -n "$value" ]; then
        if [[ "$value" == *"PLACEHOLDER"* ]]; then
            print_warning "  $var: $value (placeholder)"
        else
            print_success "  $var: Set"
        fi
    else
        print_error "  $var: Not set"
        exit 1
    fi
done

print_success "All template variables validated"

# =============================================================================
# RESOLVE TEMPLATE
# =============================================================================

print_step "🔄 Resolving template variables"

# Create resolved template - only substitute specific environment variables
# This prevents envsubst from touching NGINX variables like $escaped_request_uri
envsubst '$ACR_LOGIN_SERVER,$APP_ID,$CLIENT_SECRET,$NAMESPACE,$OAUTH2_COOKIE_SECRET,$OPIK_ACCESS_GROUP_ID,$OPIK_HOST,$OPIK_VERSION,$RESOURCE_GROUP,$SSL_ENABLED,$SSL_ISSUER,$TENANT_ID' < helm-values-azure-nginx-template.yaml > "$OUTPUT_FILE"

# Verify the resolved template
if [ ! -f "$OUTPUT_FILE" ]; then
    print_error "Failed to create resolved template"
    exit 1
fi

# Check if any variables remain unresolved (except for escaped ones)
UNRESOLVED=$(grep -o '\$[A-Z_][A-Z_0-9]*' "$OUTPUT_FILE" | grep -v '\$escaped_request_uri' | sort -u || true)

if [ -n "$UNRESOLVED" ]; then
    print_warning "Some variables remain unresolved in the template:"
    echo "$UNRESOLVED"
    if [[ "$UNRESOLVED" == *"PLACEHOLDER"* ]]; then
        print_info "This is expected for placeholder values"
    else
        print_error "Unexpected unresolved variables found"
        exit 1
    fi
else
    print_success "All variables successfully resolved"
fi

# =============================================================================
# OUTPUT SUMMARY
# =============================================================================

print_header "Template Resolution Complete"

print_success "✅ Resolved template created: $OUTPUT_FILE"
print_info "📊 Template statistics:"
echo "  - File size: $(du -h "$OUTPUT_FILE" | cut -f1)"
echo "  - Line count: $(wc -l < "$OUTPUT_FILE")"

if [[ "$CLIENT_SECRET" == *"PLACEHOLDER"* ]] || [[ "$OAUTH2_COOKIE_SECRET" == *"PLACEHOLDER"* ]] || [[ "$OPIK_ACCESS_GROUP_ID" == *"PLACEHOLDER"* ]]; then
    print_warning "⚠️  Template contains placeholder values"
    print_info "To get actual values:"
    echo "  1. Run the full deploy-azure_nginx.sh script, or"
    echo "  2. Manually replace placeholder values in $OUTPUT_FILE"
else
    print_success "🎉 Template is ready for deployment with:"
    echo "  helm upgrade --install opik ./helm_chart/opik -n $NAMESPACE -f $OUTPUT_FILE"
fi

echo ""
print_info "You can now use this resolved template for Helm deployment or further customization"