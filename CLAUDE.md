# SpreadPaper website

## Internal links end in a slash

Pages build to directories (`/help/index.html`), and Cloudflare's `auto-trailing-slash` answers `/help` with a 307 to `/help/`. Every internal link, footer entry, nav item and 404 destination is written as `/help/`, never `/help`. A bare path works in the browser but sends every crawler through a redirect, which Ahrefs reports as "Page has links to redirect". Files keep their extension (`/favicon-32.png`). `npm test` checks every built page and fails on a link that redirects.
