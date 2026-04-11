/**
 * Detect whether the current document is an HTML document.
 *
 * Chrome extension content scripts inject into any top-level document
 * matching the manifest's match patterns, including SVG, XML, and plain
 * text documents served over http(s). Those documents have a non-HTML
 * root element and `document.body` is `null`, so any code that calls
 * `document.body.appendChild(...)` or `new MutationObserver().observe(
 * document.body, ...)` at init time crashes.
 *
 * Scheme-only match patterns (`https://*\/*`, `http://*\/*`) are not
 * enough to filter these out -- the scheme does not determine the
 * document type.
 *
 * Use this helper at the entry point of any content script (or inside
 * any function that touches `document.body` or `document.head`) that
 * should only run on real HTML pages.
 */
export function isHTMLDocument(): boolean {
  return (
    typeof document !== 'undefined' &&
    document.documentElement instanceof HTMLHtmlElement
  )
}
