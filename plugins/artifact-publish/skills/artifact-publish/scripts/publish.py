#!/usr/bin/env python3
"""Publish a self-contained HTML file as an artifact, and manage what is published.

    publish.py report.html                 publish with the default account
    publish.py report.html --as acme.com   publish as another domain's account
    publish.py report.html --share 7       also return a link that needs no login
    publish.py report.html --slug proposal force the folder on the server
    publish.py --whoami [--as acme.com]    show the signed-in account
    publish.py --logout [--as acme.com]    forget the account on this machine

    publish.py list [--json]               what this account published, newest first
    publish.py info <page> [--json]        one page: address, owner, size, saved state
    publish.py get <page> [-o FILE]        download its HTML
    publish.py rm <page> [--with-state]    remove it (and the state people saved on it)
    publish.py redirect <page> <target>    make an old address lead to a new one
    publish.py share <page> --days 7|30    a link that needs no login (--forever: no expiry)
    publish.py state <page> [-o FILE]      what people saved on the page, as JSON

A <page> is a path in the account's domain (cerc/plan.html), a key
(acme.com/cerc/plan.html) or the page's address on the service (/a/, /raw/ or
/c/). A key or an address names its domain, which picks the account when --as
is absent. A redirect <target> is a page of the same domain, in the same forms.

THE ACCOUNT DECIDES WHO CAN OPEN IT. An artifact belongs to the domain of the
Google account that published it, and only accounts of that domain can open it.
Publishing a client's material under your own domain leaves the client out of it.

Standard library only, on purpose: this ships as a plugin and cannot depend on
any project's environment. Authorization is a Google sign-in, not a cloud
credential: the first run per account opens a browser, then the refresh token
stays on this machine with mode 600.

Optional config at ~/.config/nexaedge/artifacts.json — every key is optional:

    {
      "service": "https://artifacts.nexaedge.com",
      "default_domain": "acme.com",
      "accounts": {"acme.com": "you@acme.com"}
    }

`accounts` only preselects the account on Google's screen. `default_domain` is
the account used without `--as`; with a single account signed in, that one wins
and no config is needed at all.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import http.server
import json
import os
import re
import secrets
import stat
import sys
import threading
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from collections.abc import Callable
from datetime import datetime, timezone, tzinfo
from pathlib import Path
from typing import Any, NamedTuple

CONFIG_FILE = Path.home() / ".config" / "nexaedge" / "artifacts.json"
SESSION_DIR = Path.home() / ".config" / "nexaedge" / "artifact-share"
DEFAULT_SERVICE = "https://artifacts.nexaedge.com"

TIMEOUT = 30
LOGIN_TIMEOUT = 300
CONTENT_TYPE = "text/html; charset=utf-8"

# Cloudflare rejects urllib's default User-Agent ("Python-urllib/3.x") with error
# 1010, the browser integrity check. Identifying ourselves fixes it, and is the
# right thing anyway: whoever reads the service log deserves to know who called.
USER_AGENT = "artifact-publish/1.0 (+https://artifacts.nexaedge.com)"

_TITLE = re.compile(r"<title[^>]*>(.*?)</title>", re.IGNORECASE | re.DOTALL)

# Names that name a file, not a document. Publishing under one of these means
# publishing something nobody finds again in the listing.
_DULL = {"index", "report", "untitled", "document", "page", "output"}


class Failure(RuntimeError):
    """Failed in a way the user needs to read, without a traceback."""


# --- configuration -----------------------------------------------------------


def config() -> dict[str, Any]:
    if not CONFIG_FILE.exists():
        return {}
    try:
        return json.loads(CONFIG_FILE.read_text())
    except (OSError, ValueError) as exc:
        raise Failure(f"{CONFIG_FILE} is not readable JSON: {exc}") from exc


def service_url() -> str:
    return str(
        os.environ.get("ARTIFACTS_SERVICE") or config().get("service") or DEFAULT_SERVICE
    ).rstrip("/")


class Account(NamedTuple):
    domain: str
    """Sign-in hint, when the config knows the address. Empty is fine."""
    email: str = ""

    @property
    def session_file(self) -> Path:
        # One file per domain. The service hosts several domains, and a single
        # file would silently publish the next artifact under the previous
        # account's domain, which is who gets to read it.
        return SESSION_DIR / f"{self.domain}.json"


def signed_in_domains() -> list[str]:
    if not SESSION_DIR.is_dir():
        return []
    return sorted(p.stem for p in SESSION_DIR.glob("*.json"))


def pick_account(asked: str | None) -> Account:
    """`--as`, then the configured default, then the only account signed in.

    With none of those it returns an empty domain, and the sign-in runs without
    a domain hint: whichever corporate account the person picks defines it. That
    is what makes the first run work with no configuration.
    """
    accounts = {str(k).lower(): str(v) for k, v in (config().get("accounts") or {}).items()}

    if asked:
        asked = asked.strip().lower().lstrip("@")
        if "@" in asked:
            return Account(asked.split("@")[-1], asked)
        return Account(asked, accounts.get(asked, ""))

    padrao = str(config().get("default_domain") or "").lower()
    if padrao:
        return Account(padrao, accounts.get(padrao, ""))

    existing = signed_in_domains()
    if len(existing) == 1:
        return Account(existing[0], accounts.get(existing[0], ""))
    if len(existing) > 1:
        raise Failure(
            "More than one account is signed in and no default is set: "
            f"{', '.join(existing)}.\nPick one with --as <domain>, or set "
            f'"default_domain" in {CONFIG_FILE}.'
        )
    return Account("", "")


# --- HTTP with the standard library ------------------------------------------


def _request(url: str, *, data: bytes | None = None, headers: dict[str, str] | None = None,
             method: str = "GET") -> tuple[int, bytes]:
    request = urllib.request.Request(
        url, data=data, headers={"User-Agent": USER_AGENT, **(headers or {})}, method=method
    )
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()
    except urllib.error.URLError as exc:
        raise Failure(f"Could not reach {url}: {exc.reason}") from exc


def _error_of(body: bytes, status: int) -> str:
    try:
        return str(json.loads(body).get("error") or body.decode()[:200])
    except (ValueError, UnicodeDecodeError):
        return body.decode(errors="replace")[:200] or f"HTTP {status}"


# --- stored session ----------------------------------------------------------


def _load(account: Account) -> dict[str, Any]:
    if not account.domain or not account.session_file.exists():
        return {}
    try:
        return json.loads(account.session_file.read_text())
    except (OSError, ValueError):
        return {}


def _store(domain: str, data: dict[str, Any]) -> None:
    path = SESSION_DIR / f"{domain}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))
    # 600: a refresh token is worth a whole Google account until it is revoked.
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)


def signed_in_as(account: Account) -> str | None:
    return _load(account).get("email")


def forget(account: Account) -> bool:
    if account.domain and account.session_file.exists():
        account.session_file.unlink()
        return True
    return False


# --- Google sign-in ----------------------------------------------------------


def _oauth_config(service: str) -> dict[str, Any]:
    """The OAuth client comes from the service, so this plugin carries none."""
    status, body = _request(f"{service}/api/publish/config")
    if status != 200:
        raise Failure(
            f"{service} did not return the sign-in configuration ({status}). "
            f"{_error_of(body, status)}"
        )
    parsed = json.loads(body)
    missing = [k for k in ("client_id", "client_secret", "auth_uri", "token_uri")
               if not parsed.get(k)]
    if missing:
        raise Failure(f"Sign-in configuration is incomplete (missing {', '.join(missing)}).")
    return parsed


class _Catcher(http.server.BaseHTTPRequestHandler):
    """Receives Google's redirect and keeps the query."""

    result: dict[str, str] = {}

    def do_GET(self) -> None:  # noqa: N802 (name required by BaseHTTPRequestHandler)
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        if "code" not in query and "error" not in query:
            self.send_error(404)  # favicon and friends
            return
        _Catcher.result = {k: v[0] for k, v in query.items()}
        body = (
            "<!DOCTYPE html><meta charset=utf-8>"
            "<style>body{font-family:-apple-system,system-ui,sans-serif;"
            "text-align:center;padding-top:20vh;color:#0f172a}</style>"
            "<h2>Done.</h2><p>You can close this tab and go back to the terminal.</p>"
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args: Any) -> None:
        """Silence http.server's log, which would clutter the output."""


