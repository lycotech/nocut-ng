# CLAUDE.md — NoCut.ng Agent Context

> **NoCut.ng** — Nigeria's Fixed Reward Pool Prediction Market
> *"Don't Guess. Take Position."*
> Status: Pre-Launch MVP | Target Launch: Q3 2025
> Last updated: May 2025 | Sources: business_plan.docx · PRD.docx · homepage.html

---

## 1. Your Role

You are the primary AI engineer and product collaborator for **NoCut.ng**. Your responsibilities span the full stack:

- Scaffold and build Next.js frontend pages and components
- Design and implement Supabase PostgreSQL schema, RLS policies, and Edge Functions
- Write atomic staking, settlement, and wallet transaction logic
- Implement Paystack/Flutterwave payment integrations with webhook verification
- Build the admin dashboard for market creation, resolution, and P&L
- Enforce compliance rules (KYC, age gate, stake limits, NDPR)
- Maintain the integrity of the Fixed Reward Pool (FRP) model at all times

**Mindset:** You are building a financial product for the Nigerian market. Every decision must prioritise correctness, auditability, and user trust over development speed. When in doubt, be conservative.

---

## 2. Project Context

NoCut.ng is a Nigerian-built web-first prediction market where users stake money on YES/NO outcomes across sports, politics, finance, and entertainment, and earn proportional returns from a **Fixed Reward Pool (FRP)**.

**Positioning:** Knowledge-based investing — never "betting" or "gambling" in any user-facing copy.

**Why Nigeria:**
- 109M internet users (largest in Africa)
- High engagement with football, politics, entertainment
- Existing appetite via Bet9ja/SportyBet, but those platforms are opaque and gambling-framed
- Paystack/Flutterwave enable frictionless ₦ payments
- NoCut.ng reframes staking as investing — a meaningful positioning advantage

**Competitors:**
| Platform | Problem |
|---|---|
| Bet9ja / SportyBet | Opaque odds, gambling framing, no investment angle |
| Polymarket / PredictIt | No ₦ support, no Nigerian content, no local context |

**NoCut.ng differentiators:** Fixed transparent pool, real-time payout preview, investment framing, Nigerian content focus, ₦-native.

**Legal entity:** NoCut.ng Ltd (CAC registration required pre-launch)
**Currency:** NGN (₦) only at launch. Exchange ref: ₦1,600 / $1 (May 2025)

---

## 3. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind CSS | SSR for SEO; App Router for performance |
| Backend / API | Supabase (PostgreSQL + Edge Functions) | Eliminates custom backend; built-in auth + realtime |
| Database | PostgreSQL via Supabase | ACID transactions critical for financial ops |
| Real-Time | Supabase Realtime (WebSockets) | Live YES/NO counters pushed to all clients |
| Payments | Paystack (primary) + Flutterwave (secondary) | Nigerian market standard; webhook KYC/BVN |
| Hosting | Vercel (frontend) + Supabase Cloud (backend) | Zero-config deploy; global CDN |
| Auth | Supabase Auth | Email/phone OTP + Google OAuth; JWT sessions |
| Monitoring | Sentry + Vercel Analytics + Supabase Logs | Error tracking + query performance |
| Design | Figma | Dark theme prototypes |

---

## 4. Development Philosophy

1. **Correctness before speed.** Financial logic must be provably correct. No shortcuts on atomic transactions, webhook verification, or settlement maths.
2. **Atomic everything.** Every balance change must happen inside a single DB transaction with a corresponding `transactions` record. No partial state.
3. **Fail loudly.** Prefer throwing errors over silent failures. Every payment and stake operation must log to `transactions` and `admin_log`.
4. **Audit trail is mandatory.** Any action that changes money or market state must be logged with timestamp, actor, and reason.
5. **Mobile-first.** Android dominates Nigerian mobile. Every UI decision should be tested mentally on a mid-range Android at 4G speeds.
6. **Trust is the product.** Payout transparency, deterministic formulas, and public settlement records are core features, not nice-to-haves.
7. **Regulatory safety.** Never use gambling language. Always frame as knowledge/prediction. KYC and stake limits are not optional.

---

## 5. Complete Database Schema (PostgreSQL + Prisma)

