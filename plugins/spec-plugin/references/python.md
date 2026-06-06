# Python toolkit

Tool versions resolve via asdf (`.tool-versions`) — call `python` directly (run inside the project's venv where one exists). **Never grep-spelunk**; use the tools below. With `pyright-lsp` installed, prefer the harness's **native go-to-definition / find-references**.

## Navigate — verify a symbol, go-to-definition, find callers

`inspect` is ground truth for existence, signature, and definition location.
```bash
# from a dir where `import mod` resolves (dotted path for nested packages)
python -c "import inspect,mod; print(inspect.signature(mod.Cls.foo))"                         # real typed signature
python -c "import inspect,mod; print(inspect.getsourcefile(mod.Cls.foo), inspect.getsourcelines(mod.Cls.foo)[1])"  # file + line
python -c "import mod; print(hasattr(mod.Cls,'foo'))"                                          # exists?
python -c "import mod; print([m for m in dir(mod.Cls) if not m.startswith('_')])"             # public members
```
Structural search (callers, defs):
```bash
ast-grep -p 'def foo($$$)'     -l python .     # definitions
ast-grep -p 'Order.create($$$)' -l python .     # call sites
```

## Execute — observe real behavior (no staging)

One-shot eval (prefer this); load app context for frameworks.
```bash
python -c 'from app.api.payload import build_payload; print(build_payload(user_id=7, amount=1990))'
echo 'from app.models import User; print(User.objects.first().pk)' | python manage.py shell      # Django app context
python -c 'import django,os; os.environ.setdefault("DJANGO_SETTINGS_MODULE","cfg.settings"); django.setup(); from app.models import User; print(User.objects.count())'
```
Interactive REPL via tmux (`ipython` if available):
```bash
SOCK=/tmp/probe/py.sock
tmux -S "$SOCK" new-session -d -s py -x 200 -y 50
tmux -S "$SOCK" send-keys -t py 'ipython' Enter        # or: python manage.py shell / python
# poll capture-pane until ready, then:
tmux -S "$SOCK" send-keys -t py 'from app.calc import Calc; Calc(0.1).total(100)' Enter
tmux -S "$SOCK" capture-pane -t py -p | tail -20
tmux -S "$SOCK" kill-server
```

## Debug — breakpoint, stack + locals (`pdb`, scriptable without a TTY)

```bash
# post-mortem at an uncaught exception — drops into the failing frame:
python -m pdb -c c -c where -c 'p n' -c q ./buggy.py
# breakpoint with an auto-command block fed on stdin (end with a final `c`):
printf 'b mod.py:42\ncommands 1\nsilent\nwhere\np some_local\nc\nend\nc\n' | python -m pdb ./script.py
```
pdb commands: `b FILE:LINE` (breakpoint), `c` (continue), `where`/`w` (stack), `args`/`a` (function args), `p`/`pp EXPR`, `n`/`s` (next/step). In code: `breakpoint()` drops into pdb at that line.