def _exchange(oauth: dict[str, Any], extra: dict[str, str]) -> dict[str, Any]:
    data = urllib.parse.urlencode(
        {"client_id": oauth["client_id"], "client_secret": oauth["client_secret"], **extra}
    ).encode()
    status, body = _request(
        oauth["token_uri"],
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    parsed = json.loads(body) if body else {}
    if status != 200:
        detail = f"{parsed.get('error', status)} {parsed.get('error_description', '')}"
        raise Failure(f"Google refused the token exchange: {detail.strip()}")
    return parsed


def _sign_in(account: Account, oauth: dict[str, Any]) -> dict[str, Any]:
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    )
    state = secrets.token_urlsafe(16)

    _Catcher.result = {}
    server = http.server.HTTPServer(("127.0.0.1", 0), _Catcher)
    server.timeout = LOGIN_TIMEOUT
    redirect = f"http://127.0.0.1:{server.server_port}"

    params = {
        "client_id": oauth["client_id"],
        "redirect_uri": redirect,
        "response_type": "code",
        "scope": " ".join(oauth.get("scopes", ["openid", "email", "profile"])),
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
        # offline + consent: without both, Google returns no refresh token and
        # the sign-in would come back every hour.
        "access_type": "offline",
        "prompt": "consent",
    }
    if account.domain:
        params["hd"] = account.domain
    if account.email:
        params["login_hint"] = account.email

    url = f"{oauth['auth_uri']}?{urllib.parse.urlencode(params)}"
    who = account.email or (f"an account of {account.domain}" if account.domain
                            else "your work Google account")
    print(f"Opening the browser to sign in as {who}…", file=sys.stderr)
    if not webbrowser.open(url):
        print(f"Could not open a browser. Open this URL:\n{url}", file=sys.stderr)

    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    while thread.is_alive() and not _Catcher.result:
        thread.join(timeout=0.5)
    server.server_close()

    result = _Catcher.result
    if not result:
        raise Failure("The sign-in did not come back in time. Run it again.")
    if "error" in result:
        raise Failure(f"Google refused the sign-in: {result['error']}")
    if result.get("state") != state:
        raise Failure("The returned `state` does not match. Sign-in discarded.")

    return _exchange(
        oauth,
        {
            "code": result["code"],
            "grant_type": "authorization_code",
            "redirect_uri": redirect,
            "code_verifier": verifier,
        },
    )


