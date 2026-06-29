# AGENTS.md — NoCut.ng Claude Code Build Playbook

> This file is a step-by-step agentic prompt for Claude Code.
> Work through each phase in order. Complete all tasks in a phase before moving to the next.
> After each phase, verify the deliverables listed before proceeding.

---

## Ground Rules (Read First)

- **Never** update `wallet_balance` outside an atomic DB transaction
- **Never** use the words "bet", "betting", "gambling", "odds", or "casino" anywhere in the codebase — not in copy, comments, variable names, or logs
- **Never** expose `SUPABASE_SERVICE_ROLE_KEY` or payment secret keys to the client
- **Always** run `place_stake()` as a PostgreSQL function — never replicate its logic in application code
- **Always** verify Paystack webhook signatures before processing any event
- All monetary values displayed to users must use the format `₦1,234,567.00`
- All brand colours must come from Tailwind tokens defined in `tailwind.config.js` — never use Tailwind defaults like `blue-500` or `gray-700`
- When in doubt on financial logic, stop and ask rather than guess

---

## Phase 0 — Project Scaffold & Tooling

**Goal:** Working monorepo with CI/CD, Supabase connected, Vercel deploying.

### Steps

1. **Initialise the Next.js project**
   ```bash
   npx create-next-app@latest nocut-ng \
     --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
   cd nocut-ng
   ```

2. **Install core dependencies**
   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   npm install @paystack/inline-js
   npm install lucide-react clsx tailwind-merge
   npm install sentry/nextjs
   npm install -D prisma @prisma/client
   ```

3. **Configure Tailwind brand tokens** — edit `tailwind.config.ts`:
   ```ts
   colors: {
     brand: {
       bg:           '#0B0F1A',
       surface:      '#111827',
       input:        '#1F2937',
       border:       'rgba(255,255,255,0.07)',
       amber:        '#F59E0B',
       'amber-hover':'#D97706',
       yes:          '#10B981',
       'yes-muted':  'rgba(16,185,129,0.12)',
       no:           '#EF4444',
       'no-muted':   'rgba(239,68,68,0.10)',
       text:         '#F0F2F8',
       muted:        '#6B7280',
       subtle:       '#4B5563',
     }
   }
   ```

4. **Create `.env.local`** from the template in CLAUDE.md Section 16. Fill in Supabase URL and anon key only for now.

5. **Create Supabase client helpers**
   - `src/lib/supabase/client.ts` — browser client using `createBrowserClient`
   - `src/lib/supabase/server.ts` — server client using `createServerClient` with cookies
   - `src/lib/supabase/middleware.ts` — session refresh middleware

6. **Add `src/middleware.ts`** — uses Supabase middleware helper to refresh sessions on every request

7. **Create utility functions** in `src/lib/utils/`:
   - `formatCurrency(amount: number): string` — returns `₦1,234,567.00`
   - `formatDate(date: string | Date): string` — returns `12 May 2025, 3:45pm WAT`
   - `cn(...inputs)` — clsx + tailwind-merge helper

8. **Set up GitHub repo** — push initial commit. Connect to Vercel. Confirm preview deployment builds successfully.

### Phase 0 Verification
- [ ] `npm run dev` starts without errors
- [ ] Tailwind brand tokens resolve correctly (test with a `bg-brand-bg` class in a component)
- [ ] Supabase client initialises without throwing (check browser console)
- [ ] Vercel preview URL is live and loads the default page

---

## Phase 1 — Database Schema

**Goal:** All tables, triggers, functions, and RLS policies live in Supabase.

### Steps

1. **Open Supabase SQL editor** and run each block below in order.

2. **Create `users` table** (full schema from CLAUDE.md Section 5)

3. **Create `markets` table** (full schema from CLAUDE.md Section 5)

4. **Create `stakes` table**

5. **Create `transactions` table**

6. **Create `settlements` table**

7. **Create `admin_log` table**

8. **Create `withdrawal_requests` table**

9. **Create `referrals` table**

10. **Create the auto-closure trigger** — `check_market_auto_close()` function + `market_auto_close` trigger on `markets` BEFORE UPDATE

11. **Create `place_stake()` PostgreSQL function** — full implementation from CLAUDE.md Section 5. This is the most critical DB function. Read it carefully before running.

12. **Apply RLS policies** for `users`, `markets`, `stakes`, `transactions` (from CLAUDE.md Section 6)

13. **Enable RLS** on all tables: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`

