# Pratap AI Innovations — Client Console UI Specification (v1)

> **Product name:** **Front Desk Command**
> **Audience:** Practice owners & agency founders (non-technical buyers)
> **Rule:** No enterprise jargon. No "DeepSeek/Apex" branding. It should feel like a calm, premium SaaS product for a single business owner.

---

## 1. Brand System

| Token | Value | Usage |
| :--- | :--- | :--- |
| Primary ink | `#0F172A` | Headings, nav |
| Surface | `#F8FAFC` | Page background (light theme default) |
| Card | `#FFFFFF` + soft shadow | Panels |
| Accent | `#25D366` → `#10B981` gradient | WhatsApp-aligned action color |
| Alert amber | `#F59E0B` | Pending approvals |
| Danger | `#EF4444` | Rejected / failed |
| Typography | Inter / Plus Jakarta Sans | 15px base, generous line height |
| Radius | 14px cards, 10px buttons | Soft, friendly |

**Voice in UI copy:** plain operator English. 
"Not approved yet" instead of "HITL pending". 
"Your week at a glance" instead of "Executive telemetry".

---

## 2. Navigation (left rail, 5 items)

```
┌──────────────────────────────┐
│  ● Front Desk Command        │
├──────────────────────────────┤
│  🏠 Home                     │  ← the one screen owners check daily
│  ✅ Approvals   (badge: 2)   │  ← every decision that needs them
│  ✍️ Content                  │  ← posts/emails/ads it drafted
│  📈 Results                  │  ← leads, bookings, spend, ROI
│  ⚙️ My Business              │  ← edit brand, budget, channels
└──────────────────────────────┘
```

No tabs named "Workflows", "Departments", "Agents", "Audit Trail", "Memory Repository". Those concepts remain but are renamed and folded in below.

---

## 3. Screen-by-Screen Spec

### 🏠 Home ("Good morning, Doctor")
1. **Status strip:** `● Live — answering your WhatsApp 24/7` (green pulse dot).
2. **This week's numbers (4 cards):** Messages answered · Appointments booked · Replies waiting on you · Money recovered this month (₹).
3. **"What it did while you slept"** — timeline feed of plain-language events:
   - *"Answered 14 messages between 10 PM – 7 AM"*
   - *"Booked 3 appointments for Tuesday"*
   - *"Chased 2 patients who asked about pricing and went quiet"*
4. **Big primary button:** `Review 2 things that need you →` (jumps to Approvals).
5. Optional **Team Floor view** toggle (see §5) collapsed under a "See inside the system" link.

### ✅ Approvals (the core habit loop)
Card per pending item, mobile-friendly:
```
┌────────────────────────────────────────────┐
│  Postpone Meta ad?                         │
│  The weekend offer creative stopped        │
│  working after 6 weeks. Pause it tonight.  │
│                                            │
│  Impact: saves ₹1,200/wk  ·  Risk: low    │
│                                            │
│  [ Yes, do it ]  [ Not now ]  [ Edit… ]   │
│  💬 Tell us why (it learns from this)      │
└────────────────────────────────────────────┘
```
- Buttons say **"Yes, do it" / "Not now"**, not APPROVE/REJECT.
- A feedback box feeds the preference-learning engine (unchanged underneath).
- History section: "Approved this week" with what happened next.

### ✍️ Content
- Grid of drafts: LinkedIn post, Instagram carousel, email, ad copy.
- Each card: platform icon, first two lines preview, brand-score badge (`On brand ✓ 98`).
- Actions: `Publish` · `Save for later` · `Rewrite with note…`.
- Filter chips: All · Social · Email · Ads.

### 📈 Results
- One chart: leads/bookings per week (line), spend bars behind it.
- Table: channel, spent, leads, cost per lead, trend arrow.
- "Money we saved you" card = recovered stalled chats × avg procedure value.
- Monthly PDF export button.

### ⚙️ My Business
Plain forms bound to config/business.yaml via API:
- **About my practice:** name, services, prices, opening hours.
- **How we sound:** tone examples + phrases never to use.
- **Budget:** monthly cap slider; where it goes.
- **Rules:** "Always ask me before spending over ₹X", "Always ask before publishing".

---

## 4. Terminology Map (old → new)

| Internal concept | Client-facing name |
| :--- | :--- |
| DeepSeek Harness Brain | Your assistant |
| HITL approval request | Needs your yes |
| Agent / department office | The team (behind the scenes) |
| Task ledger | Work log |
| Learning & memory repository | What it has learned |
| Audit trail (5W1H) | Why I did that |
| Anti-slop guardrail | Brand check |
| Mission / workflow | Plan |
| Simulation mode | Demo mode |

---

## 5. Keep the 3D Office? → "The Team Floor" (optional easter egg)

Keep `office-3d.js` but rebrand and hide it:
- Entry: small link on Home — *"See inside the system"*.
- Rename departments to roles people get: **Outreach desk, Ad desk, Writing desk, Numbers desk**.
- Speech bubbles show real client outcomes: "Booked Priya N. for Tue 4 PM".
- Zero mentions of frameworks/vendors inside it.

---

## 6. What Changes Under the Hood (nothing breaks)

- API stays identical (`/api/status`, `/api/approvals/.../resolve`, `/api/workflows/trigger`…).
- Only strings, layout, and CSS change in `public/`.
- Server header/title/env-name swaps: `deepseek-brain.ts` internal class names stay (invisible to users); remove visible strings only.
- New `.env`: `APP_NAME="Front Desk Command"`.
