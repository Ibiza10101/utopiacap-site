# Utopia Capital Research — site rebuild

Static rebuild of utopiacap.com (live July 2019 – May 2021), recovered from
the Wayback Machine. Built with [Eleventy](https://11ty.dev), hosted free on
GitHub Pages — no server, no database, no hosting cost.

## Structure

- `scripts/classify.mjs` — reads a Wayback CDX export (`scripts/cdx.json`,
  not committed) and sorts archived URLs into blog posts vs. static pages,
  writing `scripts/posts.json` / `scripts/pages.json`.
- `scripts/recover.mjs` — fetches each archived page/post, strips the
  Wayback toolbar and the old theme's page-builder scaffolding, and writes
  clean Markdown into `src/posts/*.md` (posts) and `src/*.md` (pages).
  Idempotent — re-running skips anything already recovered
  (`scripts/recover.state.json`, not committed); delete that file to force
  a re-fetch. Rate-limited to ~1 request every 3s to stay polite to
  archive.org.
- `src/` — the actual Eleventy site source (layouts in `_includes/`).

## Local development

```
npm install
npm run build      # outputs to _site/
npm run serve       # local dev server with live reload
```

## Re-running the content recovery

Only needed if you want to re-pull from archive.org (e.g. a page was
skipped or extracted badly the first time):

```
npm run recover
```

Env vars: `RECOVER_LIMIT=N` to cap how many items it processes,
`RECOVER_SKIP_PAGES=1` to do posts only.

## Deploying

`.github/workflows/deploy.yml` builds and deploys to GitHub Pages on every
push to `main`. One-time setup in the repo's GitHub settings:

1. Settings → Pages → Source → "GitHub Actions".
2. Settings → Pages → Custom domain → `utopiacap.com` → Save (this also
   writes the `CNAME` file check, which `src/CNAME` already provides).
3. At your DNS provider for utopiacap.com (currently Automattic/WordPress.com
   — you may need to switch nameservers or just edit DNS there), add:
   - Four `A` records for the apex domain pointing at GitHub Pages:
     `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - (Optional) a `CNAME` record for `www` pointing at
     `<your-github-username>.github.io`
4. Wait for DNS propagation, then check "Enforce HTTPS" in the Pages
   settings once GitHub issues the certificate.

No step in this requires a paid plan.
