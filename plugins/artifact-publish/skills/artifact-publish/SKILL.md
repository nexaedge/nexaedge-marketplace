---
name: artifact-publish
description: >-
  Publish a self-contained HTML file as an artifact on artifacts.nexaedge.com and return the
  link. This is the default way to publish HTML from any folder: report, proposal, dashboard,
  comparison, document. Use whenever someone asks to publish, share, send a link to, deliver
  or upload an HTML file for another person to open.
---

# Publish an artifact

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/publish.py" <file.html>
python3 "${CLAUDE_SKILL_DIR}/scripts/publish.py" <file.html> --as <domain>
```

Prints the link and opens it in the browser. Standard library only: no venv, no package install, no cloud credential.

The first run per account opens a browser to sign in with Google. After that the refresh token stays in `~/.config/nexaedge/artifact-share/<domain>.json` (mode 600) and nothing is asked again.

| | |
|---|---|
| `--as <domain>` | account that publishes (default: the configured one, or the only one signed in) |
| `--share 7` | also return a link that opens **without sign-in**, expiring in N days (max 30) |
| `--slug name` | folder on the server (default: the file's folder) |
| `--no-open` | do not open the browser |
| `--whoami` | show the signed-in account (accepts `--as`) |
| `--relogin` | sign in again, to switch accounts |

A first argument that is a command name (`list`, `info`, `get`, `rm`, `redirect`, `share`, `state`) runs that command instead of publishing. See [Managing what is published](#managing-what-is-published).

## Pick the account before publishing

**The account decides who can open it.** The artifact belongs to the domain of the account that published it, and only accounts of that domain get in. Getting this wrong raises no error: it produces a link the intended reader cannot open.

- Material that belongs to a client or to another company of yours: publish with **that** domain's account, via `--as`.
- Everything else: the default account.
- **When it is not clear whose subject it is, ask instead of choosing.** That is cheaper than republishing elsewhere and replacing a link already sent.

Run `--whoami` when unsure which account is active.

## People outside the domain

Anyone without an account on that domain **cannot open the normal link**: they land on a sign-in screen that does nothing for them. For those, use `--share N`, which returns a link with no sign-in and an expiry date. It expires on its own and cannot be revoked one by one, so prefer a short window.

## The title is the artifact's name

The HTML `<title>` becomes the name in the listing, in the tab of whoever opens it, and in how the link is referred to. Write what the document is, with its scope (`Q3 pipeline review · Jul 2026`), **never the file name**: an artifact called "index" or "report" cannot be found later. The script warns when the title is one of those, and publishes anyway.

Wrong title after publishing: open the link, click the title in the top bar, edit, press Enter. Only whoever published sees the field, and renaming neither republishes nor changes the date.

## Before publishing

Prefer **self-contained**: CSS, JS and data inside the file, images as data URIs. External resources do load — a CDN script, a webfont, an image by URL, a cross-origin `fetch` — so this is a recommendation, not a limit the service imposes. An artifact is a frozen copy that has to open weeks after the link went out, and a CDN that moves takes the page with it, a network that blocks the host renders it wrong, and every open tells whoever serves the asset who is reading.

What the isolated origin (`sandbox allow-scripts`, no `allow-same-origin`) does cost is anything tied to an origin: **`localStorage`, `sessionStorage` and cookies are unavailable**, so a page cannot remember anything between visits. The document's own JavaScript runs normally, canvas and blob downloads included.

Publishing again with the same path overwrites it, and the link stays the same.

## Managing what is published

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/publish.py" list
python3 "${CLAUDE_SKILL_DIR}/scripts/publish.py" redirect cerc/old.html cerc/new.html
```

Every command takes `--as <domain>`, with the same account resolution as publishing. A `<page>` is a path in the account's domain (`cerc/plan.html`), a key (`acme.com/cerc/plan.html`) or the page's address on the service (`https://artifacts.nexaedge.com/a/acme.com/cerc/plan.html`; the `/raw/` and `/c/` forms of the address name the same page). A share link (`/s/<token>`) names no page and is refused. A key or an address names its domain, which picks the account when `--as` is absent; a domain that contradicts `--as` is an error.

| Command | What it does |
|---|---|
| `list [--json]` | what this account published, newest first: date (local time, with the zone), title, path, and the size, or `→ target` for a redirect |
| `info <page> [--json]` | address, owner, update date, size and how many people saved state on it |
| `get <page> [-o FILE]` | the page's HTML, to a file or to stdout |
| `rm <page> [--with-state]` | remove a page |
| `redirect <page> <target>` | make `<page>`'s address lead to `<target>`: a page of the same domain (path, key or address); a target on another domain or a URL is refused; prints old address → new address |
| `share <page> --days 7\|30` or `--forever` | a link that opens without sign-in; `--forever` has no expiry |
| `state <page> [-o FILE]` | what people saved on the page, as JSON, for every participant |

**When to use which:**

- **A page moved or was replaced by another: `redirect` at its old path.** Links already sent keep working, and the person who opens one lands on the current page. Publish the new page first: the target is always a page of the same domain.
- **`rm` is for what has nowhere to go.** A page that has a successor gets a redirect, not a removal.
- **Removing a page people saved state on needs `--with-state`.** Without it the service refuses and the command says how many people saved state; the flag deletes that state together with the page. Ask before using it: it cannot be undone.
- **After `rm`, read the warnings.** Each one names a redirect that pointed at the removed page and now leads nowhere: point it elsewhere with `redirect` or remove it.
- **`list` first** when the task is to clean up or to find what a path was: it shows redirects and sizes, and `info` shows who saved state before an `rm`.
- `get` brings a published page back to a file to edit and republish; `state` exports what people answered.

## Configuration (optional)

`~/.config/nexaedge/artifacts.json`, every key optional:

```json
{
  "service": "https://artifacts.nexaedge.com",
  "default_domain": "acme.com",
  "accounts": {"acme.com": "you@acme.com"}
}
```

`accounts` only preselects the account on Google's screen. `default_domain` is what publishes without `--as`. With a single account signed in, no configuration is needed at all.

## When not to publish

An HTML file only the user will look at right now does not need to become an artifact: write it in the project folder and open it locally. Publishing is for when the document has to leave the machine.