def _email_in(raw_id_token: str) -> str:
    """The e-mail inside the ID token, for display only.

    Deliberately unverified: the service verifies it, and verifying here would
    give a false sense of guarantee — this value decides nothing.
    """
    try:
        payload = raw_id_token.split(".")[1]
        padded = payload + "=" * (-len(payload) % 4)
        return str(json.loads(base64.urlsafe_b64decode(padded)).get("email", ""))
    except (IndexError, ValueError):
        return ""


def id_token(account: Account, service: str, *, relogin: bool = False) -> tuple[str, str]:
    """A fresh ID token, signing in through the browser when needed."""
    stored = _load(account)
    # The stored account has to belong to the requested domain. Reusing another
    # domain's session would publish in the wrong place, which is who can read it.
    same = bool(account.domain) and str(stored.get("email", "")).endswith(f"@{account.domain}")

    if not relogin and same and stored.get("refresh_token"):
        try:
            body = _exchange(
                _oauth_config(service),
                {"grant_type": "refresh_token", "refresh_token": stored["refresh_token"]},
            )
            if body.get("id_token"):
                return str(body["id_token"]), str(stored.get("email", ""))
        except Failure:
            # Revoked or expired: fall through to the browser, which is what the
            # person would do next anyway.
            pass

    body = _sign_in(account, _oauth_config(service))
    raw = body.get("id_token")
    if not raw:
        raise Failure("Google returned no ID token. Check the client's scopes.")

    email = _email_in(str(raw))
    domain = email.split("@")[-1] if "@" in email else account.domain
    if not domain:
        raise Failure("Could not tell the account's domain from the sign-in.")
    _store(
        domain,
        {
            "service": service,
            "email": email,
            "refresh_token": body.get("refresh_token", stored.get("refresh_token", "")),
        },
    )
    if email:
        print(f"Signed in as {email}.", file=sys.stderr)
    return str(raw), email


# --- publishing --------------------------------------------------------------


def title_of(html: str, fallback: str) -> str:
    found = _TITLE.search(html)
    if not found:
        return fallback
    return " ".join(found.group(1).split())[:200] or fallback


