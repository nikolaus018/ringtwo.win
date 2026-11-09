# ringtwo.win

My homepage. Every project on it has something to play with.

```
server.py          stdlib-only Python server: serves site/, plus
                   /api/host     live CPU, RAM, temperature, uptime of the mini PC it runs on
                   /api/github   repo data for every project (cached, ETag'd, backs off on rate limits)
                   /api/commits  commit history per day and project (refreshed every 6 h)
site/projects.json all content: one entry per project, in page order
site/app.js        shell, overview, project pages, card previews
site/demos/<id>.js the toy for each project: export default function (el, ctx)
site/commits.json  fallback commit data, used until the server's cache is filled
tools/activity_svg.py  commit chart for the GitHub profile README
ship.py            deploy to the Venvy app "homepage"
```

## Adding a project

1. Add an entry to `site/projects.json`: `id`, `repo`, `name`, `color`, `kind`, `platform`, `status`,
   `one`, `why`, `toy {title, hint}`, `facts`, `story`, `details`, `media`, `stack`, `links`.
2. Write `site/demos/<id>.js` (look at `garagedoor-pro.js` for the pattern) and add a card preview to
   `PREVIEW` in `app.js`.
3. Images go in `site/img/` as WebP: `cwebp -q 82 -resize 1600 0 in.png -o site/img/x.webp`.
4. `python3 ship.py`. The server picks the new repo up for its GitHub data on its own.

## Deploying

```bash
python3 ship.py login    # once, password prompted
python3 ship.py setup    # once: switches the Venvy app from static to python/server.py, same port
python3 ship.py          # every deploy
```

Uploads never delete files on the server; remove stale ones in Venvy. Asset URLs carry a build version
(`?v=`), because Cloudflare tells browsers to keep `.css`/`.js` for 4 hours.
