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
  const items = Array.from(
    list.querySelectorAll('mws-conversation-list-item')
  ).slice(0, 6)

  const previews: MessagePreview[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]

    // Google Messages renders sender name and preview text inside nested
    // custom elements whose internal structure changes across app versions.
    // We walk all leaf elements (no children) and take the first two
    // non-empty text nodes: [0] = sender, [1] = preview text.
    //
    // Why leaf elements only: compound containers repeat the same text as
    // their children, so we skip any element that has child elements to
    // avoid duplicate or concatenated strings.
    const leaves = Array.from(item.querySelectorAll('*')).filter((el) => {
      const text = el.textContent?.trim()
      return text && text.length > 0 && el.children.length === 0
    })

    const senderName = leaves[0]?.textContent?.trim() ?? 'Unknown'
    const previewText = leaves[1]?.textContent?.trim() ?? ''

    // Unread indicator: Google Messages stamps a data-e2e-is-unread attribute
    // on an element inside the item when the conversation has unseen messages.
    const isUnread = item.querySelector('[data-e2e-is-unread]') !== null

    previews.push({
      conversationId: `conv-${i}`,
      senderName,
      previewText,
      isUnread,
      timestamp: undefined, // Relative timestamps are resolved by the adapter
    })
  }

  return { status: 'paired', previews }
}
