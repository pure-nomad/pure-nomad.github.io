#!/usr/bin/env bash
# ==============================================================================
# GitHub Management & Deployment CLI Script for pure-nomad.github.io
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
  echo -e "${BOLD}GitHub Management Script — pure-nomad.github.io${RESET}"
  echo ""
  echo "Usage: ./scripts/manage-github.sh [OPTION]"
  echo ""
  echo "Options:"
  echo "  --check       Check local git status, recent commits, and GH CLI status"
  echo "  --deploy      Stage, commit, and push updates to main branch"
  echo "  --trigger     Trigger GitHub Actions Pages deployment workflow"
  echo "  --secrets     Guide/set GitHub repository secrets via gh CLI"
  echo "  --help        Show this help message"
  echo ""
}

function check_status() {
  echo -e "${BOLD}--- Git Repository Status ---${RESET}"
  git status --short
  echo ""
  echo -e "${BOLD}--- Current Branch & Remote ---${RESET}"
  git branch -vv | grep '^\*'
  echo ""
  echo -e "${BOLD}--- Recent Commits ---${RESET}"
  git log -n 3 --oneline
  echo ""

  if command -v gh &> /dev/null; then
    log_info "GitHub CLI (gh) detected. Checking auth status..."
    gh auth status || log_warn "gh CLI is installed but not authenticated. Run 'gh auth login' to connect."
  else
    log_warn "GitHub CLI (gh) is not installed. Install via 'brew install gh' for enhanced workflow controls."
  fi
}

function deploy_site() {
  log_info "Preparing deployment to GitHub Pages (main branch)..."
  
  if [ -z "$(git status --porcelain)" ]; then
    log_warn "Working directory is clean. No uncommitted changes to deploy."
    echo -n "Push latest commits to origin/main anyway? [y/N]: "
    read -r resp
    if [[ "$resp" =~ ^[Yy]$ ]]; then
      git push origin main
      log_success "Pushed latest commits to origin/main!"
    fi
    return
  fi

  echo -e "${BOLD}Modified files to commit:${RESET}"
  git status --short
  echo ""
  
  echo -n "Enter commit message (or press Enter for 'feat: site & worker updates'): "
  read -r msg
  if [ -z "$msg" ]; then
    msg="feat: site & worker updates"
  fi

  git add .
  git commit -m "$msg"
  log_info "Pushing to origin/main..."
  git push origin main
  log_success "Changes successfully pushed to main branch!"
  log_info "GitHub Actions will automatically deploy to GitHub Pages."
}

function trigger_workflow() {
  if ! command -v gh &> /dev/null; then
    log_error "GitHub CLI ('gh') is required for workflow triggering. Run 'brew install gh'."
    exit 1
  fi

  log_info "Triggering GitHub Actions Pages deployment workflow..."
  gh workflow run static.yml --ref main
  log_success "Workflow run requested successfully!"
  log_info "Viewing recent runs:"
  gh run list --workflow=static.yml --limit 3
}

function manage_secrets() {
  if ! command -v gh &> /dev/null; then
    log_error "GitHub CLI ('gh') is required to manage repository secrets."
    exit 1
  fi

  log_info "Managing repository secrets for GitHub..."
  echo "Available secret management options:"
  echo "1) Set WORKER_ENDPOINT secret"
  echo "2) List existing repository secrets"
  echo "3) Back"
  echo -n "Select option [1-3]: "
  read -r choice

  case "$choice" in
    1)
      echo -n "Enter Worker Endpoint URL: "
      read -r ep_url
      if [ -n "$ep_url" ]; then
        gh secret set WORKER_ENDPOINT --body "$ep_url"
        log_success "WORKER_ENDPOINT secret set successfully!"
      fi
      ;;
    2)
      gh secret list
      ;;
    *)
      log_info "Exiting secrets manager."
      ;;
  esac
}

# --- CLI Argument Parsing ---
case "${1:-}" in
  --check)
    check_status
    ;;
  --deploy)
    deploy_site
    ;;
  --trigger)
    trigger_workflow
    ;;
  --secrets)
    manage_secrets
    ;;
  --help|-h)
    print_usage
    ;;
  "")
    check_status
    echo ""
    echo -e "${BOLD}Select an action:${RESET}"
    echo "1) Stage, commit, and push to main"
    echo "2) Trigger GitHub Actions deployment workflow"
    echo "3) Manage repository secrets"
    echo "4) Exit"
    echo -n "Select option [1-4]: "
    read -r opt
    case "$opt" in
      1) deploy_site ;;
      2) trigger_workflow ;;
      3) manage_secrets ;;
      *) exit 0 ;;
    esac
    ;;
  *)
    log_error "Unknown option: $1"
    print_usage
    exit 1
    ;;
esac