14. **Create Prisma schema** — run `npx prisma db pull` to generate `schema.prisma` from the Supabase DB. Review and commit.

### Phase 1 Verification
- [ ] All 8 tables exist in Supabase Table Editor
- [ ] Insert a test market row, then update `total_yes` to equal `reward_pool` — confirm `status` flips to `closed` automatically
- [ ] RLS blocks a direct anonymous read on `users` table
- [ ] `place_stake()` function exists in Supabase → Database → Functions

---

## Phase 2 — Authentication

**Goal:** Users can register (email/phone OTP + Google OAuth), log in, and sessions persist.

### Steps

1. **Enable auth providers in Supabase dashboard:**
   - Email (OTP, not magic link)
   - Phone (Twilio SMS — add credentials)
   - Google OAuth (add client ID + secret)

2. **Build `/app/(auth)/signup/page.tsx`**
   - Fields: display name, email, phone (+234 prefix), password
   - On submit: call `supabase.auth.signUp()`
   - Redirect to `/verify` after submission
   - Apply brand styling — dark card, amber focus rings, no light backgrounds

3. **Build `/app/(auth)/verify/page.tsx`**
   - OTP input (6 digits)
   - Call `supabase.auth.verifyOtp()`
   - On success: redirect to `/dashboard`

4. **Build `/app/(auth)/login/page.tsx`**
   - Email + password fields
   - Google OAuth button
   - Forgot password link
   - Human-readable error messages only — never surface Supabase error codes

5. **Build `/app/(auth)/reset-password/page.tsx`**
   - Email input → `supabase.auth.resetPasswordForEmail()`

6. **Create `useAuth` hook** in `src/hooks/useAuth.ts`
   - Wraps `supabase.auth.getUser()` and `supabase.auth.onAuthStateChange()`
   - Returns `{ user, loading, signOut }`

7. **Create auth guard** — server-side redirect in `(dashboard)` and `(admin)` layout files using `supabase.auth.getUser()` on the server

8. **Create user record on signup** — Supabase Auth trigger or Edge Function that inserts into `public.users` table after `auth.users` row is created. Set `referral_code` to a unique 8-char alphanumeric string.

### Phase 2 Verification
- [ ] New user can sign up with email and receive OTP
- [ ] Verified user is redirected to `/dashboard`
- [ ] Logged-out user trying to access `/dashboard` is redirected to `/login`
- [ ] Google OAuth flow completes and creates a `public.users` row
- [ ] `useAuth()` returns correct user on client

---

## Phase 3 — Wallet & Payments

**Goal:** Users can deposit NGN via Paystack, see their balance live, and request withdrawals.

### Steps

1. **Build `BalanceCard` component** (`src/components/wallet/BalanceCard.tsx`)
   - Displays `₦X,XXX.XX` in large white bold text
   - "Deposit" (amber) and "Withdraw" (ghost) buttons
   - Subscribe to `transactions` table via Supabase Realtime to auto-refresh balance

2. **Build `DepositModal` component**
   - Amount input with ₦ prefix
   - On confirm: call `/api/me/deposit/initiate` → get Paystack payment URL → open Paystack Popup
   - Show loading skeleton while waiting for webhook confirmation

3. **Create `/app/api/me/deposit/initiate/route.ts`**
   - Authenticate user (server-side)
   - Call Paystack `POST /transaction/initialize` with `amount * 100` (kobo), `email`, `reference`
   - Store `reference` in `transactions` table as `status: 'pending'`
   - Return `{ authorization_url, reference }`

