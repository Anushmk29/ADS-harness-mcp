# Tracking Setup: Meta Pixel + CAPI — Implementation Checklist
**Priority:** P1 — Do NOT launch ads without this
**Total Effort:** 4–8 hours (first time)
**Currency:** INR
**Why:** Without CAPI, you lose 30–40% of conversion data to iOS ATT, ITP, and ad blockers. At ₹6,000/month (Phase A), that's ₹1,800–2,400/month of invisible spend. At ₹10,500/month (Phase B), that's ₹3,150–4,200/month.

---

## Architecture Overview

```
User Action on Website
        │
        ├──→ Meta Pixel (client-side, in <head>)
        │       ├── PageView (auto)
        │       ├── ViewContent (auto, per page)
        │       ├── AddToCart / Lead (manual trigger)
        │       └── event_id (generated client-side)
        │
        └──→ CAPI (server-side, via your backend)
                ├── Same events as Pixel
                ├── customer_information (em, ph, fn, ln)
                ├── event_id (same as Pixel)
                └── action_source: "website"
                        │
                        ▼
              Meta Events Manager
              (dedup on event_id, EMQ scoring)
```

**Key principle:** Every event fires TWICE — once from the Pixel (browser), once from CAPI (server). Meta deduplicates on `event_id`. The server-side copy captures conversions the browser missed (iOS, ad blockers).

---

## Step 1: Meta Business Manager Setup

| Task | How | Time |
|------|-----|------|
| Create Business Manager (if not exists) | business.facebook.com → "Create Business" | 10 min |
| Create Ad Account | Business Manager → Settings → Accounts → Ad Accounts → Add | 5 min |
| Verify Business (if >$5K/month planned) | Business Manager → Verify | 1–7 days |
| Add team members | Business Manager → People → Add | 5 min |

---

## Step 2: Domain Verification

| Task | How | Time |
|------|-----|------|
| Go to Events Manager | events_manager.facebook.com | |
| Click "Connect Data" → "Websites and Apps" → "Add Website" | | 10 min |
| Enter your domain (e.g., yoursite.com) | | |
| Verify via: (a) DNS TXT record, or (b) HTML file upload, or (c) Meta Pixel (if already installed) | | 15 min |
| Confirm domain shows "Verified" | | |

> **Why:** Domain verification is required for CAPI, Advanced Matching, and AEM. Without it, Events Manager won't accept server-side events.

---

## Step 3: Meta Pixel Installation

### 3a: Get the Pixel Code
1. Events Manager → Data Sources → Add Data Source → Website
2. Enter website URL
3. Meta generates a Pixel ID (numeric, e.g., `123456789012345`)
4. Copy the Pixel Base Code

### 3b: Install Base Code
Paste in the `<head>` of your website (before any other tracking scripts):

```html
<!-- Meta Pixel Code -->
<script>
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){
n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;
n.version='2.0';n.queue=[];t=b.createElement(e);
t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', 'YOUR_PIXEL_ID');
fbq('track', 'PageView');
</script>
<noscript><img height="1" width="1" style="display:none"
src="https://www.facebook.com/tr?id=YOUR_PIXEL_ID&ev=PageView&noscript=1"/></noscript>
<!-- End Meta Pixel Code -->
```

### 3c: Standard Events
Add these events to your site (in the order they should fire):

| Event | Where It Fires | Parameters |
|-------|---------------|------------|
| `PageView` | Every page (auto, in base code) | — |
| `ViewContent` | Product/service detail pages | `content_name`, `content_category`, `content_id` |
| `Lead` | Lead form submission (Thank You page or form callback) | `value`, `currency` |
| `InitiateCheckout` | "Book a Call" page (if separate from Lead) | `value`, `currency` |
| `Purchase` | (Only if you have e-commerce component) | `value`, `currency`, `num_items`, `content_ids` |

### 3d: Custom Events (Your Specific Funnel)

```javascript
// Fire on: Thank You page after lead form submission
fbq('track', 'Lead', {
  value: 30000,         // Estimated value of a lead in INR (₹30,000 avg deal)
  currency: 'INR',
  content_name: 'Automation Audit Lead',
  content_category: 'Lead Generation'
});

// Fire on: WhatsApp click (India-specific — high intent signal)
fbq('track', 'WhatsAppClick', {
  content_name: 'WhatsApp CTA Click',
  content_category: 'Engagement'
});

// Fire on: "Book a Call" page view (Calendly embed or booking page)
fbq('track', 'ViewContent', {
  content_name: 'Book a Call Page',
  content_category: 'Conversion'
});
```

