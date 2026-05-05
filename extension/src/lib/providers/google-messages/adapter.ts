/**
 * MessagesProviderAdapter
 *
 * Adapts the Google Messages tab manager (SMS scraping) into the
 * ProviderAdapter interface consumed by EmailPollingService.
 *
 * Responsibilities:
 * - Translate MessagePreview[] into EmailLike[] (subject = '', html = undefined)
 * - Enforce per-session poll budget (max 5 polls via tab manager)
 * - Convert relative timestamp strings ("2 min", "Yesterday", "Şimdi", ...) to epoch ms
 * - Generate stable IDs for dedup (conversationHref or conversationId + previewText hash)
 * - Gracefully return [] on any tab manager failure
 *
 * Timestamp policy:
 *   The session-controller uses a DOM-baseline provenance gate (see
 *   smsBaseline / emailBaseline) for the autofill freshness decision.
 *   The parsed epoch returned here is consumed by the recency scorer for
 *   ordering inside the post-baseline candidate set and by the popup for
 *   sorting. Values that cannot be parsed return undefined; downstream
 *   treats undefined as "unknown" and only uses it as a low-priority
 *   tiebreaker. We never substitute `Date.now()` for a value we don't
 *   actually know — that would falsify freshness signals.
 */

import type { ProviderAdapter, EmailLike, ProviderId } from '@/lib/services/email-polling-service'
import type { MessagesTabManager } from './tab-manager'

/** Maximum message previews returned per poll (keeps payload small). */
const MAX_PREVIEWS = 4

/**
 * SHA-256 of `value`, hex encoded. Used to fingerprint conversation
 * snippets for the cross-session provenance baseline without persisting
 * the raw snippet text (which would include OTP digits) to storage.
 *
 * Note: SHA-256 of a 6-digit OTP is brute-force reversible; this is not
 * a cryptographic privacy boundary. It protects against incidental
 * disclosure (logs, casual storage inspection), not against an attacker
 * with code execution against chrome.storage.session.
 */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

export class MessagesProviderAdapter implements ProviderAdapter {
  readonly id: ProviderId = 'google-messages'
  readonly mailboxId: string

  constructor(
    private readonly tabManager: MessagesTabManager,
    mailboxId: string,
    private readonly sessionId?: string
  ) {
    this.mailboxId = mailboxId
  }

  async listRecent(_params: {
    sinceEpochMs: number
    max: number
    keywordHint?: string
  }): Promise<EmailLike[]> {
    // Check poll budget (skip if no sessionId -- popup sync excluded)
    if (this.sessionId) {
      const count = this.tabManager.getPollCount(this.sessionId)
      if (count >= 5) {
        return [] // Budget exhausted for this session
      }
    }

    try {
      const tab = await this.tabManager.ensureTab()
      const previews = await this.tabManager.scrapeRecentPreviews(tab.tabId)

      // Increment poll count AFTER successful scrape
      if (this.sessionId) {
        const newCount = this.tabManager.incrementPollCount(this.sessionId)
        if (newCount >= 5) {
          await this.tabManager.closeIfOwned()
        }
      }

      // Translate MessagePreview[] -> EmailLike[]. snippetHash is computed
      // here so the SessionController can diff conversations across polls
      // (and across sessions, via the persisted snapshot) without ever
      // having raw snippet text leave the in-memory pipeline.
      return Promise.all(
        previews.slice(0, MAX_PREVIEWS).map(async preview => {
          const conversationKey = preview.conversationHref || preview.conversationId
          const snippetHash = await sha256Hex(preview.previewText)
          return {
            id: `gm-${this.hashPreview(conversationKey, preview.previewText)}`,
            provider: 'google-messages' as ProviderId,
            mailboxId: this.mailboxId,
            subject: '',
            from: preview.senderName,
            text: preview.previewText,
            html: undefined,
            receivedEpochMs: parseRelativeTimestamp(preview.timestamp),
            _meta: {
              conversationHref: preview.conversationHref,
              isUnread: preview.isUnread,
              snippetHash,
            },
          }
        })
      )
    } catch (error) {
      console.warn('[MessagesProviderAdapter] listRecent failed:', error)
      // Re-throw so EmailPollingService records this as a failed adapter
      // (EmailPollingService catches per-adapter and records { success: false })
      throw error
    }
  }

