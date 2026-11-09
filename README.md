# ringtwo.win

My homepage. Static files in `site/`, served by [Venvy](https://github.com/nikolaus018/venvy) on a mini PC at home.

## Adding a project

1. Add an entry to `site/projects.json`. Its position in the list is its position on the page.

   | field | what |
   |---|---|
   | `id` | URL slug: `ringtwo.win/#/<id>` |
   | `repo` | GitHub repo name. Commit counts and live data come from it |
   | `name`, `color`, `kind`, `platform`, `status` | sidebar, cards, header tag |
   | `one` | one sentence: what it is |
   | `why` | why I built it, in my words (optional) |
   | `what` | two sentences under the title |
   | `facts` | `[["big", "small"], …]`: the number grid |
   | `story` | paragraphs for "How it works" (`<b>`, `<code>` allowed) |
   | `details` | short bullet facts (optional) |
   | `media` | `{ "type": "wide" \| "phones" \| "render", "items": [[src, w, h, caption], …] }` (optional) |
   | `demo` | name of an interactive block in `app.js` → `DEMOS` (optional) |
   | `stack`, `links` | chips, and `[label, url]` buttons (the first one is primary) |

2. Put the images in `site/img/` (WebP: `cwebp -q 82 -resize 1600 0 in.png -o site/img/x.webp`).
3. Refresh the commit data and the GitHub profile chart:
   ```bash
   python3 tools/activity_svg.py path/to/nikolaus018-profile-repo
   ```
4. Deploy: `python3 ship.py`. It uploads `site/` to the Venvy app `homepage` and restarts it.
   Uploads never delete files on the server, so a removed image stays there until deleted in Venvy.

The intro text is `intro` in `projects.json`. `{age}` in it is worked out from `born`.