4. **Create `/app/api/webhooks/paystack/route.ts`**
   - Step 1: Verify `X-Paystack-Signature` header — HMAC-SHA512 of raw request body using `PAYSTACK_SECRET_KEY`. **Reject with 401 if invalid.**
   - Step 2: Check `event` type — handle `charge.success` only for now
   - Step 3: Idempotency check — query `transactions` for existing `provider_ref`. If found, return 200 and stop.
   - Step 4: In a single atomic transaction: credit `users.wallet_balance`, update `transactions.status = 'confirmed'`, set `balance_before` and `balance_after`
   - Return 200 after processing

5. **Build `WithdrawModal` component**
   - Fields: bank name (dropdown of Nigerian banks from Paystack), account number, account name (auto-verified via Paystack Resolve Account), amount
   - On submit: POST to `/api/me/withdraw`

6. **Create `/app/api/me/withdraw/route.ts`**
   - Validate: authenticated, `wallet_balance >= amount`, amount > 0
   - Insert into `withdrawal_requests` as `status: 'pending'`
   - Insert into `transactions` as `status: 'pending'`
   - Do NOT debit wallet yet — debit happens when admin approves

7. **Build `TransactionRow` component** — used in both dashboard and `/transactions` page
   - Icon + type label + description + amount (green for credit, red for debit) + status badge + date

8. **Create `useWallet` hook** — Supabase Realtime subscription to `transactions` for current user; returns `{ balance, transactions, loading }`

### Phase 3 Verification
- [ ] Paystack Popup opens correctly and completes a test payment (use Paystack test keys)
- [ ] Webhook receives `charge.success` event and credits wallet — confirm balance updates in real time
- [ ] Duplicate webhook events are rejected (idempotency check works)
- [ ] Withdrawal request appears in DB as `pending`
- [ ] Balance card updates without page refresh

---

## Phase 4 — Market Feed & Detail

**Goal:** Active markets are visible, live YES/NO totals update in real time, payout calculator works.

### Steps

1. **Create `/lib/frp/formulas.ts`** — implement all 5 pure functions from CLAUDE.md Section 15. Write unit tests for each.

2. **Build `MarketCard` component** (`src/components/market/MarketCard.tsx`)
   - Category tag (colour per CLAUDE.md Section 9)
   - Market title (text-sm font-medium)
   - `StakeSplitBar` — animated green/red bar showing YES% vs NO%
   - YES pill: `bg-brand-yes-muted text-yes` — shows expected payout
   - NO pill: `bg-brand-no-muted text-no` — shows expected payout
   - Pool size + time remaining in meta row
   - Hover: `border-brand-amber` transition

3. **Build `/app/(public)/page.tsx`** — Homepage (Server Component)
   - Fetch active markets server-side via Supabase
   - Hero section: tagline + stats bar (total staked, active markets, positions taken)
   - Category filter tabs (client component for interactivity)
   - 2-column market grid using `MarketCard`
   - Subscribe to market updates via Supabase Realtime (client component wrapping the grid)

4. **Create `useMarket(id)` hook** — Supabase Realtime subscription to `markets` WHERE `id = marketId`; returns live `{ market, loading }`

5. **Build `CountdownTimer` component** — accepts `closesAt: Date`; counts down days/hours/minutes/seconds; updates every second via `setInterval`; cleans up on unmount

6. **Build `PayoutCalculator` component**
   - Number input for stake amount
   - Calls `expectedPayout(userStake, currentSideTotal, rewardPool)` on every change
   - Debounce 300ms
   - Shows live "Expected payout: ₦X" — updates as user types
   - Two rows: "If YES wins → ₦X" and "If NO wins → ₦X"

7. **Build `/app/(public)/markets/[id]/page.tsx`** — Market Detail (SSR + client realtime)
   - Server Component fetches initial market data
   - Client components: `StakeSplitBar`, `PayoutCalculator`, `CountdownTimer`, `StakePanel`, recent activity feed
   - Market status badge: ACTIVE (green) / CLOSED (amber) / SETTLED (grey)
   - If settled: show winning side + user's actual payout

