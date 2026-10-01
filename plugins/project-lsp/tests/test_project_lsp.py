import importlib.util
import json
import os
import queue
import stat
import subprocess
import sys
import threading
from collections.abc import Callable, Iterator
from importlib.machinery import SourceFileLoader
from pathlib import Path
from typing import Any

import pytest

PLUGIN = Path(__file__).resolve().parent.parent
PROJECT_LSP = PLUGIN / "bin" / "project-lsp"
FAKE_SERVER = Path(__file__).resolve().parent / "fake_server.py"
TIMEOUT = 10
# Enough for git, and no mise: a test that wants mise puts its own fake first.
BASE_PATH = os.pathsep.join(["/usr/bin", "/bin"])

type Message = dict[str, Any]


class Client:
    """The session's side of project-lsp: sends messages and waits for the ones it expects."""

    def __init__(self, path: str, cwd: Path) -> None:
        self.process = subprocess.Popen(
            [sys.executable, str(PROJECT_LSP), "--", sys.executable, str(FAKE_SERVER)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            env={"PATH": path, "HOME": os.environ.get("HOME", "/")},
            cwd=cwd,
        )
        self._received: queue.Queue[Message] = queue.Queue()
        self._seen: list[Message] = []
        threading.Thread(target=self._read, daemon=True).start()
        self._next_id = 100

    def send(self, message: Message) -> None:
        assert self.process.stdin is not None
        body = json.dumps({"jsonrpc": "2.0", **message}).encode()
        self.process.stdin.write(b"Content-Length: %d\r\n\r\n" % len(body) + body)
        self.process.stdin.flush()

    def request(self, method: str, params: Message) -> Message:
        """The response to a request, once it arrives."""
        self._next_id += 1
        request_id = self._next_id
        self.send({"id": request_id, "method": method, "params": params})
        return self.expect(lambda m: m.get("id") == request_id and "method" not in m)

    def expect(self, wanted: Callable[[Message], bool]) -> Message:
        for index, message in enumerate(self._seen):
            if wanted(message):
                return self._seen.pop(index)
        while True:
            message = self._received.get(timeout=TIMEOUT)
            if wanted(message):
                return message
            self._seen.append(message)

    def diagnostic_of(self, path: Path) -> str:
        message = self.expect(
            lambda m: m.get("method") == "textDocument/publishDiagnostics"
            and m["params"]["uri"] == path.as_uri()
        )
        return message["params"]["diagnostics"][0]["message"]

    def open(self, path: Path) -> None:
        document = {"uri": path.as_uri(), "languageId": "go", "version": 1, "text": ""}
        self.send({"method": "textDocument/didOpen", "params": {"textDocument": document}})

    def _read(self) -> None:
        stream = self.process.stdout
        assert stream is not None
        while True:
            length = None
            while True:
                line = stream.readline()
                if not line:
                    return
                line = line.strip()
                if line.lower().startswith(b"content-length:"):
                    length = int(line.split(b":")[1])
                elif not line and length is not None:
                    break
            self._received.put(json.loads(stream.read(length)))


def git_repository(path: Path) -> Path:
    path.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    subprocess.run(
        ["git", "-C", str(path), "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q",
         "--allow-empty", "-m", "start"],
        check=True,
    )
    return path.resolve()


def described(directory: Path) -> str:
    return f"cwd={directory} root={directory.as_uri()}"


@pytest.fixture
def session(tmp_path: Path) -> Path:
    return git_repository(tmp_path / "session")


@pytest.fixture
def client(session: Path) -> Iterator[Client]:
    started = start(session, BASE_PATH)
    yield started
    started.process.kill()
    started.process.wait()


def start(session: Path, path: str) -> Client:
    started = Client(path, session)
    root = (session / "sub").as_uri()
    response = started.request("initialize", {"processId": None, "rootUri": root, "capabilities": {}})
    assert response["result"] == {"capabilities": {"fake": True}}
    started.send({"method": "initialized", "params": {}})
    return started


def test_the_session_server_runs_in_the_worktree_of_the_session_folder(
    client: Client, session: Path
) -> None:
    client.open(session / "sub" / "a.go")

    assert client.diagnostic_of(session / "sub" / "a.go") == described(session)


def test_a_file_of_another_repository_gets_a_server_started_in_that_repository(
    client: Client, tmp_path: Path
) -> None:
    other = git_repository(tmp_path / "other")

    client.open(other / "pkg" / "b.go")

    assert client.diagnostic_of(other / "pkg" / "b.go") == described(other)


def test_a_file_of_a_worktree_gets_a_server_in_that_worktree(
    client: Client, session: Path, tmp_path: Path
) -> None:
    worktree = tmp_path / "session" / ".claude" / "worktrees" / "fix"
    subprocess.run(["git", "-C", str(session), "worktree", "add", "-q", str(worktree)], check=True)

    client.open(worktree / "c.go")

    assert client.diagnostic_of(worktree / "c.go") == described(worktree.resolve())


def test_a_file_outside_git_gets_a_server_in_its_directory(
    client: Client, tmp_path: Path
) -> None:
    loose = tmp_path / "loose"
    loose.mkdir()

    client.open(loose / "d.go")

    assert client.diagnostic_of(loose / "d.go") == described(loose.resolve())


def test_a_request_about_a_file_is_answered_by_the_server_of_its_project(
    client: Client, tmp_path: Path
) -> None:
    other = git_repository(tmp_path / "other")
    client.open(other / "b.go")

    response = client.request(
        "textDocument/definition",
        {"textDocument": {"uri": (other / "b.go").as_uri()}, "position": {"line": 0, "character": 0}},
    )

    assert response["result"] == {"cwd": str(other)}


def test_a_workspace_symbol_search_joins_the_answers_of_every_server(
    client: Client, session: Path, tmp_path: Path
) -> None:
    other = git_repository(tmp_path / "other")
    client.open(other / "b.go")
    client.diagnostic_of(other / "b.go")

    response = client.request("workspace/symbol", {"query": "x"})

    assert sorted(symbol["name"] for symbol in response["result"]) == sorted(
        [str(session), str(other)]
    )


def test_a_symbol_search_sent_as_a_file_of_a_new_project_opens_reaches_that_project(
    client: Client, session: Path, tmp_path: Path
) -> None:
    other = git_repository(tmp_path / "other")

    client.open(other / "b.go")
    response = client.request("workspace/symbol", {"query": "x"})

    assert sorted(symbol["name"] for symbol in response["result"]) == sorted(
        [str(session), str(other)]
    )


def test_a_server_that_ends_in_its_handshake_leaves_no_request_unanswered(
    client: Client, session: Path, tmp_path: Path
) -> None:
    broken = git_repository(tmp_path / "broken")
    (broken / ".refuse").touch()

    client.open(broken / "b.go")
    symbols = client.request("workspace/symbol", {"query": "x"})
    definition = client.request(
        "textDocument/definition",
        {"textDocument": {"uri": (broken / "b.go").as_uri()}, "position": {"line": 0, "character": 0}},
    )

    assert [symbol["name"] for symbol in symbols["result"]] == [str(session)]
    assert "error" in definition


def test_requests_of_two_servers_reach_the_client_apart_and_each_answer_returns_to_its_server(
    client: Client, session: Path, tmp_path: Path
) -> None:
    other = git_repository(tmp_path / "other")
    client.open(other / "b.go")

    asked = [
        client.expect(lambda m: m.get("method") == "workspace/configuration") for _ in range(2)
    ]
    for request in asked:
        client.send({"id": request["id"], "result": [request["id"]]})
    configured = [client.expect(lambda m: m.get("method") == "fake/configured") for _ in range(2)]

    assert asked[0]["id"] != asked[1]["id"]
    assert sorted(m["params"]["cwd"] for m in configured) == sorted([str(session), str(other)])
    assert all(m["params"]["answer"][0] in {r["id"] for r in asked} for m in configured)
    assert configured[0]["params"]["answer"] != configured[1]["params"]["answer"]


def test_shutdown_is_answered_once_every_server_has_and_exit_ends_project_lsp(
    client: Client, tmp_path: Path
) -> None:
    other = git_repository(tmp_path / "other")
    client.open(other / "b.go")
    client.diagnostic_of(other / "b.go")

    assert client.request("shutdown", {})["result"] is None
    client.send({"method": "exit"})

    assert client.process.wait(TIMEOUT) == 0


def test_each_server_is_started_in_its_project_through_mise(session: Path, tmp_path: Path) -> None:
    bin_directory = tmp_path / "bin"
    bin_directory.mkdir()
    calls = tmp_path / "mise-calls"
    mise = bin_directory / "mise"
    mise.write_text(f'#!/bin/sh\necho "$@" >>"{calls}"\ncd "$3"\nshift 4\nexec "$@"\n')
    mise.chmod(mise.stat().st_mode | stat.S_IXUSR)
    started = start(session, os.pathsep.join([str(bin_directory), BASE_PATH]))
    try:
        started.open(session / "a.go")
        assert started.diagnostic_of(session / "a.go") == described(session)
    finally:
        started.process.kill()
        started.process.wait()

    assert calls.read_text().startswith(f"exec -C {session} -- {sys.executable} {FAKE_SERVER}")


def test_uv_leaves_nothing_in_the_environment_of_a_server() -> None:
    loader = SourceFileLoader("project_lsp", str(PROJECT_LSP))
    spec = importlib.util.spec_from_loader("project_lsp", loader)
    assert spec is not None
    module = importlib.util.module_from_spec(spec)
    loader.exec_module(module)
    uv_env = "/cache/uv/builds/env"

    kept = module.server_environment(
        {"VIRTUAL_ENV": uv_env, "UV": "/bin/uv", "UV_RUN_RECURSION_DEPTH": "1",
         "PATH": f"{uv_env}/bin:/usr/bin", "HOME": "/home/u"}
    )

    assert kept == {"PATH": "/usr/bin", "HOME": "/home/u"}