def dull_title_warning(title: str) -> str | None:
    if title.strip().lower().removesuffix(".html") in _DULL:
        return (
            f"The title came out as {title!r}, which names a file and not a document: that is "
            "how it will show up in the listing and in the tab of whoever opens it.\n"
            "Give it a <title> that says what the document is, then publish again. It can also "
            "be fixed later by clicking the title in the bar at the top of the link."
        )
    return None


def remote_path(local: Path, slug: str | None) -> str:
    folder = slug or local.parent.name
    if folder in ("", ".", "/"):
        folder = local.stem
    plain = unicodedata.normalize("NFKD", folder).encode("ascii", "ignore").decode()
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", plain).strip("-").lower() or "artifact"
    return f"{safe}/{local.name}"


def publish(account: Account, path: str, slug: str | None, share_days: int,
            relogin: bool) -> dict[str, str]:
    local = Path(path).expanduser()
    if not local.is_file():
        raise Failure(f"{local} does not exist.")
    if local.suffix.lower() != ".html":
        raise Failure(f"{local.name} is not .html. The service hosts self-contained HTML.")

    html = local.read_bytes()
    title = title_of(html.decode(errors="replace"), local.stem)
    warning = dull_title_warning(title)
    if warning:
        print(warning, file=sys.stderr)

    service = service_url()
    target = remote_path(local, slug)
    token, _ = id_token(account, service, relogin=relogin)

    query = {"path": target, "title": title}
    if share_days:
        query["share_days"] = str(share_days)

    status, body = _request(
        f"{service}/api/publish?{urllib.parse.urlencode(query)}",
        data=html,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": CONTENT_TYPE,
            # The service requires it: checking a quota against an unknown size
            # is not checking it.
            "Content-Length": str(len(html)),
        },
        method="POST",
    )

    if status in (401, 403):
        raise Failure(
            f"{_error_of(body, status)}\n"
            "Publishing needs a signed-in work Google account. Switch accounts with --relogin."
        )
    if status >= 400:
        raise Failure(f"The service refused it ({status}): {_error_of(body, status)}")

    return {str(k): str(v) for k, v in json.loads(body).items()}


# --- naming a page -----------------------------------------------------------


class PageRef(NamedTuple):
    """A page as the person wrote it. The domain is empty when the text names none."""

    domain: str
    path: str


_PAGE_ROUTES = frozenset({"a", "raw", "c"})


def _service_page(text: str, service: str) -> PageRef | None:
    """The page a service address names, or None when the address is not a page route.

    A share link (`/s/<token>`) names no page and is refused.
    """
    address = urllib.parse.urlsplit(text)
    base = urllib.parse.urlsplit(service)
    if (address.scheme, address.netloc.lower()) != (base.scheme, base.netloc.lower()):
        return None
    root = f"{base.path.rstrip('/')}/"
    if not address.path.startswith(root):
        return None
    route, _, rest = address.path[len(root):].partition("/")
    if route == "s":
        raise Failure(
            f"{text} is a share link, which names no page: "
            "pass the page's path or its /a/ address."
        )
    if route not in _PAGE_ROUTES:
        return None
    domain, _, path = urllib.parse.unquote(rest).strip("/").partition("/")
    if not domain or not path:
        raise Failure(f"{text} does not name a page.")
    return PageRef(domain.lower(), path)


def _page_of_text(text: str) -> PageRef:
    """A key (`acme.com/cerc/plan.html`) or a path in the account (`cerc/plan.html`).

    A published path is always `<folder>/<file>`, so a first segment with a dot
    followed by two more segments is a domain and a key.
    """
    path = text.strip("/")
    if not path:
        raise Failure("A page is missing: give its path, key or address.")
    domain, _, rest = path.partition("/")
    if "." in domain and "/" in rest:
        return PageRef(domain.lower(), rest)
    return PageRef("", path)


def _parse(text: str, service: str, refusal: str) -> PageRef:
    text = text.strip()
    if "://" not in text:
        return _page_of_text(text)
    page = _service_page(text, service)
    if page is None:
        raise Failure(refusal.format(text=text))
    return page


def parse_page(text: str, service: str) -> PageRef:
    return _parse(text, service, f"{{text}} is not a page on {service}.")


def parse_target(text: str, service: str) -> PageRef:
    return _parse(
        text,
        service,
        "{text} cannot be a redirect target: the target must be a page of the same domain, "
        f"given as a path, a key or its {service}/a/ address.",
    )


