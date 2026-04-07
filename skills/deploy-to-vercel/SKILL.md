---
name: deploy-to-vercel
description: >
  Deploy completed web applications to Vercel. Requires explicit user approval
  before every deployment. Never auto-deploy.
---

# Deploy to Vercel

Use this skill when a user asks you to deploy a completed web application, frontend, or static site to Vercel.

## CRITICAL: User Approval Required

**NEVER deploy without explicit user approval.** Before every deployment you MUST:

1. Present a clear summary of what will be deployed:
   - Project name and directory
   - Framework detected
   - Whether this is a new project or an update
   - Whether this will be a preview or production deploy
2. **Stop and wait** for the user to explicitly say "yes", "deploy it", "go ahead", or similar confirmation
3. If the user has not approved, do NOT run any `vercel` commands

This is non-negotiable. Even if the user previously said "deploy when ready", you must still confirm the specific deployment before executing it.

## Authentication

The Vercel token is available as `$VERCEL_TOKEN` in the environment. Always pass it explicitly:

```bash
vercel --token "$VERCEL_TOKEN" [commands...]
```

Never run `vercel login` — the token handles authentication.

## Deployment Workflow

### Step 1: Verify the build works locally

```bash
npm run build
# or: pnpm build / yarn build / bun run build
```

If the build fails, fix it first. Do not attempt to deploy broken code.

### Step 2: Preview deploy (always do this first)

```bash
vercel --token "$VERCEL_TOKEN" --yes
```

This creates a preview deployment with a unique URL. Share the preview URL with the user.

### Step 3: Production deploy (only after user approves the preview)

After the user reviews the preview and confirms they want to go to production:

```bash
vercel --token "$VERCEL_TOKEN" --prod --yes
```

**Always do preview first, then production.** Never skip straight to production.

## First-Time Project Setup

For new projects that haven't been deployed to Vercel before:

```bash
vercel link --token "$VERCEL_TOKEN" --yes
```

To deploy to a specific Vercel team/scope:

```bash
vercel --token "$VERCEL_TOKEN" --scope <team-slug> --yes
```

## Environment Variables

If the project needs env vars on Vercel:

```bash
echo "value" | vercel env add VAR_NAME production --token "$VERCEL_TOKEN"
```

Or configure via `vercel.json` in the project root.

## Framework Support

The Vercel CLI auto-detects frameworks — no extra config needed for:
- Next.js, Vite, React, Vue, Svelte, Nuxt, Astro, Remix, SvelteKit
- Static HTML sites

## Custom Domains

After a successful production deploy:

```bash
vercel alias set <deployment-url> <custom-domain> --token "$VERCEL_TOKEN"
```

## Error Handling

- **"No framework detected"** — ensure the project has a `package.json` or `index.html`
- **Auth errors** — verify `$VERCEL_TOKEN` is set: `echo $VERCEL_TOKEN | head -c 10`
- **Build fails on Vercel but works locally** — check all dependencies are in `package.json`, not just globally installed
- **Rate limits** — wait and retry, do not loop

## Rules Summary

1. **Always get user approval** before any deployment
2. Preview deploy first, production only after user confirms
3. Report the deployment URL immediately after deploy completes
4. Never retry failed deployments automatically — report the error and let the user decide
5. Never deploy if the local build is failing
