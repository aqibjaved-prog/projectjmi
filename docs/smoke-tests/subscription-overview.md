# Subscription Overview — End-to-End Smoke Test Checklist

Scope: `SubscriptionPanel` on `/schools/$schoolId`, its Overview card, and dashboard/query auto-refresh after Apply Plan Change, Renew, and Recalculate. Do NOT modify any working functionality while running these tests.

Preconditions
- Signed in as **Super Admin**.
- At least one school exists per state below (create as needed).
- Plans available: Trial (with `duration_days` set), Basic (monthly), Standard (monthly or yearly), Premium (yearly, unlimited limits where applicable).
- Some schools should have students / vehicles / drivers / routes populated to exercise usage bars.

Legend
- ✅ = expected pass
- ⚠ = expected warning styling (amber)
- ⛔ = expected danger styling (red / destructive)

---

## 1. Overview card — status states

Navigate to `/schools/$schoolId` → **Subscription** panel → **Overview** card.

### 1.1 Active subscription (paid, > 7 days remaining)
- [ ] Status badge reads **Active** (default variant).
- [ ] Payment badge reads **Paid**.
- [ ] Plan name + tier chip visible.
- [ ] Start date, End date, Next renewal render as localized dates.
- [ ] Days remaining shows a positive integer, no warning color.
- [ ] Amount shows `CUR X.XX` matching plan `price_cents` and billing cycle.
- [ ] No expiry warning banner.

### 1.2 Trial subscription
- [ ] Status badge reads **Trialing** (secondary variant).
- [ ] Billing cycle chip reads **Trial**.
- [ ] End date = start + plan `duration_days` (verify against `periodEndFor`).
- [ ] Days remaining matches `duration_days` on day 0.
- [ ] Amount reads **Free** (price_cents = 0).
- [ ] If ≤ 7 days remain → ⚠ amber "Expiring soon" indicator with `AlertTriangle`.

### 1.3 Expiring soon (Active, ≤ 7 days)
- [ ] ⚠ Days remaining and End date render in amber (`text-amber-600 dark:text-amber-400`).
- [ ] `AlertTriangle` icon visible next to end date.
- [ ] Status badge still **Active**.

### 1.4 Expired
- [ ] ⛔ Status badge reads **Expired** (or Active with end date in the past → shown as destructive).
- [ ] End date and days remaining render in `text-destructive`.
- [ ] "Expired" label / `XCircle` icon visible.
- [ ] Renew button remains enabled.

### 1.5 Suspended
- [ ] ⛔ Status badge reads **Suspended** (destructive variant).
- [ ] Payment badge reflects real `payment_status` (often **Overdue**).
- [ ] Overview still shows dates and amount (no crash on null fields).
- [ ] Apply Plan Change / Renew / Recalculate remain operable.

---

## 2. Resource usage progress bars

For each of **Students / Vehicles / Drivers / Routes**:

### 2.1 Below 80%
- [ ] Progress bar green (default primary).
- [ ] Label shows `used / limit`.
- [ ] No badge.

### 2.2 80% – 99% (warning)
- [ ] ⚠ Bar switches to amber (`[&>div]:bg-amber-500`).
- [ ] "Near limit" badge with `AlertTriangle` icon.

### 2.3 100% (danger)
- [ ] ⛔ Bar switches to destructive.
- [ ] "Limit reached" destructive badge.
- [ ] Creating one more student/vehicle is blocked by backend trigger (`PLAN_LIMIT_*`) and surfaces `planLimitMessage`.

### 2.4 Unlimited plan (limit = null, e.g. Premium)
- [ ] "Unlimited" secondary badge with `Infinity` icon.
- [ ] Progress bar hidden.
- [ ] Usage text reads `used / Unlimited`.

### 2.5 Zero-limit / no plan
- [ ] Falls back to `EMPTY_USAGE`; no NaN, no runtime error.

---

## 3. Auto-refresh after mutations

Open browser devtools → Network. Confirm each action triggers query invalidation and UI updates without a manual reload.

### 3.1 Apply Plan Change
Steps: select a different plan → **Apply Plan Change** → confirm in dialog.
- [ ] Confirmation dialog shows side-by-side comparison (cycle, price, student/vehicle limits, features, computed start/end).
- [ ] On confirm: toast success.
- [ ] Overview card updates: plan name, tier, cycle, amount, start/end dates, days remaining.
- [ ] Usage bars recompute against new limits (e.g. previously 100% may become 60%).
- [ ] Subscription History table gains a new row (`action` upgraded/downgraded/changed, from/to plan, old & new limits in `notes`, `performed_by` = current user).
- [ ] Invalidated queries fire: `school`, `stats`, `subscriptions`, `platform-stats`, `history`, `plan-usage`.
- [ ] Dashboard (`/dashboard`) reflects new plan/limits on next visit without hard reload.
- [ ] Same-plan selection → Apply Plan Change button disabled with the required "already on this plan" message.

### 3.2 Renew
- [ ] Uses **current** plan id — dropdown selection is ignored.
- [ ] End date shifts forward by `duration_days` (trial) or +1 month / +1 year per cycle.
- [ ] Status returns to **Active** if previously expired.
- [ ] History row inserted with `action = renewed`.
- [ ] Overview card, subscriptions list, and dashboard counts auto-refresh.

### 3.3 Recalculate dates
- [ ] Uses **current** plan id — dropdown selection is ignored.
- [ ] Start date preserved; End date recomputed via `periodEndFor(start, cycle, duration_days)`.
- [ ] No history row required unless project already writes one — verify current behavior is unchanged.
- [ ] Days remaining updates immediately.
- [ ] No changes to plan, cycle, price, or limits.

---

## 4. Cross-page regression

- [ ] `/subscriptions` list reflects updated status, cycle, amount, renewal date.
- [ ] `/plans` unaffected.
- [ ] `/dashboard` Super Admin: MRR, Total Revenue, Active/Expiring/Expired counts update after Apply/Renew.
- [ ] `/dashboard` School Admin: PlanUsageCard reflects new limits post-change.
- [ ] Subscription History table order and columns unchanged.
- [ ] No new console errors, no failed network requests.
- [ ] `bun run build` and `tsgo` both pass.

---

## 5. Accessibility & UX

- [ ] Apply Plan Change dialog has `DialogTitle` + `DialogDescription` (aria-describedby present).
- [ ] All badges have readable contrast in light and dark themes.
- [ ] Progress bars have accessible label text alongside them.
- [ ] Keyboard: Tab reaches Plan select → Apply → Renew → Recalculate in logical order; Esc closes dialog.