8. **Build `StakePanel` component**
   - YES and NO buttons (large, full-width on mobile)
   - Disabled when: market closed, user not logged in (show "Log in to stake"), wallet insufficient
   - Amount input pre-filled from `PayoutCalculator`
   - On submit: POST to `/api/me/stakes`

### Phase 4 Verification
- [ ] `/` loads with server-rendered markets in under 2s
- [ ] Category filter tabs filter the market grid without page reload
- [ ] Market cards show correct YES/NO expected payouts using `expectedPayout()` formula
- [ ] Market detail page countdown timer counts down live
- [ ] Payout calculator recalculates within 300ms of typing
- [ ] Unit tests for all 5 FRP formula functions pass

---

## Phase 5 — Staking Engine

**Goal:** Users can place stakes atomically; auto-closure fires correctly; no race conditions.

### Steps

1. **Create `/app/api/me/stakes/route.ts`** (POST)
   - Authenticate user server-side
   - Validate inputs: `market_id` exists, `side` is 'yes' or 'no', `amount > 0`
   - Call Supabase RPC: `supabase.rpc('place_stake', { p_user_id, p_market_id, p_side, p_amount })`
   - Handle error codes from `place_stake()`:
     - `market_not_active` → "This market is no longer accepting positions"
     - `insufficient_balance` → "Your wallet balance is too low. Please deposit funds."
     - `user_self_excluded` → "Your account is currently in a cooling-off period"
     - `age_not_confirmed` → "Please confirm your age before staking"
   - On success: return `{ stake_id, expected_payout }`
   - Never return raw Supabase error messages to client

2. **Update `StakePanel`** to call the API and handle all error states with human-readable messages

3. **Add optimistic UI** to `StakePanel`:
   - Show "Placing your position…" loading state immediately
   - On success: show green toast "Position placed! Expected payout: ₦X"
   - On error: show red toast with human-readable message
   - Reset form

4. **Implement rate limiting** on `/api/me/stakes` — max 20 requests per minute per user (use `@upstash/ratelimit` or middleware)

5. **Test auto-closure:**
   - Create a test market with a small reward pool (e.g. ₦1,000)
   - Place stakes until `total_yes + total_no >= reward_pool`
   - Confirm market `status` automatically flips to `closed`
   - Confirm Supabase Realtime broadcasts the closure to all connected clients
   - Confirm `StakePanel` YES/NO buttons become disabled immediately on closure

6. **Validate daily stake limit** — the `place_stake()` DB function checks this, but add a client-side pre-check to show a useful error before the round-trip

### Phase 5 Verification
- [ ] Stake is placed atomically (wallet debited + stake inserted + market totals updated in one transaction)
- [ ] A market auto-closes when pool is reached
- [ ] Auto-closure broadcasts to all open browser tabs in real time
- [ ] Duplicate stake requests (network retry) are handled gracefully
- [ ] Rate limit rejects > 20 stake requests per minute
- [ ] All 9 stake validations from CLAUDE.md Section 15 are enforced

---

## Phase 6 — Settlement Engine

**Goal:** Admin can select a winning side; winners are credited; settlement is irreversible and audited.

### Steps

1. **Create `/app/api/admin/markets/[id]/settle/route.ts`** (POST)
   - Check `is_admin = true` from JWT — reject with 403 if not admin
   - Body: `{ winning_side: 'yes' | 'no', resolution_note: string }`
   - Run all 5 settlement validations from CLAUDE.md Section 15 in order
   - Execute settlement in a single DB transaction:
     a. Fetch all stakes WHERE `market_id = id` AND `side = winning_side`
     b. For each winning stake: calculate `payout = (stake.amount / total_winning_stakes) * reward_pool`
     c. Credit each winner's `wallet_balance`
     d. Insert payout `transactions` record for each winner
     e. Update each winning `stake`: `actual_payout = payout`, `is_winner = true`
     f. Update each losing `stake`: `is_winner = false`
     g. Insert `settlements` record
     h. Update `markets`: `status = 'settled'`, `winning_side`, `settled_at`
     i. Insert into `admin_log`
   - Return `{ settled: true, total_winners, pool_distributed }`

