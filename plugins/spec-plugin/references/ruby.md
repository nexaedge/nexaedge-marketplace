# Ruby / Rails toolkit

Tool versions resolve automatically via asdf (`.tool-versions`) — call `ruby` / `bin/rails` directly. **Never grep-spelunk** for "does X exist / what's its signature / how does it behave"; use the tools below.

## Navigate — verify a symbol, go-to-definition, find callers

Ruby introspection is ground truth — it resolves inheritance and mixins correctly (better than grep). Ruby-LSP (if installed in the env) helps with go-to-def/find-refs, but Ruby's dynamic nature limits it, so introspection is the reliable path.

```bash
# exists? + real signature + where defined (resolves super/include/prepend)
ruby -r./path/file.rb -e 'p Klass.instance_method(:meth).source_location'    # file:line
ruby -r./path/file.rb -e 'p Klass.instance_method(:meth).parameters'          # [[:req,:x],[:key,:y]]
ruby -r./path/file.rb -e 'p Klass.new.respond_to?(:meth)'                      # exists?
ruby -r./path/file.rb -e 'p Klass.instance_methods(false)'                     # own methods (no inherited)
ruby -r./path/file.rb -e 'p Klass.method(:cls_meth).source_location'          # class method
# Rails-autoloaded / STI / metaprogrammed classes (slower — boots the app):
bin/rails runner 'p Model.instance_method(:meth).source_location'
```
Structural search (callers, defs) when introspection can't load the class:
```bash
ast-grep -p 'def meth($$$)'   -l ruby .      # definitions
ast-grep -p '$RECV.meth($$$)' -l ruby .       # call sites
```

## Execute — observe real behavior (no staging)

One-shot REPL eval (prefer this). Stub only the outermost boundary; everything beneath runs for real.
```bash
bin/rails runner 'puts OrderSerializer.new(Order.last).to_json'                # full app
bin/rails runner - <<'RB'                                                       # multi-line on stdin
order = Order.new(id: 7, total_cents: 1990); puts OrderSerializer.new(order).serializable_hash.to_json
RB
ruby -r./lib/calc.rb -e 'puts Calc.new(0.1).total(100)'                         # no Rails boot
bin/rails runner 'PaymentGateway.define_method(:charge){|*| {status:"approved"} }; p Checkout.new.run(Order.last)'  # stub boundary
```
Interactive REPL via tmux (persistent state):
```bash
SOCK=/tmp/probe/rb.sock
tmux -S "$SOCK" new-session -d -s con -x 220 -y 50
tmux -S "$SOCK" send-keys -t con 'bin/rails console' Enter
# poll `capture-pane` until the prompt appears, then send lines; state persists
tmux -S "$SOCK" send-keys -t con 'u = User.first; u.orders.count' Enter
tmux -S "$SOCK" capture-pane -t con -p | tail -30
tmux -S "$SOCK" kill-server
```

## Debug — breakpoint, real stack + locals (`rdbg`, the `debug` gem)

`rdbg` output needs a real PTY → drive it via tmux.
```bash
SOCK=/tmp/probe/dbg.sock
tmux -S "$SOCK" new-session -d -s dbg -x 200 -y 50
tmux -S "$SOCK" send-keys -t dbg 'rdbg bin/rails -- runner script.rb' Enter
# then: b Klass#meth (breakpoint) → c (continue) → bt (backtrace) → info (locals+ivars+%self) → p EXPR
tmux -S "$SOCK" send-keys -t dbg 'b Calc#total' Enter
tmux -S "$SOCK" send-keys -t dbg 'c' Enter
tmux -S "$SOCK" send-keys -t dbg 'bt' Enter
tmux -S "$SOCK" capture-pane -t dbg -p | tail -40
tmux -S "$SOCK" kill-server
```
Or drop `binding.b` (alias `binding.break`) in source for an explicit stop. `catch ZeroDivisionError` breaks on raise.
