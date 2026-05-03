import { describe, it, expect } from "vitest"
import { isStrictDomainMatch, shouldSuppressMatch } from "../eligibility"
import { domainAffinity, extractETLD } from "../domain-affinity"

describe("isStrictDomainMatch", () => {
  describe("exact eTLD+1", () => {
    it("passes when host eTLD+1 equals sender eTLD+1", () => {
      expect(isStrictDomainMatch("login.example.com", "example.com")).toBe(true)
    })

    it("passes for compound TLDs (.co.uk)", () => {
      expect(isStrictDomainMatch("login.amazon.co.uk", "amazon.co.uk")).toBe(
        true,
      )
    })

    it("passes for compound TLDs (.com.tr)", () => {
      expect(isStrictDomainMatch("shop.example.com.tr", "example.com.tr")).toBe(
        true,
      )
    })
  })

  describe("alias match", () => {
    it("passes for audited alias (dropboxmail.com → dropbox.com)", () => {
      expect(isStrictDomainMatch("dropbox.com", "dropboxmail.com")).toBe(true)
    })
  })

  describe("rejection", () => {
    it("rejects when senderETLD is undefined", () => {
      expect(isStrictDomainMatch("example.com", undefined)).toBe(false)
    })

    it("rejects when senderETLD is empty string", () => {
      expect(isStrictDomainMatch("example.com", "")).toBe(false)
    })

    it("rejects token-overlap matches (affinity 0.6)", () => {
      // Sanity-check: domainAffinity returns 0.6 when site tokens appear in
      // the subject. The gate must reject this regardless because subject
      // overlap is not domain evidence.
      const a = domainAffinity(
        "github.com",
        "notification.com",
        "GitHub Security Alert",
      )
      expect(a).toBe(0.6)
      // Gate uses (siteHost, senderETLD) — no subject — so the comparison
      // collapses to 0.0 anyway, which is also < 0.9.
      expect(isStrictDomainMatch("github.com", "notification.com")).toBe(false)
    })

    it("rejects unrelated domains", () => {
      expect(isStrictDomainMatch("twitter.com", "mailgun.org")).toBe(false)
    })
  })

  describe("shared-host blocklist", () => {
    it("rejects github.io page", () => {
      // tldts collapses both subdomains to github.io — eTLD+1 match would
      // be unsafe without the blocklist.
      expect(extractETLD("victim.github.io")).toBe("github.io")
      expect(isStrictDomainMatch("victim.github.io", "github.io")).toBe(false)
    })

    it("rejects vercel.app page", () => {
      expect(extractETLD("myapp.vercel.app")).toBe("vercel.app")
      expect(isStrictDomainMatch("myapp.vercel.app", "vercel.app")).toBe(false)
    })

    it("rejects pages.dev page", () => {
      expect(extractETLD("mysite.pages.dev")).toBe("pages.dev")
      expect(isStrictDomainMatch("mysite.pages.dev", "pages.dev")).toBe(false)
    })

    it("rejects appspot.com page", () => {
      expect(extractETLD("myapp.appspot.com")).toBe("appspot.com")
      expect(isStrictDomainMatch("myapp.appspot.com", "appspot.com")).toBe(
        false,
      )
    })

    it("rejects netlify.app page", () => {
      expect(isStrictDomainMatch("mysite.netlify.app", "netlify.app")).toBe(
        false,
      )
    })
  })

  describe("edge cases", () => {
    it("handles localhost match", () => {
      expect(isStrictDomainMatch("localhost", "localhost")).toBe(true)
    })

    it("rejects mismatched localhost vs real sender", () => {
      expect(isStrictDomainMatch("localhost", "example.com")).toBe(false)
    })

    it("returns false for empty pageHost", () => {
      expect(isStrictDomainMatch("", "example.com")).toBe(false)
    })

    it("handles port in pageHost gracefully", () => {
      // hostname doesn't include port, but pageHost may. tldts strips the
      // port via getDomain. Sanity-check the path doesn't crash.
      expect(isStrictDomainMatch("example.com:8080", "example.com")).toBe(true)
    })
  })
})

describe("shouldSuppressMatch", () => {
  describe("flag off", () => {
    it("never suppresses when feature flag is disabled", () => {
      // unknown evidence + unrelated sender + email-only — would suppress
      // if flag were on. Flag off → false.
      expect(
        shouldSuppressMatch(false, "unknown", ["email"], "x.com", "unrelated.com"),
      ).toBe(false)
    })
  })

  describe("evidence", () => {
    it("does not suppress when evidence is positive", () => {
      expect(
        shouldSuppressMatch(true, "positive", ["email"], "x.com", "unrelated.com"),
      ).toBe(false)
    })

    it("does not suppress when evidence is undefined (backward compat = positive)", () => {
      expect(
        shouldSuppressMatch(true, undefined, ["email"], "x.com", "unrelated.com"),
      ).toBe(false)
    })

    it("applies the gate only when evidence is unknown", () => {
      // Same inputs differ only in evidence — unknown should suppress, positive should not.
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "x.com", "unrelated.com"),
      ).toBe(true)
      expect(
        shouldSuppressMatch(true, "positive", ["email"], "x.com", "unrelated.com"),
      ).toBe(false)
    })
  })

  describe("channel set", () => {
    it("does not suppress SMS-only sessions", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["sms"], "x.com", "unrelated.com"),
      ).toBe(false)
    })

    it("does not suppress hybrid email+sms sessions", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["email", "sms"], "x.com", "unrelated.com"),
      ).toBe(false)
    })

    it("suppresses email-only when sender mismatches", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "x.com", "unrelated.com"),
      ).toBe(true)
    })
  })

  describe("strict-affinity outcome", () => {
    it("does not suppress when sender eTLD+1 matches page eTLD+1", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "login.example.com", "example.com"),
      ).toBe(false)
    })

    it("does not suppress when sender is in audited alias map", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "dropbox.com", "dropboxmail.com"),
      ).toBe(false)
    })

    it("suppresses when sender is unrelated", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "twitter.com", "mailgun.org"),
      ).toBe(true)
    })

    it("suppresses when senderETLD is missing", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "example.com", undefined),
      ).toBe(true)
    })

    it("suppresses when page is on a shared host", () => {
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "victim.github.io", "github.io"),
      ).toBe(true)
    })
  })

  describe("X TOTP scenario (the bug this gate fixes)", () => {
    it("suppresses match for x.com TOTP page with unrelated email code", () => {
      // Field detected with autocomplete=one-time-code on X TOTP screen.
      // Classifier returned 'unknown' → channelEvidence='unknown'.
      // Polling found a recent unrelated email code from Mailgun.
      // Recency-only matcher accept would normally surface the chip;
      // the gate must suppress it.
      expect(
        shouldSuppressMatch(true, "unknown", ["email"], "x.com", "mailgun.org"),
      ).toBe(true)
    })
  })
})