2. **Build `SettlementPanel` admin component**
   - Shows market summary: T, R, M (platform margin — highlight in green as "secured profit")
   - YES button (green) and NO button (red) — large, side by side
   - After selection: show payout preview ("X winners will receive ₦Y each")
   - Require typing the market title to confirm — prevents mis-clicks
   - Warning banner: "This action is irreversible"
   - Resolution note textarea (required)
   - On confirm: POST to settle endpoint

3. **Update market detail page** to show settlement results:
   - "YES WON" or "NO WON" badge
   - If current user was a winner: green card "You won ₦X — credited to your wallet"
   - If current user lost: "Better luck next time"

### Phase 6 Verification
- [ ] Settlement credits correct amounts to all winners
- [ ] `(sum of all winner payouts) = reward_pool` — verify this exactly
- [ ] `settlements` record exists after settlement
- [ ] `admin_log` record exists with `action = 'market_settled'`
- [ ] Non-admin cannot call the settle endpoint (403 returned)
- [ ] Settling an already-settled market is rejected
- [ ] Winner wallet balances update in real time via Supabase Realtime

---

## Phase 7 — Admin Dashboard

**Goal:** Admin can manage markets, view P&L, manage users, and approve withdrawals.

### Steps

1. **Create admin route guard** — in `/app/(admin)/layout.tsx`, check `is_admin = true` server-side. Redirect non-admins to `/`.

2. **Build `/app/(admin)/admin/page.tsx`** — KPI dashboard
   - 4 KPI cards: Total Pool Revenue (this month), Active Markets, Registered Users, Pending Withdrawals (amber if > 0)
   - Revenue chart: last 30 days daily margin (use a simple SVG line chart or Recharts)
   - Active markets table with "Resolve" button for closed markets

3. **Build `/app/(admin)/admin/markets/new/page.tsx`** — Market creation form
   - Fields: title, category (dropdown), reward pool, closes_at, resolves_at, resolution_criteria, resolution_source
   - Inline margin calculator: "Set pool to ₦X for 16.7% margin on ₦Y expected stakes"
   - Auto-close toggle — locked ON, amber padlock icon, tooltip "Required for platform integrity"
   - "Save as Draft" and "Publish Market" buttons
   - POST to `/api/admin/markets`

4. **Build `/app/(admin)/admin/markets/[id]/page.tsx`** — Market detail + settlement
   - Shows `SettlementPanel` when market status is `closed`
   - Shows read-only summary when `settled`

5. **Build `/app/(admin)/admin/withdrawals/page.tsx`** — Withdrawal approval queue
   - Table: user, amount, bank details, requested at, status
   - "Approve" and "Reject" (with reason) actions
   - On approve: debit user wallet, initiate Paystack Transfer, mark withdrawal as `processing`

6. **Build `/app/(admin)/admin/users/page.tsx`** — User management
   - Searchable paginated table: user, email, KYC status, wallet balance, stakes count
   - Click-through to user detail: full stake history, transaction log, edit daily limit, ban/unban

7. **Build `/app/(admin)/admin/audit/page.tsx`** — Audit log viewer
   - Paginated table of `admin_log` rows
   - Filter by action type and date range

### Phase 7 Verification
- [ ] Non-admin cannot access any `/admin/*` route
- [ ] Market creation inserts row with `status = 'draft'`
- [ ] Publishing a draft market sets `status = 'active'` and makes it visible on the feed
- [ ] Withdrawal approval triggers Paystack Transfer API call
- [ ] Audit log records every admin action with timestamp and actor

---

## Phase 8 — KYC & Compliance

**Goal:** Users are age-gated and BVN/NIN-verified before staking. Responsible use tools are in place.

### Steps

