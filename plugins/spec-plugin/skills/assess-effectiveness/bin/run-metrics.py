#!/usr/bin/env python3
"""
run-metrics.py — assess the LATEST spec-plugin version across every session that used it.

Finds all transcripts that invoked a spec-plugin skill at the target version
(default: latest installed) across ALL ~/.claude/projects, and reports the
run-efficiency profile per session + aggregate, vs the v11 baseline. This is a
cross-session, version-scoped view — NOT one run — so it shows how the latest
plugin version behaves in the wild, to drive the next round of improvements.

Usage:
  python3 run-metrics.py                      # latest version, last 14 days, all projects
  python3 run-metrics.py --version v12        # pin a version
  python3 run-metrics.py --since "2026-06-01 00:00"   # widen/narrow the window
  python3 run-metrics.py --all                # no mtime bound (slower)
  python3 run-metrics.py --dir <projects-subdir>      # limit to one project's transcripts

Baseline (v11, pre-tuning): thinking≈87% · 12 & 8 compactions/engineer-session ·
explore-Bash:Skill≈150:1 · preload-fired=False. After tuning, expect: thinking
lower, compactions→~0 per story, explore:skill inverts, preload-fired=True.
"""
import json, os, glob, re, argparse, time

EXPLORE = re.compile(r'^\s*(?:cd\s+\S+\s*&&\s*)?(?:[A-Za-z_]\w*=\S+\s+)*(grep|rg|ag|ack|cat|head|tail|find|fd|ls)\b')
GATE = re.compile(r'\b(test|pytest|vitest|jest|mypy|ruff|rubocop|tsc|eslint|build|rake|cargo|go test|git|bundle|install)\b')

def latest_version():
    vs = []
    for d in glob.glob(os.path.expanduser("~/.claude/plugins/cache/*/spec-plugin/v*")):
        m = re.search(r"/v(\d+)$", d)
        if m: vs.append(int(m.group(1)))
    return "v%d" % max(vs) if vs else None

def analyze(f, ver):
    """Return metrics dict if the session invoked a spec-plugin skill at `ver`, else None."""
    marker = "spec-plugin/%s/" % ver
    used = False; turns = out = explore = skill = vis = comp = 0
    preload = False; title = None; firstu = None; skills = set()
    for line in open(f, errors="ignore"):
        if marker in line:
            used = True
            skills.update(re.findall(r"spec-plugin/%s/skills/([a-z-]+)" % re.escape(ver), line))
        try: o = json.loads(line)
        except Exception: continue
        t = o.get("type")
        if t == "ai-title": title = o.get("aiTitle") or title
        if o.get("isCompactSummary"): comp += 1
        m = o.get("message", {}) if isinstance(o.get("message"), dict) else {}
        c = m.get("content")
        s = c if isinstance(c, str) else (" ".join(b.get("text","") for b in c if isinstance(b,dict) and b.get("type")=="text") if isinstance(c,list) else "")
        if "=== STORY (" in s or "=== version architecture (" in s: preload = True
        if t == "user" and firstu is None and s and not s.startswith("<") and "caveat" not in s.lower()[:30]:
            firstu = s[:60]
        if t != "assistant": continue
        turns += 1
        out += m.get("usage", {}).get("output_tokens", 0)
        for b in m.get("content", []):
            if not isinstance(b, dict): continue
            if b.get("type") == "text": vis += len(b.get("text","") or "")
            elif b.get("type") == "tool_use":
                vis += len(json.dumps(b.get("input", {})))
                n = b.get("name")
                if n == "Skill": skill += 1
                elif n == "Bash":
                    cmd = b.get("input", {}).get("command", "") or ""
                    if EXPLORE.match(cmd) and not GATE.search(cmd): explore += 1
    if not used or turns == 0: return None
    think = round(100 * max(0, out - vis // 4) / out) if out else 0
    label = (title or firstu or "?").replace("\n", " ")
    mr = re.search(r"You are\s+\*?\*?([a-z0-9-]+)", firstu or "")
    if mr: label = mr.group(1)
    return dict(f=os.path.basename(f)[:8], proj=os.path.basename(os.path.dirname(f)), turns=turns,
                out=out, think=think, comp=comp, explore=explore, skill=skill, preload=preload,
                skills="+".join(sorted(skills)) or "—", label=label[:34])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", default=None, help="spec-plugin version, e.g. v12 (default: latest installed)")
    ap.add_argument("--dir", default=None, help="limit to one ~/.claude/projects subdir")
    ap.add_argument("--since", default=None, help='local "YYYY-MM-DD HH:MM"; default last 14 days')
    ap.add_argument("--all", action="store_true", help="no mtime bound (scan everything; slower)")
    a = ap.parse_args()
    ver = a.version or latest_version()
    if not ver:
        print("could not detect an installed spec-plugin version; pass --version vNN"); return
    proj = glob.glob(os.path.expanduser("~/.claude/projects/*"))
    dirs = [a.dir] if a.dir else proj
    files = [f for d in dirs for f in glob.glob(os.path.join(d, "*.jsonl"))]
    if not a.all:
        cut = datetime_to_epoch(a.since) if a.since else time.time() - 14*86400
        files = [f for f in files if os.path.getmtime(f) >= cut]
    rows = [r for r in (analyze(f, ver) for f in sorted(files, key=os.path.getmtime)) if r]
    print("spec-plugin %s · %d session(s) that invoked it%s\n" % (ver, len(rows), "" if a.all else " (last %s)" % (a.since or "14d")))
    print(f"{'session':9} {'turns':>5} {'out_k':>6} {'think%':>6} {'comp':>5} {'explore':>7} {'skill':>5} {'preload':>7}  skills · role")
    for r in rows:
        print(f"{r['f']:9} {r['turns']:>5} {r['out']//1000:>6} {r['think']:>6} {r['comp']:>5} {r['explore']:>7} {r['skill']:>5} {str(r['preload']):>7}  {r['skills']} · {r['label']}")
    if rows:
        eng = sorted(r["think"] for r in rows if r["turns"] > 40)
        te, ts = sum(r["explore"] for r in rows), sum(r["skill"] for r in rows)
        execs = [r for r in rows if "execute-task" in r["skills"]]
        pf = sum(1 for r in execs if r["preload"])
        print(f"\nAGGREGATE · explore-Bash:Skill = {te}:{ts} ({'%.0f:1' % (te/ts) if ts else '∞'})"
              f" · compactions = {sum(r['comp'] for r in rows)}"
              f" · median think% (>40t) = {eng[len(eng)//2] if eng else 0}")
        print(f"execute-task sessions = {len(execs)}; preload fired in {pf}/{len(execs)}")
        print("BASELINE v11: think≈87% · 12+8 compactions/engineer · explore:skill≈150:1 · preload=False")

def datetime_to_epoch(s):
    from datetime import datetime
    return datetime.strptime(s, "%Y-%m-%d %H:%M").timestamp()

if __name__ == "__main__":
    main()
