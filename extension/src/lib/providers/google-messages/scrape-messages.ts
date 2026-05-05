import type { ScrapeResult, MessagePreview } from './types'

/**
 * Self-contained scraping function for Google Messages for Web.
 * Injected into messages.google.com tab via chrome.scripting.executeScript().
 *
 * CRITICAL: This function must remain self-contained -- no closures, no imports
 * that would be referenced at runtime. When V8 serializes the function via
 * chrome.scripting.executeScript({ func: scrapeMessages }), the function body
 * is extracted and re-evaluated in the target tab's context. Any external
 * references (closures, module-level vars) will be undefined there.
 *
 * Selector strategy (stability priority):
 * 1. Custom element tags: mws-*, mw-* (survived years of updates)
 * 2. data-e2e-* attributes (designed for automation)
 * 3. [is-outgoing] attribute
 * 4. NEVER: ng-star-inserted, _ngcontent-*, Material class names
 */
export function scrapeMessages(): ScrapeResult {
  // 1. Check for QR code -- means device is not paired yet
  if (document.querySelector('mw-qr-code')) {
    return { status: 'unpaired', previews: [] }
  }

  // 2. Check for conversation list -- if absent, page is still loading or
  //    the user is in a state that doesn't show the list (e.g. new chat screen)
  const list = document.querySelector('mws-conversations-list')
  if (!list) {
    return { status: 'not-ready', previews: [] }
  }

  // 3. Collect conversation items, capped at 6 to keep the payload small.
  //    Only the most recent conversations matter for OTP matching.
  //    IMPORTANT: Exclude mws-conversation-list-item-menu siblings (context menus).
  const items = Array.from(
    list.querySelectorAll('mws-conversation-list-item:not(mws-conversation-list-item-menu)')
  ).slice(0, 6)

  const previews: MessagePreview[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // PRIMARY: Use data-e2e-* attributes (purpose-built for automation, most stable).
    // Verified against real Google Messages DOM (2026-03):
    //   data-e2e-conversation-name -- sender/contact name (e.g., "Amazon", "Trendyol")
    //   data-e2e-conversation-snippet -- message preview text (contains OTP codes)
    //   data-e2e-is-unread -- "true"/"false" string
    //   mws-relative-timestamp -- time display ("1:15 PM", "Mar 16")
    const nameEl = item.querySelector('[data-e2e-conversation-name]')
    const snippetEl = item.querySelector('[data-e2e-conversation-snippet]')
    const unreadEl = item.querySelector('[data-e2e-is-unread]')
    const timestampEl = item.querySelector('mws-relative-timestamp')

    let senderName = nameEl?.textContent?.trim() ?? ''
    let previewText = snippetEl?.textContent?.trim() ?? ''

    // FALLBACK: If data-e2e attributes are missing (DOM change), walk leaf nodes.
    if (!senderName || !previewText) {
      const leaves = Array.from(item.querySelectorAll('*')).filter((el) => {
        const text = el.textContent?.trim()
        return text && text.length > 0 && el.children.length === 0
      })
      if (!senderName) senderName = leaves[0]?.textContent?.trim() ?? 'Unknown'
      if (!previewText) previewText = leaves[1]?.textContent?.trim() ?? ''
    }

    const isUnread = unreadEl?.getAttribute('data-e2e-is-unread') === 'true'

    // Timestamp text. Prefer the inner <div aria-label="..."> when present
    // (older messages render as <div aria-label="N min ago">N min</div>);
    // fall back to the timestamp element's textContent for fresh messages
    // which render the text directly inside <mws-relative-timestamp> with
    // no wrapping div and no aria-label.
    const ariaTimestampEl = timestampEl?.querySelector<HTMLElement>('[aria-label]')
    const ariaTimestamp = ariaTimestampEl?.getAttribute('aria-label')?.trim() || undefined
    const visibleTimestamp = timestampEl?.textContent?.trim() || undefined
    const timestamp = ariaTimestamp || visibleTimestamp

    // Stable conversation href from the list item's <a href>. Used by
    // the provenance baseline to identify the same conversation across
    // polls even after list reorder. Three locations in priority order:
    //   1. descendant <a href> — current Google Messages structure
    //      (mws-conversation-list-item wraps an inner <a class="list-item">)
    //   2. the item itself — when the scraper's selector matches an <a>
    //   3. ancestor <a href> — defensive against future Google Messages
    //      restructures that flip the wrapping anchor outside the
    //      mws-conversation-list-item host. Without this, conversationHref
    //      goes undefined and the SMS provenance gate degrades to
    //      snippet-only diff (weaker classifier).
    const linkEl = item.querySelector<HTMLAnchorElement>('a[href]')
      ?? (item.tagName?.toUpperCase() === 'A' ? (item as unknown as HTMLAnchorElement) : null)
      ?? (item.closest?.('a[href]') as HTMLAnchorElement | null)
    const conversationHref = linkEl?.getAttribute('href') || undefined

    previews.push({
      conversationId: `conv-${i}`,
      conversationHref,
      senderName,
      previewText,
      isUnread,
      timestamp,
    })
  }

  return { status: 'paired', previews }
}