1. **Age gate:** On first stake attempt (if `age_confirmed = false`), show modal:
   - Checkbox: "I confirm I am 18 years or older and agree to the Terms of Service"
   - On confirm: PATCH `/api/me` to set `age_confirmed = true`
   - Store ToS acceptance timestamp in `users.metadata` JSONB

2. **Build `/app/(dashboard)/kyc/page.tsx`** — KYC wizard
   - Step 1: Age confirmation (auto-complete if already done)
   - Step 2: BVN or NIN input (tab selector)
   - Step 3: Verified success screen

3. **Create `/app/api/me/kyc/verify-bvn/route.ts`**
   - Server-side only
   - POST to Paystack Identity API: `https://api.paystack.co/bank/resolve_bvn/{bvn}`
   - On success: encrypt BVN and store in `users.kyc_bvn`, set `kyc_status = 'verified'`, set `kyc_verified_at`
   - Never return raw BVN to client in any response

4. **Self-exclusion:** In profile settings, allow users to set `self_excluded = true` and `self_excluded_until` (1 week / 1 month / 3 months from now)
   - PATCH `/api/me/self-exclude`
   - Once active, all stake attempts are blocked at the DB level (`place_stake()` checks this)

5. **Daily stake limit:** Display current limit in profile. Admin can edit via `/api/admin/users/:id`.

6. **Create ToS and Privacy Policy pages** — `/app/(public)/terms/page.tsx` and `/app/(public)/privacy/page.tsx` — static, legal content only.

### Phase 8 Verification
- [ ] User without `age_confirmed = true` cannot place a stake (blocked in UI and in `place_stake()`)
- [ ] User without `kyc_status = 'verified'` cannot place a stake
- [ ] BVN is stored encrypted, never visible in API responses
- [ ] Self-excluded user's stake button is disabled with message "Your account is in a cooling-off period"
- [ ] Daily limit is enforced at the DB level

---

## Phase 9 — QA, Security & Launch Prep

**Goal:** The platform is safe, tested, and ready for real users.

### Steps

1. **Unit tests** — write tests in `src/lib/frp/formulas.test.ts`:
   - `expectedPayout()` — test with various stake amounts and side totals
   - `settlementPayout()` — verify sum of all winner payouts equals `rewardPool`
   - `platformMargin()` — always positive when R < T
   - `recommendedPool()` — verify margin % calculation
   - Run: `npm test`

2. **Integration test — full stake lifecycle:**
   - Create market (admin)
   - Deposit funds (user)
   - Place YES stake
   - Place NO stake (different user)
   - Trigger auto-closure (fill pool)
   - Settle market (admin)
   - Verify winner wallet credited, loser unchanged
   - Verify `settlements` record matches `reward_pool` exactly

3. **Webhook security audit:**
   - Send a Paystack webhook with an invalid signature — confirm 401 returned
   - Send a duplicate `provider_ref` — confirm idempotency check prevents double-credit
   - Send a `charge.success` with a reference not in `transactions` — confirm it is rejected and logged

4. **Race condition test:**
   - Simulate 10 concurrent stake requests from the same user
   - Confirm wallet never goes negative
   - Confirm `total_yes + total_no` never exceeds `reward_pool`

5. **Security checklist:**
   - [ ] `SUPABASE_SERVICE_ROLE_KEY` is never in any `NEXT_PUBLIC_` var
   - [ ] All admin routes return 403 for non-admin users (test with a regular user JWT)
   - [ ] RLS prevents users from reading other users' stakes or transactions
   - [ ] Paystack signature verification is active on the webhook route
   - [ ] BVN/NIN not returned in any API response (grep codebase for `kyc_bvn` and `kyc_nin` to confirm)
   - [ ] No raw error codes or stack traces reach the client
   - [ ] `Content-Security-Policy` header is set via `next.config.js`

6. **Performance checklist:**
   - [ ] Homepage SSR renders in < 2s (test with WebPageTest set to Nigerian 4G)
   - [ ] Supabase Realtime stake updates appear in < 500ms
   - [ ] Market detail page with payout calculator does not flicker on keystroke

