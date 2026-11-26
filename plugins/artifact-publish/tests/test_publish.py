import importlib.util
import json
import os
import sys
import time
import urllib.parse
from collections.abc import Callable, Iterator
from datetime import timedelta, timezone
from pathlib import Path
from types import ModuleType
from typing import Any, NamedTuple

import pytest

PLUGIN = Path(__file__).resolve().parent.parent
PUBLISH = PLUGIN / "skills" / "artifact-publish" / "scripts" / "publish.py"
SERVICE = "https://artifacts.nexaedge.com"
DOMAIN = "ppfxlabs.ai"
PAGE = "cerc/plano.html"
KEY = f"{DOMAIN}/{PAGE}"
BRT = timezone(timedelta(hours=-3), "BRT")


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location("artifact_publish_script", PUBLISH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


publish = _load()


class Call(NamedTuple):
    method: str
    url: str
    data: bytes | None
    headers: dict[str, str]

    @property
    def route(self) -> str:
        return urllib.parse.urlsplit(self.url).path

    @property
    def query(self) -> dict[str, str]:
        return dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.url).query))

    @property
    def body(self) -> Any:
        return json.loads(self.data) if self.data else None


class FakeService:
    """Stands in for the HTTP layer: records each request and answers from a queue."""

    def __init__(self) -> None:
        self.calls: list[Call] = []
        self.signed_in: list[Any] = []
        self._answers: list[tuple[int, bytes]] = []

    def answers(self, status: int, body: Any = None, *, raw: bytes | None = None) -> None:
        self._answers.append((status, raw if raw is not None else json.dumps(body).encode()))

    def request(self, url: str, *, data: bytes | None = None,
                headers: dict[str, str] | None = None, method: str = "GET") -> tuple[int, bytes]:
        self.calls.append(Call(method, url, data, dict(headers or {})))
        return self._answers.pop(0)

    def sign_in(self, account: Any, service: str, *, relogin: bool = False) -> tuple[str, str]:
        self.signed_in.append(account)
        return "TOKEN", f"me@{account.domain or 'acme.com'}"

    @property
    def only_call(self) -> Call:
        assert len(self.calls) == 1, self.calls
        return self.calls[0]


@pytest.fixture
def no_account_on_this_machine(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(publish, "CONFIG_FILE", tmp_path / "artifacts.json")
    monkeypatch.setattr(publish, "SESSION_DIR", tmp_path / "sessions")
    monkeypatch.delenv("ARTIFACTS_SERVICE", raising=False)


@pytest.fixture
def service(monkeypatch: pytest.MonkeyPatch, no_account_on_this_machine: None) -> FakeService:
    fake = FakeService()
    monkeypatch.setattr(publish, "_request", fake.request)
    monkeypatch.setattr(publish, "id_token", fake.sign_in)
    return fake


@pytest.fixture
def brt() -> Iterator[None]:
    """The machine's clock set to São Paulo, put back afterwards."""
    before = os.environ.get("TZ")
    os.environ["TZ"] = "America/Sao_Paulo"
    time.tzset()
    yield
    if before is None:
        del os.environ["TZ"]
    else:
        os.environ["TZ"] = before
    time.tzset()


def run(*argv: str) -> int:
    return publish.main(list(argv))


# --- naming a page -----------------------------------------------------------


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (PAGE, ("", PAGE)),
        (f"/{PAGE}/", ("", PAGE)),
        (KEY, (DOMAIN, PAGE)),
        (KEY.replace(DOMAIN, "PPFXLabs.AI"), (DOMAIN, PAGE)),
        (f"{SERVICE}/a/{KEY}", (DOMAIN, PAGE)),
        (f"{SERVICE}/a/{KEY}?x=1#top", (DOMAIN, PAGE)),
        (f"{SERVICE}/a/{DOMAIN}/cerc/plano%20novo.html", (DOMAIN, "cerc/plano novo.html")),
    ],
    ids=["path", "path with slashes", "key", "key in capitals", "service url", "url with query",
         "url with escapes"],
)
def test_a_page_is_a_path_a_key_or_a_service_address(text: str, expected: tuple[str, str]) -> None:
    assert publish.parse_page(text, SERVICE) == expected


