# SpreadPaper website

The marketing site for [SpreadPaper](https://github.com/spreadpaper/SpreadPaper), live at **[spreadpaper.app](https://spreadpaper.app/)**.

Astro, Tailwind CSS v4, TypeScript. One static page, deployed to Cloudflare Workers.

## Running it

```bash
npm ci
npm run dev      # Local dev server
npm run build    # Static build to dist/
npm run preview  # Serve the built site
```

Node 24 or later. The rig scripts and the page test are TypeScript run straight through Node's own type stripping, so there is no build step for them and no `tsx`.

TypeScript is held at 6.x: `astro check` needs the programmatic compiler API, which TypeScript 7's native compiler does not expose yet ([tracking](https://github.com/withastro/roadmap/discussions/1321)).

## Checks

```bash
npm run check       # astro check, types across .astro and .ts
npm run rigs:check  # every drawn monitor rig against its geometry source
npm test            # build, rig check, then the built page
```

## Layout

| Path | What lives there |
|---|---|
| `src/pages/` | The routes: the front page and the 404 |
| `src/layouts/Layout.astro` | Document head, metadata, JSON-LD, the script tag |
| `src/components/sections/` | The page's sections, one file each |
| `src/components/Icon.astro` | Inlines one Phosphor glyph at build time |
| `src/scripts/main.ts` | Nav, scrollspy, reveal, copy, sliders, tabs, clock phase |
| `src/styles/` | `style.css` (Cool Dark tokens) and `rigs.css` (the drawn monitors) |
| `scripts/` | Rig geometry and the generators and checker that hang off it |
| `public/` | Photographs, favicons, the social card, `robots.txt` |

## The monitor rigs

Every drawn display on the page comes from one source of truth, `scripts/rigs.ts`. `RIGS.md` and `rigs-preview.html` are generated from it — run `npm run rigs` after changing geometry, never edit either by hand. `npm run rigs:check` is what stops a clip rect and the frame rect that traces it from drifting apart, which fails silently in a browser.

`DESIGN.md` is the art direction, and explains why the monitors are drawn as monitors.

## Deployment

Pushes to `main` build and deploy to Cloudflare Workers via `.github/workflows/deploy.yml`. Static assets are served directly from Cloudflare's asset store; there is no Worker script, and asset requests are not billed.

Releases are managed by release-please, which opens a PR that bumps the version and writes `CHANGELOG.md` from conventional commits.

To deploy by hand:

```bash
npm run deploy
```

That needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the environment.

## Photography

The photographs are from Unsplash under the Unsplash Licence, and are the ones the app itself ships with. Each is credited in place on the page; the full list with sources is in the app repository's `CREDITS.md`.

## Licence

MIT, same as the app. See `LICENSE`.
