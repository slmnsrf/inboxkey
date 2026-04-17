/**
 * Domain Affinity Scoring Algorithm
 *
 * This module implements the domain affinity algorithm used to match email sender
 * domains with browser watch session domains. The algorithm provides a graduated
 * scoring system that accounts for exact matches, known aliases, and token-based
 * similarity.
 *
 * The domain affinity score is a critical component of the watch session matching
 * system, providing the foundational signal for determining whether an incoming
 * email is likely related to a specific browser session.
 *
 * Algorithm Overview:
 * 1. **Exact eTLD+1 Match (1.0)**: When the effective top-level domain plus one
 *    label matches exactly (e.g., "google.com" === "google.com"), we have the
 *    highest confidence in the match.
 *
 * 2. **Alias Match (0.9)**: Some services send emails from different domains than
 *    their main service domain (e.g., emails from "dropboxmail.com" for "dropbox.com").
 *    These known aliases receive nearly as high a score as exact matches.
 *
 * 3. **Token Overlap (0.6)**: When tokens from the site domain appear in the sender
 *    domain or email subject, this indicates a moderate affinity. This catches cases
 *    like "battlestate" appearing in both "battlestategames.com" and "tarkov-support.com".
 *
 * 4. **No Match (0.0)**: When there is no detectable relationship between the domains,
 *    the affinity score is zero.
 *
 * @example
 * // Exact match
 * domainAffinity("google.com", "google.com") // returns 1.0
 *
 * @example
 * // Alias match
 * domainAffinity("dropbox.com", "dropboxmail.com") // returns 0.9
 *
 * @example
 * // Token overlap via subject
 * domainAffinity("github.com", "notification.com", "GitHub Security Alert") // returns 0.6
 *
 * @example
 * // No match
 * domainAffinity("google.com", "facebook.com") // returns 0.0
 *
 * @module lib/matching/domain-affinity
 */

import { getDomain } from "tldts";
import { DOMAIN_ALIASES } from "./scoring-config.js";

/**
 * Extracts the effective top-level domain plus one label (eTLD+1)
 * from a full domain using the Mozilla Public Suffix List (via tldts).
 *
 * Correctly handles compound TLDs that a naive `slice(-2)` misses,
 * including `.co.uk`, `.co.jp`, `.com.au`, `.com.br`, `.com.tr`, etc.
 * Previously, every UK / Japanese / Turkish / Brazilian site collapsed
 * to its bare 2-label suffix (e.g. `amazon.co.uk` -> `co.uk`),
 * allowing any email from that country to match any site from that
 * country at full 1.0 affinity.
 *
 * @param domain - The full domain name to extract from
 * @returns The eTLD+1 portion, or the original (lowercased, trimmed)
 *          input when tldts cannot parse it (single-label hosts like
 *          "localhost", IP addresses, malformed inputs).
 *
 * @example
 * extractETLD("mail.google.com")      // "google.com"
 * extractETLD("login.amazon.co.uk")   // "amazon.co.uk"
 * extractETLD("www.rakuten.co.jp")    // "rakuten.co.jp"
 * extractETLD("shop.example.com.tr")  // "example.com.tr"
 * extractETLD("localhost")            // "localhost"
 */
export function extractETLD(domain: string): string {
  if (!domain) {
    return "";
  }

  const normalized = domain.toLowerCase().trim();

  // tldts returns null for single-label hosts, IPs, and malformed
  // inputs - fall back to the normalized string so callers still get
  // a comparable value (e.g. "localhost" === "localhost").
  const registrable = getDomain(normalized);
  return registrable ?? normalized;
}

/**
 * Checks if two domains are related through the DOMAIN_ALIASES mapping.
 *
 * This function handles bidirectional alias checking:
 * - If siteDomain has aliases, check if senderDomain is among them
 * - If senderDomain maps to an alias, check if it matches siteDomain
 *
 * @param siteDomain - The domain from the browser session (eTLD+1 format)
 * @param senderDomain - The domain from the email sender (eTLD+1 format)
 * @returns True if domains are aliases of each other, false otherwise
 *
 * @example
 * // dropboxmail.com is an alias for dropbox.com
 * isAliasMatch("dropbox.com", "dropboxmail.com") // returns true
 * isAliasMatch("dropboxmail.com", "dropbox.com") // returns true
 *
 * @example
 * // Unrelated domains
 * isAliasMatch("google.com", "facebook.com") // returns false
 */
