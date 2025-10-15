/**
 * Clipboard Service
 *
 * Handles clipboard operations with auto-clear after 30 seconds for security.
 */

export class ClipboardService {
  private clearTimeoutId: number | null = null

  /**
   * Copy code to clipboard with auto-clear after 30 seconds.
   */
  async copyCode(code: string): Promise<void> {
    await navigator.clipboard.writeText(code)
    this.scheduleAutoClear()
  }

  private scheduleAutoClear(): void {
    if (this.clearTimeoutId) {
      clearTimeout(this.clearTimeoutId)
    }

    this.clearTimeoutId = window.setTimeout(async () => {
      try {
        await navigator.clipboard.writeText('')
      } catch {
        // Ignore errors (clipboard might be inaccessible)
      }
    }, 30_000)
  }
}
