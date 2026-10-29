# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Preview for review (plan §3)

`scripts/export-preview.sh` runs rig on `127.0.0.1` and saves `/digest/2026-10-28` as one
self-contained HTML file at `var/preview/index.html` (gitignored). It refuses to publish a 404,
a script tag or an external reference. It stops the server it started on exit.

```sh
scripts/export-preview.sh clean    # default: banner reads "no marker set"
LANE_MARKER=... scripts/export-preview.sh marker   # for the review copy only
```

Publishing is `.github/workflows/preview.yml`, manual (`workflow_dispatch`) only, with
`include_marker` defaulting to `false`. The artifact is not git: it is kept one day, and only
`var/preview` is uploaded. Never commit the generated HTML, never put it in issues or chat
attachments: there the marker can't be taken off again (ADR 0003).

- **Review copy:** run with `include_marker: true`, send the link and the plan's issues.
- **Clean-up:** run again with `include_marker` unset. It replaces the page at the same URL.
  This must happen after the review is in: the marker-free build removes the reviewer's copy.
- Pages must be configured by a human before the first run; the workflow does not enable it.