@pytest.mark.parametrize(
    "text",
    ["", "/", "https://example.com/a/ppfxlabs.ai/x/y.html", f"{SERVICE}/s/some-token",
     f"{SERVICE}/a/{DOMAIN}", "http://artifacts.nexaedge.com/a/ppfxlabs.ai/x/y.html"],
    ids=["empty", "slash", "other host", "share link", "domain only", "other scheme"],
)
def test_text_that_names_no_page_of_the_service_is_refused(text: str) -> None:
    with pytest.raises(publish.Failure):
        publish.parse_page(text, SERVICE)


def test_a_service_in_another_place_is_where_addresses_are_read() -> None:
    local = "http://localhost:8080"
    assert publish.parse_page(f"{local}/a/{KEY}", local) == (DOMAIN, PAGE)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        (PAGE, publish.PageRef("", PAGE)),
        (KEY, publish.PageRef(DOMAIN, PAGE)),
        (f"{SERVICE}/a/{KEY}", publish.PageRef(DOMAIN, PAGE)),
        (f"{SERVICE}/raw/{KEY}", publish.PageRef(DOMAIN, PAGE)),
        (f"{SERVICE}/c/{KEY}", publish.PageRef(DOMAIN, PAGE)),
    ],
    ids=["path", "key", "a address", "raw address", "c address"],
)
def test_a_target_is_a_path_a_key_or_a_service_address_of_a_page(
    text: str, expected: tuple[str, str]
) -> None:
    assert publish.parse_target(text, SERVICE) == expected


@pytest.mark.parametrize("route", ["a", "raw", "c"])
def test_every_page_route_of_the_service_resolves_to_the_same_key(route: str) -> None:
    assert publish.parse_page(f"{SERVICE}/{route}/{KEY}", SERVICE) == (DOMAIN, PAGE)


@pytest.mark.parametrize("parse", [publish.parse_page, publish.parse_target])
def test_a_share_link_is_refused_because_it_names_no_page(
    parse: Callable[[str, str], tuple[str, str]],
) -> None:
    with pytest.raises(publish.Failure, match="share link.*names no page.*path or its /a/ address"):
        parse(f"{SERVICE}/s/some-token", SERVICE)


@pytest.mark.parametrize(
    "text",
    ["https://example.com/landing?x=1", f"{SERVICE}/api/artifacts", f"{SERVICE}/",
     "http://example.com/landing"],
    ids=["other host", "other route of the service", "service root", "plain http"],
)
def test_a_target_that_is_not_a_page_of_the_service_is_refused(text: str) -> None:
    with pytest.raises(publish.Failure, match="target must be a page of the same domain"):
        publish.parse_target(text, SERVICE)