  /**
   * Stable per-message identifier for dedup against the seen-store.
   * Cheap non-crypto hash is fine here: the seen-store keys are scoped
   * by mailboxId + extractor version, and collisions across distinct
   * (conversationKey, previewText) pairs are vanishingly unlikely at
   * the 4-preview-per-poll budget. The cryptographic snippetHash above
   * lives in `_meta` for the provenance diff path.
   */
  private hashPreview(conversationKey: string, previewText: string): string {
    const str = `${conversationKey}:${previewText}`
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash |= 0 // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }
}

// ─── Locale-aware relative timestamp parser ─────────────────────────────────

/**
 * Parse a relative timestamp string from Google Messages into an epoch ms
 * value, or undefined when the input cannot be confidently mapped to a time.
 *
 * Locale coverage matches the extension's supported languages (see
 * `extension/src/lib/i18n/submit-button-patterns.ts` — 21 langs):
 * EN, ES, FR, DE, IT, PT, NL, SV, FI, DA, NO, PL, CS, TR, RU, UK, AR,
 * HI, JA, KO, ZH.
 *
 * Recognised forms per language (ordered as listed above):
 *   - "now" / "just now" + locale equivalents
 *   - "N min" / "N minutes" + locale unit tokens (incl. CJK/Cyrillic/etc.)
 *   - "N hr" / "N hours" + locale unit tokens
 *   - "yesterday" + locale equivalents
 *
 * Inputs that resolve only to a calendar day ("today"/"hoy"/"今日"), a
 * clock time ("1:15 PM", "13:15"), or an unrecognised date ("Mar 16",
 * localised long-form dates) return undefined: we don't have minute-level
 * information, and silently substituting Date.now() would falsify freshness.
 *
 * @param timestamp Relative timestamp text, or undefined.
 * @param now       Reference "now" in epoch ms (test seam; defaults to Date.now()).
 * @returns Epoch ms when the message arrived, or undefined when unknown.
 */
export function parseRelativeTimestamp(
  timestamp: string | undefined,
  now: number = Date.now()
): number | undefined {
  if (!timestamp) return undefined

  // Lowercase + trim. NOTE: lowercasing is safe for Cyrillic/Greek/Latin
  // and is a no-op for CJK/Arabic/Devanagari, so it does not corrupt
  // non-Latin matches.
  let t = timestamp.toLowerCase().trim()
  if (!t) return undefined

  // Strip "ago" markers (suffixes and prefixes) across all supported
  // locales so the unit regex below sees just "<digits><unit>".
  t = stripAgoMarkers(t).trim()
  if (!t) return undefined

  // "Now" forms.
  if (NOW_PATTERN.test(t)) return now

  // "Yesterday" forms.
  if (YESTERDAY_PATTERN.test(t)) return now - 86_400_000

  // "Today" — calendar-day only; exact time unknown. Returning undefined
  // is more honest than fabricating a midpoint.
  if (TODAY_PATTERN.test(t)) return undefined

  // "N min" forms.
  const minMatch = t.match(MIN_PATTERN)
  if (minMatch) {
    const n = parseInt(minMatch[1], 10)
    if (Number.isFinite(n)) return now - n * 60_000
  }

  // "N hr" forms.
  const hrMatch = t.match(HR_PATTERN)
  if (hrMatch) {
    const n = parseInt(hrMatch[1], 10)
    if (Number.isFinite(n)) return now - n * 3_600_000
  }

  // Anything else (clock times, dates, untranslated locales) is unknown.
  return undefined
}

/**
 * Strip "X ago" / "ago X" markers across supported locales so the
 * remaining string is "<digits> <unit>" (or just a literal "now"/etc).
 *
 * Suffix markers (after the value):
 *   en "ago", it "fa", nl "geleden", sv "sedan", fi "sitten",
 *   da/no "siden", pl "temu", tr "önce", ru "назад", uk "тому",
 *   hi "पहले", ja "前", ko "전", zh "前".
 * Prefix markers (before the value):
 *   es "hace", fr "il y a", de "vor", pt "há", cs "před", ar "منذ".
 *
 * "Just now" / "a minute ago" / "moments ago" idioms are NOT mapped;
 * they fall through and the explicit "now" pattern catches the
 * literal forms.
 */
function stripAgoMarkers(t: string): string {
  // Suffixes. Trailing whitespace optional. Use Unicode flag for non-Latin.
  t = t.replace(
    /\s*(?:ago|fa|geleden|sedan|sitten|siden|temu|önce|назад|тому|पहले|前|전)\s*$/u,
    ''
  )
  // Prefixes. Leading whitespace optional after the marker.
  t = t.replace(/^(?:hace|il\s+y\s+a|vor|há|před|منذ)\s+/u, '')
  return t
}

/**
 * "Now" / "Just now" forms across locales.
 *   EN  now, just now
 *   ES  ahora, ahora mismo
 *   FR  maintenant, à l'instant
 *   DE  jetzt, soeben, gerade
 *   IT  adesso, ora, proprio ora
 *   PT  agora, agora mesmo
 *   NL  nu, zojuist, net
 *   SV  nu, just nu
 *   FI  nyt, juuri nyt
 *   DA  nu, lige nu
 *   NO  nå, akkurat nå
 *   PL  teraz, przed chwilą
 *   CS  teď, právě teď, nyní
 *   TR  şimdi, şu anda, az önce
 *   RU  сейчас, только что
 *   UK  зараз, щойно
 *   AR  الآن, منذ لحظات
 *   HI  अभी
 *   JA  今, たった今
 *   KO  지금, 방금
 *   ZH  现在, 刚刚
 *
 * Anchored to the full string so partial matches (e.g. "0 min") don't
 * sneak through.
 */
const NOW_PATTERN = new RegExp(
  '^(?:' +
    [
      // EN
      'now', 'just\\s+now',
      // ES
      'ahora', 'ahora\\s+mismo',
      // FR
      'maintenant', "à\\s+l'instant",
      // DE
      'jetzt', 'soeben', 'gerade',
      // IT
      'adesso', 'ora', 'proprio\\s+ora',
      // PT
      'agora', 'agora\\s+mesmo',
      // NL
      'nu', 'zojuist', 'net',
      // SV
      'just\\s+nu',
      // FI
      'nyt', 'juuri\\s+nyt',
      // DA
      'lige\\s+nu',
      // NO
      'nå', 'akkurat\\s+nå',
      // PL
      'teraz', 'przed\\s+chwilą',
      // CS
      'teď', 'právě\\s+teď', 'nyní',
      // TR
      'şimdi', 'şu\\s*anda', 'az\\s+önce',
      // RU
      'сейчас', 'только\\s+что',
      // UK
      'зараз', 'щойно',
      // AR
      'الآن', 'منذ\\s+لحظات',
      // HI
      'अभी',
      // JA
      '今', 'たった今',
      // KO
      '지금', '방금',
      // ZH
      '现在', '刚刚',
    ].join('|') +
  ')$',
  'u'
)

/**
 * "Yesterday" forms across locales.
 *   EN  yesterday
 *   ES  ayer
 *   FR  hier
 *   DE  gestern
 *   IT  ieri
 *   PT  ontem
 *   NL  gisteren
 *   SV  igår, i går
 *   FI  eilen
 *   DA  i går
 *   NO  i går
 *   PL  wczoraj
 *   CS  včera
 *   TR  dün
 *   RU  вчера
 *   UK  вчора
 *   AR  أمس
 *   HI  कल
 *   JA  昨日
 *   KO  어제
 *   ZH  昨天
 */
const YESTERDAY_PATTERN = new RegExp(
  '^(?:' +
    [
      'yesterday', 'ayer', 'hier', 'gestern', 'ieri', 'ontem', 'gisteren',
      'igår', 'i\\s*går', 'eilen', 'wczoraj', 'včera', 'dün', 'вчера',
      'вчора', 'أمس', 'कल', '昨日', '어제', '昨天',
    ].join('|') +
  ')$',
  'u'
)

/**
 * "Today" forms across locales (low resolution -> undefined).
 */
const TODAY_PATTERN = new RegExp(
  '^(?:' +
    [
      'today', 'hoy', "aujourd'hui", 'heute', 'oggi', 'hoje', 'vandaag',
      'idag', 'i\\s*dag', 'tänään', 'dzisiaj', 'dnes', 'bugün',
      'сегодня', 'сьогодні', 'اليوم', 'आज', '今日', '오늘', '今天',
    ].join('|') +
  ')$',
  'u'
)

/**
 * "N min" / "N minutes" unit tokens across locales.
 *
 * Latin scripts:
 *   EN  min, mins, minute, minutes
 *   ES  min, minuto, minutos
 *   FR  min, minute, minutes
 *   DE  min, minute, minuten   (German "Min" lowercases to "min")
 *   IT  min, minuto, minuti
 *   PT  min, minuto, minutos
 *   NL  min, minuut, minuten
 *   SV  min, minut, minuter
 *   FI  min, minuutti, minuuttia
 *   DA  min, minut, minutter
 *   NO  min, minutt, minutter
 *   PL  min, minuta, minut, minuty
 *   CS  min, minuta, minut, minuty
 *   TR  dk, dakika
 *
 * Cyrillic / Arabic / Devanagari / CJK:
 *   RU  мин, минута, минут, минуты
 *   UK  хв, хвилина, хвилин, хвилини
 *   AR  دقيقة, دقائق
 *   HI  मिनट
 *   JA  分
 *   KO  분
 *   ZH  分, 分钟
 *
 * Captures the integer in group 1. Unit may follow with optional
 * whitespace; CJK forms don't have a separator.
 */
const MIN_PATTERN = new RegExp(
  '^(\\d+)\\s*(?:' +
    [
      // Latin
      'minutes', 'minuten', 'minutter', 'minuti', 'minutos', 'minutter',
      'minuutti', 'minuuttia', 'minuter', 'minute', 'minuta', 'minuty',
      'minuut', 'minutt', 'minut', 'mins', 'min',
      'dakika', 'dk',
      // Cyrillic
      'минуты', 'минут', 'минута', 'мин',
      'хвилини', 'хвилин', 'хвилина', 'хв',
      // Arabic
      'دقائق', 'دقيقة',
      // Devanagari
      'मिनट',
      // CJK
      '分钟', '分',
    ].join('|') +
  ')',
  'u'
)

/**
 * "N hr" / "N hours" unit tokens across locales.
 *
 *   EN  hr, hrs, hour, hours
 *   ES  h, hora, horas
 *   FR  h, heure, heures
 *   DE  std, stunde, stunden
 *   IT  h, ora, ore
 *   PT  h, hora, horas
 *   NL  uur, u
 *   SV  h, tim, timme, timmar
 *   FI  t, tunti, tuntia
 *   DA  t, time, timer
 *   NO  t, time, timer
 *   PL  godz, godzina, godziny
 *   CS  h, hod, hodina, hodiny
 *   TR  sa, saat
 *   RU  ч, час, часа, часов
 *   UK  год, година, години, годин
 *   AR  ساعة, ساعات
 *   HI  घंटा, घंटे
 *   JA  時間
 *   KO  시간
 *   ZH  小时
 */
const HR_PATTERN = new RegExp(
  '^(\\d+)\\s*(?:' +
    [
      // Latin
      'hours', 'horas', 'heures', 'hodiny', 'hodina', 'godziny', 'godzina',
      'stunden', 'stunde', 'tuntia', 'tunti', 'timmar', 'timer', 'timme',
      'heure', 'hora', 'hour', 'godz', 'tim', 'std', 'hod', 'hrs', 'hr',
      'uur',
      'saat', 'sa',
      'ore', 'ora',
      'time',
      'h', 'u', 't',
      // Cyrillic
      'часов', 'часа', 'час', 'ч',
      'години', 'година', 'годин', 'год',
      // Arabic
      'ساعات', 'ساعة',
      // Devanagari
      'घंटे', 'घंटा',
      // CJK
      '時間', '시간', '小时',
    ].join('|') +
  ')',
  'u'
)
