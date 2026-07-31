#!/usr/bin/env bash
# ==============================================================================
# Render Dashboard Prep & Management Script for pure-nomad.github.io
# ==============================================================================
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

BOLD="\033[1m"
GREEN="\033[32m"
CYAN="\033[36m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

function log_info() {
  echo -e "${CYAN}[INFO]${RESET} $1"
}

function log_success() {
  echo -e "${GREEN}[SUCCESS]${RESET} $1"
}

function log_warn() {
  echo -e "${YELLOW}[WARN]${RESET} $1"
}

function log_error() {
  echo -e "${RED}[ERROR]${RESET} $1"
}

function print_usage() {
  echo -e "${BOLD}Render Dashboard Management & Prep Script${RESET}"
  echo ""
  echo "Usage: ./scripts/manage-render.sh [OPTION]"
  echo ""
  echo "Options:"
  echo "  --check          Run pre-flight checks for Render Blueprint & worker dependencies"
  echo "  --env-template   Output template of environment variables required for Render"
  echo "  --open           Open Render Dashboard in your default web browser"
  echo "  --help           Show this help message"
  echo ""
}

function run_checks() {
  echo -e "${BOLD}--- Render Pre-flight Verification ---${RESET}"
  
  # 1. Check render.yaml existence
  if [ -f "$REPO_DIR/render.yaml" ]; then
    log_success "render.yaml Blueprint found at repository root."
  else
    log_error "render.yaml missing! Create render.yaml before deploying to Render."
  fi

  # 2. Check Node environment
  if command -v node &> /dev/null; then
    log_success "Node.js version: $(node -v)"
  else
    log_error "Node.js is not installed."
  fi

  # 3. Check worker directory & package.json
  if [ -f "$REPO_DIR/worker/package.json" ]; then
    log_success "worker/package.json found."
  else
    log_error "worker/package.json missing."
  fi

  # 4. Check worker tests
  log_info "Running backend worker unit tests..."
  (cd "$REPO_DIR/worker" && npm test)
  log_success "All worker unit tests passed!"
}

function print_env_template() {
  echo -e "${BOLD}--- Render Dashboard Environment Variables ---${RESET}"
  echo "Copy these key-value pairs into your Render Web Service Environment settings:"
  echo ""
  cat << 'EOF'
ALLOWED_ORIGIN=https://pure-nomad.github.io
TO_EMAIL=cglascoe.jr@gmail.com
GMAIL_CLIENT_ID=<your-gmail-client-id>
GMAIL_CLIENT_SECRET=<your-gmail-client-secret>
GMAIL_REFRESH_TOKEN=<your-gmail-refresh-token>
EOF
  echo ""
}

function open_dashboard() {
  log_info "Opening Render Dashboard in browser..."
  if command -v open &> /dev/null; then
    open "https://dashboard.render.com/"
  elif command -v xdg-open &> /dev/null; then
    xdg-open "https://dashboard.render.com/"
  else
    log_warn "Could not auto-open browser. Please visit: https://dashboard.render.com/"
  fi
}

# --- CLI Argument Parsing ---
case "${1:-}" in
  --check)
    run_checks
    ;;
  --env-template)
    print_env_template
    ;;
  --open)
    open_dashboard
    ;;
  --help|-h)
    print_usage
    ;;
  "")
    run_checks
    echo ""
    print_env_template
    echo -e "${BOLD}Next Steps for Render Dashboard Deployment:${RESET}"
    echo "1. Go to https://dashboard.render.com/"
    echo "2. Click 'New +' -> 'Blueprint'"
    echo "3. Select repository 'pure-nomad.github.io'"
    echo "4. Supply the secret environment variables listed above when prompted."
    ;;
  *)
    log_error "Unknown option: $1"
    print_usage
    exit 1
    ;;
esac