def account_for(asked: str | None, pages: list[PageRef]) -> Account:
    """`--as` when given, else the domain the pages name, else the usual resolution.

    A page that names a domain contradicting `--as` is an error, raised before
    any sign-in opens.
    """
    named = sorted({page.domain for page in pages if page.domain})
    if len(named) > 1:
        raise Failure(
            f"These addresses belong to different domains ({', '.join(named)}); "
            "a page and its redirect target share one."
        )
    if not asked:
        return pick_account(named[0] if named else None)
    account = pick_account(asked)
    if named and named[0] != account.domain:
        raise Failure(f"The page is on {named[0]}, but --as asks for {account.domain}.")
    return account


# --- calling the service -----------------------------------------------------


class Session(NamedTuple):
    service: str
    token: str
    domain: str

    def key(self, path: str) -> str:
        return f"{self.domain}/{path}"

    def address(self, key: str) -> str:
        return f"{self.service}/a/{key}"


class Reply(NamedTuple):
    status: int
    body: bytes

    @property
    def data(self) -> dict[str, Any]:
        try:
            parsed = json.loads(self.body)
        except ValueError as exc:
            raise Failure(f"The service sent an unreadable answer ({self.status}).") from exc
        if not isinstance(parsed, dict):
            raise Failure(f"The service answered with something unexpected ({self.status}).")
        return parsed

    @property
    def error(self) -> str:
        return _error_of(self.body, self.status)


def open_session(account: Account, service: str) -> Session:
    token, email = id_token(account, service)
    domain = account.domain or (email.split("@")[-1] if "@" in email else "")
    if not domain:
        raise Failure("Could not tell the account's domain from the sign-in.")
    return Session(service, token, domain)


