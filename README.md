# ringtwo.win

Source of the former ringtwo.win project homepage. The site is no longer served:
`ringtwo.win` redirects to [github.com/nikolaus018](https://github.com/nikolaus018).
Other services still run on `*.ringtwo.win` subdomains.

## Layout

```
server.py          stdlib-only Python server: serves site/, plus
                   /api/host     CPU, RAM, temperature and uptime of the host
                   /api/github   repository data per project (cached, ETag, rate-limit back-off)
                   /api/commits  commit history per day and project (refreshed every 6 h)
site/projects.json content: one entry per project, in page order
site/app.js        shell, overview, project pages, card previews
site/demos/<id>.js interactive demo per project: export default function (el, ctx)
site/commits.json  fallback commit data until the server cache is filled
tools/activity_svg.py  commit-activity chart generator
ship.py            deploy to the Venvy app "homepage"
```

## Deploying

```bash
python3 ship.py login    # once, password prompted
python3 ship.py setup    # once: switches the Venvy app from static to python/server.py, same port
python3 ship.py          # every deploy
```

Uploads never delete files on the server. Asset URLs carry a build version (`?v=`)
because Cloudflare tells browsers to cache `.css` and `.js` for 4 hours.
