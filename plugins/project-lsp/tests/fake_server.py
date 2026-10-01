"""A language server that says where it runs: its answers carry its working directory, and the
`rootUri` it was initialized with.

- `initialize` answers with `{"capabilities": {"fake": true}}`.
- `initialized` makes it ask the client `workspace/configuration` with id 1, and once answered it
  sends the notification `fake/configured` with what the client answered.
- `textDocument/didOpen` publishes one diagnostic whose message is `cwd=<dir> root=<rootUri>`.
- `textDocument/definition` answers `{"cwd": <dir>}`.
- `workspace/symbol` answers `[{"name": <dir>}]`.
- `shutdown` answers null, and `exit` ends it.

In a folder holding a `.refuse` file it ends at once, before reading anything.
"""

import json
import os
import sys
from typing import Any

root_uri = None
if os.path.exists(".refuse"):
    sys.exit(3)


def read() -> dict[str, Any] | None:
    length = None
    while True:
        line = sys.stdin.buffer.readline()
        if not line:
            return None
        line = line.strip()
        if not line:
            if length is not None:
                break
            continue
        name, _, value = line.partition(b":")
        if name.lower() == b"content-length":
            length = int(value)
    return json.loads(sys.stdin.buffer.read(length))


def send(message: dict[str, Any]) -> None:
    body = json.dumps({"jsonrpc": "2.0", **message}).encode()
    sys.stdout.buffer.write(b"Content-Length: %d\r\n\r\n" % len(body) + body)
    sys.stdout.buffer.flush()


while (message := read()) is not None:
    method = message.get("method")
    cwd = os.getcwd()
    if method == "initialize":
        root_uri = message["params"].get("rootUri")
        send({"id": message["id"], "result": {"capabilities": {"fake": True}}})
    elif method == "initialized":
        send({"id": 1, "method": "workspace/configuration", "params": {"items": [{}]}})
    elif method is None and message.get("id") == 1:
        send({"method": "fake/configured", "params": {"cwd": cwd, "answer": message["result"]}})
    elif method == "textDocument/didOpen":
        uri = message["params"]["textDocument"]["uri"]
        diagnostic = {
            "range": {"start": {"line": 0, "character": 0}, "end": {"line": 0, "character": 1}},
            "message": f"cwd={cwd} root={root_uri}",
        }
        send({"method": "textDocument/publishDiagnostics",
              "params": {"uri": uri, "diagnostics": [diagnostic]}})
    elif method == "textDocument/definition":
        send({"id": message["id"], "result": {"cwd": cwd}})
    elif method == "workspace/symbol":
        send({"id": message["id"], "result": [{"name": cwd}]})
    elif method == "shutdown":
        send({"id": message["id"], "result": None})
    elif method == "exit":
        break
