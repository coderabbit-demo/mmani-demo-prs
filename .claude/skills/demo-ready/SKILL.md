---
name: demo-ready
description: Get the machine ready for the mmani-demo-prs SE demo — sync the local repo to the pre-PR branch state, run the freshness check, open a fresh Chrome window with all demo tabs (SE deck first), and open VS Code on the project. Covers both the main walkthrough (Parts I–II) and the 42-minute Verify, backend and approvals session (Part III). Trigger on "/demo-ready", "get me ready for the demo", "set up the demo", "demo prep".
---

# demo-ready

Prepares everything for the `coderabbit-demo/mmani-demo-prs` SE demo. Source of truth for the
flow and the freshness rules is `docs/demo-guide/mmani-demo-guide.html` (Freshness check +
Appendix A/C). Part III of that guide (Steps 31–41) is the 42-minute Verify, backend and
approvals session; its Markdown runbook is `docs/demo-runbook-verify-backend.md` (PR #16), and
the printed guide is on Drive as
[mmani-demo-guide.pdf](https://drive.google.com/file/d/1YT95z_KyGDSXFKOWff1jDT38xf997Z-N/view).
Run all five phases in order and report a short summary at the end.

Repo path: `~/projects/mmani-demo-prs`. **Never push** `agent/discount-codes` or
`demo/agent-base` — every push to the agent branch triggers a new review. Also never push to
`demo/low-risk-copy` (#14): a new commit drops its CodeRabbit approval. Never merge #17: its base
is `agent/discount-codes`, so merging pushes to the agent branch. Nothing here pushes.

## Phase 1 — Sync local to the pre-PR state

Run in the repo. These are local-only (fetch/pull, no push):

```bash
R=~/projects/mmani-demo-prs
git -C "$R" fetch origin
git -C "$R" switch agent/discount-codes
git -C "$R" pull --ff-only
git -C "$R" branch -f demo/agent-base "$(git -C "$R" merge-base origin/agent/discount-codes origin/main)"
```

Then verify the three invariants the CLI/VS Code review depends on:

```bash
git -C "$R" rev-parse --short HEAD              # expect: e7a13a2
git -C "$R" rev-parse --short demo/agent-base   # expect: df75131
git -C "$R" diff --stat demo/agent-base..HEAD | tail -1   # expect: 13 files changed
git -C "$R" status --porcelain                  # expect: empty (clean working tree)
```

If the working tree is dirty, warn: a leftover rehearsal fix (applied suggestion / Fix with AI)
must be discarded before the demo. If HEAD moved past `e7a13a2`, the agent branch advanced on
origin — flag it; the screenshots in the guide were captured at `e7a13a2`.

## Phase 2 — Freshness check

Auto-checked above: branches exist, HEAD/base revisions, 13-file diff, clean tree. Print the
remaining items (live, must be eyeballed in the browser once the tabs are open) as a checklist:

- PR #3 is open, unmerged, labeled **Demo - Do not merge**; F1 and F2 threads unresolved.
- PR summary still shows Pre-merge checks with Success Criteria graded against SC-10.
- Deep Scan `2b10cbc0` is the selected scan on the **agent branch** (a scan of `main` has no F1).
- Fix with AI task `6265b19c` exists. **Do not** click Recheck, Fix, Create PR, or Commit and
  push — each one pushes or re-scans and marks F1 Fixed (can't be undone short of a re-scan).
- Do not start a new Deep Scan during the demo.

Part III PRs (all labeled **Demo - Do not merge**). Check them with one read-only call:

```bash
for n in 13 14 15 16 17 18; do gh pr view $n --repo coderabbit-demo/mmani-demo-prs \
  --json number,state,isDraft,reviewDecision,headRefName \
  --jq '"#\(.number) \(.state) draft=\(.isDraft) \(.reviewDecision) \(.headRefName)"'; done
```

Expect all OPEN; #13–#16 and #18 drafts; **#14 APPROVED** (CodeRabbit approved it after
`@coderabbitai ignore pre-merge checks`, Nov 19 17:13 UTC); #17 not a draft, head
`coderabbit/add-pull-request-tests/…`. Then eyeball:

- #14 summary: Merge Risk **Minimal**, "Pre-merge checks failed · 2 inconclusive", the override
  reply, and "coderabbitai approved these changes". Don't rerun the override on #14.
- #15: the CodeRabbit Verify comment says **All scenarios passed · 2 of 2**.
- PR #3: Finishing Touches no longer offers Generate unit tests (it produced #17). Never tick
  **Commit to this branch** there.
- The GitHub rule Step 40 assumes (2 required approvals on `main`) may not be set yet; if it
  isn't, present it as the policy you would set.

## Phase 3 — Start the demo server (buggy agent branch)

The server must run the `agent/discount-codes` code (Phase 1 already checked it out), so F2 is
live. `npm run dev` brings up the services + Vite storefront:

- catalog `:4001`, orders `:4002`, gateway `:8080`, storefront (Vite) **`http://localhost:5173`**.

Start it detached so it survives this turn, and confirm it is listening before opening the tab:

```bash
cd ~/projects/mmani-demo-prs
pgrep -f scripts/dev.ts >/dev/null && echo "already running" || nohup npm run dev > "$TMPDIR/demo-dev.log" 2>&1 &
sleep 6
curl -s -o /dev/null -w "5173:%{http_code} 8080:%{http_code}\n" http://localhost:5173 http://localhost:8080
tail -15 "$TMPDIR/demo-dev.log"
```

Port binding and the `nohup` launch need the sandbox disabled. Data is synthetic and resets on
restart. Stop it after the demo with `pkill -f scripts/dev.ts`.

**Part III Step 32 smoke test (raw HTTP, synthetic data):** confirm the gateway reproduces
Verify scenarios 2 and 3 before the session. Expect `-2500` then `200`:

```bash
GW=http://localhost:8080/api; G='Authorization: Bearer demo-grace'; A='Authorization: Bearer demo-ada'; J='Content-Type: application/json'
M=$(curl -s -X POST $GW/orders -H "$G" | jq -r .id); curl -s -X PUT $GW/orders/$M/lines/MUG-CERAMIC -H "$G" -H "$J" -d '{"quantity":1}' >/dev/null
curl -s -X POST $GW/orders/$M/discount -H "$G" -H "$J" -d '{"code":"SAVE20"}' | jq .totals.netCents
C=$(curl -s -X POST $GW/orders -H "$A" | jq -r .id); curl -s -X PUT $GW/orders/$C/lines/HOODIE-GRY-L -H "$A" -H "$J" -d '{"quantity":1}' >/dev/null
curl -s -o /dev/null -w '%{http_code}\n' -X POST $GW/orders/$C/discount -H "$A" -H "$J" -d "{\"code\":\"X') OR code = 'WELCOME10' --\"}"
```

These calls add carts to the running server's in-memory data. They don't affect the storefront
repro below, and everything resets when `npm run dev` restarts.

**Repro to show F2 (leave the live tab fresh; walk this in the demo):** Shopping as Ada → add
the **Ceramic carrot mug** ($15) → apply code **SAVE20** ($20 fixed) → the discount is counted
twice (adjustment line drags subtotal to −$5, plus Discount −$20), so **Total = −$25.00**. Other
seeded codes: `WELCOME10` 10%, `APPAREL15` 15% apparel, `VIP50` $50/1-use, `SUMMER25` expired.

## Phase 4 — Open a fresh Chrome window with the demo tabs

Approach A: a brand-new Chrome window, SE deck as the first tab, in demo order.

`open` is blocked inside the Bash sandbox (error -10822). Run this step with the sandbox
disabled (it still goes through the permission gate). If that is declined, print the block for
the user to paste into a terminal.

```bash
open -na "Google Chrome" --args --new-window "https://content.coderabbit.ai/content/sales/se-demo/se-demo-deck"
sleep 2
open -a "Google Chrome" \
  "https://app.coderabbit.ai" \
  "https://coderabbit-demo.atlassian.net/browse/SC-10" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/3" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/3#discussion_r4407733137" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/3#discussion_r4407733154" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/3#discussion_r4407733140" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/3#discussion_r4407733132" \
  "https://app.coderabbit.ai/triage?repo=mmani-demo-prs" \
  "https://app.coderabbit.ai/change-stack/coderabbit-demo/mmani-demo-prs/pull/3/overview?toCommitId=f8c4f9b8e5063afb6c1519f03cc199b9f7e2d51e&reviewRunId=52e242bc-2bab-4445-938d-5d44d22fb365" \
  "https://app.coderabbit.ai/change-stack/coderabbit-demo/mmani-demo-prs/pull/3/blast-radius?toCommitId=f8c4f9b8e5063afb6c1519f03cc199b9f7e2d51e&reviewRunId=52e242bc-2bab-4445-938d-5d44d22fb365" \
  "https://app.coderabbit.ai/change-stack/coderabbit-demo/mmani-demo-prs/pull/3/qa-agent?qaRunId=b2070439-9e89-49bd-a484-5bcfe3dbdff6&qaView=history" \
  "https://app.coderabbit.ai/security/repositories?owner=coderabbit-demo&repo=mmani-demo-prs&tab=code&scanId=2b10cbc0-68c6-404b-927b-7963e1ed70ab" \
  "https://app.coderabbit.ai/security/repositories?owner=coderabbit-demo&repo=mmani-demo-prs" \
  "https://app.coderabbit.ai/code/tasks/6265b19c-1bba-49ef-ac60-f4f66a4dd2a2" \
  "https://app.coderabbit.ai/verify/repositories" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/14" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/13/files" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/15" \
  "https://app.coderabbit.ai/change-stack/coderabbit-demo/mmani-demo-prs/pull/15/verify?cs_source=qa_pr_comment&qaRunId=2b05da6e-d2f0-4da4-90f5-b5e5a20f24d2" \
  "https://github.com/coderabbit-demo/mmani-demo-prs/pull/17" \
  "https://drive.google.com/file/d/1YT95z_KyGDSXFKOWff1jDT38xf997Z-N/view" \
  "http://localhost:5173/"
```

Tab order (deck first, then app home, then one tab per demo stop):
1. SE demo deck · 2. app.coderabbit.ai · 3. Jira SC-10 · 4. GitHub PR #3 ·
5-8. Steps 7-9 finding deep links (F1 discounts.ts:20; F2 discounts.ts:73, :30; db.ts:17) ·
9. Triage · 10. Change Stack overview · 11. Security Blast radius · 12. QA Agent run ·
13. Deep Scan `2b10cbc0` · 14. Attack Surface · 15. Fix with AI task `6265b19c` ·
16. Verification/Testing (→ Test suites → mmani-demo-prs → User journeys; Part III Step 33:
Journey Testing → Schedules) · 17. #14 low-risk PR (Merge Risk Minimal, override, approval) ·
18. #13 approval config diff · 19. #15 regression tests · 20. #15 Verify run (2 of 2 passed) ·
21. #17 generated unit tests · 22. Demo guide PDF on Drive ·
23. Storefront `localhost:5173` (live buggy app — Phase 3 must be up first; leave it fresh).

Tabs 17–22 serve Part III. For the main walkthrough only, they can stay in the background.

**Change Stack / Blast radius revision.** The latest review run (`e7a13a2`, the
`Merge branch 'main'` head) is **Review skipped — no files to review**, so its Change Stack is
empty and Security Blast radius is unavailable. The real review is the prior run on `f8c4f9b`.
Both tabs above are pinned to it with `toCommitId=f8c4f9b8e5063afb6c1519f03cc199b9f7e2d51e&reviewRunId=52e242bc-2bab-4445-938d-5d44d22fb365`.
The page shows an "older snapshot" banner — expected; do not click "Open latest snapshot" (that
returns to the empty head run). If the run id ever changes, re-pin: open Change Stack → Review
history → select the `f8c4f9b` run, and read the `toCommitId` / `reviewRunId` off the URL.

Full Appendix A deep-link index is in the guide if a deeper set is wanted.

## Phase 5 — Open VS Code on the project

```bash
code ~/projects/mmani-demo-prs
```

Also sandbox-blocked; run it with the sandbox disabled or print it for the user. In VS Code:
CodeRabbit panel → Current = `agent/discount-codes`, Compare against = `demo/agent-base`
(not `origin/main`), Changes to review = Committed changes.

## Final report

One short summary: sync result (HEAD / base / file count / clean?), the freshness checklist,
the Part III PR states (#13–#18) and the Step 32 smoke test, whether Chrome and VS Code launched,
and any item that needs the user's attention.