def call(session: Session, method: str, route: str, *, query: dict[str, str] | None = None,
         payload: dict[str, Any] | None = None) -> Reply:
    url = f"{session.service}{route}"
    if query:
        url += f"?{urllib.parse.urlencode(query)}"
    headers = {"Authorization": f"Bearer {session.token}"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    return Reply(*_request(url, data=data, headers=headers, method=method))


def refused(reply: Reply) -> Failure:
    if reply.status in (401, 403):
        return Failure(
            f"{reply.error}\nThe service did not accept this account. "
            "Pick the right one with --as <domain>."
        )
    return Failure(f"The service refused it ({reply.status}): {reply.error}")


def refused_for(reply: Reply, key: str) -> Failure:
    if reply.status == 404:
        return Failure(f"{key} is not published.")
    return refused(reply)


# --- showing what the service returned --------------------------------------


def moment(iso: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except ValueError as exc:
        raise Failure(f"The service sent a date that cannot be read: {iso!r}.") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def format_moment(iso: str, zone: tzinfo | None = None) -> str:
    """The moment in `zone` (this machine's by default), with the zone written."""
    return moment(iso).astimezone(zone).strftime("%Y-%m-%d %H:%M %Z")


def human_size(count: int) -> str:
    if count < 1024:
        return f"{count} B"
    value = float(count)
    for unit in ("KB", "MB"):
        value /= 1024
        if value < 1024:
            return f"{value:.1f} {unit}"
    return f"{value / 1024:.1f} GB"


def people(count: int) -> str:
    return f"{count} person" if count == 1 else f"{count} people"


def listing(artifacts: list[dict[str, Any]], zone: tzinfo | None = None) -> list[str]:
    """One line per page, newest first: when, title, path, and size or redirect."""
    newest_first = sorted(artifacts, key=lambda page: moment(page["updated"]), reverse=True)
    rows = [
        (
            format_moment(page["updated"], zone),
            str(page.get("title") or "-"),
            str(page["path"]),
            f"→ {page['redirect']}" if page.get("redirect") else human_size(int(page["size"])),
        )
        for page in newest_first
    ]
    title_width = max((len(row[1]) for row in rows), default=0)
    path_width = max((len(row[2]) for row in rows), default=0)
    return [
        f"{when}  {title.ljust(title_width)}  {path.ljust(path_width)}  {detail}"
        for when, title, path, detail in rows
    ]


def write_out(data: bytes, output: str | None) -> None:
    """Writes to `output`, or to stdout when it is absent."""
    if not output:
        sys.stdout.flush()
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()
        return
    target = Path(output).expanduser()
    try:
        target.write_bytes(data)
    except OSError as exc:
        raise Failure(f"Could not write {target}: {exc.strerror}") from exc
    print(f"Saved {target} ({human_size(len(data))}).")


# --- the commands ------------------------------------------------------------


def _open_page(args: argparse.Namespace) -> tuple[Session, str]:
    """Signs in as the account the page belongs to and returns the page's key."""
    service = service_url()
    page = parse_page(args.page, service)
    session = open_session(account_for(args.account, [page]), service)
    return session, session.key(page.path)


def cmd_list(args: argparse.Namespace) -> int:
    session = open_session(account_for(args.account, []), service_url())
    reply = call(session, "GET", "/api/artifacts")
    if reply.status != 200:
        raise refused(reply)
    artifacts = reply.data.get("artifacts") or []
    if args.json:
        newest_first = sorted(artifacts, key=lambda page: moment(page["updated"]), reverse=True)
        print(json.dumps(newest_first, indent=2, ensure_ascii=False))
    elif artifacts:
        print("\n".join(listing(artifacts)))
    else:
        print(f"Nothing is published under {session.domain}.")
    return 0


def cmd_info(args: argparse.Namespace) -> int:
    session, key = _open_page(args)
    reply = call(session, "GET", "/api/artifacts/info", query={"key": key})
    if reply.status != 200:
        raise refused_for(reply, key)
    info = reply.data
    if args.json:
        print(json.dumps(info, indent=2, ensure_ascii=False))
        return 0
    print(info.get("title") or "-")
    print(info.get("url") or session.address(key))
    print(f"Path:     {info.get('path')}")
    print(f"Owner:    {info.get('owner')}")
    print(f"Updated:  {format_moment(str(info['updated']))}")
    print(f"Size:     {human_size(int(info.get('size') or 0))}")
    print(f"Saved by: {people(int(info.get('answers') or 0))}")
    if info.get("redirect"):
        print(f"Redirects to: {info['redirect']}")
    return 0


def cmd_get(args: argparse.Namespace) -> int:
    session, key = _open_page(args)
    reply = call(session, "GET", "/api/artifacts/raw", query={"key": key})
    if reply.status == 409:
        raise Failure(f"{key} is a redirect to {reply.data.get('redirect')}: it has no HTML.")
    if reply.status != 200:
        raise refused_for(reply, key)
    write_out(reply.body, args.output)
    return 0


def cmd_rm(args: argparse.Namespace) -> int:
    session, key = _open_page(args)
    query = {"key": key, **({"with_state": "1"} if args.with_state else {})}
    reply = call(session, "DELETE", "/api/artifacts", query=query)
    if reply.status == 409 and not args.with_state:
        saved = int(reply.data.get("answers") or 0)
        raise Failure(
            f"{people(saved)} saved state on {key}. Removing the page deletes that too: "
            "add --with-state to go ahead."
        )
    if reply.status != 200:
        raise refused_for(reply, key)
    result = reply.data
    saved = int(result.get("state_deleted") or 0)
    went_with_it = f" The saved state of {people(saved)} went with it." if saved else ""
    print(f"Removed {key}.{went_with_it}")
    for dangling in result.get("dangling") or []:
        print(
            f"Warning: {dangling} still redirects to {key}, which is gone. "
            "Point it somewhere else with redirect, or remove it.",
            file=sys.stderr,
        )
    return 0


def cmd_redirect(args: argparse.Namespace) -> int:
    service = service_url()
    page = parse_page(args.page, service)
    target = parse_target(args.target, service)
    session = open_session(account_for(args.account, [page, target]), service)

    key = session.key(page.path)
    to = session.key(target.path)
    reply = call(session, "POST", "/api/artifacts/redirect", payload={"key": key, "to": to})
    if reply.status != 201:
        raise refused(reply)
    print(f"{reply.data.get('url') or session.address(key)} → {session.address(to)}")
    return 0


def cmd_share(args: argparse.Namespace) -> int:
    session, key = _open_page(args)
    days = None if args.forever else args.days
    reply = call(session, "POST", "/api/share", payload={"key": key, "days": days})
    if reply.status != 200:
        raise refused_for(reply, key)
    result = reply.data
    label = f"{result['days']}-day link" if result.get("days") else "Link with no expiry"
    print(f"{label}, no sign-in: {result['url']}")
    return 0


def cmd_state(args: argparse.Namespace) -> int:
    session, key = _open_page(args)
    reply = call(session, "GET", "/api/state/all", query={"key": key})
    if reply.status != 200:
        raise refused_for(reply, key)
    write_out((json.dumps(reply.data, indent=2, ensure_ascii=False) + "\n").encode(), args.output)
    return 0


COMMANDS: dict[str, Callable[[argparse.Namespace], int]] = {
    "list": cmd_list,
    "info": cmd_info,
    "get": cmd_get,
    "rm": cmd_rm,
    "redirect": cmd_redirect,
    "share": cmd_share,
    "state": cmd_state,
}


def _command_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="publish.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True, metavar="command")

    def command(name: str, summary: str, *, pages: tuple[str, ...] = ("page",)
                ) -> argparse.ArgumentParser:
        sub = commands.add_parser(name, help=summary, description=summary)
        for page in pages:
            sub.add_argument(page, help="path, key or address of the page")
        sub.add_argument("--as", dest="account", metavar="DOMAIN",
                         help="account to use (default: the page's domain, the configured "
                              "or the only one)")
        sub.set_defaults(run=COMMANDS[name])
        return sub

    command("list", "what this account published, newest first", pages=()
            ).add_argument("--json", action="store_true", help="print the raw JSON")
    command("info", "one page's address, owner, size and saved state"
            ).add_argument("--json", action="store_true", help="print the raw JSON")
    command("get", "download a page's HTML").add_argument(
        "-o", "--output", metavar="FILE", help="write to FILE instead of stdout")
    command("rm", "remove a page").add_argument(
        "--with-state", action="store_true",
        help="also delete the state people saved on the page")
    redirect = command("redirect", "make a page's address lead to another page of the domain")
    redirect.add_argument("target", help="the new page (path, key or address) of the same domain")
    share = command("share", "a link to the page that opens without sign-in")
    expiry = share.add_mutually_exclusive_group(required=True)
    expiry.add_argument("--days", type=int, choices=(7, 30), help="the link expires in N days")
    expiry.add_argument("--forever", action="store_true", help="the link never expires")
    command("state", "what people saved on the page, as JSON").add_argument(
        "-o", "--output", metavar="FILE", help="write to FILE instead of stdout")
    return parser


def run_command(argv: list[str]) -> int:
    args = _command_parser().parse_args(argv)
    try:
        return int(args.run(args))
    except Failure as exc:
        print(str(exc), file=sys.stderr)
        return 1


def publish_main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="publish.py", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("file", nargs="?", help="the self-contained .html")
    parser.add_argument("--as", dest="account", metavar="DOMAIN",
                        help="account that publishes (default: the configured or only one)")
    parser.add_argument("--slug", help="folder on the server (default: the file's folder)")
    parser.add_argument("--share", type=int, default=0, metavar="DAYS",
                        help="also return a link that opens without sign-in (max 30)")
    parser.add_argument("--no-open", action="store_true", help="do not open the browser")
    parser.add_argument("--relogin", action="store_true", help="sign in again")
    parser.add_argument("--whoami", action="store_true", help="show the signed-in account")
    parser.add_argument("--logout", action="store_true", help="forget the account here")
    args = parser.parse_args(argv)

    try:
        account = pick_account(args.account)

        if args.logout:
            print("Account forgotten." if forget(account) else "No account was stored.")
            return 0

        if args.whoami:
            who = signed_in_as(account)
            if who:
                print(who)
            else:
                others = signed_in_domains()
                print("Nobody signed in." + (f" Signed in elsewhere: {', '.join(others)}."
                                             if others else ""))
            return 0

        if not args.file:
            parser.error("missing the .html file (or use --whoami / --logout)")

        result = publish(account, args.file, args.slug, args.share, args.relogin)
    except Failure as exc:
        print(str(exc), file=sys.stderr)
        return 1

    print(result["url"])
    if result.get("share_url"):
        print(f"{result['share_days']}-day link, no sign-in: {result['share_url']}")
    if not args.no_open:
        webbrowser.open(result["url"])
    return 0


def main(argv: list[str] | None = None) -> int:
    """A first argument that names a command runs it; anything else is the file to publish."""
    arguments = sys.argv[1:] if argv is None else argv
    if arguments and arguments[0] in COMMANDS:
        return run_command(arguments)
    return publish_main(arguments)


if __name__ == "__main__":
    raise SystemExit(main())