### 3e: Event ID Generation (Critical for Dedup)

```javascript
// Generate a unique event ID client-side
// Include it in BOTH the Pixel event AND the CAPI payload
function generateEventId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Use it in your Pixel event:
const eventId = generateEventId();
fbq('track', 'Lead', {
  value: 100,
  currency: 'INR',
  event_id: eventId  // ← This is the dedup key
});

// Store eventId in a hidden form field or cookie
// so your server-side code can read it and include in CAPI payload
document.cookie = `meta_event_id=${eventId}; path=/; max-age=86400; SameSite=Lax`;
```

---

## Step 4: Conversions API (CAPI)

### 4a: CAPI Implementation Options

| Method | Effort | Cost | Recommended For |
|--------|--------|------|----------------|
| **Meta CAPI Gateway** | 1–2 hrs | $0 (Meta-hosted) | **Best for low-budget** — auto-hashing, no server code |
| Server-side (Node/Python) | 4–8 hrs | $0 (self-hosted) | If you already have a backend |
| Partner integration (Shopify, HubSpot, etc.) | 1–2 hrs | Varies | If you use a supported platform |

### 4b: CAPI Gateway Setup (Recommended for Low Budget)

1. Events Manager → Data Sources → [Your Website] → "Send Data Using CAPI Gateway"
2. Generate Access Token (Events Manager → Access Tokens)
3. Configure event forwarding rules:
   - Forward ALL standard events
   - Include `customer_information` fields
4. Test with Events Manager → "Test Events" tab

### 4c: Server-Side CAPI (If You Have a Backend)

**Node.js example:**

```javascript
const crypto = require('crypto');

// Hash PII fields (lowercase + trim + SHA-256)
function hashPII(value) {
  if (!value) return null;
  return crypto.createHash('sha256')
    .update(value.trim().toLowerCase())
    .digest('hex');
}

// Build CAPI event payload
function buildCAPIEvent(eventName, eventId, customerInfo, eventParams) {
  return {
    data: [{
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,  // Same ID as Pixel event (dedup)
      action_source: 'website',
      user_data: {
        em: customerInfo.email ? hashPII(customerInfo.email) : null,
        ph: customerInfo.phone ? hashPII(customerInfo.phone.replace(/\D/g, '')) : null,
        fn: customerInfo.firstName ? hashPII(customerInfo.firstName) : null,
        ln: customerInfo.lastName ? hashPII(customerInfo.lastName) : null,
        // Optional:
        // ct: customerInfo.city ? hashPII(customerInfo.city) : null,
        // st: customerInfo.state ? hashPII(customerInfo.state) : null,
        // zp: customerInfo.zip ? hashPII(customerInfo.zip) : null,
        // external_id: customerInfo.crmId ? hashPII(customerInfo.crmId) : null,
        client_ip_address: customerInfo.ip,
        client_user_agent: customerInfo.userAgent,
      },
      custom_data: {
        value: eventParams.value || null,
        currency: eventParams.currency || 'USD',
        // Add other standard params as needed
      }
    }]
  };
}

// Send to Meta
async function sendCAPIEvent(pixelId, accessToken, payload) {
  const response = await fetch(
    `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  return response.json();
}

