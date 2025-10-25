# Magic Link Intent Detection - Feature Specification

**Status:** Proposed (Pending Decision)
**Date:** 2025-10-24
**Architect Review:** ✅ Complete
**Codex Review:** 🔄 In Progress

---

## Executive Summary

**Problem:** Current field-centric detection works well for OTP codes but misses magic links because they appear as TEXT/LINKS after user actions (button clicks, form submits) rather than in input fields.

**Proposed Solution:** Extend detection system with **Page Context Detector** using hybrid field + intent detection approach.

**Impact:**
- Proactive magic link presentation (no manual popup required)
- Better UX for passwordless authentication flows
- Maintains privacy-first, local-only architecture
- No new permissions required

**Effort:** 4-6 weeks (Phase 1 MVP)

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [The Gap](#the-gap)
3. [Proposed Architecture](#proposed-architecture)
4. [Option Comparison](#option-comparison)
5. [Recommended Approach](#recommended-approach)
6. [New Components](#new-components)
7. [User Flows](#user-flows)
8. [Safety & Privacy](#safety-and-privacy)
9. [Performance Impact](#performance-impact)
10. [Implementation Phases](#implementation-phases)
11. [Risk Assessment](#risk-assessment)
12. [Success Metrics](#success-metrics)
13. [Rollout Strategy](#rollout-strategy)
14. [Open Questions](#open-questions)
15. [Decision Framework](#decision-framework)

---

## Current State Analysis

### What Already Works

**Magic Link Pipeline (Production-Ready):**
```
Email Polling → extraction-core → Magic Link Extraction → PopupCache → Popup UI
```

**Existing Components:**
- `packages/extraction-core/src/extraction/extractor.ts` (lines 91-140): Extracts magic links with 0-1 scoring
- `extension/src/background/session-controller.ts` (lines 336-338, 377-386): Captures magic links
- `extension/src/ui/components/MagicLinkSection.tsx`: Displays links in popup
- `extension/src/ui/services/link-service.ts`: Safe link opening (HTTPS checks, reset confirmations)

**Safety Mechanisms:**
- HTTPS-only validation
- Password reset detection and confirmation
- Rate limiting (5 links/minute)
- Dangerous keyword filtering

---

## The Gap

### OTP Flow (Works Well)
```
Field Detected → Watch Session → Email Polling → Code Extraction → Autofill ✅
```

### Magic Link Challenge
```
❌ No input field to detect
❌ Links appear as TEXT/LINKS, not form fields
❌ User intent is implicit (clicking "Send magic link")
❌ Auto-opening is risky (password resets!)
❌ Current solution: Manual popup access only
```

**User Experience Impact:**
- Users don't know InboxKey can help with magic links
- Must manually open popup (poor discoverability)
- Defeats "instant" promise of InboxKey
- Inconsistent with OTP auto-fill experience

---

## Proposed Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────┐
│ Content Script (contents/index.ts)                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐        ┌──────────────────────┐          │
│  │ Field        │        │ Page Context         │          │
│  │ Detector     │        │ Detector (NEW)       │          │
│  │ (existing)   │        │                      │          │
│  └──────┬───────┘        └──────┬───────────────┘          │
│         │                       │                           │
│         │ OTP field found       │ Magic link context found  │
│         ├───────────────────────┤                           │
│         ↓                       ↓                           │
│  ┌──────────────────────────────────────┐                  │
│  │ Unified Watch Session Manager        │                  │
│  │ (watch-session.ts - enhanced)        │                  │
│  └──────────────┬───────────────────────┘                  │
│                 │                                           │
└─────────────────┼───────────────────────────────────────────┘
                  │ Port Connection
┌─────────────────┼───────────────────────────────────────────┐
│ Background      ↓                                           │
│  ┌──────────────────────────────────────┐                  │
│  │ Session Controller                   │                  │
│  │ (session-controller.ts - enhanced)   │                  │
│  └──────────────┬───────────────────────┘                  │
│                 │                                           │
│                 ↓                                           │
│  ┌──────────────────────────────────────┐                  │
│  │ Email Polling Service                │                  │
│  └──────────────┬───────────────────────┘                  │
│                 │                                           │
│                 ↓                                           │
│  ┌──────────────────────────────────────┐                  │
│  │ extraction-core                      │                  │
│  │ - extractOTPs() [existing]           │                  │
│  │ - extractMagicLinks() [existing]     │                  │
│  └──────────────┬───────────────────────┘                  │
│                 │                                           │
│                 ↓                                           │
│  ┌──────────────────────────────────────┐                  │
│  │ V2 Matcher (458-point scoring)       │                  │
│  │ - Codes: domain affinity, recency    │                  │
│  │ - Links: NEW scoring for magic links │                  │
│  └──────────────┬───────────────────────┘                  │
└─────────────────┼───────────────────────────────────────────┘
                  │
┌─────────────────┼───────────────────────────────────────────┐
│ Content Script  ↓                                           │
│  ┌──────────────────────────────────────┐                  │
│  │ Magic Link Presenter (NEW)           │                  │
│  │ - In-page notification chip          │                  │
│  │ - User confirms before opening       │                  │
│  │ - Keyboard accessible                │                  │
│  └──────────────────────────────────────┘                  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. User loads app.linear.app/login
2. Page Context Detector analyzes page (URL, buttons, forms)
3. Confidence: 85% → Start watch session (type: 'magic-link-context')
4. User clicks "Email me a login link"
5. Background polls email (0s, 5s, 10s)
6. extraction-core extracts magic link from email
7. V2 Matcher scores link (domain affinity + recency + extraction score)
8. Score 0.82 (above 0.6 threshold) → Present to user
9. Magic Link Presenter shows chip: "Magic link from linear.app [Open] [Dismiss]"
10. User clicks [Open] → Link opens in new tab → Chip dismisses
```

---

## Option Comparison

| Option | Detection Method | Trigger Timing | Precision | Complexity | Risk | Status |
|--------|------------------|----------------|-----------|------------|------|--------|
| **A: Button Click Detection** | "Send link" button heuristics | Reactive (on click) | High | High | Medium | ❌ Rejected |
| **B: Page Pattern Recognition** | URL/title/meta analysis | Proactive (page load) | Medium | Low | Low | ⚠️ Partial |
| **C: Hybrid (Field + Intent)** | Both field & page context | Both | High | Medium | Low | ✅ **RECOMMENDED** |
| **D: User-Initiated Only** | Extension icon/manual | Manual | Perfect | Low | None | 📌 Fallback |

### Option A: Button Click Detection (Reactive)

**How it works:**
- Detect when user clicks "Send magic link" / "Email me" button
- Start watch session immediately
- Extract link from email when it arrives

**Pros:**
- ✅ High precision (user explicitly requested link)
- ✅ Clear user intent

**Cons:**
- ❌ Complex heuristics ("Send link" in 21 languages)
- ❌ Fragile (button text/structure varies wildly)
- ❌ Missed opportunities (email sent via non-button actions)
- ❌ Race condition (email may arrive before session starts)

**Architect Decision:** ❌ **REJECTED** - Too fragile and complex for initial implementation. Could be added as Phase 2 enhancement.

---

### Option B: Same Domain Family + Trusted Auth Providers (Hybrid Security)

**How it works:**
- Auto-present if same eTLD+1 (e.g., linear.app → auth.linear.app)
- Auto-present if link matches trusted auth provider pattern
- Higher score threshold for trusted providers (0.85 vs 0.7)
- Block unknown cross-domain links (manual popup only)

**Trusted Auth Provider List:**

```typescript
const TRUSTED_AUTH_PROVIDERS = [
  // Auth-as-a-Service (Major Providers)
  {
    pattern: /^[a-z0-9-]+\.(auth0\.com|eu\.auth0\.com|us\.auth0\.com|au\.auth0\.com|jp\.auth0\.com)$/,
    name: 'Auth0',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9]+\.supabase\.co$/,
    name: 'Supabase',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.firebaseapp\.com$/,
    name: 'Firebase',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.web\.app$/,
    name: 'Firebase (web.app)',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.workos\.com$/,
    name: 'WorkOS',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.clerk\.(accounts\.dev|com)$/,
    name: 'Clerk',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.magic\.link$/,
    name: 'Magic',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.stytch\.com$/,
    name: 'Stytch',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.descope\.(com|io)$/,
    name: 'Descope',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.passage\.id$/,
    name: 'Passage by 1Password',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.hanko\.io$/,
    name: 'Hanko',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.ory\.(sh|network)$/,
    name: 'Ory',
    minScore: 0.85
  },

  // Enterprise Identity Providers
  {
    pattern: /^login\.microsoftonline\.com$/,
    name: 'Microsoft Azure AD',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.b2clogin\.com$/,
    name: 'Microsoft Azure AD B2C',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.(okta\.com|oktapreview\.com|okta-emea\.com)$/,
    name: 'Okta',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.onelogin\.com$/,
    name: 'OneLogin',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.pingone\.(com|eu|asia|ca)$/,
    name: 'Ping Identity',
    minScore: 0.85
  },

  // Developer Platforms
  {
    pattern: /^[a-z0-9-]+\.vercel\.app$/,
    name: 'Vercel',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.netlify\.app$/,
    name: 'Netlify',
    minScore: 0.85
  },

  // SaaS Platforms with Known Auth Patterns
  {
    pattern: /^hooks\.slack\.com$/,
    name: 'Slack (hooks)',
    minScore: 0.85
  },

  // Additional Modern Auth Providers
  {
    pattern: /^[a-z0-9-]+\.frontegg\.com$/,
    name: 'Frontegg',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.userfront\.(com|dev)$/,
    name: 'Userfront',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.authkit\.com$/,
    name: 'AuthKit',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.kinde\.com$/,
    name: 'Kinde',
    minScore: 0.85
  },
  {
    pattern: /^auth\.aws\.amazon\.com$/,
    name: 'AWS Cognito',
    minScore: 0.85
  },
  {
    pattern: /^[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/,
    name: 'AWS Cognito (Regional)',
    minScore: 0.85
  }
]
```

**Coverage:** ~85% of magic link flows (same domain + 25+ trusted providers)

**Pros:**
- ✅ Comprehensive coverage of major auth providers
- ✅ Covers enterprise (Okta, Azure AD, OneLogin)
- ✅ Covers modern SaaS auth (Auth0, Clerk, Stytch, Magic)
- ✅ Covers developer platforms (Vercel, Netlify, Firebase)
- ✅ Explicit allowlist (no user editing = controlled security)
- ✅ Higher score threshold (0.85) for trusted providers

**Cons:**
- ⚠️ Must maintain list (add new providers occasionally)
- ⚠️ Unknown providers require manual popup (acceptable trade-off)

**Security Guarantees:**
- Same eTLD+1 matching: 0.7 threshold
- Trusted provider matching: 0.85 threshold (higher bar)
- Unknown cross-domain: Blocked (manual popup only)
- No wildcards at TLD level (e.g., never `*.com`)
- Regional variants covered (eu.auth0.com, us.auth0.com, etc.)

**Architect Decision:** ✅ **APPROVED** - Balanced approach with comprehensive provider coverage and controlled security model.

---

### Option C: Hybrid (Field + Intent) - **RECOMMENDED**

**How it works:**
- Keep existing field detection for OTPs (unchanged)
- Add page context detection for magic links
- Unified session manager handles both
- Different presentation strategies (autofill vs chip)

**Pros:**
- ✅ Extends existing architecture with minimal changes
- ✅ Reuses proven components (watch session, extraction-core, chip UI)
- ✅ Maintains safety-first approach
- ✅ Provides better UX (in-context) while preserving manual fallback
- ✅ Backward compatible (OTP flow unchanged)
- ✅ Privacy-preserving (local-only, no tracking)

**Cons:**
- ⚠️ Medium complexity (new detection layer)
- ⚠️ Requires careful confidence threshold tuning

**Architect Decision:** ✅ **RECOMMENDED** - Best balance of UX improvement, safety, and implementation complexity.

---

### Option D: User-Initiated Only (Conservative)

**How it works:**
- Extension icon/shortcut to "Watch for magic link"
- User explicitly starts session
- Most conservative approach

**Pros:**
- ✅ Zero false positives
- ✅ Simple implementation
- ✅ Maximum user control

**Cons:**
- ❌ Poor discoverability (users don't know InboxKey can help)
- ❌ Requires manual popup interaction
- ❌ Defeats "instant" promise of InboxKey

**Architect Decision:** 📌 **FALLBACK** - Keep existing popup manual flow, but add proactive detection for better UX.

---

## Recommended Approach

### Core Principle
Extend the existing detection system with a **Page Context Detector** that recognizes passwordless auth scenarios and starts watch sessions proactively.

### Key Design Decisions (FINAL)

1. **Multi-Link Strategy:** Show only highest-scoring safe link. Others accessible via popup. (Decision: Option 1)
   - Simplest UX, one decision at a time
   - Dangerous links never auto-presented (manual popup only)

2. **Cross-Domain Strategy:** Same eTLD+1 + 25 trusted auth providers allowlist. (Decision: Option B)
   - Auto-present: linear.app → auth.linear.app (same domain family)
   - Auto-present: myapp.com → xyz.auth0.com (trusted provider, 0.85 threshold)
   - Block: Unknown cross-domain (manual popup only)
   - Comprehensive coverage: Auth0, Supabase, Firebase, Okta, Azure AD, WorkOS, Clerk, and 18 more

3. **Button Text Detection:** Smart multi-language heuristic using cognates. (Decision: Option C)
   - Language-agnostic keyword matching (email, link, magic, send, passwordless)
   - Cognate patterns across Romance, Germanic, Turkish, East Asian languages
   - 75-80% global coverage without full i18n burden
   - Low maintenance (add cognates as discovered)

4. **Confidence Threshold:** 50%+ to minimize false positives
5. **Session Window:** 15 seconds (same as OTP)
6. **User Confirmation Required:** Never auto-open links (show chip with [Open] button)
7. **Safety First:** Hard blocks on dangerous links, domain affinity checks, higher thresholds for cross-domain
8. **Backward Compatible:** OTP flow unchanged, no breaking changes

---

## New Components

### 1. Page Context Detector

**File:** `/extension/src/lib/detection/page-context-detector.ts`
**LOC:** ~200
**Performance:** <5ms one-time on page load

```typescript
interface PageContext {
  type: 'magic-link-login' | 'magic-link-signup' | 'unknown'
  confidence: number // 0-100
  triggers: string[] // Reasons for detection
}

function detectPageContext(): PageContext {
  // Multi-signal detection:
  // 1. URL patterns (e.g., /login, /signin, /auth/passwordless)
  // 2. Page title keywords ("Login", "Sign in", "Passwordless")
  // 3. Button text analysis ("Send magic link", "Email me a link")
  // 4. Form detection (email input + submit, no password field)
  // 5. Meta tags (og:title, og:description with auth keywords)
}
```

**Detection Heuristics:**

| Confidence | Criteria | Action |
|-----------|----------|--------|
| **HIGH (80+)** | URL contains `/passwordless` OR `/magic-link` + visible "Send link" button | Auto-start session |
| **MEDIUM (50-79)** | `/login` or `/signin` URL + email field + no password field + matching button text | Auto-start session |
| **LOW (<50)** | Partial matches only | No action (manual popup only) |

**Smart Multi-Language Button Detection (Cognate Approach):**

Instead of maintaining 500+ patterns across 21 languages, we use cognates (words that are similar across languages) for intelligent button text scoring:

```typescript
function scoreButtonText(buttonText: string): number {
  const text = buttonText.toLowerCase()
  let score = 0

  // POSITIVE SIGNALS (magic link indicators)

  // "Email" - appears in many languages unchanged
  const hasEmail = /email|e-mail|@/.test(text)

  // "Link" cognates across languages
  const hasLink = /link|lien|enlace|collegamento|bağlantı|링크|链接|リンク/.test(text)
  // English: link, French: lien, Spanish: enlace, Italian: collegamento
  // Turkish: bağlantı, Korean: 링크, Chinese: 链接, Japanese: リンク

  // "Magic" cognates
  const hasMagic = /magic|magique|mágico|magico|sihirli|魔法|マジック/.test(text)
  // English: magic, French: magique, Spanish: mágico, Italian: magico
  // Turkish: sihirli, Chinese: 魔法, Japanese: マジック

  // "Send" cognates
  const hasSend = /send|envoyer|enviar|inviare|gönder|보내기|发送|送信/.test(text)
  // English: send, French: envoyer, Spanish: enviar, Italian: inviare
  // Turkish: gönder, Korean: 보내기, Chinese: 发送, Japanese: 送信

  // "Login/Sign in" cognates
  const hasLogin = /login|signin|sign.in|connexion|iniciar|acceder|giriş|로그인|登录|ログイン/.test(text)

  // "Passwordless" cognates
  const hasPasswordless = /passwordless|sans.mot.de.passe|sin.contraseña|senza.password|şifresiz|무비밀번호|无密码|パスワードなし/.test(text)

  // Scoring combinations
  if (hasMagic && hasLink) score += 40  // "Magic link" in any language
  if (hasEmail && hasLink && hasSend) score += 35  // "Send email link"
  if (hasPasswordless) score += 30  // "Passwordless"
  if (hasLogin && hasEmail) score += 25  // "Email login"
  if (hasLink && hasSend) score += 20  // "Send link"

  // NEGATIVE SIGNALS (reduce false positives)

  // "Password" cognates (traditional login, NOT magic link)
  const hasPassword = /password|passwort|contraseña|mot.de.passe|şifre|비밀번호|密码|パスワード/.test(text)

  // "Register/Sign up" (not login)
  const hasRegister = /register|signup|sign.up|créer|registr|inscr|kayıt|가입|注册|登録/.test(text)

  // "Contact/Support" (contact forms, not auth)
  const hasContact = /contact|support|help|aide|ayuda|aiuto|destek|지원|帮助|サポート/.test(text)

  // "Newsletter/Subscribe"
  const hasNewsletter = /newsletter|subscribe|abonne|suscri|iscri|abone|구독|订阅|購読/.test(text)

  // Apply penalties
  if (hasPassword) score -= 40  // Strong negative (traditional login)
  if (hasRegister) score -= 30  // Sign up, not login
  if (hasContact || hasNewsletter) score -= 40  // Contact/newsletter forms

  return Math.max(0, score)  // Never negative
}
```

**Language Coverage with Cognate Approach:**

| Language Family | Coverage | Example Cognates |
|----------------|----------|------------------|
| **Romance** (French, Spanish, Italian, Portuguese) | ⭐⭐⭐⭐ Excellent | link→lien/enlace/collegamento, magic→magique/mágico |
| **Germanic** (English, German, Dutch) | ⭐⭐⭐⭐ Excellent | email, link, magic (similar) |
| **Turkish** | ⭐⭐⭐ Good | gönder, bağlantı, sihirli |
| **East Asian** (Chinese, Japanese, Korean) | ⭐⭐⭐ Good | 链接/リンク/링크, 发送/送信/보내기 |
| **Slavic** (Russian, Polish, Czech) | ⭐⭐ Medium | Some cognates, but less overlap |
| **Other** (Arabic, Hindi, etc.) | ⭐ Limited | Requires additional patterns |

**Expected Global Coverage:** 75-80% (vs 90% with full i18n, 70% with URL+Form only)

**Maintenance:** Low (add new cognates as discovered, ~5-10 per quarter)

**Example Detection:**

```typescript
// app.linear.app/login
{
  type: 'magic-link-login',
  confidence: 85,
  triggers: [
    'URL=/login',
    'button=Email me a login link',
    'form=email-only',
    'no-password-field'
  ]
}
```

**Integration with Race Condition Prevention:**

**Architect Decision:** Prevent field detection and page context detection from creating concurrent sessions.

**File:** `/extension/src/contents/index.ts` (+50 LOC)

```typescript
// Global session state tracker (CRITICAL: prevents race condition)
let activeSessionType: 'otp-field' | 'magic-link-context' | null = null
let activeSession: BaseWatchSession | null = null

// Enhanced field detection (OTP) - PRIORITY #1
async function handleDetectedField(
  field: HTMLInputElement,
  result: DetectionResult
): Promise<void> {
  // Check if magic link session already active
  if (activeSessionType === 'magic-link-context') {
    console.log('[InboxKey] Magic link session active, skipping field detection')
    return
  }

  // Check if field already watched
  if (isFieldWatched(field)) {
    console.log('[InboxKey] Field already being watched, skipping')
    return
  }

  // Start field-based session (OTP)
  activeSessionType = 'otp-field'
  activeSession = new FieldWatchSession(field, result, {
    onCodeFound: (code) => {
      console.log('[InboxKey] Code found:', code)
      // Autofill logic...
    },
    onSessionEnd: () => {
      activeSessionType = null
      activeSession = null
    }
  })

  await activeSession.start()
  markFieldAsWatched(field)
}

// Page context detection (Magic Links) - PRIORITY #2
async function detectPageContextAndStartWatch(): Promise<void> {
  // CRITICAL: Field detection has priority
  if (activeSessionType === 'otp-field') {
    console.log('[InboxKey] OTP field session active, skipping page context detection')
    return
  }

  const context = detectPageContext()

  if (context.score >= 0.5) { // Threshold for proactive session (UPDATED: 0-1 scale)
    console.log('[InboxKey] Magic link context detected:', context)

    // Start context-based session (Magic Links)
    activeSessionType = 'magic-link-context'
    activeSession = new ContextWatchSession(context, {
      onLinkFound: async (link) => {
        console.log('[InboxKey] Magic link found:', link)
        // Show chip (reuses session-chip.ts)
      },
      onSessionEnd: () => {
        activeSessionType = null
        activeSession = null
      }
    })

    await activeSession.start()
  }
}

// Page load initialization
async function initialize(): Promise<void> {
  // PRIORITY #1: Detect existing fields (OTP)
  await detectExistingFields() // Existing OTP detection

  // PRIORITY #2: Detect page context (Magic Links)
  // Only runs if no field session started
  await detectPageContextAndStartWatch()

  // Set up mutation observers for dynamic content
  setupFieldDetectionObserver() // Existing OTP observer
  setupPageContextObserver() // New magic link observer (respects activeSessionType)
}
```

**Priority Rules:**
1. **Field detection wins** (more specific signal than page context)
2. If field detected → OTP session starts → page context detection skipped
3. If page context detected first → magic link session starts → field detection skipped
4. Only ONE session active at a time (no concurrent sessions)
5. Session cleanup resets `activeSessionType` → allows new session

**Why This Matters:**
- Prevents confusion (two chips showing different options)
- Clear user experience (one action at a time)
- Avoids polling conflicts (two sessions polling same emails)
- Respects user intent (field interaction is more explicit than page context)

---

### 2. Magic Link Presenter

**Architect Decision:** REUSE existing `session-chip.ts` component instead of creating new presenter.

**File:** `/extension/src/contents/session-chip.ts` (enhanced to support magic links)
**Modifications:** +30 LOC (make field parameter optional)

**Why Reuse:**
- ✅ Saves ~120 LOC (150 → 30)
- ✅ Ensures UI consistency (no subtle visual differences)
- ✅ Single component to maintain
- ✅ Existing accessibility features (keyboard nav, screen reader) automatically work

**Enhanced showSessionChip() Signature:**

```typescript
export async function showSessionChip(
  field: HTMLInputElement | null, // NOW OPTIONAL (was required)
  timeout: number | null,
  options?: {
    message?: string
    actions?: Array<{ label: string, onClick: () => void, primary?: boolean }>
    type?: 'info' | 'success' | 'warning' | 'error'
    duration?: number | null // Auto-dismiss duration (null = no auto-dismiss)
  }
): Promise<ChipHandle>
```

**Magic Link Usage:**

```typescript
// In ContextWatchSession.handleMagicLinkFound()
import { showSessionChip } from './session-chip'
import { classifyLink } from '../lib/safety/link-classifier'

private async handleMagicLinkFound(link: MagicLinkResult): void {
  const classification = classifyLink(link.href)
  const domain = new URL(link.href).hostname

  const chip = await showSessionChip(
    null, // No field for magic links
    null, // No timeout
    {
      message: classification.isDangerous
        ? `⚠️ ${classification.warningMessage}`
        : `Magic link from ${domain}`,
      actions: [
        {
          label: classification.isDangerous ? 'Confirm to Open' : 'Open',
          onClick: () => this.openLink(link.href),
          primary: true
        },
        {
          label: 'Dismiss',
          onClick: () => chip.hide()
        }
      ],
      type: classification.isDangerous ? 'warning' : 'success',
      duration: classification.isDangerous ? null : 10000 // Dangerous links don't auto-dismiss
    }
  )

  this.callbacks.onLinkPresented(link)
}
```

**Visual Design (Unchanged):**
- Same chip UI as OTP sessions (consistent UX)
- Positioned bottom-right (non-intrusive)
- Keyboard accessible (Tab to focus, Enter to open, Escape to dismiss)
- Screen reader announcements (`role="alert"`, `aria-live`)
- Reduced motion respected

---

### 3. Enhanced Watch Session Architecture

**Architect Decision:** Use **composition pattern** instead of making field optional.

**Files:**
- `/extension/src/contents/watch-session.ts` (base class, ~150 LOC)
- `/extension/src/contents/field-watch-session.ts` (OTP sessions, ~100 LOC)
- `/extension/src/contents/context-watch-session.ts` (magic link sessions, ~100 LOC)

**Architecture:**

```typescript
// Base class with shared session logic
abstract class BaseWatchSession {
  protected port: chrome.runtime.Port | null = null
  protected sessionId: string | null = null
  protected keepAliveTimer: number | null = null

  abstract getSessionType(): 'otp-field' | 'magic-link-context'
  abstract getSessionPayload(): Record<string, unknown>

  async start(): Promise<void> {
    this.port = chrome.runtime.connect({ name: 'watch-session' })

    this.port.postMessage({
      type: "START_SESSION",
      url: window.location.href,
      sessionType: this.getSessionType(),
      ...this.getSessionPayload()
    })

    this.setupMessageHandlers()
    this.startKeepAlive()
  }

  protected abstract setupMessageHandlers(): void

  // Shared lifecycle methods
  protected startKeepAlive(): void { /* ... */ }
  protected cleanup(): void { /* ... */ }
}

// Field-based session (OTP) - EXISTING BEHAVIOR
class FieldWatchSession extends BaseWatchSession {
  constructor(
    private readonly field: HTMLInputElement,
    private readonly detectionResult: DetectionResult,
    private readonly callbacks: FieldSessionCallbacks
  ) {
    super()
  }

  getSessionType(): 'otp-field' {
    return 'otp-field'
  }

  getSessionPayload() {
    return {
      expected: deriveExpectedShape(this.field),
      detectionResult: this.detectionResult
    }
  }

  protected setupMessageHandlers(): void {
    this.port!.onMessage.addListener((message) => {
      if (message.type === 'SESSION_CODE_FOUND') {
        this.handleCodeFound(message.code)
      }
    })
  }

  private handleCodeFound(code: string): void {
    // Existing autofill logic
    this.field.value = code
    this.callbacks.onCodeFound(code)
  }
}

// Context-based session (Magic Links) - NEW
class ContextWatchSession extends BaseWatchSession {
  constructor(
    private readonly pageContext: PageContext,
    private readonly callbacks: ContextSessionCallbacks
  ) {
    super()
  }

  getSessionType(): 'magic-link-context' {
    return 'magic-link-context'
  }

  getSessionPayload() {
    return {
      pageContext: this.pageContext
    }
  }

  protected setupMessageHandlers(): void {
    this.port!.onMessage.addListener((message) => {
      if (message.type === 'SESSION_MAGIC_LINK_FOUND') {
        this.handleMagicLinkFound(message.link)
      }
    })
  }

  private handleMagicLinkFound(link: MagicLinkResult): void {
    // Show in-page notification chip (reuse existing chip UI)
    this.callbacks.onLinkFound(link)
  }
}
```

**Benefits of Composition:**
- ✅ **Type safety:** No `field?.` null-checks needed
- ✅ **Clarity:** Explicitly separates OTP vs magic link concerns
- ✅ **Maintainability:** Each session type owns its lifecycle
- ✅ **No regressions:** Existing OTP code completely unchanged

**Backward Compatibility:**
- Existing OTP sessions use `FieldWatchSession` (no code changes)
- New magic link sessions use `ContextWatchSession`
- Shared base class eliminates duplication
- Port communication patterns preserved

---

### 4. Enhanced Session Controller & New Components

**Architect Decision:** Extract link matching to separate component, bypass cache for session matching, hard block dangerous links.

#### 4A. Link Matcher Component (NEW)

**File:** `/extension/src/lib/matching/link-matcher.ts` (~150 LOC)

**Purpose:** Centralized magic link scoring and matching logic (reusable, testable)

```typescript
export interface LinkMatchingContext {
  siteUrl: string
  siteETLD: string
  sessionStart: number
  currentTime: number
}

export interface ScoredLink extends MagicLinkResult {
  finalScore: number
  scoringBreakdown: {
    extractionScore: number
    domainAffinity: number
    recency: number
    safetyPenalty: number
  }
}

export function findBestMagicLink(
  links: MagicLinkResult[],
  context: LinkMatchingContext
): ScoredLink | null {
  // Step 1: HARD BLOCK dangerous links (NEVER auto-present)
  const safeCandidates = links.filter(link => !link.isDangerous)

  if (safeCandidates.length === 0) {
    console.log('[LinkMatcher] No safe links found (all dangerous)')
    return null
  }

  // Step 2: Score safe links
  const scored = safeCandidates.map(link => scoreMagicLink(link, context))

  // Step 3: Apply threshold based on domain trust
  const viable = scored.filter(link => {
    const threshold = getTrustThreshold(link, context)
    return link.finalScore >= threshold
  })

  if (viable.length === 0) {
    console.log('[LinkMatcher] No links above threshold')
    return null
  }

  // Step 4: Return highest scoring link
  return viable.sort((a, b) => b.finalScore - a.finalScore)[0]
}

function scoreMagicLink(
  link: MagicLinkResult,
  context: LinkMatchingContext
): ScoredLink {
  const linkHostname = new URL(link.href).hostname
  const linkETLD = extractETLD(linkHostname)
  const pageHostname = new URL(context.siteUrl).hostname

  let score = link.extractionScore // Base score from extraction-core (0-1)
  const breakdown = {
    extractionScore: link.extractionScore,
    domainAffinity: 0,
    recency: 0,
    safetyPenalty: 0
  }

  // Domain affinity (UPDATED: subdomain takeover defense)
  if (linkHostname === pageHostname) {
    // Exact hostname match (strongest signal)
    breakdown.domainAffinity = 0.4
    score += 0.4
  } else if (linkETLD === context.siteETLD) {
    // Same eTLD+1 (weaker signal - subdomain)
    breakdown.domainAffinity = 0.3
    score += 0.3
  } else {
    // Different domain (trusted provider check)
    breakdown.domainAffinity = 0.1
    score += 0.1
  }

  // Recency boost (prefer recent links)
  const ageMinutes = (context.currentTime - link.timestamp) / 60000
  if (ageMinutes < 5) {
    breakdown.recency = 0.2
    score += 0.2
  } else if (ageMinutes > 10) {
    // Too old (likely from previous attempt)
    breakdown.recency = -0.1
    score -= 0.1
  }

  // Session boost (arrived during session window)
  const arrivedDuringSession = link.timestamp >= context.sessionStart
  if (arrivedDuringSession) {
    breakdown.recency += 0.1
    score += 0.1
  }

  return {
    ...link,
    finalScore: Math.max(0, Math.min(1, score)), // Clamp to [0, 1]
    scoringBreakdown: breakdown
  }
}

function getTrustThreshold(link: ScoredLink, context: LinkMatchingContext): number {
  const linkHostname = new URL(link.href).hostname
  const linkETLD = extractETLD(linkHostname)

  // Same eTLD+1: lower threshold (0.7)
  if (linkETLD === context.siteETLD) {
    return 0.7
  }

  // Trusted provider: higher threshold (0.75) - ARCHITECT UPDATED
  if (isTrustedAuthProvider(linkHostname)) {
    return 0.75 // LOWERED from 0.85 per architect recommendation
  }

  // Unknown cross-domain: block (threshold = Infinity)
  return Infinity
}
```

---

#### 4B. Link Classifier Component (NEW)

**File:** `/extension/src/lib/safety/link-classifier.ts` (~100 LOC)

**Purpose:** Single source of truth for dangerous link detection

```typescript
export interface LinkClassification {
  isDangerous: boolean
  dangerType?: 'password-reset' | 'unsubscribe' | 'delete-account' | 'account-closure'
  requiresConfirmation: boolean
  autoOpenAllowed: boolean
  warningMessage?: string
}

export function classifyLink(
  href: string,
  anchorText?: string,
  emailSubject?: string
): LinkClassification {
  const lowerHref = href.toLowerCase()
  const lowerText = (anchorText || '').toLowerCase()
  const lowerSubject = (emailSubject || '').toLowerCase()

  // DANGEROUS KEYWORDS (from existing DANGEROUS_LINK_KEYWORDS)
  const dangerousPatterns = [
    { keywords: ['reset', 'password', 'recovery', 'recover', 'forgot'], type: 'password-reset' as const },
    { keywords: ['delete', 'remove', 'close', 'deactivate'], type: 'delete-account' as const },
    { keywords: ['unsubscribe', 'opt-out', 'stop'], type: 'unsubscribe' as const },
    { keywords: ['cancel', 'suspend', 'terminate'], type: 'account-closure' as const }
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.keywords.some(kw =>
      lowerHref.includes(kw) || lowerText.includes(kw) || lowerSubject.includes(kw)
    )) {
      return {
        isDangerous: true,
        dangerType: pattern.type,
        requiresConfirmation: true,
        autoOpenAllowed: false, // NEVER auto-open dangerous links
        warningMessage: getDangerWarning(pattern.type)
      }
    }
  }

  // Safe link
  return {
    isDangerous: false,
    requiresConfirmation: false,
    autoOpenAllowed: true
  }
}

function getDangerWarning(type: string): string {
  switch (type) {
    case 'password-reset':
      return 'This appears to be a password reset link. Confirm to open.'
    case 'delete-account':
      return 'This link may delete or remove your account. Proceed with caution.'
    case 'unsubscribe':
      return 'This is an unsubscribe link.'
    case 'account-closure':
      return 'This link may close or suspend your account. Proceed with caution.'
    default:
      return 'This link requires confirmation.'
  }
}
```

---

#### 4C. Auth Patterns Registry (NEW)

**File:** `/extension/src/lib/patterns/auth-patterns.ts` (~100 LOC)

**Purpose:** Centralized registry for trusted auth providers (10 core providers - ARCHITECT REDUCED)

```typescript
export interface TrustedAuthProvider {
  pattern: RegExp
  name: string
  minScore: number
  notes?: string
}

// CORE 10 PROVIDERS (reduced from 25 per architect recommendation)
export const TRUSTED_AUTH_PROVIDERS: TrustedAuthProvider[] = [
  {
    pattern: /^[a-z0-9-]+\.(auth0\.com|eu\.auth0\.com|us\.auth0\.com)$/,
    name: 'Auth0',
    minScore: 0.75,
    notes: 'Global auth-as-a-service platform'
  },
  {
    pattern: /^[a-z0-9]+\.supabase\.co$/,
    name: 'Supabase',
    minScore: 0.75
  },
  {
    pattern: /^[a-z0-9-]+\.(firebaseapp\.com|web\.app)$/,
    name: 'Firebase',
    minScore: 0.75,
    notes: 'Google Firebase Auth'
  },
  {
    pattern: /^login\.microsoftonline\.com$/,
    name: 'Microsoft Azure AD',
    minScore: 0.75
  },
  {
    pattern: /^[a-z0-9-]+\.okta\.com$/,
    name: 'Okta',
    minScore: 0.75
  },
  {
    pattern: /^[a-z0-9-]+\.workos\.com$/,
    name: 'WorkOS',
    minScore: 0.75
  },
  {
    pattern: /^[a-z0-9-]+\.clerk\.(accounts\.dev|com)$/,
    name: 'Clerk',
    minScore: 0.75
  },
  {
    pattern: /^[a-z0-9-]+\.vercel\.app$/,
    name: 'Vercel',
    minScore: 0.75
  },
  {
    pattern: /^[a-z0-9-]+\.netlify\.app$/,
    name: 'Netlify',
    minScore: 0.75
  },
  {
    pattern: /^[a-z0-9-]+\.auth\.[a-z0-9-]+\.amazoncognito\.com$/,
    name: 'AWS Cognito',
    minScore: 0.75
  }
]

export function isTrustedAuthProvider(hostname: string): boolean {
  return TRUSTED_AUTH_PROVIDERS.some(provider => provider.pattern.test(hostname))
}

export function getTrustedProviderName(hostname: string): string | null {
  const provider = TRUSTED_AUTH_PROVIDERS.find(p => p.pattern.test(hostname))
  return provider?.name || null
}
```

---

#### 4D. Session Controller Updates

**File:** `/extension/src/background/session-controller.ts` (modifications: +80 LOC)

**Changes:** Use link-matcher, bypass cache for session matching, hard block dangerous links

```typescript
import { findBestMagicLink, type LinkMatchingContext } from '../lib/matching/link-matcher'

interface SessionState {
  // Existing fields...

  // NEW
  sessionType: 'otp-field' | 'magic-link-context'
  pageContext?: PageContext
}

class SessionController {
  private async pollForContent(session: SessionState): Promise<SessionResult | null> {
    // Poll fresh candidates (bypass cache for session matching)
    const freshCandidates = await this.pollingService.pollOnce()

    // Update popup cache AFTER polling (for UI display)
    await this.popupCacheManager.updateWithNewCandidates(freshCandidates)

    if (session.sessionType === 'magic-link-context') {
      // Use centralized link matcher
      const matchingContext: LinkMatchingContext = {
        siteUrl: session.url,
        siteETLD: session.siteETLD,
        sessionStart: session.sessionStart,
        currentTime: Date.now()
      }

      const bestLink = findBestMagicLink(freshCandidates.links, matchingContext)

      if (bestLink) {
        // Send magic link to content script
        session.port.postMessage({
          type: 'SESSION_MAGIC_LINK_FOUND',
          link: bestLink
        })

        return {
          type: 'magic-link',
          link: bestLink,
          timestamp: Date.now()
        }
      }
    } else {
      // Existing OTP code matching (also uses fresh candidates)
      const bestCode = this.findBestMatchingCode(
        freshCandidates.codes,
        session.url,
        Date.now(),
        session.sessionStart,
        session.expectedShape
      )

      if (bestCode) {
        session.port.postMessage({
          type: 'SESSION_CODE_FOUND',
          code: bestCode.code
        })

        return {
          type: 'code',
          code: bestCode,
          timestamp: Date.now()
        }
      }
    }

    return null
  }
}
```

**Key Changes:**
- ✅ **Link matching extracted** to `/extension/src/lib/matching/link-matcher.ts`
- ✅ **Dangerous links hard blocked** (filtered before scoring)
- ✅ **Session matching bypasses cache** (uses fresh candidates)
- ✅ **Cache updated after matching** (for popup UI display)
- ✅ **Trusted provider threshold lowered to 0.75** (from 0.85)
- ✅ **Subdomain takeover defense** (exact hostname bonus +0.4 vs +0.3 eTLD)

---

## User Flows

### Flow 1: Proactive Magic Link (NEW)

```
1. User visits app.linear.app/login
   └─> Page loads

2. Page Context Detector analyzes
   └─> URL: /login ✓
   └─> Button: "Email me a login link" ✓
   └─> Form: email field only (no password) ✓
   └─> Confidence: 85% (HIGH)

3. Auto-start watch session
   └─> Type: 'magic-link-context'
   └─> Duration: 15 seconds
   └─> Show chip: "Listening for magic link..."

4. User clicks "Email me a login link"
   └─> Email sent (external to InboxKey)

5. Background polling (t=0s, 5s, 10s)
   └─> Email arrives (within 15s window)
   └─> extraction-core extracts link
   └─> Link: https://auth.linear.app/verify/abc123

6. V2 Matcher scores link
   └─> extraction-core score: 0.9
   └─> Domain affinity: +0.3 (linear.app matches)
   └─> Recency: +0.2 (<5min old)
   └─> Safety: 0.0 (not dangerous)
   └─> Final score: 0.82 (above 0.6 threshold ✓)

7. Present link to user
   └─> Update chip: "Magic link from linear.app [Open] [Dismiss]"
   └─> Badge: Green checkmark

8. User clicks [Open]
   └─> Link opens in new tab
   └─> Chip dismisses
   └─> Session complete ✓
```

**Alternative: Low Confidence**
```
1-2. Same as above
3. Confidence: 45% (LOW - below 50% threshold)
4. NO auto-start session
5. User must manually open popup to access link
```

---

### Flow 2: Manual Popup Access (EXISTING - Unchanged)

```
1. User on any page
2. Clicks InboxKey extension icon
3. Popup opens → Shows recent magic links (last 7 days)
4. User clicks [Open] button
5. Link service validates (HTTPS, not dangerous)
6. Link opens in new tab
7. Popup closes
```

**No changes to existing flow** - Fallback always available

---

### Flow 3: Ambiguous Context (Fallback)

```
1. User on ambiguous page (confidence <50%)
2. No proactive session started
3. User notices email arrived with magic link
4. Clicks InboxKey icon
5. Popup shows magic links (if any extracted)
6. User manually opens link
```

---

### Flow 4: Dangerous Link Detection

```
1-6. Same as Flow 1
7. Link detected as dangerous (password reset)
   └─> extraction-core keywords: "reset", "password"
   └─> Safety penalty: -0.2
   └─> Final score: 0.62 (still above threshold)

8. Present with warning
   └─> Chip: "⚠️ Password reset link detected. Confirm to open."
   └─> Color: Orange/warning
   └─> Auto-dismiss: Disabled (requires manual action)

9. User clicks [Open]
   └─> Confirmation modal: "This appears to be a password reset link. Continue?"
   └─> User confirms → Link opens
   └─> User cancels → Chip remains (can open later)
```

---

## Safety and Privacy

### Enhanced Safety Checks

```typescript
function shouldPresentMagicLink(
  link: LinkCandidate,
  context: PageContext
): boolean {
  // 1. HTTPS only (existing check)
  if (!link.href.startsWith('https://')) {
    console.warn('[Safety] Blocked non-HTTPS link:', link.href)
    return false
  }

  // 2. Dangerous keywords (existing check)
  if (containsAny(link.href.toLowerCase(), DANGEROUS_LINK_KEYWORDS)) {
    console.warn('[Safety] Dangerous link detected:', link.href)
    // Don't block completely - show with warning
    link.isDangerous = true
  }

  // 3. Domain affinity check (NEW)
  const linkDomain = extractETLD(new URL(link.href).hostname)
  const pageDomain = extractETLD(window.location.hostname)

  // Require domain match OR high extraction score
  if (linkDomain !== pageDomain && link.score < 0.8) {
    console.warn('[Safety] Domain mismatch + low score:', {
      linkDomain,
      pageDomain,
      score: link.score
    })
    return false
  }

  // 4. Recency check (NEW)
  const ageMinutes = (Date.now() - link.timestamp) / 60000
  if (ageMinutes > 10) {
    console.warn('[Safety] Link too old:', ageMinutes, 'minutes')
    return false  // Links >10min old require manual action
  }

  // 5. User automation setting
  const automationLevel = await getAutomationLevel()
  if (automationLevel === 'manual') {
    console.log('[Safety] Manual mode - no auto-presentation')
    return false
  }

  return true
}
```

### User Control

**Automation Level Setting** (existing - applies to magic links):

| Level | Behavior |
|-------|----------|
| `manual` | No proactive sessions (popup only) |
| `clipboard` | Show chip but copy to clipboard instead of opening |
| `autofill` | Show chip with one-click open (default) |
| `full-automation` | Show chip + auto-open after 2s delay (dangerous links still require confirmation) |

**Domain Toggle** (existing - applies to magic links):
- Per-domain enable/disable
- Uses eTLD+1 matching
- UI toggle in popup footer

### Privacy Guarantees

✅ **No new permissions required**
✅ **All processing local-only** (unchanged)
✅ **No tracking of user clicks** on "Send link" buttons
✅ **Magic links stored in ephemeral cache only** (7 day retention, existing)
✅ **No data leaves the device**
✅ **No analytics or telemetry** (unless user explicitly opts in for local-only metrics)

---

## Performance Impact

### New Overhead Analysis

| Component | Timing | Frequency | Impact |
|-----------|--------|-----------|--------|
| Page Context Detection | <5ms | Once per page load (login pages only) | Negligible |
| MutationObserver (button detection) | <1ms | Per DOM mutation (already used for fields) | Minimal |
| Magic link scoring | <2ms | Per link candidate | Same as OTP matching |
| In-page chip rendering | <10ms | Once per magic link found | Same as existing session chip |

**Total Additional Overhead:** <20ms on login pages only

**Comparison:**
- Page load: ~1000ms (typical)
- Field detection (existing): ~0.14ms (Tier 1) to ~0.45ms (Tier 2)
- Magic link context: ~5ms (1% of typical detection time)

**Impact Assessment:** ✅ **NEGLIGIBLE** - Well within performance budget

---

## Implementation Phases

### Phase 1: MVP (6-7 weeks) - ARCHITECT UPDATED

**Goal:** Core proactive magic link detection with conservative heuristics and robust architecture

**Estimated Effort:** 6-7 weeks (updated from 4-6 weeks to account for architectural improvements)

**Week 1-2: Foundation Components**

1. **Link Matcher** (`/extension/src/lib/matching/link-matcher.ts` - 150 LOC)
   - Centralized scoring logic (extraction score + domain affinity + recency)
   - Hard block dangerous links (filter before scoring)
   - Trust threshold logic (0.7 same eTLD, 0.75 trusted provider)
   - Subdomain takeover defense (exact hostname bonus)
   - Unit tests (15 tests)

2. **Link Classifier** (`/extension/src/lib/safety/link-classifier.ts` - 100 LOC)
   - Single source of truth for danger classification
   - Detects password-reset, unsubscribe, delete-account, etc.
   - Returns structured classification with warning messages
   - Unit tests (10 tests)

3. **Auth Patterns Registry** (`/extension/src/lib/patterns/auth-patterns.ts` - 100 LOC)
   - 10 core trusted providers (Auth0, Supabase, Firebase, Azure AD, Okta, WorkOS, Clerk, Vercel, Netlify, AWS Cognito)
   - Centralized pattern management
   - ReDoS safety tests
   - Unit tests (10 tests)

**Week 3-4: Detection & Session Architecture**

4. **Page Context Detector** (`/extension/src/lib/detection/page-context-detector.ts` - 200 LOC)
   - URL pattern matching (language-agnostic)
   - Form structure detection (email-only, no password)
   - Smart button text cognate scoring (75-80% global coverage)
   - Meta tag analysis
   - Unit tests (20 tests)

5. **Watch Session Composition** (3 files, ~350 LOC total)
   - `/extension/src/contents/watch-session.ts` (base class, 150 LOC)
   - `/extension/src/contents/field-watch-session.ts` (OTP, 100 LOC)
   - `/extension/src/contents/context-watch-session.ts` (magic links, 100 LOC)
   - Type-safe composition (no field? null-checks)
   - Separate message handlers (SESSION_CODE_FOUND vs SESSION_MAGIC_LINK_FOUND)
   - Integration tests (15 tests)

**Week 5-6: Session Controller & Presentation**

6. **Session Controller Updates** (`session-controller.ts` +80 LOC)
   - Add sessionType discrimination
   - Use link-matcher for magic link selection
   - Bypass cache for session matching (use fresh candidates)
   - Update cache AFTER matching (for popup UI)
   - Integration tests (10 tests)

7. **Content Script Integration** (`contents/index.ts` +50 LOC)
   - Global session tracker (prevents race conditions)
   - Priority rule: field detection wins over page context
   - Initialize both detectors (respecting priority)
   - Integration tests (5 tests)

8. **Session Chip Enhancement** (`session-chip.ts` +30 LOC)
   - Make field parameter optional (support null for magic links)
   - Add magic link presentation mode
   - Reuse existing accessibility features
   - Visual consistency tests (3 tests)

**Week 7: QA, Security & Accessibility**

9. **Security Validation**
   - Dangerous link hard block tests (ensure NEVER auto-presented)
   - ReDoS tests for auth provider patterns (<5ms)
   - HTTPS-only validation
   - Subdomain takeover tests
   - Cross-domain phishing scenarios

10. **Performance Testing**
   - Page context detection <5ms (P95)
   - Button text scoring <2ms per button
   - Magic link scoring <2ms per link
   - Total overhead <20ms on login pages
   - Zero impact on non-auth pages

11. **Accessibility Testing**
   - Keyboard navigation (Tab, Enter, Escape)
   - Screen reader announcements (NVDA, JAWS)
   - Focus management
   - Color contrast AA+
   - Reduced motion respect

12. **E2E Tests** (8 flows)
   - Linear.app magic link flow
   - Notion.so magic link flow
   - Slack workspace link flow
   - Vercel deployment link flow
   - Password reset (dangerous, blocked)
   - Multi-link email (highest safe link wins)
   - Email arrives before session (race condition)
   - Low confidence page (no auto-presentation)

**Files to Create (8 new files):**
- `/extension/src/lib/matching/link-matcher.ts` (150 LOC)
- `/extension/src/lib/safety/link-classifier.ts` (100 LOC)
- `/extension/src/lib/patterns/auth-patterns.ts` (100 LOC)
- `/extension/src/lib/detection/page-context-detector.ts` (200 LOC)
- `/extension/src/contents/field-watch-session.ts` (100 LOC)
- `/extension/src/contents/context-watch-session.ts` (100 LOC)
- Test files (6 new test suites)

**Files to Modify (4 existing files):**
- `/extension/src/contents/watch-session.ts` (refactor to base class, ~150 LOC)
- `/extension/src/contents/session-chip.ts` (+30 LOC)
- `/extension/src/contents/index.ts` (+50 LOC)
- `/extension/src/background/session-controller.ts` (+80 LOC)

**Total New LOC:** ~650 (up from 580 due to architectural improvements)

**Testing Coverage:**
- Unit tests: 75+ tests
- Integration tests: 30+ tests
- E2E tests: 8 flows
- **Target:** 85%+ code coverage

**Success Criteria:**
- ✅ 80%+ precision on known passwordless pages
- ✅ <5ms page context detection (P95)
- ✅ <10ms chip render time
- ✅ **ZERO auto-presents of dangerous links** (hard block enforced)
- ✅ All existing OTP tests pass (no regressions)
- ✅ Security checklist complete (ReDoS tests, phishing scenarios)
- ✅ Accessibility checklist complete (keyboard, screen reader)
- ✅ 85%+ test coverage

---

### Phase 2: Refinement (Post-MVP, 2-3 weeks)

**Goal:** Improve detection accuracy and user experience

**Enhancements:**

1. **Button Click Detection** (optional enhancement)
   - Detect actual "Send link" button clicks
   - Start session immediately on click
   - Complement page context detection

2. **Enhanced Confidence Scoring**
   - Page title analysis
   - Meta tag analysis (og:title, og:description)
   - Brand hints from favicon/logos
   - Machine learning potential (local-only)

3. **Multi-language Support**
   - Button text patterns in 21 languages (same as field detection)
   - Localized page titles
   - i18n for chip UI

4. **A/B Testing Infrastructure**
   - Feature flags for confidence thresholds
   - Local-only metrics (opt-in)
   - Experimentation framework

5. **Telemetry (Opt-in, Local-only)**
   - Session success rate (link presented → user clicked)
   - False positive rate (chip dismissed immediately)
   - Performance metrics (detection time, session latency)
   - Anonymized counters in chrome.storage.local

**Success Criteria:**
- ≥90% precision on passwordless pages
- <30% false positive dismissal rate
- Manual popup usage decreases by 30%+

---

### Phase 3: Advanced (Future, 3-4 weeks)

**Goal:** Advanced detection and personalization

**Enhancements:**

1. **ML-based Page Classification** (local-only)
   - TensorFlow.js for page pattern recognition
   - Runs in browser (no server required)
   - User-specific training (opt-in)

2. **Brand Hints & Metadata**
   - Extract brand from page metadata
   - Match against known passwordless auth providers
   - Allowlist for high-confidence detection

3. **Custom User Patterns** (power users)
   - User-defined page patterns
   - Custom button selectors
   - Domain-specific rules

4. **Cross-domain Magic Links**
   - Detect when magic links go to different domains (e.g., app.slack.com → workspace.slack.com)
   - Allowlist known patterns
   - Require high extraction-core score (0.8+)

**Success Criteria:**
- ≥95% precision
- Support for 50+ popular passwordless auth services
- Power user adoption (custom patterns)

---

## Risk Assessment

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation | Owner |
|------|-----------|--------|-----------|-------|
| **False positive detection** (non-magic-link pages) | Medium | Low | Conservative confidence threshold (50%+), short session window (15s), user can dismiss chip | Architect |
| **Auto-opening dangerous links** | Low | **CRITICAL** | Hard block on DANGEROUS_LINK_KEYWORDS, domain affinity check, confirmation for reset links, NEVER auto-open without user click | Security |
| **Performance regression** | Low | Low | Lazy detection (only on /login pages), debounced mutations, same polling as OTP, <5ms context detection | Engineering |
| **User confusion** (chip appears unexpectedly) | Medium | Low | Clear messaging ("Magic link from domain.com"), easy dismiss, respects automation level, domain toggle works | UX |
| **Privacy concerns** (tracking "Send link" clicks) | Low | Medium | **NO tracking implemented**, all detection local, no analytics, no data leaves device | Privacy |
| **Session race condition** (email arrives before session starts) | Low | Medium | 15s session window, polling at t=0s catches early emails, fallback to manual popup | Engineering |
| **Cross-domain link false negatives** | Medium | Low | Start with conservative same-domain matching, Phase 2 adds allowlist, require high extraction score | Product |
| **Browser compatibility** (Chrome vs Edge vs Brave) | Low | Low | All Chromium-based browsers supported (MV3 standard), test on all platforms | QA |

### Mitigation Strategies

1. **False Positives:**
   - Start with HIGH confidence threshold (60%+)
   - Gradual tuning based on user feedback
   - Easy dismiss (single click or Escape key)
   - Respects automation level and domain toggles

2. **Dangerous Links:**
   - Multi-layer safety (HTTPS, keywords, domain affinity, confirmation)
   - Never auto-open (always require user click)
   - Clear warnings for password resets
   - Rate limiting (existing: 5 links/minute)

3. **Performance:**
   - Lazy detection (only login/signup pages)
   - Debounced mutations (existing pattern)
   - Minimal CPU usage (<5ms one-time)
   - No impact on non-auth pages

4. **Privacy:**
   - Zero external communication
   - No button click tracking
   - Local-only processing (existing architecture)
   - Explicit user consent for any metrics

---

## Success Metrics

### Primary Metrics (Local-Only, Privacy-Preserving)

1. **Detection Accuracy:** ≥80% precision on known magic link login pages
   - True Positives: Passwordless pages correctly detected
   - False Positives: Non-passwordless pages incorrectly detected
   - False Negatives: Passwordless pages missed
   - Measurement: E2E tests + opt-in user feedback

2. **Performance:** Page context detection <5ms, chip render <10ms
   - Measured via performance.now() in production (local logging only)
   - No impact on page load time (<1% overhead)

3. **Safety:** Zero auto-opens of dangerous links in testing
   - 100% confirmation rate for password reset links
   - Zero bypasses of safety checks

4. **User Satisfaction:** Manual popup usage decreases by ≥30%
   - Compare popup open rate before/after feature launch
   - Anonymous local counters (opt-in)
   - Indicator: Users prefer in-context presentation

### Secondary Metrics (Optional, Opt-in)

5. **Session Success Rate:** Link presented → user clicked (target: >60%)
   - Measures relevance and timeliness
   - Local counter: presentedCount, clickedCount

6. **False Positive Rate:** Chip dismissed immediately (target: <30%)
   - Measures detection accuracy
   - Local counter: presentedCount, dismissedWithin5sCount

7. **Performance Telemetry:**
   - Context detection time (avg, p50, p95, p99)
   - Session latency (time from page load to link presentation)
   - Email arrival time (within 15s window?)

### Measurement Approach

**Privacy-Preserving Telemetry:**
- All metrics stored in chrome.storage.local only
- No data sent to servers
- Aggregated anonymously (no URLs, no user IDs)
- Opt-in via Settings panel
- User can view/export their own metrics
- Clear documentation of what's collected

**Example Storage:**
```json
{
  "magicLinkMetrics": {
    "sessionsStarted": 42,
    "linksPresented": 38,
    "linksClicked": 25,
    "linksDismissed": 13,
    "avgDetectionTime": 3.2,
    "avgSessionLatency": 4.8,
    "falsePositives": 8
  }
}
```

---

## Open Questions

### Technical Questions

1. **Multi-link scenarios:** If multiple magic links arrive (e.g., login + password reset), which to present?
   - **Proposed:** Show highest scoring, allow cycling through alternatives via chip UI (next/prev buttons)

2. **Cross-domain magic links:** Some services email links to different domains (e.g., app.slack.com → workspace.slack.com)
   - **Proposed:** Allowlist known patterns, require high extraction-core score (0.8+)
   - **Phase:** Phase 2 or 3

3. **Button text detection:** Smart multi-language heuristic using cognates
   - **Approach:** Detect button relevance using keywords that appear across languages
   - **Coverage:** ~75-80% globally without full i18n burden
   - **Implementation:** Language-agnostic keyword matching with cognate patterns

4. **Session timing:** 15s window may be too short if email delivery is slow
   - **Proposed:** Start with 15s (same as OTP), monitor email arrival times, extend to 20-30s if needed
   - **Metric:** % of emails arriving after 15s

### Product Questions

5. **Mobile browsers:** How does this work in mobile Chrome (if extension support added)?
   - **Answer:** Defer until Chrome on Android supports MV3 extensions
   - **Timeline:** 2025-2026 (tentative)

6. **User education:** How do we teach users about this feature?
   - **Proposed:**
     - One-time tooltip on first magic link detection
     - Help text in Settings panel
     - Optional tutorial video
     - FAQ in documentation

7. **Opt-out:** Should users be able to disable proactive detection entirely?
   - **Answer:** YES - Respect automation level 'manual' + domain toggle
   - **UI:** Settings > Automation > Manual mode

### UX Questions

8. **Chip positioning:** Bottom-right OK for all pages? Conflicts with chat widgets?
   - **Proposed:**
     - Detect existing chat widgets
     - Auto-adjust position (bottom-left if bottom-right occupied)
     - User preference for position (Phase 2)

9. **Multiple sessions:** What if user opens multiple login pages simultaneously?
   - **Proposed:**
     - Support multiple concurrent sessions (one per tab)
     - Present links in correct tab (match by URL)
     - Badge shows active session count

10. **Accessibility:** Screen reader announcements for chip?
    - **Answer:** YES
    - **Implementation:**
      - `role="alert"` for chip
      - `aria-live="polite"` for non-urgent
      - `aria-live="assertive"` for dangerous links
      - Focus management (shift focus to chip on presentation)

---

## Decision Framework

### Go/No-Go Criteria

**✅ Proceed with Implementation IF:**
1. Architect approval (risk assessment acceptable)
2. UI-UX approval (chip design, accessibility)
3. Security review pass (dangerous link protections adequate)
4. Performance budget met (<20ms overhead)
5. No breaking changes to existing OTP flow
6. Privacy guarantees maintained (local-only)

**⛔ Do NOT Proceed IF:**
1. Security concerns unresolved (auto-open risk)
2. Performance impact >50ms (page load degradation)
3. Privacy violations (external communication required)
4. Breaking changes to core functionality
5. Insufficient testing coverage (<80% test coverage)

### Decision Timeline

**Week 1-2:** Review and decision
- Product owner reviews this document
- Architect reviews technical approach
- UI-UX reviews chip design and user flows
- Security reviews safety mechanisms
- Team discusses open questions

**Week 3:** Final decision
- Go/No-Go decision from product owner
- If GO: Prioritize Phase 1 in roadmap
- If NO-GO: Document decision rationale, revisit in 3-6 months

**Week 4+:** Implementation (if approved)
- Phase 1 MVP begins (4-6 weeks)
- Weekly progress reviews
- Continuous risk assessment

---

## Appendices

### Appendix A: Related Files

**Existing Files (To Understand/Modify):**
- `/extension/src/contents/index.ts` - Add page context detection
- `/extension/src/contents/watch-session.ts` - Enhance for context-based sessions
- `/extension/src/background/session-controller.ts` - Add magic link path
- `/packages/extraction-core/src/extraction/extractor.ts` - Already extracts magic links (no changes)
- `/extension/src/ui/services/link-service.ts` - Existing safety checks (reuse)
- `/extension/src/contents/session-chip.ts` - Reuse for magic link presenter

**New Files (To Create):**
- `/extension/src/lib/detection/page-context-detector.ts` - Page pattern recognition
- `/extension/src/contents/magic-link-presenter.ts` - In-page chip UI

**Test Files (To Create):**
- `/extension/tests/unit/page-context-detector.test.ts` (~20 test cases)
- `/extension/tests/unit/magic-link-scoring.test.ts` (~15 test cases)
- `/extension/tests/integration/magic-link-session.test.ts` (~5 scenarios)
- `/extension/tests/e2e/magic-link-proactive.test.ts` (Linear, Notion, Slack flows)

---

### Appendix B: Dangerous Link Keywords (Existing)

From `/extension/src/ui/services/link-service.ts`:

```typescript
const DANGEROUS_LINK_KEYWORDS = [
  'reset',
  'password',
  'recovery',
  'recover',
  'forgot',
  'delete',
  'remove',
  'close',
  'cancel',
  'deactivate',
  'suspend',
  'terminate'
]
```

**Behavior:**
- Links containing these keywords require confirmation
- Shown with warning chip (orange color)
- Auto-dismiss disabled (user must manually open or dismiss)
- Confirmation modal before opening

---

### Appendix C: Automation Level Descriptions

From `/extension/src/lib/storage/schema.ts`:

```typescript
export type AutomationLevel = 'manual' | 'clipboard' | 'autofill' | 'full-automation'

// Manual: User must click icon to detect codes (no auto-detection)
// Clipboard: Auto-detect and copy to clipboard (no autofill)
// Autofill: Auto-detect and autofill (current default behavior)
// Full-automation: Auto-detect, autofill, and auto-submit
```

**Magic Link Behavior:**

| Level | OTP Behavior | Magic Link Behavior |
|-------|--------------|---------------------|
| `manual` | No auto-detection | No proactive sessions (popup only) |
| `clipboard` | Auto-detect + copy | Show chip + copy link to clipboard |
| `autofill` | Auto-detect + fill | Show chip + one-click open (default) |
| `full-automation` | Auto-detect + fill + submit | Show chip + auto-open after 2s delay (dangerous links still require confirmation) |

---

### Appendix D: Page Context Detection Examples

**Example 1: Linear (HIGH confidence)**

```typescript
{
  url: 'https://linear.app/login',
  type: 'magic-link-login',
  confidence: 92,
  triggers: [
    'URL=/login',
    'button=Email me a login link',
    'form=email-only',
    'no-password-field',
    'title=Login - Linear'
  ]
}
```

**Example 2: Generic Login (MEDIUM confidence)**

```typescript
{
  url: 'https://example.com/signin',
  type: 'magic-link-login',
  confidence: 58,
  triggers: [
    'URL=/signin',
    'button=Send me a link',
    'form=email-only',
    'no-password-field'
  ]
}
```

**Example 3: Ambiguous Page (LOW confidence - NO ACTION)**

```typescript
{
  url: 'https://example.com/contact',
  type: 'unknown',
  confidence: 25,
  triggers: [
    'form=email-only' // Contact form, not auth
  ]
}
```

---

### Appendix E: Performance Benchmarks

**Target Performance Budget:**

| Metric | Target | Measurement |
|--------|--------|-------------|
| Page context detection | <5ms | performance.now() |
| Magic link scoring | <2ms | performance.now() |
| Chip rendering | <10ms | performance.now() |
| Total overhead (login pages) | <20ms | Sum of above |
| Impact on page load | <1% | Before/after comparison |

**Baseline (Existing):**
- Field detection (Tier 1): ~0.14ms
- Field detection (Tier 2): ~0.45ms
- Session chip rendering: ~8ms
- OTP autofill: ~15ms

**New Components:**
- Page context detection: ~3-5ms (one-time on page load)
- Magic link presenter: ~8-10ms (same as session chip)
- Session controller magic link path: ~1-2ms (per link)

**Total Impact:** ~15-20ms on login pages only (negligible)

---

## Architect Review & Verdict

**Review Date:** 2025-10-25
**Status:** ✅ **APPROVED WITH CONDITIONS**
**Risk Level:** MEDIUM
**Reviewer:** Architect Agent

### Verdict Summary

The magic link intent detection feature represents a **well-considered architectural extension** that builds on existing patterns while introducing necessary complexity. The hybrid field + intent detection approach is architecturally sound and maintains InboxKey's core principles (local-only, privacy-first, safety-first).

**Overall Assessment:** The architecture is fundamentally compatible with existing systems, but **critical refinements** were required before implementation.

---

### Critical Architectural Fixes (IMPLEMENTED)

#### 1. ✅ WatchSession Composition Pattern
**Problem:** Making `field` optional would break type safety and introduce null-checks everywhere.

**Solution:** Use composition pattern with three classes:
- `BaseWatchSession` (shared logic)
- `FieldWatchSession` (OTP, existing behavior)
- `ContextWatchSession` (magic links, new)

**Benefit:** Type-safe, no regressions, clear separation of concerns.

---

#### 2. ✅ Hard Block Dangerous Links
**Problem:** Original spec allowed dangerous links to auto-present if score was high enough.

**Solution:** Filter dangerous links BEFORE scoring in `link-matcher.ts`:
```typescript
const safeCandidates = links.filter(link => !link.isDangerous)
```

**Benefit:** ZERO chance of auto-presenting password reset links.

---

#### 3. ✅ Race Condition Prevention
**Problem:** Field detection and page context detection could trigger simultaneously.

**Solution:** Global session tracker with priority rule (field detection wins):
```typescript
let activeSessionType: 'otp-field' | 'magic-link-context' | null = null
```

**Benefit:** Only one session active at a time, clear user experience.

---

#### 4. ✅ Extract Link Matcher Component
**Problem:** Embedding scoring logic in session-controller.ts (already 565 LOC).

**Solution:** New component `/extension/src/lib/matching/link-matcher.ts` (150 LOC):
- Centralized scoring logic
- Reusable across session controller and popup
- Unit testable in isolation

**Benefit:** Cleaner architecture, easier to maintain.

---

#### 5. ✅ Session Matching Bypasses Cache
**Problem:** Round-trip through PopupCache adds latency and complexity.

**Solution:** Match from fresh candidates, update cache after:
```typescript
const freshCandidates = await pollingService.pollOnce()
const bestLink = findBestMagicLink(freshCandidates, context)
await popupCache.update(freshCandidates) // After matching
```

**Benefit:** Faster matching, simpler data flow.

---

#### 6. ✅ Reduced Trusted Providers to 10
**Problem:** Maintaining 25 regex patterns is high burden for MVP.

**Solution:** Core 10 providers (Auth0, Supabase, Firebase, Azure AD, Okta, WorkOS, Clerk, Vercel, Netlify, AWS Cognito).

**Benefit:** Lower maintenance, easier to add ReDoS tests, expandable in Phase 2.

---

#### 7. ✅ Lowered Trusted Provider Threshold to 0.75
**Problem:** 0.85 threshold unrealistic with 0.6-0.7 baseline extraction scores.

**Solution:** Same eTLD: 0.7, Trusted provider: 0.75 (was 0.85).

**Benefit:** More realistic matching without compromising security.

---

#### 8. ✅ Subdomain Takeover Defense
**Problem:** Same eTLD+1 matching vulnerable to compromised subdomains.

**Solution:** Exact hostname bonus (+0.4 vs +0.3 for eTLD+1):
```typescript
if (linkHostname === pageHostname) score += 0.4 // Stronger
else if (linkETLD === pageETLD) score += 0.3 // Weaker
```

**Benefit:** Reduces phishing risk from subdomain takeover attacks.

---

#### 9. ✅ Centralized Link Classification
**Problem:** Three different layers making danger decisions (extraction-core, link-service, presenter).

**Solution:** New component `/extension/src/lib/safety/link-classifier.ts`:
- Single source of truth for danger classification
- Structured classification with warning messages
- Reusable across all components

**Benefit:** Consistent danger detection, easier to maintain.

---

#### 10. ✅ Reuse session-chip.ts Component
**Problem:** Creating new magic-link-presenter.ts (150 LOC) duplicates chip logic.

**Solution:** Make `showSessionChip()` accept `field: HTMLInputElement | null`:
- Saves ~120 LOC (30 vs 150)
- Ensures UI consistency
- Existing accessibility features work automatically

**Benefit:** Single component to maintain, consistent UX.

---

### New Architectural Components

The architect review identified need for 3 additional components:

1. **`/extension/src/lib/matching/link-matcher.ts`** (150 LOC)
   - Centralized magic link scoring
   - Hard blocks dangerous links
   - Trust threshold logic

2. **`/extension/src/lib/safety/link-classifier.ts`** (100 LOC)
   - Single source of truth for danger classification
   - Structured classification responses

3. **`/extension/src/lib/patterns/auth-patterns.ts`** (100 LOC)
   - Centralized trusted provider registry
   - 10 core providers (down from 25)
   - ReDoS safety tests

**Total Additional LOC:** ~350 (architectural improvements)

---

### Updated Implementation Timeline

**Original Estimate:** 4-6 weeks
**Architect Estimate:** 6-7 weeks
**Reason:** Additional architectural components for long-term maintainability

**Breakdown:**
- Week 1-2: Foundation components (link-matcher, link-classifier, auth-patterns)
- Week 3-4: Detection & session architecture (page-context-detector, watch session composition)
- Week 5-6: Session controller & presentation (integration, chip reuse)
- Week 7: QA, security, accessibility validation

---

### Security & Safety Validation

**Required Checklists (QA-OPS Gates):**

**Security Checklist:**
- [ ] Dangerous links NEVER auto-presented (hard block verified)
- [ ] HTTPS-only validation enforced
- [ ] Rate limiting (5 links/minute) working
- [ ] Trusted provider regex ReDoS tests pass (<5ms)
- [ ] Subdomain takeover defense implemented
- [ ] User confirmation required for reset links
- [ ] All magic links require user click (no auto-open)
- [ ] Privacy: no tracking, no external communication

**Performance Checklist:**
- [ ] Page context detection <5ms (P95)
- [ ] Button text scoring <2ms per button
- [ ] Magic link scoring <2ms per link
- [ ] Total overhead <20ms on login pages
- [ ] Zero impact on non-auth pages

**Accessibility Checklist:**
- [ ] Keyboard navigation (Tab, Enter, Escape)
- [ ] Screen reader support (role="alert", aria-live)
- [ ] Focus management
- [ ] Color contrast AA+
- [ ] Reduced motion respected

---

### Risk Assessment

| Risk | Original | After Architect Review |
|------|----------|----------------------|
| **Dangerous link auto-open** | MEDIUM | ✅ **LOW** (hard block enforced) |
| **Type safety issues** | MEDIUM | ✅ **LOW** (composition pattern) |
| **Race conditions** | HIGH | ✅ **LOW** (global session tracker) |
| **Maintenance burden** | HIGH (25 providers) | ✅ **MEDIUM** (10 providers) |
| **Performance** | LOW | ✅ **LOW** (unchanged) |
| **Privacy** | LOW | ✅ **LOW** (unchanged) |

**Overall Risk:** MEDIUM → **LOW-MEDIUM** (after architectural improvements)

---

### Architect Recommendations Summary

**✅ APPROVED FOR IMPLEMENTATION** with the following conditions:

1. **All 10 critical fixes implemented** before starting code
2. **Security checklist complete** before QA-OPS validation
3. **Test coverage ≥85%** for new components
4. **UI-UX accessibility gate passed** for chip presentation
5. **Edge cases documented** in code comments

**Conditions Met:** All critical architectural issues have been addressed in updated spec.

**Ready to Proceed:** YES

---

## Conclusion

The **Hybrid Field + Intent Detection** approach with **Architect-approved architectural improvements** provides the best balance of:
- ✅ User experience improvement (proactive magic link presentation)
- ✅ Safety (hard block dangerous links, never auto-open, subdomain takeover defense)
- ✅ Privacy (local-only, no tracking, no new permissions)
- ✅ Backward compatibility (OTP flow unchanged, composition pattern)
- ✅ Performance (negligible overhead <20ms)
- ✅ Maintainability (centralized components, clear boundaries, 10 core providers)
- ✅ Type safety (composition pattern, no null-checks)
- ✅ Security (link-classifier, hard blocks, ReDoS tests)

**Final Recommendation:** **APPROVED** for Phase 1 MVP implementation

**Updated Effort:** 6-7 weeks (from 4-6 weeks)

**Next Steps:**
1. ✅ Product owner review (completed - decisions locked)
2. ✅ Architect review (completed - APPROVED WITH CONDITIONS)
3. ⏳ UI-UX specialist review of chip reuse strategy
4. ⏳ Implement critical architectural fixes (10 items)
5. ⏳ Code-implementer: Follow week-by-week implementation plan
6. ⏳ QA-OPS: Validate security, performance, accessibility checklists
7. ⏳ Ship Phase 1 MVP

---

**Document Version:** 1.0
**Last Updated:** 2025-10-24
**Status:** Pending Decision
**Owner:** Product Owner
