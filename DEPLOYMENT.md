# Deployment & Operations Guide

This guide covers deployment instructions for the **pure-nomad.github.io** site and its backend services across **GitHub Pages**, **Cloudflare Workers**, and **Render Dashboard**.

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [GitHub Pages Deployment (Frontend)](#1-github-pages-deployment-frontend)
   - [Automated Deployment (GitHub Actions)](#automated-deployment-github-actions)
   - [Manual Deployment Script (`scripts/manage-github.sh`)](#manual-deployment-script-scriptsmanage-githubsh)
3. [Cloudflare Workers Deployment (Primary Backend)](#2-cloudflare-workers-deployment-primary-backend)
   - [KV Namespace & Secret Setup](#kv-namespace--secret-setup)
   - [Deploying with Wrangler](#deploying-with-wrangler)
4. [Render Dashboard Deployment (Alternative Backend)](#3-render-dashboard-deployment-alternative-backend)
   - [Blueprint Deployment (`render.yaml`)](#blueprint-deployment-renderyaml)
   - [Render Prep Script (`scripts/manage-render.sh`)](#render-prep-script-scriptsmanage-rendersh)
5. [Troubleshooting & Environment Verification](#5-troubleshooting--environment-verification)

---

## Architecture Overview

```
                                  ┌──────────────────────────────────────────┐
                                  │            GitHub Pages                  │
                                  │       https://pure-nomad.github.io       │
                                  └────────────────────┬─────────────────────┘
                                                       │
                                        ┌──────────────┴──────────────┐
                                        │                             │
                                        ▼                             ▼
                        ┌───────────────────────────┐   ┌───────────────────────────┐
                        │    Cloudflare Worker      │   │    Render Web Service     │
                        │ (Primary Contact/Survey)  │   │   (Alternative API Host)  │
                        └──────────────┬────────────┘   └─────────────┬─────────────┘
                                       │                              │
                                       └──────────────┬───────────────┘
                                                      ▼
                                            Gmail API / Notification
```

---

## 1. GitHub Pages Deployment (Frontend)

### Automated Deployment (GitHub Actions)
The repository is configured with a GitHub Actions workflow in `.github/workflows/static.yml`. Any push to the `main` branch automatically builds and deploys the static files (`index.html`, `survey.html`, assets) to GitHub Pages.

1. Commit and push your changes to `main`:
   ```bash
   git add .
   git commit -m "feat: update site"
   git push origin main
   ```
2. Monitor deployment status under the **Actions** tab on GitHub.

### Manual Deployment Script (`scripts/manage-github.sh`)
You can use the included CLI management script to check repository status, stage/commit changes, trigger GitHub Actions workflows, or set repository secrets:

```bash
# Run status check
./scripts/manage-github.sh --check

# Interactive deployment helper
./scripts/manage-github.sh
```

**Script Capabilities:**
- `--check`: Displays current git status, recent commits, and active branch info.
- `--deploy`: Guides staging, committing, and pushing to `main`.
- `--trigger`: Triggers the GitHub Actions `static.yml` workflow via GitHub CLI (`gh`).
- `--secrets`: Helper for setting repository secrets using `gh secret set`.

---

## 2. Cloudflare Workers Deployment (Primary Backend)

The backend Worker handles rate limiting, honeypot protection, validation, and email delivery via Gmail API.

### KV Namespace & Secret Setup
Navigate to the `worker/` directory and authenticate with Cloudflare:

```bash
cd worker
npx wrangler login

# Create KV Namespace for rate limiting
npx wrangler kv:namespace create RATE_LIMIT
```

Copy the returned `id` and update `worker/wrangler.toml`:
```toml
kv_namespaces = [
  { binding = "RATE_LIMIT", id = "YOUR_KV_NAMESPACE_ID" }
]
```

Configure your Gmail OAuth secrets in Cloudflare Workers:
```bash
npx wrangler secret put GMAIL_CLIENT_ID
npx wrangler secret put GMAIL_CLIENT_SECRET
npx wrangler secret put GMAIL_REFRESH_TOKEN
```

### Deploying with Wrangler
```bash
npx wrangler deploy
```
Once deployed, copy the Worker URL (e.g. `https://signal-check-survey.cglascoe-jr.workers.dev`) and ensure `index.html` and `survey.html` reference this endpoint.

---

## 3. Render Dashboard Deployment (Alternative Backend)

If you prefer to host the backend or API on Render instead of Cloudflare Workers, use the Render Dashboard Blueprint.

### Blueprint Deployment (`render.yaml`)
A `render.yaml` Blueprint file is located at the root of the repository.

1. Log into your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub repository (`pure-nomad.github.io`).
4. Render will automatically detect `render.yaml` and configure the service.
5. In the Render Dashboard, fill in the required environment variables:
   - `GMAIL_CLIENT_ID`
   - `GMAIL_CLIENT_SECRET`
   - `GMAIL_REFRESH_TOKEN`
   - `TO_EMAIL` (`cglascoe.jr@gmail.com`)
   - `ALLOWED_ORIGIN` (`https://pure-nomad.github.io`)
6. Click **Apply** to deploy.

### Render Prep Script (`scripts/manage-render.sh`)
Use the Render prep script to validate your environment and `render.yaml` blueprint before deploying:

```bash
# Run pre-flight check
./scripts/manage-render.sh --check

# Interactive Render prep helper
./scripts/manage-render.sh
```

**Script Capabilities:**
- `--check`: Validates Node environment, dependencies, and `render.yaml` syntax.
- `--env-template`: Displays required environment variable key/value template.
- `--open`: Opens the Render Dashboard in your browser.

---

## 5. Troubleshooting & Environment Verification

### Testing Worker Backend Locally
Run unit tests inside the `worker` directory:
```bash
cd worker
npm test
```

Start Wrangler local dev server:
```bash
cd worker
npm run dev
```

### Frontend Overrides
You can override the backend endpoint dynamically on `index.html` or `survey.html` in the browser console or prior to script load:
```js
window.CONTACT_ENDPOINT = "http://localhost:8787/contact";
window.SURVEY_ENDPOINT = "http://localhost:8787/survey";
```
