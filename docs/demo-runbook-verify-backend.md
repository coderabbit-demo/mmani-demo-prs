# Demo runbook: Verify, backend tests, regression and merge risk (42 min)

A Do / Say / See runbook for a 42-minute session on PR #3 (`agent/discount-codes`, SC-10). It
reuses steps from the main demo guide ([`docs/demo-guide/`](demo-guide/), "Step N" below means
that guide's step) and reorders them around Verify, backend testing, regression and approvals.

The two findings, as in the guide:

- **F1:** SQL injection in the discount lookup, `services/orders/src/discounts.ts:20`.
- **F2:** the discount is counted twice (a −1 order line and `discount_cents`) and never capped
  (`discounts.ts:29-30`, `:67-73`), with a relaxed quantity constraint (`db.ts:17`).

Pull requests used:

| PR | Branch | Role in this session |
| --- | --- | --- |
| [#3](https://github.com/coderabbit-demo/mmani-demo-prs/pull/3) | `agent/discount-codes` | The agent's PR with F1 and F2. Merge Risk **High**. |
| [#14](https://github.com/coderabbit-demo/mmani-demo-prs/pull/14) | `demo/low-risk-copy` | README-only copy fix, stacked on the config PR. |
| [#13](https://github.com/coderabbit-demo/mmani-demo-prs/pull/13) | `demo/approval-config` | Approval policy in `.coderabbit.yaml`. |
| [#15](https://github.com/coderabbit-demo/mmani-demo-prs/pull/15) | `test/discount-regression` | Regression tests for the F2 cap and single deduction. |

> Every PR here is labeled **Demo - Do not merge**. Never push to `agent/discount-codes`: a
> push re-triggers review of PR #3. Leave the F1 and F2 review threads on PR #3 unresolved.

## Before the session

- Run the main guide's freshness check (Part III). PR #3 is open, unmerged, and its F1 and F2
  threads are unresolved.
- The new PRs are drafts, and CodeRabbit skips drafts (`auto_review.drafts: false`) and
  automatic Verify runs skip them too. Before the session, comment `@coderabbitai review` on
  PR #14 so it has a Merge Risk rating and an approval decision. Comment
  `@coderabbitai verify` on any draft PR you want a Verify run on.
- For section 3, start the app on the agent branch in a local checkout (never push from it):
  `git worktree add --detach ../mmani-agent origin/agent/discount-codes`, then `npm ci` and
  `npm run dev` in that folder. Data is synthetic and in-memory.

---

## 1. Frame (2 min)

**Do** Open SC-10 from the Jira link in PR #3's description, then return to PR #3.

**Say** "A coding agent built this discount feature from a Jira ticket, and its tests pass. Today
we show four things CodeRabbit adds after the code review: it tests the claims against the
running app, it reaches the backend and the services this one feeds, it keeps the bug from coming
back, and it decides which pull requests a person still has to approve."

**See** PR #3, labeled **Demo - Do not merge**, with Merge Risk **High** in the summary.

---

## 2. How Verify works: Steps 16–17 (6 min)

### 2.1 Run Verify on PR #3 (Step 16)

**Do** Show the comment `@coderabbitai verify` on PR #3. For the prepared demo, open the existing
run from the comment's **Review Evidence** button rather than starting a new one.

**Say** "Findings are claims. Verify writes test scenarios from the change, runs them against the
running app in a sandbox, and keeps the evidence. Automatic runs skip drafts, so on a draft you
ask for one with this comment."

**See** "At least one scenario demonstrated a regression." 5 of 5 scenarios, 11 bugs, with the
testing limits stated.

### 2.2 F2 proven in the running app (Step 17)

**Do** Open scenario 2, *It preserves physical order lines and totals through discounted
checkout*. Show **Evidence**, then **Checks → Failed**.

**Say** "Checkout worked, and that is the problem. The hoodie cart reports a 4,000-cent subtotal
instead of 6,000, the fulfillment consumer receives a quantity of minus one, and the mug cart nets
minus $25."

**See** Observed: "Discounted cart reported subtotal 4000 rather than 6000." "The mug cart net was
-2500, below zero." An execution log on each check.

---

## 3. Backend and cross-service: Step 18 as API tests, then Step 9 (7 min)

### 3.1 The same scenarios as raw HTTP calls

**Do** In a terminal, run the calls below against the gateway on `:8080` of the local agent-branch
stack. Then open scenario 3 (Step 18), *It rejects unauthorized discount and unsafe sorting
requests*, and show **Checks → Failed**.

**Say** "Verify isn't only clicking through a storefront. Under the UI these are API calls, and you
can replay every one of them. Here is scenario 2 and scenario 3 as plain HTTP against the gateway."

**See** The responses below. They match Verify's observed values exactly. On `main` the same calls
return a 6,000 subtotal with no discount line, a mug net of 0, and **400** for the injected code.

The `Authorization` value is a synthetic demo shopper ID, the same one the storefront's shopper
picker uses (`GET /api/shoppers`). It is not a credential. No other headers or secrets are needed.

```bash
GW=http://localhost:8080/api
ADA='Authorization: Bearer demo-ada'
GRACE='Authorization: Bearer demo-grace'
JSON='Content-Type: application/json'
```

Scenario 2: a discounted hoodie cart, then the order that fulfillment reads after checkout.

```bash
ORDER=$(curl -s -X POST "$GW/orders" -H "$ADA" | jq -r .id)
curl -s -X PUT "$GW/orders/$ORDER/lines/HOODIE-GRY-L" -H "$ADA" -H "$JSON" -d '{"quantity":1}' > /dev/null
curl -s -X POST "$GW/orders/$ORDER/discount" -H "$ADA" -H "$JSON" -d '{"code":"SAVE20"}' \
  | jq -c '{lines: [.lines[] | {sku, quantity}], totals}'
curl -s -X POST "$GW/orders/$ORDER/checkout" -H "$ADA" -o /dev/null -w 'checkout HTTP %{http_code}\n'
curl -s "$GW/orders/$ORDER" -H "$ADA" | jq -c '{status, lines: [.lines[] | {sku, quantity}], totals}'
```

```text
{"lines":[{"sku":"DISCOUNT-SAVE20","quantity":-1},{"sku":"HOODIE-GRY-L","quantity":1}],"totals":{"subtotalCents":4000,"discountCents":2000,"netCents":2000}}
checkout HTTP 200
{"status":"placed","lines":[{"sku":"DISCOUNT-SAVE20","quantity":-1},{"sku":"HOODIE-GRY-L","quantity":1}],"totals":{"subtotalCents":4000,"discountCents":2000,"netCents":2000}}
```

Scenario 2: a $20 code on a $15 mug.

```bash
MUG=$(curl -s -X POST "$GW/orders" -H "$GRACE" | jq -r .id)
curl -s -X PUT "$GW/orders/$MUG/lines/MUG-CERAMIC" -H "$GRACE" -H "$JSON" -d '{"quantity":1}' > /dev/null
curl -s -X POST "$GW/orders/$MUG/discount" -H "$GRACE" -H "$JSON" -d '{"code":"SAVE20"}' | jq -c .totals
```

```text
{"subtotalCents":-500,"discountCents":2000,"netCents":-2500}
```

Scenario 3: SQL in the discount code applies a different promotion (F1).

```bash
CART=$(curl -s -X POST "$GW/orders" -H "$ADA" | jq -r .id)
curl -s -X PUT "$GW/orders/$CART/lines/HOODIE-GRY-L" -H "$ADA" -H "$JSON" -d '{"quantity":1}' > /dev/null
curl -s -X POST "$GW/orders/$CART/discount" -H "$ADA" -H "$JSON" \
  -d "{\"code\":\"X') OR code = 'WELCOME10' --\"}" -w '\nHTTP %{http_code}\n'
```

```text
... "sku":"DISCOUNT-WELCOME10","quantity":-1,"unitPriceCents":600 ...
HTTP 200
```

### 3.2 It breaks another repository (Step 9)

**Do** Open the `db.ts:17` finding on PR #3.

**Say** "That quantity of minus one is not a local problem. To make its design fit, the agent
relaxed a database constraint. CodeRabbit read the fulfillment repository, which is linked in this
repo's config: those minus-one lines become pick tasks and increase stock, and finance books them
as SKU revenue. The org standards repository is linked the same way."

**See** "Keep the physical-line quantity constraint." Sources: Coding guidelines, Path
instructions, Linked repositories. In `.coderabbit.yaml` (config PR #13),
`knowledge_base.linked_repositories` lists `coderabbit-demo/mmani-demo-prs-consumer` and
`coderabbit-demo/coderabbit-standards`.

---

## 4. Regression: Steps 27–29, schedule, unit test generation, a regression test (8 min)

### 4.1 Map the journey library (Step 27)

**Do** Open **Verify → Journey testing → mmani-demo-prs**. For a new repo, click **Map with an
Agent**, review the proposal, and reply "Apply all nine journeys."

**Say** "A PR run checks one change. Journeys check the product: browsing, carts, discounts,
checkout, stock, privacy, and the fulfillment handoff. You write them once and run them on every
branch."

**See** Nine journeys, each with a user, a goal, test steps, and assertions grounded in the source.

### 4.2 Baseline on main, then the agent branch (Steps 28–29)

**Do** Set **Branch** to `main` and show the latest run. Then set it to `agent/discount-codes` and
show the existing run.

**Say** "On main, every journey passes. That is the baseline. The tests don't change, only the
branch, and five journeys now fail. Every failure is about discounts."

**See** All nine passed on `main`. On the agent branch, bugs in: apply and replace discounts;
recover from an invalid or expired discount; redeem fixed discounts; place an order; the
fulfillment and finance handoff.

### 4.3 Run the journeys on a schedule

**Do** On the repository's page, open **Journey Testing → Schedules** and show (or create)
a schedule that runs the journeys on `main`.

**Say** "Regressions don't announce themselves in a PR. A schedule runs the same library on a
branch every day and can file Jira issues for new findings, so a bug that slips past a review still
gets caught by morning."

**See** A schedule with a branch, time, days of week and timezone, and the optional **Auto create
issues** setting.

### 4.4 Unit test generation

**Do** In PR #3's CodeRabbit summary, expand **Finishing Touches → Generate unit tests (beta)**
and tick **Create a new PR** (the separate-PR option). For the demo, open the existing result,
[#17](https://github.com/coderabbit-demo/mmani-demo-prs/pull/17), instead of starting a new run.

**Say** "Finishing touches can write the tests for you. With a separate PR, CodeRabbit also reads
the CI logs and fixes build failures in the tests it wrote."

**See** "Generating unit tests… This may take up to 20 minutes", a Coding Agent task, then #17:
four test files, based on `agent/discount-codes`.

> **Never tick "Commit to this branch" on PR #3.** It would commit to `agent/discount-codes` and
> re-trigger the PR #3 review.

### 4.5 The fix, with a regression test

**Do** Open PR #15 (`test/discount-regression`) and its file
`tests/discount-regression.test.ts`. Then show the same tests run against the agent branch.

**Say** "This is the test that keeps F2 from coming back. It goes through the gateway, so it
doesn't care how the discount is implemented. It asserts one deduction and a capped,
non-negative net. It passes on main. Run it against the agent's branch and all six fail, with the
exact numbers Verify reported."

**See** On `main`: `npm run check` passes, 26 tests. On the agent branch:

```text
✖ F2 cap: a fixed code larger than the cart nets zero, not a negative total
    actual:   { subtotalCents: -500, discountCents: 2000, netCents: -2500 }
    expected: { subtotalCents: 1500, discountCents: 1500, netCents: 0 }
✖ F2 single deduction: the discount is not also stored as an order line
    actual:   [ [ 'DISCOUNT-WELCOME10', -1 ], [ 'HOODIE-GRY-L', 1 ] ]
    expected: [ [ 'HOODIE-GRY-L', 1 ] ]
ℹ tests 6  pass 0  fail 6
```

---

## 5. Deterministic results (6 min)

### 5.1 Journey assertions are explicit

**Do** Open one failing journey from 4.2, for example *Redeem fixed discounts within customer and
campaign limits*, and show its assertions and evidence.

**Say** "Each journey has written assertions: expected values, observed values, and an execution
log. A result is pass or fail on those assertions, not on a model's impression."

**See** "SAVE20 on a $15 mug produced a −$25 total." Expected versus observed, with a recording.

### 5.2 Blocked and Inconclusive never count as a pass

**Do** Point at the result states in a Verify run.

**Say** "If an error stops testing, the result is Blocked. If the observations aren't enough to
decide, it's Inconclusive. If nothing ran, it's Skipped. None of those is reported as a pass, and
even Passed means only that the assessed criteria passed within the tested scope."

**See** The outcome labels Bugs, Blocked, Blockers, Failed, Passed, Inconclusive and Skipped, and
the testing limits listed on the PR run (Step 16).

### 5.3 Pre-merge checks against Jira (Step 10)

**Do** Scroll to **Pre-merge checks** in PR #3's summary. Expand **Success Criteria**, then
**Order Invariants** and **Security Gate**.

**Say** "CodeRabbit read SC-10 and graded the PR against every success criterion, with file and
line evidence. Order Invariants fails because a net can go negative. Security Gate fails on F1."

**See** 6 errors and 1 warning: Linked Issues, Out of Scope, Security Gate, Jira Work Item, Success
Criteria (S1–S10 Not met), Order Invariants.

### 5.4 What an error-mode check does

**Do** Open `.coderabbit.yaml` and point at `mode: error` on **Order Invariants** and **Security
Gate**.

**Say** "These checks are in error mode. With Automatic Approvals on, a failing error check means
CodeRabbit will not approve, so a person has to review it. It doesn't override GitHub. Branch rules
still decide what merges."

**See** `mode: error` on both checks, kept inline in `.coderabbit.yaml`.

> Don't say a pre-merge check that is **Inconclusive** blocks the PR. CodeRabbit's docs say an
> inconclusive pre-merge check does not block. 5.2 is about Verify results, not pre-merge checks.

---

## 6. Risk and rules (9 min)

### 6.1 Triage: where does PR #3 sit? (Step 11)

**Do** Open **Triage** filtered to `mmani-demo-prs`. Find PR #3.

**Say** "As a reviewer I see the whole queue, prioritized, with risk and blast radius on every
card."

**See** PR #3's card with its risk, its blast radius and the next action.

### 6.2 Merge Risk: PR #3 versus the low-risk PR

**Do** In PR #3's summary, expand **Merge Risk**. Then open PR #14 and expand its
**Merge Risk**.

**Say** "Same repository, same reviewer. PR #3 changes discount math, the schema and the order
contract, and it is rated High. This one changes README copy and nothing else, and it is rated
Minimal. The rating is tied to the commit it covers, so a new push needs a new assessment."

**See** PR #3: **Merge Risk High**, up to `f8c4f`. PR #14: **Merge Risk Minimal**, up to `e4eac`,
"This documentation-only update … does not change runtime behavior."

### 6.3 The approval policy lives in the repository

**Do** Open PR #13 and its `.coderabbit.yaml` diff.

**Say** "The policy is code, and it's reviewed like code. CodeRabbit may approve only at low risk.
The orders service needs minimal risk. Discount, pricing, checkout and schema changes are never
auto-approved. Authors can't use the approve command on their own PR, because that would skip the
thread and check requirements."

**See**

```yaml
merge_risk_instructions: >-
  High risk: any change to discount calculation or redemption, order totals or checkout ...
auto_approvals:
  enabled: true
  max_merge_risk: low
  allow_author_approval: false
  overrides:
    - paths: ["services/orders/**"]
      max_merge_risk: minimal
    - paths: ["services/orders/src/discounts.ts", "services/orders/src/pricing.ts",
              "services/orders/src/app.ts", "**/db.ts", "**/*discount*"]
      enabled: false
```

### 6.4 What CodeRabbit approves, and what it doesn't

**Do** On PR #14, show the pre-merge checks, then the `@coderabbitai ignore pre-merge checks`
comment and CodeRabbit's reply, then the approval and the merge box.

**Say** "Minimal risk is necessary, not sufficient. CodeRabbit approves only when the latest commit
is reviewed, threads are resolved, no pre-merge check is failing, and the risk limits hold. Here two
Jira checks were inconclusive, because the success criteria ask for evidence a README change can't
produce, so CodeRabbit held its approval. A person looked, decided the checks don't apply to a copy
fix, and overrode them for this PR only, on the record. CodeRabbit approved within seconds. It is
one of two approvals, so a person still has to approve. PR #3 fails on every count: High risk, a
never-auto-approve path, and six failing checks."

**See** PR #14: Merge Risk Minimal; "Pre-merge checks failed · 2 inconclusive" (Linked Issues,
Success Criteria); 6 checks passed, including Security Gate and Order Invariants. Then "Pre-merge
checks override executed successfully. Overridden by `@manimahesh` via command… Approval outcome:
Changes approved," and **coderabbitai approved these changes**. The override applies to #14 only,
and future PRs still enforce the checks. This PR is stacked on #13, so its review reads the new
policy from the PR head.

> **Before a rerun:** #14 is already approved. To show the withheld state live, use a fresh
> docs-only PR stacked on `demo/approval-config`, or show this sequence from the PR history.

> **Assumed GitHub rule (not applied by these PRs).** Branch protection or a ruleset on `main`:
> require 2 approving reviews, dismiss stale approvals on new commits, and require the `check`
> CI job. Until an admin sets it, show this as the policy you would set, not the live state.

---

## 7. Two-week pilot close (4 min)

**Do** Show a single slide or this section.

**Say** "Here is a two-week pilot that proves it on your code, not ours:

1. **One repository.** Install CodeRabbit on one service repo with this kind of
   `.coderabbit.yaml`.
2. **One cross-service journey.** Map one journey that crosses a service boundary, like our
   checkout-to-fulfillment handoff, link the downstream repository, and schedule the journey daily
   on main.
3. **One low-risk PR class.** Pick one class, for example docs-only or test-only changes, and write
   it into `merge_risk_instructions`.
4. **Approvals in observe-only mode first.** For the first week, leave `auto_approvals.enabled`
   off and compare the Merge Risk CodeRabbit assigns with what your reviewers decide. Turn
   approvals on for that one class only once they agree."

**See** The four pilot items, plus the success measure: CodeRabbit's low-risk calls match the
human reviewers' calls on every PR in the first week.

---

## Appendix: Security session, Nov 24

These steps are held for the security session. They are unchanged from the main guide.

### Stage 1: Before the PR, CLI and VS Code (Steps 3–4)

Setup: `~/projects/mmani-demo-prs` on `agent/discount-codes`, reviewed against the local branch
`demo/agent-base` (see the main guide's Appendix C). Don't compare against `main`.

**Step 3: Review committed changes with the CodeRabbit CLI.**
**Do** `coderabbit review --committed --base demo/agent-base`. **Say** "Code exists, so review
it now, before a PR." **See** F1 Injection (CWE-89) at `discounts.ts:20`. F2 "Limit the discount
to the cart subtotal", and through the tests, "Do not assert a negative order total."

**Step 4: Inspect the same findings in VS Code.**
**Do** In the CodeRabbit panel, set the base to `demo/agent-base`, scope **Review committed
changes**. **Say** "Same findings, in my editor, next to the code." **See** F1 inline at line 20;
F2 "Clamp the discount to the eligible subtotal" and "Do not subtract the discount through an order
line." Don't apply fixes during a recorded demo.

### Stage 5: Deep Scan and Attack Surface (Steps 19–23)

Deep Scan `2b10cbc0` of `agent/discount-codes`. Scan the agent branch, not `main`.

- **Step 19: Deep Scan ranks the same injection highest.** **Do** CodeRabbit Security →
  Repositories → mmani-demo-prs → Findings, agent-branch scan. Don't start a new scan. **See**
  Injection · CWE-89 · High · `discounts.ts:20`; F2 as CWE-682 at `discounts.ts:66`.
- **Step 20: The attack surface map puts F1 in the Sinks lane.** **Do** Open the **Attack
  surface** tab. **See** 94 mapped points; one red High tile in services → Sinks.
- **Step 21: Open the red tile.** **See** `findDiscountCode` · Sinks · Injection · High ·
  `discounts.ts:20`.
- **Step 22: Data flow.** **See** Left: `createOrdersApp` entry point, trust boundary,
  `getOwnedOrder`. Right: `customerId`, `skusInCategory`, `applyDiscountCode`.
- **Step 23: Reachability.** **See** Entry `gateway/src/app.ts:35` → `orders/src/app.ts:83` →
  `discounts.ts:20` → `discounts.ts:67`.

### Stage 6: Fix with AI (Steps 24–26)

Open the existing Coding Agent task `6265b19c`. Never click **Create PR** or **Commit and push**.

- **Step 24: Fix starts a Coding Agent task.** **See** Task *Fix injection in
  services/orders/src/discounts.ts*, whose prompt treats the finding as untrusted evidence.
- **Step 25: Pointed at the agent branch, it fixes and tests.** **See** Both SQL statements bound;
  `npm run check` passes 18 tests; F2 named as out of scope.
- **Step 26: Review the patch.** **See** `upper('${code.trim()}')` → `upper(?)`, the interpolated
  `UPDATE` bound, and the test *SQL syntax in a code cannot apply a different promotion*. Leave the
  task unmerged.

---

## Unverified items

- **Verified November 19:** the separate-PR option is the **Create a new PR** box under
  **Generate unit tests (beta)** in PR #3's summary; it produced #17 (4.4).
- **Verified November 19:** PR #14 is Merge Risk Minimal. CodeRabbit held approval while two Jira
  checks were inconclusive, then approved 13 seconds after `@coderabbitai ignore pre-merge checks`
  (6.2, 6.4).
- **Assumption:** the GitHub two-approval rule on `main` (6.4) is not set by these PRs.