7. **Mobile checklist:**
   - [ ] All pages work at 375px viewport width
   - [ ] YES/NO stake buttons are ≥ 44px tall
   - [ ] No horizontal overflow on any page
   - [ ] Modals are scroll-friendly on small screens

8. **Seed launch markets** — insert the 5 markets from CLAUDE.md Section 9 as `status = 'active'` via admin dashboard

9. **Smoke test with real Paystack keys:**
   - Make a ₦100 deposit
   - Place a ₦50 stake
   - Verify wallet balance and transaction history are correct

### Phase 9 Verification
- [ ] All unit tests pass
- [ ] Full lifecycle integration test passes
- [ ] Security checklist 100% complete
- [ ] Mobile checklist 100% complete
- [ ] Sentry is receiving events (trigger a test error)
- [ ] 5 launch markets are live on the platform

---

## Phase 10 — Beta & Launch

**Goal:** Invite 20–50 users, run the first live market, document the first payout publicly.

### Steps

1. Deploy `main` branch to production at `nocut.ng` via Vercel

2. Switch all environment variables to production values (Paystack live keys, production Supabase URL)

3. Invite beta users via email — direct sign-up links

4. Monitor Sentry and Supabase Logs in real time during first market fill

5. When first market closes and settles — screenshot the settlement record, publish payout proof on Twitter/X as trust-building PR

6. After beta: open public sign-up

---

## Month 3 Features (Post-Launch)

After stable MVP launch, implement in this order:

### F-11 — Referral Programme
- Generate `referral_code` on user creation (already in schema)
- Landing page at `/r/[referral_code]` — sets a cookie, then redirects to `/signup`
- In `place_stake()` DB function: on first stake, check `referred_by`, credit referrer 2% of stake amount as `referral_bonus` transaction

### F-12 — Leaderboard
- `/app/(public)/leaderboard/page.tsx` — SSR, revalidate every 60s
- Query: SUM of `actual_payout - amount` for winning stakes in current week, grouped by user
- Anonymise display names (show first 3 chars + ***)
- Weekly reset cron: Supabase Edge Function scheduled every Monday 00:00 WAT

---

## Useful Commands

```bash
# Development
npm run dev                        # Start dev server

# Database
npx prisma db pull                 # Pull schema from Supabase
npx prisma generate                # Regenerate Prisma client
npx prisma studio                  # Open Prisma Studio GUI

# Testing
npm test                           # Run all tests
npm run test:watch                 # Watch mode

# Type checking
npm run type-check                 # tsc --noEmit

# Lint
npm run lint                       # ESLint

# Build
npm run build                      # Production build
npm run start                      # Start production server locally
```

---

## File Structure Reference

```
src/
  app/
    (public)/           — SSR pages visible to all
    (auth)/             — Login, signup, verify, reset
    (dashboard)/        — Protected user pages
    (admin)/            — Protected admin pages
    api/                — Route handlers
  components/
    ui/                 — Button, Input, Card, Badge, Modal, Toast
    market/             — MarketCard, StakeSplitBar, StakePanel, PayoutCalculator, CountdownTimer
    wallet/             — BalanceCard, DepositModal, WithdrawModal, TransactionRow
    auth/               — LoginForm, SignupForm, OtpInput
    admin/              — MarketForm, SettlementPanel, WithdrawalQueue, KpiCard
    layout/             — Navbar, Footer, PageContainer
  hooks/
    useAuth.ts
    useMarket.ts
    useWallet.ts
    useStake.ts
  lib/
    supabase/           — client.ts, server.ts, middleware.ts
    frp/                — formulas.ts, formulas.test.ts
    paystack/           — client.ts, webhook.ts
    utils/              — formatCurrency.ts, formatDate.ts, cn.ts
```

---

*NoCut.ng — Don't Guess. Take Position.*
*This file is for Claude Code only — do not ship to production.*