export function isAliasMatch(
  siteDomain: string,
  senderDomain: string
): boolean {
  // Check if senderDomain is in the aliases for siteDomain
  const canonicalSite = DOMAIN_ALIASES[siteDomain];
  if (canonicalSite && canonicalSite === senderDomain) {
    return true;
  }

  // Check if siteDomain is in the aliases for senderDomain
  const canonicalSender = DOMAIN_ALIASES[senderDomain];
  if (canonicalSender && canonicalSender === siteDomain) {
    return true;
  }

  // Check if both map to the same canonical domain
  // This includes the case where both are the same domain and both map to themselves
  if (
    canonicalSite &&
    canonicalSender &&
    canonicalSite === canonicalSender
  ) {
    return true;
  }

  return false;
}

/**
 * Tokenizes a string into normalized tokens for comparison.
 *
 * Tokenization process:
 * 1. Convert to lowercase
 * 2. Replace all non-alphanumeric characters with spaces
 * 3. Split on whitespace
 * 4. Filter out empty strings
 *
 * @param text - The text to tokenize
 * @returns Array of normalized tokens
 *
 * @example
 * tokenize("Hello-World 123") // returns ["hello", "world", "123"]
 * tokenize("GitHub.com") // returns ["github", "com"]
 * tokenize("") // returns []
 */
function tokenize(text: string): string[] {
  if (!text) {
    return [];
  }

  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Calculates token overlap score between site domain and sender/subject.
 *
 * This function checks if any tokens from the site domain (excluding TLD) appear
 * in either the sender domain or email subject. This helps catch cases where
 * services use different domains but include identifying tokens.
 *
 * @param siteETLD - The site domain in eTLD+1 format (e.g., "github.com")
 * @param senderETLD - The sender domain in eTLD+1 format (e.g., "notifications.com")
 * @param subject - The email subject line (optional)
 * @returns 1 if there is token overlap, 0 otherwise
 *
 * @example
 * // Token "github" appears in subject
 * tokenOverlap("github.com", "noreply.com", "GitHub Security Alert") // returns 1
 *
 * @example
 * // Token "battlestate" in both domains
 * tokenOverlap("battlestategames.com", "battlestate-support.com", "") // returns 1
 *
 * @example
 * // No overlap
 * tokenOverlap("google.com", "facebook.com", "Hello") // returns 0
 */
export function tokenOverlap(
  siteETLD: string,
  senderETLD: string,
  subject: string = ""
): number {
  // Extract site domain without TLD
  // e.g., "github.com" → "github"
  const siteParts = siteETLD.split(".");
  const siteWithoutTLD =
    siteParts.length > 1
      ? siteParts.slice(0, -1).join(".")
      : siteETLD;

  // Tokenize all inputs
  const siteTokens = tokenize(siteWithoutTLD);
  const senderTokens = tokenize(senderETLD);
  const subjectTokens = tokenize(subject);

  // Combine sender and subject tokens into a single set
  const combinedTokens = new Set([...senderTokens, ...subjectTokens]);

  // Check if any site token appears in the combined set
  const hasOverlap = siteTokens.some((token) => combinedTokens.has(token));

  return hasOverlap ? 1 : 0;
}

/**
 * Calculates the domain affinity score between a site domain and email sender.
 *
 * This is the primary function of the module, implementing the graduated scoring
 * algorithm described in the module documentation. It checks for matches in order
 * of confidence: exact match, alias match, token overlap, and finally no match.
 *
 * The algorithm processes inputs as eTLD+1 domains, so full domains should be
 * normalized using extractETLD() before calling this function.
 *
 * @param siteETLD - The site domain from the watch session (eTLD+1 format)
 * @param senderETLD - The sender domain from the email (eTLD+1 format)
 * @param subject - Optional email subject line for token matching
 * @returns Affinity score: 1.0 (exact), 0.9 (alias), 0.6 (token overlap), or 0.0 (no match)
 *
 * @example
 * // Exact match - highest confidence
 * domainAffinity("google.com", "google.com") // returns 1.0
 *
 * @example
 * // Alias match - known alternate domain
 * domainAffinity("dropbox.com", "dropboxmail.com") // returns 0.9
 *
 * @example
 * // Token overlap - shared tokens indicate relationship
 * domainAffinity("github.com", "noreply.com", "GitHub notification") // returns 0.6
 *
 * @example
 * // No match - unrelated domains
 * domainAffinity("google.com", "facebook.com", "Hello") // returns 0.0
 */
export function domainAffinity(
  siteETLD: string,
  senderETLD: string,
  subject?: string
): number {
  // 1. Exact eTLD+1 match - highest confidence
  if (siteETLD === senderETLD) {
    return 1.0;
  }

  // 2. Alias match - known alternate domains
  if (isAliasMatch(siteETLD, senderETLD)) {
    return 0.9;
  }

  // 3. Token overlap - shared identifying tokens
  if (tokenOverlap(siteETLD, senderETLD, subject || "") === 1) {
    return 0.6;
  }

  // 4. No match - no detectable relationship
  return 0.0;
}
