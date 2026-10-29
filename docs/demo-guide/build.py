# Build the printable guide: anchors on stages/steps, a linked index, then PDF.
import os, re, subprocess, sys, html
G = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
CHROME = os.environ.get("CHROME", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
src = open(f"{G}/mmani-demo-guide.html").read()

entries = []  # (level, id, label)
def stage(m):
    tag, attrs, text = m.group(1), m.group(2), m.group(3)
    plain = re.sub(r"<[^>]+>", "", text).strip()
    sid = "sec-" + re.sub(r"[^a-z0-9]+", "-", plain.lower()).strip("-")[:40]
    entries.append((2 if tag == "h2" else 3, sid, plain))
    return f'<{tag}{attrs} id="{sid}">{text}</{tag}>'

def step(m):
    num, rest = m.group(1), m.group(2)
    plain = re.sub(r"<[^>]+>", " ", rest)
    plain = re.sub(r"\s+", " ", plain).strip()
    entries.append((4, f"step-{num}", f"Step {num} · {plain}"))
    return (f'<div class="head" id="step-{num}"><span class="step">STEP {num}</span>{rest}'
            f'<a class="up" href="#index">↑ Index</a></div>')

# Only Part / Stage headings after the index placeholder.
head, tail = src.split("<!--INDEX-->", 1)
HEAD_RE = r'<(h2|h3)([^>]*)>((?:Part|Stage|Appendix)[^<]*(?:<code>[^<]*</code>[^<]*)*)</h[23]>'
STEP_RE = r'<div class="head"><span class="step">STEP (\d+)</span>(.*?)</div>'
def either(m):
    if m.group("h"):
        return stage(re.match(HEAD_RE, m.group(0)))
    return step(re.match(STEP_RE, m.group(0)))
tail = re.sub(f"(?P<h>{HEAD_RE})|(?P<s>{STEP_RE})", either, tail)

items = []
for lvl, aid, label in entries:
    cls = {2: "i-part", 3: "i-stage", 4: "i-step"}[lvl]
    items.append(f'<li class="{cls}"><a href="#{aid}">{html.escape(label)}</a></li>')
index = ('<h2 id="index">Index</h2>\n<p class="small">Select any line to jump to that stage or step. '
         'Every step has an ↑ Index link back here.</p>\n<ul class="index">' + "\n".join(items) + "</ul>\n")

css = """
  .index { list-style: none; padding: 0; margin: 6pt 0 0; columns: 2; column-gap: 18pt; }
  .index li { break-inside: avoid; margin: 0; padding: 1.5pt 0; }
  .index .i-part { font-weight: 800; margin-top: 6pt; }
  .index .i-stage { font-weight: 600; margin-top: 4pt; }
  .index .i-step { padding-left: 10pt; font-size: 9.5pt; }
  .index a { color: var(--ink); }
  .dss .head { position: relative; }
  .dss .head a.up { position: absolute; right: 10pt; top: 6pt; font: 600 8pt ui-monospace, Menlo, monospace; color: var(--muted); }
"""
out = head.replace("</style>", css + "</style>", 1) + index + tail
open(f"{G}/build.html", "w").write(out)
subprocess.run([CHROME, "--headless=new", "--disable-gpu",
                "--no-pdf-header-footer", "--generate-pdf-document-outline",
                f"--print-to-pdf={G}/mmani-demo-guide.pdf", f"file://{G}/build.html"], check=True,
               stderr=subprocess.DEVNULL)
print(len([e for e in entries if e[0] == 4]), "steps,", len(entries), "index entries")