def test_an_external_url_is_refused_as_a_redirect_target_before_signing_in(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run("redirect", KEY, "https://example.com/x") == 1
    assert "target must be a page of the same domain" in capsys.readouterr().err
    assert service.signed_in == [] and service.calls == []


# --- picking the account -----------------------------------------------------


def test_the_domain_a_page_names_picks_the_account_when_as_is_absent(
    service: FakeService, tmp_path: Path
) -> None:
    (tmp_path / "artifacts.json").write_text(json.dumps({"default_domain": "other.com"}))
    account = publish.account_for(None, [publish.PageRef(DOMAIN, PAGE)])
    assert account.domain == DOMAIN


def test_a_page_without_a_domain_uses_the_usual_resolution(
    service: FakeService, tmp_path: Path
) -> None:
    (tmp_path / "artifacts.json").write_text(json.dumps({"default_domain": "other.com"}))
    assert publish.account_for(None, [publish.PageRef("", PAGE)]).domain == "other.com"


def test_as_agreeing_with_the_page_domain_is_accepted_even_as_an_address() -> None:
    account = publish.account_for(f"me@{DOMAIN}", [publish.PageRef(DOMAIN, PAGE)])
    assert (account.domain, account.email) == (DOMAIN, f"me@{DOMAIN}")


def test_as_contradicting_the_page_domain_is_refused() -> None:
    with pytest.raises(publish.Failure, match="--as"):
        publish.account_for("acme.com", [publish.PageRef(DOMAIN, PAGE)])


def test_pages_of_two_domains_are_refused() -> None:
    with pytest.raises(publish.Failure, match="different domains"):
        publish.account_for(
            None, [publish.PageRef(DOMAIN, PAGE), publish.PageRef("acme.com", PAGE)]
        )


def test_a_contradiction_is_refused_before_any_sign_in(service: FakeService) -> None:
    assert run("rm", KEY, "--as", "acme.com") == 1
    assert service.signed_in == [] and service.calls == []


# --- dispatch ----------------------------------------------------------------


@pytest.fixture
def published(
    monkeypatch: pytest.MonkeyPatch, no_account_on_this_machine: None
) -> list[tuple[Any, ...]]:
    """What the legacy path publishes: stubbed, with the browser closed."""
    runs: list[tuple[Any, ...]] = []

    def fake_publish(account: Any, path: str, slug: str | None, share: int,
                     relogin: bool) -> dict[str, str]:
        runs.append((account.domain, path, slug, share, relogin))
        return {"url": "https://example/a/x"}

    monkeypatch.setattr(publish, "publish", fake_publish)
    monkeypatch.setattr(publish.webbrowser, "open", lambda url: runs.append(("open", url)))
    return runs


def test_a_file_is_published_as_before(published: list[tuple[Any, ...]]) -> None:
    assert run("report.html", "--as", "acme.com", "--slug", "q3", "--share", "7") == 0
    assert published == [
        ("acme.com", "report.html", "q3", 7, False),
        ("open", "https://example/a/x"),
    ]


def test_no_open_still_keeps_the_browser_closed(published: list[tuple[Any, ...]]) -> None:
    run("report.html", "--no-open")
    assert published == [("", "report.html", None, 0, False)]


def test_a_file_whose_name_starts_like_a_command_is_still_a_file(
    published: list[tuple[Any, ...]],
) -> None:
    run("list.html", "--no-open")
    assert published[0][1] == "list.html"


def test_whoami_still_reports_without_the_service(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    assert run("--whoami") == 0
    assert capsys.readouterr().out.startswith("Nobody signed in.")
    assert service.calls == []


def test_a_command_name_runs_the_command_and_publishes_nothing(
    service: FakeService, published: list[tuple[Any, ...]]
) -> None:
    service.answers(200, {"artifacts": []})
    assert run("list", "--as", DOMAIN) == 0
    assert published == []
    assert service.only_call.route == "/api/artifacts"


def test_every_command_name_parses_into_its_handler() -> None:
    arguments = {"list": [], "redirect": [PAGE, PAGE], "share": [PAGE, "--forever"]}
    for name, handler in publish.COMMANDS.items():
        parsed = publish._command_parser().parse_args([name, *arguments.get(name, [PAGE])])
        assert parsed.run is handler


# --- requests ----------------------------------------------------------------


def authorized(call: Call) -> bool:
    return call.headers.get("Authorization") == "Bearer TOKEN"


def test_a_path_is_completed_with_the_account_domain(service: FakeService) -> None:
    service.answers(200, {"key": KEY, "title": "Plano", "url": f"{SERVICE}/a/{KEY}",
                          "updated": "2026-11-25T17:05:00Z", "size": 10, "answers": 0})
    assert run("info", PAGE, "--as", DOMAIN) == 0
    call = service.only_call
    assert (call.method, call.route, call.query) == ("GET", "/api/artifacts/info", {"key": KEY})
    assert authorized(call) and call.data is None


def test_the_domain_learned_at_sign_in_completes_a_path_when_none_was_known(
    service: FakeService,
) -> None:
    service.answers(200, {"key": "acme.com/cerc/plano.html", "updated": "2026-11-25T17:05:00Z"})
    run("info", PAGE)
    assert service.only_call.query == {"key": "acme.com/cerc/plano.html"}


def test_a_service_address_picks_the_account_and_the_key(service: FakeService) -> None:
    service.answers(200, {"updated": "2026-11-25T17:05:00Z"})
    run("info", f"{SERVICE}/a/{KEY}")
    assert [account.domain for account in service.signed_in] == [DOMAIN]
    assert service.only_call.query == {"key": KEY}


def test_list_shows_newest_first_with_the_zone_and_the_redirect_target(
    service: FakeService, brt: None, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(200, {"artifacts": [
        {"key": KEY, "path": PAGE, "domain": DOMAIN, "title": "Plano", "owner": "me",
         "updated": "2026-11-25T17:05:00Z", "size": 2048, "redirect": None},
        {"key": f"{DOMAIN}/cerc/velho.html", "path": "cerc/velho.html", "domain": DOMAIN,
         "title": "Velho", "owner": "me", "updated": "2026-11-26T01:00:00Z", "size": 100,
         "redirect": KEY},
    ]})
    assert run("list", "--as", DOMAIN) == 0
    assert service.only_call.method == "GET" and authorized(service.only_call)
    assert capsys.readouterr().out.splitlines() == [
        f"2026-11-25 22:00 -03  Velho  cerc/velho.html  → {KEY}",
        "2026-11-25 14:05 -03  Plano  cerc/plano.html  2.0 KB",
    ]


def test_list_json_prints_the_pages_newest_first(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    older = {"path": "a/old.html", "updated": "2026-01-01T00:00:00Z", "size": 1}
    newer = {"path": "a/new.html", "updated": "2026-02-01T00:00:00Z", "size": 1}
    service.answers(200, {"artifacts": [older, newer]})
    run("list", "--json", "--as", DOMAIN)
    assert json.loads(capsys.readouterr().out) == [newer, older]


def test_list_says_when_nothing_is_published(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(200, {"artifacts": []})
    run("list", "--as", DOMAIN)
    assert capsys.readouterr().out == f"Nothing is published under {DOMAIN}.\n"


def test_moments_are_written_in_the_asked_zone() -> None:
    assert publish.format_moment("2026-11-25T17:05:00Z", BRT) == "2026-11-25 14:05 BRT"
    assert publish.format_moment("2026-11-25T17:05:00+00:00", BRT) == "2026-11-25 14:05 BRT"


@pytest.mark.parametrize(
    ("count", "written"),
    [(0, "0 B"), (1023, "1023 B"), (1024, "1.0 KB"), (1536, "1.5 KB"),
     (5 * 1024 * 1024, "5.0 MB"), (3 * 1024**3, "3.0 GB")],
)
def test_sizes_are_written_in_the_largest_fitting_unit(count: int, written: str) -> None:
    assert publish.human_size(count) == written


def test_info_prints_the_page_and_its_json(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    info = {"key": KEY, "path": PAGE, "domain": DOMAIN, "title": "Plano", "owner": "me",
            "updated": "2026-11-25T17:05:00Z", "size": 2048, "redirect": None,
            "url": f"{SERVICE}/a/{KEY}", "answers": 3}
    service.answers(200, info)
    service.answers(200, info)
    run("info", KEY)
    text = capsys.readouterr().out
    assert f"{SERVICE}/a/{KEY}" in text and "Saved by: 3 people" in text and "2.0 KB" in text
    run("info", KEY, "--json")
    assert json.loads(capsys.readouterr().out) == info


def test_a_missing_page_is_said_in_one_line(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(404, {"error": "not found"})
    assert run("info", KEY) == 1
    assert capsys.readouterr().err == f"{KEY} is not published.\n"


def test_an_account_the_service_refuses_is_told_to_use_as(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(403, {"error": "wrong domain"})
    assert run("info", KEY) == 1
    err = capsys.readouterr().err
    assert "wrong domain" in err and "--as" in err


def test_get_writes_the_html_to_a_file(
    service: FakeService, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    html = "<html>é</html>".encode()
    service.answers(200, raw=html)
    target = tmp_path / "plano.html"
    assert run("get", KEY, "-o", str(target)) == 0
    call = service.only_call
    assert (call.method, call.route, call.query) == ("GET", "/api/artifacts/raw", {"key": KEY})
    assert target.read_bytes() == html
    assert "plano.html" in capsys.readouterr().out


def test_get_without_a_file_writes_the_html_to_stdout(
    service: FakeService, capsysbinary: pytest.CaptureFixture[bytes]
) -> None:
    service.answers(200, raw=b"<html></html>")
    assert run("get", KEY) == 0
    assert capsysbinary.readouterr().out == b"<html></html>"


def test_get_of_a_redirect_says_where_it_leads(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(409, {"error": "redirect", "redirect": "ppfxlabs.ai/cerc/novo.html"})
    assert run("get", KEY) == 1
    assert "redirect to ppfxlabs.ai/cerc/novo.html" in capsys.readouterr().err


def test_get_reports_a_file_it_cannot_write(service: FakeService, tmp_path: Path,
                                            capsys: pytest.CaptureFixture[str]) -> None:
    service.answers(200, raw=b"x")
    assert run("get", KEY, "-o", str(tmp_path / "missing" / "plano.html")) == 1
    assert "Could not write" in capsys.readouterr().err


def test_rm_deletes_the_page_and_warns_about_each_redirect_left_dangling(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(200, {"key": KEY, "deleted": True, "state_deleted": 0,
                          "dangling": [f"{DOMAIN}/a/x.html", f"{DOMAIN}/b/y.html"]})
    assert run("rm", KEY) == 0
    call = service.only_call
    assert (call.method, call.route, call.query) == ("DELETE", "/api/artifacts", {"key": KEY})
    assert authorized(call)
    captured = capsys.readouterr()
    assert captured.out == f"Removed {KEY}.\n"
    assert f"Warning: {DOMAIN}/a/x.html still redirects" in captured.err
    assert f"Warning: {DOMAIN}/b/y.html still redirects" in captured.err


def test_rm_refused_for_saved_state_says_how_many_and_what_to_add(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(409, {"error": "has state", "answers": 3})
    assert run("rm", KEY) == 1
    err = capsys.readouterr().err
    assert "3 people saved state" in err and "--with-state" in err


@pytest.mark.parametrize(
    ("count", "line"),
    [(1, "The saved state of 1 person went with it."),
     (3, "The saved state of 3 people went with it.")],
)
def test_rm_with_state_sends_the_flag_and_says_how_many_people_s_state_went(
    service: FakeService, capsys: pytest.CaptureFixture[str], count: int, line: str
) -> None:
    service.answers(200, {"key": KEY, "deleted": True, "state_deleted": count, "dangling": []})
    assert run("rm", KEY, "--with-state") == 0
    assert service.only_call.query == {"key": KEY, "with_state": "1"}
    assert capsys.readouterr().out == f"Removed {KEY}. {line}\n"


def test_rm_of_a_missing_page_says_so(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(404, {"error": "not found"})
    assert run("rm", KEY) == 1
    assert capsys.readouterr().err == f"{KEY} is not published.\n"


def test_rm_still_refused_with_state_is_reported_not_retried(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(409, {"error": "busy", "answers": 1})
    assert run("rm", KEY, "--with-state") == 1
    assert "(409): busy" in capsys.readouterr().err


def test_redirect_posts_both_keys_and_prints_old_to_new(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    new_key = f"{DOMAIN}/cerc/novo.html"
    service.answers(201, {"key": KEY, "to": new_key, "url": f"{SERVICE}/a/{KEY}"})
    assert run("redirect", PAGE, "cerc/novo.html", "--as", DOMAIN) == 0
    call = service.only_call
    assert (call.method, call.route) == ("POST", "/api/artifacts/redirect")
    assert call.body == {"key": KEY, "to": new_key}
    assert call.headers["Content-Type"] == "application/json" and authorized(call)
    assert capsys.readouterr().out == f"{SERVICE}/a/{KEY} → {SERVICE}/a/{new_key}\n"


@pytest.mark.parametrize("route", ["raw", "c"])
def test_redirect_to_a_raw_or_c_address_of_a_page_targets_its_key(
    service: FakeService, route: str
) -> None:
    service.answers(201, {"key": KEY, "to": "x", "url": "u"})
    assert run("redirect", KEY, f"{SERVICE}/{route}/{DOMAIN}/cerc/novo.html") == 0
    assert service.only_call.body == {"key": KEY, "to": f"{DOMAIN}/cerc/novo.html"}


def test_redirect_accepts_service_addresses_for_both_pages(service: FakeService) -> None:
    service.answers(201, {"key": KEY, "to": "x", "url": "u"})
    run("redirect", f"{SERVICE}/a/{KEY}", f"{SERVICE}/a/{DOMAIN}/cerc/novo.html")
    assert service.only_call.body == {"key": KEY, "to": f"{DOMAIN}/cerc/novo.html"}
    assert [account.domain for account in service.signed_in] == [DOMAIN]


def test_redirect_to_a_page_of_another_domain_is_refused_before_signing_in(
    service: FakeService,
) -> None:
    assert run("redirect", KEY, "acme.com/cerc/novo.html") == 1
    assert service.signed_in == []


@pytest.mark.parametrize("status", [400, 404, 409])
def test_redirect_the_service_refuses_shows_its_reason(
    service: FakeService, capsys: pytest.CaptureFixture[str], status: int
) -> None:
    service.answers(status, {"error": "would loop"})
    assert run("redirect", KEY, "cerc/novo.html") == 1
    assert capsys.readouterr().err == f"The service refused it ({status}): would loop\n"


@pytest.mark.parametrize(
    ("flags", "days", "line"),
    [
        (["--days", "7"], 7, "7-day link, no sign-in: https://x/s/t"),
        (["--days", "30"], 30, "30-day link, no sign-in: https://x/s/t"),
        (["--forever"], None, "Link with no expiry, no sign-in: https://x/s/t"),
    ],
)
def test_share_asks_for_the_expiry_and_prints_the_link(
    service: FakeService, capsys: pytest.CaptureFixture[str], flags: list[str],
    days: int | None, line: str,
) -> None:
    service.answers(200, {"url": "https://x/s/t", "days": days})
    assert run("share", KEY, *flags) == 0
    call = service.only_call
    assert (call.method, call.route) == ("POST", "/api/share")
    assert call.body == {"key": KEY, "days": days}
    assert authorized(call)
    assert capsys.readouterr().out == f"{line}\n"


@pytest.mark.parametrize("flags", [[], ["--days", "9"], ["--days", "7", "--forever"]],
                         ids=["no expiry chosen", "other days", "both"])
def test_share_needs_exactly_one_valid_expiry(service: FakeService, flags: list[str]) -> None:
    with pytest.raises(SystemExit):
        run("share", KEY, *flags)
    assert service.calls == []


def test_share_of_a_missing_page_says_so(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(404, {"error": "not found"})
    assert run("share", KEY, "--days", "7") == 1
    assert capsys.readouterr().err == f"{KEY} is not published.\n"


def test_state_prints_every_participant_as_json(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    state = {"key": KEY, "participants": [{"who": "ana"}, {"who": "rui"}]}
    service.answers(200, state)
    assert run("state", KEY) == 0
    call = service.only_call
    assert (call.method, call.route, call.query) == ("GET", "/api/state/all", {"key": KEY})
    assert json.loads(capsys.readouterr().out) == state


def test_state_writes_to_a_file(service: FakeService, tmp_path: Path) -> None:
    state = {"key": KEY, "participants": []}
    service.answers(200, state)
    target = tmp_path / "state.json"
    assert run("state", KEY, "-o", str(target)) == 0
    assert json.loads(target.read_text()) == state


def test_a_service_unreachable_is_a_short_message(
    monkeypatch: pytest.MonkeyPatch, service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    def unreachable(*_args: Any, **_kwargs: Any) -> tuple[int, bytes]:
        raise publish.Failure("Could not reach the service: down")

    monkeypatch.setattr(publish, "_request", unreachable)
    assert run("list", "--as", DOMAIN) == 1
    assert capsys.readouterr().err == "Could not reach the service: down\n"


def test_an_unreadable_answer_is_a_short_message(
    service: FakeService, capsys: pytest.CaptureFixture[str]
) -> None:
    service.answers(200, raw=b"<html>not json</html>")
    assert run("list", "--as", DOMAIN) == 1
    assert "unreadable" in capsys.readouterr().err


def test_every_request_goes_to_the_configured_service(
    service: FakeService, tmp_path: Path
) -> None:
    (tmp_path / "artifacts.json").write_text(json.dumps({"service": "http://localhost:9000/"}))
    service.answers(200, {"artifacts": []})
    run("list", "--as", DOMAIN)
    assert service.only_call.url == "http://localhost:9000/api/artifacts"

