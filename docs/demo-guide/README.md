# Demo guide: follow one finding from Jira to Deep Scan

`mmani-demo-guide.pdf` is the Do / Say / See runbook for the PR #3 demo. It follows two
findings — F1, the SQL injection at `services/orders/src/discounts.ts:20`, and F2, the
double-counted, uncapped discount — through the CLI, VS Code, the PR review, Triage,
Change Stack, QA Agent, Deep Scan, and QA user journeys. A copy lives in Drive as
`mmani-demo-guide.pdf`.

| Path | What it is |
| --- | --- |
| `mmani-demo-guide.html` | Guide source. Edit this. |
| `build.py` | Adds step anchors and the linked index, then prints the PDF with headless Chrome. |
| `shots/` | Original light-mode captures (October 28, 2026). |
| `shots-jpg/` | Compressed copies referenced by the HTML. |
| `mmani-demo-guide.pdf` | Built output. |

## Rebuild the PDF

```bash
cd docs/demo-guide
python3 build.py        # writes build.html (ignored) and mmani-demo-guide.pdf
```

Requires Python 3 and Google Chrome. Set `CHROME=/path/to/chrome` if Chrome is not in the
default macOS location.

## Add or replace a screenshot

Save the capture in `shots/`, then make the compressed copy the HTML references (macOS):

```bash
sips -Z 1400 -s format jpeg shots/NN-name.png --out shots-jpg/NN-name.jpg
```

Reference it from a step as `<img src="shots-jpg/NN-name.jpg">`. Captures are light mode;
keep new ones consistent. Steps are numbered by hand in the HTML (`STEP N`); the index and
anchors are generated from those numbers.