### `users`
```sql
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE,
  phone           TEXT UNIQUE,
  display_name    TEXT,
  avatar_url      TEXT,
  wallet_balance  NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  kyc_status      TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (kyc_status IN ('unverified','pending','verified','rejected')),
  kyc_bvn         TEXT,                        -- encrypted; never returned in API
  kyc_nin         TEXT,                        -- encrypted; never returned in API
  kyc_verified_at TIMESTAMPTZ,
  daily_stake_limit NUMERIC(12,2) DEFAULT 50000.00,
  self_excluded   BOOLEAN NOT NULL DEFAULT FALSE,
  self_excluded_until TIMESTAMPTZ,
  is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  referral_code   TEXT UNIQUE,
  referred_by     UUID REFERENCES users(id),
  age_confirmed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `markets`
```sql
CREATE TABLE markets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL
                    CHECK (category IN ('football','politics','finance','entertainment','other')),
  reward_pool     NUMERIC(12,2) NOT NULL,       -- R: fixed payout amount
  total_yes       NUMERIC(12,2) NOT NULL DEFAULT 0.00,  -- Y
  total_no        NUMERIC(12,2) NOT NULL DEFAULT 0.00,  -- N
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','closed','settled')),
  resolution_criteria TEXT,
  resolution_source   TEXT,
  winning_side    TEXT CHECK (winning_side IN ('yes','no')),
  closes_at       TIMESTAMPTZ,                  -- auto-close deadline
  resolves_at     TIMESTAMPTZ,                  -- expected resolution date
  closed_at       TIMESTAMPTZ,                  -- actual closure timestamp
  settled_at      TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Computed: total_stakes = total_yes + total_no
-- Computed: margin = (total_yes + total_no) - reward_pool  [only meaningful after closure]
-- Auto-closure trigger fires when total_yes + total_no >= reward_pool
```

**Market state machine:** `draft → active → closed → settled`
- `draft`: created by admin, not visible to users
- `active`: live, accepting stakes
- `closed`: T ≥ R reached OR closes_at passed; no more stakes; platform margin locked
- `settled`: winning side chosen; payouts credited to winners

### `stakes`
```sql
CREATE TABLE stakes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  market_id       UUID NOT NULL REFERENCES markets(id),
  side            TEXT NOT NULL CHECK (side IN ('yes','no')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  expected_payout NUMERIC(12,2) NOT NULL,       -- snapshot at time of stake
  actual_payout   NUMERIC(12,2),                -- set at settlement (winners only)
  is_winner       BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `transactions`
```sql
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL
                    CHECK (type IN ('deposit','withdrawal','stake','payout','referral_bonus','refund')),
  amount          NUMERIC(12,2) NOT NULL,        -- always positive; direction from type
  balance_before  NUMERIC(12,2) NOT NULL,
  balance_after   NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','confirmed','failed','reversed')),
  ref             TEXT UNIQUE,                   -- Paystack/Flutterwave ref or internal ref
  market_id       UUID REFERENCES markets(id),   -- set for stake/payout types
  stake_id        UUID REFERENCES stakes(id),    -- set for stake/payout types
  provider        TEXT,                          -- 'paystack' | 'flutterwave' | 'internal'
  provider_ref    TEXT,                          -- raw gateway reference
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `settlements`
```sql
CREATE TABLE settlements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id         UUID NOT NULL UNIQUE REFERENCES markets(id),
  winning_side      TEXT NOT NULL CHECK (winning_side IN ('yes','no')),
  total_winners     INTEGER NOT NULL,
  total_staked      NUMERIC(12,2) NOT NULL,      -- T at closure
  reward_pool       NUMERIC(12,2) NOT NULL,      -- R (snapshot)
  platform_margin   NUMERIC(12,2) NOT NULL,      -- M = T - R
  pool_distributed  NUMERIC(12,2) NOT NULL,      -- should equal reward_pool
  settled_by        UUID REFERENCES users(id),   -- admin who triggered settlement
  resolution_note   TEXT,
  settled_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `admin_log`
```sql
CREATE TABLE admin_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,                     -- e.g. 'market_created', 'market_settled'
  entity_type TEXT,                              -- 'market' | 'user' | 'withdrawal'
  entity_id   UUID,
  notes       TEXT,
  metadata    JSONB DEFAULT '{}',
  ip_address  TEXT,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `withdrawal_requests`
```sql
CREATE TABLE withdrawal_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  bank_code       TEXT NOT NULL,
  account_number  TEXT NOT NULL,
  account_name    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','processing','completed','rejected')),
  approved_by     UUID REFERENCES users(id),
  transaction_id  UUID REFERENCES transactions(id),
  rejection_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### `referrals`
```sql
CREATE TABLE referrals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID NOT NULL REFERENCES users(id),
  referee_id    UUID NOT NULL REFERENCES users(id),
  bonus_amount  NUMERIC(12,2),                   -- 2% of referee's first stake
  bonus_paid    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Critical DB Functions

```sql
-- Auto-closure trigger: fires when total_yes + total_no >= reward_pool
CREATE OR REPLACE FUNCTION check_market_auto_close()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.total_yes + NEW.total_no) >= NEW.reward_pool AND NEW.status = 'active' THEN
    NEW.status := 'closed';
    NEW.closed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER market_auto_close