// Example: Send Lead event server-side
// (Call this from your lead form backend handler)
async function onLeadSubmitted(formData) {
  const eventId = formData.eventId; // Read from cookie or hidden field
  
  const payload = buildCAPIEvent('Lead', eventId, {
    email: formData.email,
    phone: formData.phone,
    firstName: formData.firstName,
    lastName: formData.lastName,
    ip: formData.ip,
    userAgent: formData.userAgent
  }, {
    value: 100,
    currency: 'USD'
  });
  
  await sendCAPIEvent('YOUR_PIXEL_ID', 'YOUR_ACCESS_TOKEN', payload);
}
```

### 4d: CAPI Events to Implement

| Event | Priority | customer_info Params |
|-------|----------|---------------------|
| `Lead` | P1 | `em`, `ph`, `fn`, `ln`, `ip`, `ua` |
| `WhatsAppClick` | P1 | `ph` (WhatsApp number), `ip`, `ua` |
| `ViewContent` (booking page) | P1 | `em` (if logged in), `ip`, `ua` |
| `PageView` | P2 | `ip`, `ua` |
| `Custom: CallBooked` | P2 | `em`, `ph`, `fn`, `ln`, `ip`, `ua` |

---

## Step 5: Aggregated Event Measurement (AEM)

**Why:** iOS 14.5+ limits which events Meta can optimize for. AEM lets you prioritize which events matter most.

### Setup:
1. Events Manager → Data Sources → [Your Website] → "Aggregated Event Measurement"
2. Configure up to 8 prioritized events (in order of importance):

| Priority | Event | Rationale |
|----------|-------|-----------|
| 1 | `Lead` | Primary conversion — what you're optimizing for (Phase B) |
| 2 | `WhatsAppClick` | India-specific: WhatsApp engagement is a strong intent signal |
| 3 | `InitiateCheckout` | Secondary conversion (booking page) |
| 4 | `ViewContent` | Engagement signal (Phase A) |
| 5 | `PageView` | Base signal |
| 6–8 | (Unused or custom events) | — |

3. Confirm all events show "Configured" status

> **Note:** AEM configuration takes 24–48 hours to propagate. Do this BEFORE launching ads.

---

## Step 6: Advanced Matching (Customer Information)

**Why:** Advanced Matching sends hashed customer data (email, phone, name) with every event, improving EMQ score and cross-device matching.

### Fields to Send (in priority order):

| Field | Parameter | Hash Method | Impact on EMQ |
|-------|-----------|-------------|---------------|
| Email | `em` | Lowercase + trim + SHA-256 | Highest |
| Phone | `ph` | E.164 format + SHA-256 | Second highest |
| First Name | `fn` | Lowercase + trim + SHA-256 | Moderate |
| Last Name | `ln` | Lowercase + trim + SHA-256 | Moderate |
| City | `ct` | Lowercase + SHA-256 | Low |
| State | `st` | Lowercase + SHA-256 | Low |
| ZIP | `zp` | Lowercase + SHA-256 | Low |
| External ID (CRM) | `external_id` | SHA-256 | High (cross-device) |

### Critical Rules:
- **NEVER send plain PII** — always hash before sending
- **NEVER double-hash** — hash the raw value once
- **Phone format:** E.164 (e.g., `+15551234567`) before hashing
- **Consent:** Only send PII for users who have given consent (cookie banner / lead form implies consent)

---

## Step 7: Verification & Testing

### 7a: Pixel Helper (Chrome Extension)
1. Install "Meta Pixel Helper" from Chrome Web Store
2. Visit your website
3. Confirm:
   - [ ] Pixel ID detected
   - [ ] `PageView` firing on all pages
   - [ ] `ViewContent` firing on detail pages
   - [ ] No errors or warnings in the extension

### 7b: Events Manager → Test Events
1. Events Manager → "Test Events" tab
2. Generate a test ID
3. Perform actions on your site:
   - [ ] Load homepage → `PageView` appears
   - [ ] Visit service page → `ViewContent` appears
   - [ ] Submit lead form → `Lead` appears (with `event_id`)
   - [ ] Visit booking page → `ViewContent` (booking) appears
4. Confirm each event shows:
   - [ ] Correct `event_name`
   - [ ] `event_id` present and consistent
   - [ ] `customer_information` fields populated (for CAPI events)
   - [ ] `action_source` = "website"

### 7c: CAPI Verification
1. Events Manager → Data Sources → [Your Website] → "Conversions API" tab
2. Confirm:
   - [ ] CAPI status: "Active"
   - [ ] Events received: matching count to Pixel (within 10%)
   - [ ] Dedup rate: ≥90% (shown in Diagnostics)
   - [ ] EMQ score: visible and trending up

### 7d: End-to-End Test Event Log

| # | Event | Pixel Firing | CAPI Firing | event_id Match | EMQ | Date |
|---|-------|-------------|-------------|----------------|-----|------|
| 1 | PageView | ✅ | ✅ | N/A (no event_id needed) | — | |
| 2 | ViewContent (service) | ✅ | ✅ | ✅ | | |
| 3 | Lead (form submit) | ✅ | ✅ | ✅ | | |
| 4 | ViewContent (booking) | ✅ | ✅ | ✅ | | |
| 5 | Custom: CallBooked | N/A | ✅ | — | | |

> **Fill this table during your testing session. It becomes your baseline for future audits.**

---

## Step 8: Custom Audiences Setup (Post-Launch)

Create these in Events Manager → Audiences:

| Audience Name | Source | Window | Minimum Size |
|--------------|--------|--------|-------------|
| `CA_Website_30d` | Website visitors (Pixel) | 30 days | 1,000 |
| `CA_Website_7d` | Website visitors (Pixel) | 7 days | 500 |
| `CA_Video_75pct_14d` | 75%+ video viewers | 14 days | 100 |
| `CA_LeadForm_Open_14d` | Lead form opens (no submit) | 14 days | 50 |
| `CA_LeadForm_Submit` | Lead form submitters | 90 days | 50 |
| `CA_FBIG_Engage_90d` | FB/IG page engagers | 90 days | 1,000 |
| `CA_Customer_List` | CRM upload (existing clients) | Ongoing | 10 |

> **Exclusion rule:** `CA_LeadForm_Submit` and `CA_Customer_List` are EXCLUDED from all prospecting ad sets.

---

## Step 9: EMQ Optimization Roadmap

| EMQ Score | Status | Action |
|-----------|--------|--------|
| 8.0–10.0 | Excellent | Maintain. All good. |
| 6.0–7.9 | Good | Add more `customer_information` params (city, state, ZIP) |
| 4.0–5.9 | Fair | Implement CAPI (if not done). Improve data quality. Add phone. |
| <4.0 | Critical | CAPI + Enhanced Matching is mandatory. Audit all PII fields. |

### EMQ Improvement Checklist
- [ ] Email sent on Lead event (highest impact)
- [ ] Phone sent on Lead event (second highest)
- [ ] First + Last name sent (moderate)
- [ ] City/State/ZIP sent (low but additive)
- [ ] `external_id` (CRM user ID) sent (high for cross-device)
- [ ] `client_ip_address` sent (from server, not browser)
- [ ] `client_user_agent` sent (from server, not browser)
- [ ] Consistent event naming (lowercase, no spaces)
- [ ] `action_source` set correctly per event

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Pixel not firing | JS error, ad blocker, wrong Pixel ID | Check browser console; verify Pixel ID matches Events Manager |
| Pixel fires but CAPI doesn't | Missing Access Token, wrong endpoint, no server handler | Check CAPI response; verify token has `ads_management` + `business_management` |
| Events in Pixel but not in Events Manager | Domain not verified, AEM not configured | Verify domain; check AEM event status |
| Dedup rate < 70% | event_id not matching, timestamp mismatch > 5 min | Verify event_id is identical in Pixel + CAPI; check server clock |
| EMQ < 6.0 | Missing customer_information params | Add email + phone + name to Lead event |
| "Learning Limited" persists | Too few conversions, or budget too low | Increase budget; consolidate ad sets; ensure 7+ conversions/week |
| Lead quality very low | Wrong optimization event, or form too easy | Switch to "Manual Review" on Instant Form; add qualifying question |

---

## Pre-Launch Checklist (Do All of These Before First Ad)

- [ ] Business Manager created
- [ ] Ad Account created
- [ ] Domain verified in Events Manager
- [ ] Meta Pixel installed (base + standard events)
- [ ] Custom events added (Lead, WhatsAppClick, ViewContent for booking)
- [ ] event_id generation implemented (client-side)
- [ ] CAPI configured (Gateway or server-side)
- [ ] customer_information fields populated (em, ph, fn, ln)
- [ ] AEM configured (Lead = 1, WhatsAppClick = 2, ViewContent = 3, PageView = 4)
- [ ] Pixel Helper: all events firing, no errors
- [ ] Test Events: all 4+ events confirmed in Events Manager
- [ ] CAPI: events arriving, dedup rate visible
- [ ] Custom Audiences created (even if empty — they'll populate)
- [ ] Lead Form created in Ads Manager (with WhatsApp/phone field)
- [ ] WhatsApp Business set up for speed-to-lead
- [ ] Auto WhatsApp response configured for new leads
- [ ] All creatives uploaded
- [ ] Campaigns built and budgets set
- [ ] **Ready to launch**