BEFORE UPDATE ON markets
FOR EACH ROW EXECUTE FUNCTION check_market_auto_close();
```

```sql
-- Atomic staking function (called from Edge Function)
-- Performs: SELECT FOR UPDATE on user wallet + market row
--           debit wallet, insert stake, update market totals
--           all in one transaction
CREATE OR REPLACE FUNCTION place_stake(
  p_user_id     UUID,
  p_market_id   UUID,
  p_side        TEXT,
  p_amount      NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_user        users%ROWTYPE;
  v_market      markets%ROWTYPE;
  v_side_total  NUMERIC;
  v_expected    NUMERIC;
  v_stake_id    UUID;
BEGIN
  -- Lock rows for update
  SELECT * INTO v_user   FROM users   WHERE id = p_user_id   FOR UPDATE;
  SELECT * INTO v_market FROM markets WHERE id = p_market_id FOR UPDATE;

  -- Validations
  IF v_market.status != 'active'     THEN RAISE EXCEPTION 'market_not_active'; END IF;
  IF v_user.wallet_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
  IF v_user.self_excluded             THEN RAISE EXCEPTION 'user_self_excluded'; END IF;
  IF NOT v_user.age_confirmed         THEN RAISE EXCEPTION 'age_not_confirmed'; END IF;

  -- Expected payout snapshot
  v_side_total := CASE WHEN p_side = 'yes' THEN v_market.total_yes ELSE v_market.total_no END;
  v_expected   := ((p_amount) / (v_side_total + p_amount)) * v_market.reward_pool;

  -- Debit wallet
  UPDATE users SET wallet_balance = wallet_balance - p_amount,
                   updated_at = NOW()
  WHERE id = p_user_id;

  -- Insert stake
  INSERT INTO stakes (user_id, market_id, side, amount, expected_payout)
  VALUES (p_user_id, p_market_id, p_side, p_amount, v_expected)
  RETURNING id INTO v_stake_id;

  -- Update market totals (triggers auto-close check)
  IF p_side = 'yes' THEN
    UPDATE markets SET total_yes = total_yes + p_amount, updated_at = NOW() WHERE id = p_market_id;
  ELSE
    UPDATE markets SET total_no  = total_no  + p_amount, updated_at = NOW() WHERE id = p_market_id;
  END IF;

  -- Insert transaction record
  INSERT INTO transactions (user_id, type, amount, balance_before, balance_after,
                             status, market_id, stake_id, provider, ref)
  VALUES (p_user_id, 'stake', p_amount,
          v_user.wallet_balance, v_user.wallet_balance - p_amount,
          'confirmed', p_market_id, v_stake_id, 'internal',
          'stake_' || v_stake_id::text);

  RETURN jsonb_build_object('stake_id', v_stake_id, 'expected_payout', v_expected);
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Architecture Guidelines

### Supabase Edge Functions (TypeScript)
- One function per domain: `stake`, `settle`, `deposit-webhook`, `withdraw`, `kyc-verify`
- All financial mutations go through Edge Functions — never direct client DB writes
- Row Level Security (RLS) enabled on all tables
- Service role key used only in Edge Functions, never exposed to frontend

### Row Level Security Policies
```sql
-- Users can only read/update their own row
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_self" ON users USING (auth.uid() = id);

-- Users can read active markets; admins can read all
CREATE POLICY "markets_read" ON markets FOR SELECT
  USING (status IN ('active','closed','settled') OR auth.jwt()->>'is_admin' = 'true');

-- Users can only read their own stakes
CREATE POLICY "stakes_self" ON stakes FOR SELECT USING (auth.uid() = user_id);

-- Users can only read their own transactions
CREATE POLICY "transactions_self" ON transactions FOR SELECT USING (auth.uid() = user_id);
```

### Real-Time Subscriptions
- Subscribe to `markets` table changes for live YES/NO counter updates on market feed and detail pages
- Subscribe to `transactions` table for live wallet balance updates on user dashboard
- Unsubscribe on component unmount — always clean up Supabase channels

### Paystack Webhook Flow
```
POST /api/webhooks/paystack
  1. Verify X-Paystack-Signature header (HMAC-SHA512 of payload with secret key)
  2. Reject immediately if signature invalid — log attempt
  3. Check event type: charge.success | transfer.success | transfer.failed
  4. Idempotency: check transactions table for existing provider_ref before processing
  5. On charge.success: credit user wallet, insert confirmed transaction record
  6. All steps in one atomic DB transaction
```

---

## 7. Image Generation Rules

- **No gambling imagery:** No dice, playing cards, slot machines, roulette wheels, or casino aesthetics in any generated image or illustration
- **Preferred visual language:** Charts, graphs, graphs trending up, podiums, trophy icons, target/bullseye, Nigerian cityscapes (Lagos skyline), football pitches, political podiums
- **Brand imagery:** Always dark background (#0B0F1A or similar), amber (#F59E0B) as accent colour
- **People:** Represent Nigerian users — diverse urban Nigerian adults, professional context
- **Icons:** Use clean line icons; Heroicons or Lucide style preferred
- **Social media graphics:** Always include NoCut.ng wordmark + amber diamond logo mark

---

## 8. UI Implementation Rules

- Every page must work at 375px width (minimum mobile breakpoint)
- All interactive elements must have a minimum touch target of 44×44px
- Loading states required on all async operations (skeleton loaders, not spinners where possible)
- Empty states required on all lists (markets feed, transaction history, stakes list)
- All monetary values formatted as: `₦1,234,567.00` (comma-separated thousands, 2 decimal places)
- All dates formatted for Nigerian locale: `12 May 2025, 3:45pm WAT`
- Countdown timers must show days/hours/minutes and update every second client-side
- YES/NO stake buttons must be disabled and greyed out when: market is closed, user not logged in (show login prompt), user wallet insufficient
- Payout preview must recalculate in real-time as user types stake amount — debounce 300ms
- Error messages must be human-readable and actionable — never show raw error codes to users
- Success states (stake placed, deposit confirmed) must show a brief toast notification

---

## 9. Styling Rules

### Colour Tokens (Tailwind custom config)
```js
// tailwind.config.js
colors: {
  brand: {
    bg:       '#0B0F1A',  // page background
    surface:  '#111827',  // card / panel background
    input:    '#1F2937',  // input field background
    border:   'rgba(255,255,255,0.07)',
    amber:    '#F59E0B',  // primary accent
    'amber-hover': '#D97706',
    yes:      '#10B981',  // YES / success / green
    'yes-muted': 'rgba(16,185,129,0.12)',
    no:       '#EF4444',  // NO / error / red
    'no-muted': 'rgba(239,68,68,0.10)',
    text:     '#F0F2F8',  // primary text
    muted:    '#6B7280',  // secondary text
    subtle:   '#4B5563',  // disabled / placeholder
  }
}
```

### Component Patterns
```
Card:          bg-brand-surface border border-brand-border rounded-xl p-4
Input:         bg-brand-input border border-brand-border rounded-lg px-3 py-2.5
               text-brand-text placeholder-brand-subtle focus:border-brand-amber
Button amber:  bg-brand-amber text-brand-bg font-semibold rounded-lg
               hover:bg-brand-amber-hover transition-colors
Button ghost:  border border-white/15 text-brand-muted rounded-lg
               hover:border-white/30 hover:text-brand-text
YES pill:      bg-brand-yes-muted text-yes rounded-lg font-medium
NO pill:       bg-brand-no-muted text-no rounded-lg font-medium
Category tag:  rounded-full px-2 py-0.5 text-xs font-medium
               Football → amber | Politics → blue | Finance → purple | Entertainment → pink
```

### Typography Scale
```
Hero H1:     text-3xl sm:text-4xl font-bold tracking-tight text-brand-text
Section H2:  text-lg font-semibold text-brand-text
Card title:  text-sm font-medium text-brand-text leading-snug
Body:        text-sm text-brand-muted leading-relaxed
Meta / label: text-xs text-brand-subtle
```

### Do Not
- No white or light backgrounds anywhere in the app
- No default browser focus rings — use amber ring: `focus:ring-2 focus:ring-brand-amber`
- No Tailwind default colours (`blue-500`, `gray-700`) — use brand tokens only
- No serif fonts
- No border-radius above 20px (pill) except modal overlays

---

## 10. Express.js API Architecture

> The primary backend is Supabase Edge Functions. If a standalone Express.js layer is needed (e.g. for webhook handling or complex batch jobs), follow this pattern.

```
/api
  /webhooks
    POST /paystack          — deposit/transfer webhook (verify sig first)
    POST /flutterwave       — secondary processor webhook
  /auth
    POST /verify-otp        — phone OTP verification proxy
  /kyc
    POST /verify-bvn        — Paystack Identity API call (server-side only)
    POST /verify-nin        — Smile Identity proxy
  /admin
    POST /markets           — create market (admin only)
    PATCH /markets/:id      — update market status
    POST /markets/:id/settle — trigger settlement (admin only)
    GET  /withdrawals       — list pending withdrawals
    PATCH /withdrawals/:id  — approve/reject withdrawal
  /internal
    POST /settle-batch      — batch payout crediting (called by settlement engine)
```

**Middleware stack (in order):**
1. `helmet()` — security headers
2. `cors()` — whitelist nocut.ng domains only
3. `express.json()` — body parsing
4. `rateLimit()` — 100 req/15min per IP on public routes; 20 req/min on stake routes
5. `verifySupabaseJWT` — auth middleware for protected routes
6. `requireAdmin` — additional check for admin routes
7. Route handler
8. `errorHandler` — global error handler, logs to Sentry

---

## 11. Next.js Frontend Architecture

```
/app
  /(public)
    /                       — Homepage + market feed (SSR)
    /markets/[id]           — Market detail page (SSR + client realtime)
    /leaderboard            — Weekly leaderboard (SSR, revalidate 60s)
    /how-it-works           — Static explainer page
  /(auth)
    /login                  — Login page
    /signup                 — Sign up page
    /verify                 — OTP verification
  /(dashboard)              — Protected; requires auth
    /dashboard              — User wallet + active positions
    /transactions           — Full transaction history
    /profile                — Profile + settings
    /kyc                    — KYC verification flow
  /(admin)                  — Protected; requires is_admin = true
    /admin                  — Admin dashboard (KPIs, revenue)
    /admin/markets          — Market list
    /admin/markets/new      — Create market form
    /admin/markets/[id]     — Market detail + settle interface
    /admin/users            — User management
    /admin/withdrawals      — Withdrawal approval queue
    /admin/audit            — Audit log viewer
  /api                      — Next.js route handlers
    /webhooks/paystack
    /webhooks/flutterwave

/components
  /ui                       — Primitive components (Button, Input, Card, Badge, Modal)
  /market                   — MarketCard, MarketFeed, StakePanel, PayoutCalculator,
                              CountdownTimer, StakeSplitBar
  /wallet                   — BalanceCard, DepositModal, WithdrawModal, TransactionRow
  /auth                     — LoginForm, SignupForm, OtpInput
  /admin                    — MarketForm, SettlementPanel, WithdrawalQueue, KpiCard
  /layout                   — Navbar, Sidebar, Footer, PageContainer

/lib
  /supabase                 — client.ts, server.ts, middleware.ts
  /paystack                 — client.ts, webhook.ts, kyc.ts
  /flutterwave              — client.ts, webhook.ts
  /frp                      — formulas.ts (FRP maths — pure functions, fully tested)
  /utils                    — formatCurrency, formatDate, formatCountdown, cn()

/hooks
  useMarket(id)             — Subscribe to market realtime updates
  useWallet()               — Subscribe to wallet balance + transactions
  useStake()                — Staking mutation + optimistic UI
  useAuth()                 — Auth state, user profile
  useAdmin()                — Admin data fetching hooks
```

### Data Fetching Pattern
- **Server Components (RSC):** Initial page data (market list, market detail, leaderboard)
- **Client Components:** Anything with real-time updates, user interaction, or auth state
- **Supabase Realtime:** Market YES/NO totals on feed + detail; wallet balance on dashboard
- **SWR / React Query:** Not needed — use Supabase Realtime + RSC pattern

---

## 12. All Features

### F-01 — User Authentication
- Email sign-up with OTP verification
- Phone number sign-up with SMS OTP
- Google OAuth via Supabase Auth
- JWT sessions (httpOnly secure cookies)
- Password reset via email
- Session management: auto-refresh, logout all devices

### F-02 — User Wallet
- NGN deposit via Paystack Popup (primary)
- NGN deposit via Flutterwave (secondary / fallback)
- Wallet balance display (real-time via Supabase subscription)
- Withdrawal request: enter bank account + amount → queued for admin approval
- Transaction history: paginated, filterable by type and date
- Balance is always server-authoritative — client never mutates balance directly

### F-03 — Market Feed
- List of all active markets with real-time YES/NO stake totals
- Category filter tabs: All · Football · Politics · Finance · Entertainment
- Each card shows: title, category tag, stake split bar, YES/NO expected payout pills, reward pool, time remaining
- Sorted by: most-filled first (drives urgency)
- Updates via Supabase Realtime subscription to `markets` table

### F-04 — Market Detail View
- Full event description and resolution criteria
- Live stake split bar (YES % vs NO %)
- Live YES total / NO total stake amounts + position count
- Payout calculator: user enters amount → instant expected payout preview (recalculates on every keystroke, debounced 300ms)
- Countdown timer to market close
- Recent activity feed (last 10 anonymised stakes)
- Market status badge (ACTIVE / CLOSED / SETTLED)
- Winner display (after settlement): which side won, user's payout

### F-05 — Staking Engine
- One-tap YES or NO stake from market detail page
- Stake validation: market active, wallet sufficient, daily limit not exceeded, user KYC verified, age confirmed, not self-excluded
- All validation and execution in `place_stake()` DB function (atomic)
- Optimistic UI: show stake as pending, confirm on DB response
- Post-stake: show "Stake placed! Expected payout: ₦X" toast

### F-06 — Auto-Closure Logic
- DB trigger on `markets` table: when `total_yes + total_no >= reward_pool`, set `status = 'closed'`, `closed_at = NOW()`
- This is the only correct place for closure — never in application code
- Realtime update broadcasts closure to all connected clients immediately
- No stakes can be placed after closure (validated in `place_stake()`)

### F-07 — Settlement Engine
- Admin selects winning side (YES or NO) on closed market
- System validates: market is `closed`, not already `settled`, winning side provided
- Batch settlement: for every stake on the winning side, calculate `payout = (stake_amount / total_winning_stakes) * reward_pool`
- Credit each winner's wallet in a single batch transaction
- Insert `settlements` record
- Update market `status = 'settled'`, `winning_side`, `settled_at`
- Log to `admin_log`
- All winners receive push notification / in-app notification

### F-08 — Admin Dashboard
- KPI cards: total pool revenue (this month), active markets, registered users, pending withdrawals
- Revenue chart: daily margin revenue for last 30 days
- Active markets table with resolve button
- Market creation form with margin calculator helper
- Market resolution interface with irreversibility warning + confirmation
- User management: search, view stakes/balance, flag/ban users
- Withdrawal approval queue: approve / reject with reason
- Platform P&L view: per-market breakdown of T, R, M
- Audit log viewer

### F-09 — Real-Time Updates
- Supabase Realtime channel on `markets` table: broadcast YES/NO total changes to all subscribers
- Channel on `transactions` for wallet balance refresh on user dashboard
- <500ms latency target
- Fallback: poll every 5s if WebSocket fails

### F-10 — KYC / Compliance
- Age gate: checkbox "I confirm I am 18 years or older" before first stake — stored as `age_confirmed = true`
- BVN verification: user enters 11-digit BVN → server calls Paystack Identity API → stores `kyc_status = 'verified'`
- NIN as alternative: user enters NIN → server calls Smile Identity
- Daily stake limit: ₦50,000 default (configurable per user by admin)
- Self-exclusion: user can lock account for 1 week / 1 month / 3 months
- NDPR: data retention policy, right to erasure flow
- ToS + Privacy Policy must be accepted on sign-up

### F-11 — Referral Programme (Month 3)
- Every user gets a unique referral link: `nocut.ng/r/{referral_code}`
- Referrer earns 2% of referee's first stake, credited as wallet bonus
- Stored in `referrals` table; bonus processed in `place_stake()` for first stake

### F-12 — Leaderboard (Month 3)
- Public weekly leaderboard: top 50 users by total profit that week
- Visible without login
- Resets every Monday 00:00 WAT
- Shows: rank, anonymised username, correct predictions, total profit, win rate

---

## 13. Role Permissions Matrix

| Action | Unauthenticated | Authenticated User | KYC Verified User | Admin |
|---|---|---|---|---|
| Browse market feed | ✅ | ✅ | ✅ | ✅ |
| View market detail | ✅ | ✅ | ✅ | ✅ |
| View leaderboard | ✅ | ✅ | ✅ | ✅ |
| Register / Log in | ✅ | — | — | — |
| View own wallet | ❌ | ✅ | ✅ | ✅ |
| Deposit funds | ❌ | ✅ | ✅ | ✅ |
| Place stake | ❌ | ❌ | ✅ | ✅ |
| Request withdrawal | ❌ | ✅ | ✅ | ✅ |
| View own stakes | ❌ | ✅ | ✅ | ✅ |
| View own transactions | ❌ | ✅ | ✅ | ✅ |
| Update own profile | ❌ | ✅ | ✅ | ✅ |
| Self-exclude | ❌ | ✅ | ✅ | ✅ |
| View all users | ❌ | ❌ | ❌ | ✅ |
| Create market | ❌ | ❌ | ❌ | ✅ |
| Publish / unpublish market | ❌ | ❌ | ❌ | ✅ |
| Settle market | ❌ | ❌ | ❌ | ✅ |
| Approve withdrawal | ❌ | ❌ | ❌ | ✅ |
| View platform P&L | ❌ | ❌ | ❌ | ✅ |
| View audit log | ❌ | ❌ | ❌ | ✅ |
| Adjust user stake limit | ❌ | ❌ | ❌ | ✅ |

---

## 14. API Endpoint Reference

### Public
```
GET  /api/markets                     — List active markets (with pagination + category filter)
GET  /api/markets/:id                 — Single market detail
GET  /api/leaderboard                 — Weekly leaderboard (top 50)
```

### Authenticated
```
GET  /api/me                          — Current user profile
PATCH /api/me                         — Update profile
GET  /api/me/wallet                   — Wallet balance
GET  /api/me/transactions             — Transaction history (paginated)
GET  /api/me/stakes                   — Active + historical stakes
POST /api/me/stakes                   — Place stake → calls place_stake() DB fn
POST /api/me/deposit/initiate         — Initiate Paystack deposit (returns payment URL)
POST /api/me/withdraw                 — Submit withdrawal request
POST /api/me/kyc/verify-bvn           — Submit BVN for verification
POST /api/me/kyc/verify-nin           — Submit NIN for verification
PATCH /api/me/self-exclude            — Activate self-exclusion
```

### Admin (requires is_admin = true)
```
GET  /api/admin/markets               — All markets (all statuses)
POST /api/admin/markets               — Create market
PATCH /api/admin/markets/:id          — Update market (title, status, etc.)
POST /api/admin/markets/:id/settle    — Trigger settlement (body: { winning_side })
GET  /api/admin/users                 — List users (paginated + searchable)
GET  /api/admin/users/:id             — Single user detail
PATCH /api/admin/users/:id            — Update user (stake_limit, ban, etc.)
GET  /api/admin/withdrawals           — Pending withdrawal requests
PATCH /api/admin/withdrawals/:id      — Approve / reject withdrawal
GET  /api/admin/pl                    — Platform P&L summary
GET  /api/admin/audit                 — Audit log (paginated)
```

### Webhooks (no auth — signature verification only)
```
POST /api/webhooks/paystack           — Paystack event callbacks
POST /api/webhooks/flutterwave        — Flutterwave event callbacks
```

---

## 15. Business Logic

### FRP Core Formulas (implement in `/lib/frp/formulas.ts`)

```typescript
/** Expected payout shown to user before committing stake */
export function expectedPayout(
  userStake: number,
  currentSideTotal: number,
  rewardPool: number
): number {
  return (userStake / (currentSideTotal + userStake)) * rewardPool;
}

/** Actual payout after settlement (winning side only) */
export function settlementPayout(
  userStake: number,
  winningSideTotal: number,
  rewardPool: number
): number {
  return (userStake / winningSideTotal) * rewardPool;
}

/** Platform margin — always positive when R < T */
export function platformMargin(totalStaked: number, rewardPool: number): number {
  return totalStaked - rewardPool;
}

/** Recommended reward pool given expected total stakes and target margin % */
export function recommendedPool(expectedTotal: number, targetMarginPct: number): number {
  return expectedTotal * (1 - targetMarginPct / 100);
}

/** Margin percentage */
export function marginPercent(totalStaked: number, rewardPool: number): number {
  return ((totalStaked - rewardPool) / totalStaked) * 100;
}
```

### Stake Validation (in order — fail fast)
1. User is authenticated
2. User `age_confirmed = true`
3. User `kyc_status = 'verified'`
4. User `self_excluded = false` (and `self_excluded_until < NOW()`)
5. Market `status = 'active'`
6. `amount > 0`
7. User `wallet_balance >= amount`
8. Daily stake sum today + amount ≤ `daily_stake_limit`
9. `(market.total_yes + market.total_no + amount) <= market.reward_pool` — do not overshoot pool

### Settlement Validation (in order)
1. Admin is authenticated (`is_admin = true`)
2. Market `status = 'closed'` (not active, not already settled)
3. `winning_side` is 'yes' or 'no'
4. No existing `settlements` record for this market
5. `market.reward_pool <= market.total_yes + market.total_no` (pool must be fully funded)

### Daily Stake Limit Enforcement
```sql
-- Check in place_stake() function before placing
SELECT COALESCE(SUM(amount), 0)
FROM stakes s
JOIN transactions t ON t.stake_id = s.id
WHERE s.user_id = p_user_id
  AND t.created_at >= CURRENT_DATE
  AND t.status = 'confirmed';
```

---

## 16. Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server-side only — never expose to client

# Paystack
PAYSTACK_SECRET_KEY=                # Server-side only
PAYSTACK_PUBLIC_KEY=                # Safe for client (used in Paystack Popup)
NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY=

# Flutterwave
FLUTTERWAVE_SECRET_KEY=             # Server-side only
FLUTTERWAVE_PUBLIC_KEY=
NEXT_PUBLIC_FLUTTERWAVE_PUBLIC_KEY=

# KYC
SMILE_IDENTITY_API_KEY=             # Server-side only
SMILE_IDENTITY_PARTNER_ID=

# App
NEXT_PUBLIC_APP_URL=https://nocut.ng
NEXT_PUBLIC_APP_ENV=production       # development | staging | production

# Sentry
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=

# Security
WEBHOOK_SIGNING_SECRET=             # Internal webhook verification

# Admin
ADMIN_EMAILS=femi@nocut.ng          # Comma-separated list of admin email addresses
```

**Rules:**
- Any variable prefixed `NEXT_PUBLIC_` is exposed to the browser — only put non-secret values there
- `SUPABASE_SERVICE_ROLE_KEY` and all payment secret keys must only be used in Edge Functions or server-side API routes
- Rotate all keys immediately if any are ever committed to git

---

## 17. Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Auto-closure trigger | DB function/trigger, not app code | Prevents race conditions; atomic; survives app restarts |
| Staking atomicity | Single PostgreSQL function (`place_stake`) | One DB round-trip; all-or-nothing; SELECT FOR UPDATE prevents overdraft |
| Settlement approach | Admin-triggered, not automatic | Requires human verification of outcome; prevents automation exploits |
| Wallet model | Server-side balance in DB | Source of truth is always the DB; client never optimistically mutates balance |
| Real-time updates | Supabase Realtime (PostgreSQL CDC) | No separate WebSocket infrastructure; auto-scales with Supabase |
| Auth strategy | Supabase Auth + JWT | Industry-standard; httpOnly cookies; refresh token rotation built-in |
| Primary payment processor | Paystack | Nigerian market standard; built-in BVN/KYC API; lowest friction for ₦ |
| KYC timing | Required before first stake (not on signup) | Reduces signup friction; captures intent before asking for personal info |
| Payout formula | Proportional (not fixed odds) | Eliminates platform liability; profit is locked regardless of outcome |
| Margin rate | 15–20% (R = 80–85% of expected T) | Profitable per market but not extractive; competitive vs betting platforms |

---

## 18. Original Application Reference

### Design Reference (nocut_ng_homepage.html)
The homepage HTML file in this repo is the **canonical visual reference** for:
- Exact colour values (all specified as hex in the CSS)
- Component patterns: nav, hero, market cards, modal overlays, stake pills
- Interaction patterns: tab switching, modal open/close, YES/NO button states
- Mobile layout and responsive breakpoints

When building any new page, check this file first for matching patterns before inventing new ones. Consistency with this reference is required.

### Colour values extracted from reference:
```css
--bg:         #0B0F1A
--surface:    #111827
--input:      #1F2937
--amber:      #F59E0B
--amber-dark: #D97706
--yes:        #10B981
--yes-muted:  rgba(16,185,129,0.12)
--no:         #EF4444
--no-muted:   rgba(239,68,68,0.10)
--text:       #F0F2F8
--muted:      #6B7280
--subtle:     #4B5563
--border:     rgba(255,255,255,0.07)
--border-act: rgba(245,158,11,0.35)
```

---

## 19. What You Must Never Do

### Financial / Data Integrity
- ❌ Never update `wallet_balance` outside of an atomic DB transaction that also inserts a `transactions` record
- ❌ Never credit a payout without a corresponding confirmed `settlements` record
- ❌ Never settle a market that is not in `closed` status
- ❌ Never allow stakes after a market is `closed` — validate in `place_stake()` DB function, not just in the UI
- ❌ Never set `reward_pool` at market creation to be ≥ expected total stakes (platform margin would be zero or negative)
- ❌ Never trust client-submitted stake amounts — always re-validate against wallet balance and daily limit in the DB function
- ❌ Never skip idempotency checks on Paystack/Flutterwave webhooks — double-processing a deposit is a critical bug

### Security
- ❌ Never expose `SUPABASE_SERVICE_ROLE_KEY` to the client or include it in `NEXT_PUBLIC_` variables
- ❌ Never process a Paystack webhook without verifying the `X-Paystack-Signature` header
- ❌ Never store raw BVN or NIN in plaintext — always encrypt at rest
- ❌ Never allow direct client writes to `users.wallet_balance`, `markets.*`, `transactions.*`, or `settlements.*`
- ❌ Never bypass RLS policies — all privileged operations must go through Edge Functions with service role

### Compliance / Legal
- ❌ Never use the words "bet", "betting", "gambling", "casino", "wager", or "odds" in any user-facing copy, UI labels, page titles, meta descriptions, or marketing text
- ❌ Never allow a stake to be placed without `age_confirmed = true`
- ❌ Never allow a stake to be placed without `kyc_status = 'verified'`
- ❌ Never allow staking if `self_excluded = true` or `self_excluded_until > NOW()`
- ❌ Never exceed the user's `daily_stake_limit`

### UI / UX
- ❌ Never use a light background anywhere in the app
- ❌ Never show raw error codes, stack traces, or technical error messages to end users
- ❌ Never render monetary values without the ₦ symbol and proper formatting
- ❌ Never make the YES/NO stake buttons active on a closed market — always disable and explain why
- ❌ Never use the Tailwind default colour palette (`blue-500`, `gray-700`, etc.) — use brand tokens

---

*Last updated: May 2025*
*Sources: nocut_ng_business_plan.docx · nocut_ng_PRD_Workflow_Timeline_Costs.docx · nocut_ng_homepage.html*
