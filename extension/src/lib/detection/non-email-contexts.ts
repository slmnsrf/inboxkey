/**
 * Non-Email Context Classifier
 *
 * Detects 8 categories of fields that look OTP-like but are NOT email verification codes.
 * 21-language support organized by concept family.
 *
 * Categories:
 * 1. developer - API tokens, personal access tokens, webhooks
 * 2. address - ZIP/postal code, shipping, billing address
 * 3. payment - Bank verification, payment confirmation, CVV
 * 4. booking - Travel codes, reservation numbers
 * 5. product - License keys, serial numbers, registration codes
 * 6. telecom - SIM unlock, carrier codes, IMEI
 * 7. government - Tax ID, national ID, registration numbers
 * 8. account_setup - Password creation, initial setup flows
 */

export interface NonEmailIntentResult {
  blocked: boolean
  category: string | null
  matchedKeywords: string[]
  confidence: number
}

const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  developer: [
    /\b(?:api[\s\-_]?key|access[\s\-_]?token|personal[\s\-_]?(?:access[\s\-_]?)?token)\b/i,
    /\b(?:secret[\s\-_]?key|client[\s\-_]?(?:id|secret)|webhook)\b/i,
    /\b(?:bearer[\s\-_]?token|jwt|oauth[\s\-_]?token|service[\s\-_]?account)\b/i,
    // German (no \b — umlauts are non-ASCII, \b fails on them)
    /(?:Zugriffsschl(?:ü|ue)ssel|Zugangsschl(?:ü|ue)ssel|API[\s\-_]?Schl(?:ü|ue)ssel)/i,
    // Turkish (no \b — ı/ş/ğ are non-ASCII, \b fails on them)
    /(?:API[\s\-_]?anahtar(?:ı|i)|eri(?:ş|s)im[\s\-_]?anahtar(?:ı|i)|ki(?:ş|s)isel[\s\-_]?(?:eri(?:ş|s)im[\s\-_]?)?jeton)/i,
    // French (no \b — accented chars are non-ASCII)
    /(?:cl(?:é|e)[\s\-_]?API|jeton[\s\-_]?d'acc(?:è|e)s)/i,
    // Spanish
    /\b(?:clave[\s\-_]?API|token[\s\-_]?de[\s\-_]?acceso)\b/i,
    // Russian
    /(?:ключ[\s\-_]?API|токен[\s\-_]?доступа)/i,
    // Japanese
    /(?:APIキー|アクセストークン)/i,
    // Korean
    /(?:API[\s\-_]?키|액세스[\s\-_]?토큰)/i,
    // Chinese
    /(?:API密钥|访问令牌|API密鑰|存取權杖)/i,
  ],

  address: [
    /\b(?:zip[\s\-_]?code|postal[\s\-_]?code|postcode|PLZ|CEP)\b/i,
    /\b(?:shipping[\s\-_]?address|billing[\s\-_]?address|mailing[\s\-_]?address)\b/i,
    /\b(?:street[\s\-_]?address|house[\s\-_]?number|apartment|suite)\b/i,
    // German (no \b — ß is non-ASCII)
    /(?:Postleitzahl|Stra(?:ß|ss)e|Hausnummer)/i,
    // Turkish
    /\b(?:posta[\s\-_]?kodu|sokak|mahalle)\b/i,
    // French
    /\b(?:code[\s\-_]?postal|adresse[\s\-_]?(?:de[\s\-_]?)?(?:livraison|facturation))\b/i,
    // Spanish (no \b — ó/í are non-ASCII)
    /(?:c(?:ó|o)digo[\s\-_]?postal|direcci(?:ó|o)n[\s\-_]?(?:de[\s\-_]?)?env(?:í|i)o)/i,
    // Russian
    /(?:почтовый[\s\-_]?индекс|улица)/i,
    // Japanese
    /(?:郵便番号|番地)/i,
    // Korean
    /(?:우편번호)/i,
    // Chinese
    /(?:邮政编码|邮编|郵遞區號)/i,
  ],

  payment: [
    /\b(?:bank[\s\-_]?(?:verification|code|transfer)|payment[\s\-_]?(?:code|confirmation))\b/i,
    /\b(?:transaction[\s\-_]?(?:code|id|number)|wire[\s\-_]?transfer)\b/i,
    /\b(?:IBAN|SWIFT|routing[\s\-_]?number|account[\s\-_]?number)\b/i,
    // German (no \b — Ü is non-ASCII)
    /(?:Bankleitzahl|(?:Ü|Ue)berweisung|Kontonummer|Zahlungscode)/i,
    // Turkish (no \b — ğ/ö/ı are non-ASCII)
    /(?:banka[\s\-_]?(?:do(?:ğ|g)rulama|kodu)|(?:ö|o)deme[\s\-_]?(?:kodu|onay(?:ı|i))|havale)/i,
    // French
    /\b(?:code[\s\-_]?(?:de[\s\-_]?)?(?:paiement|bancaire)|virement)\b/i,
    // Spanish (no \b — ó is non-ASCII)
    /(?:c(?:ó|o)digo[\s\-_]?(?:de[\s\-_]?)?(?:pago|bancario)|transferencia)/i,
    // Russian
    /(?:банковский[\s\-_]?код|код[\s\-_]?платежа|перевод)/i,
    // Japanese
    /(?:銀行コード|決済コード|振込)/i,
    // Korean
    /(?:은행[\s\-_]?코드|결제[\s\-_]?코드|계좌)/i,
    // Chinese
    /(?:银行代码|支付代码|转账|銀行代碼|支付代碼)/i,
  ],

  booking: [
    /\b(?:booking[\s\-_]?(?:code|reference|number)|reservation[\s\-_]?(?:code|number|id))\b/i,
    /\b(?:confirmation[\s\-_]?number|itinerary|PNR|flight[\s\-_]?number)\b/i,
    // German
    /\b(?:Buchungscode|Buchungsnummer|Reservierung)\b/i,
    // Turkish (no \b — ı/ş/ç are non-ASCII)
    /(?:rezervasyon[\s\-_]?(?:kodu|numaras(?:ı|i))|u(?:ç|c)u(?:ş|s)[\s\-_]?numaras(?:ı|i))/i,
    // French (no \b — é is non-ASCII)
    /(?:code[\s\-_]?de[\s\-_]?r(?:é|e)servation|num(?:é|e)ro[\s\-_]?de[\s\-_]?r(?:é|e)servation)/i,
    // Spanish (no \b — ó/ú are non-ASCII)
    /(?:c(?:ó|o)digo[\s\-_]?de[\s\-_]?reserva|n(?:ú|u)mero[\s\-_]?de[\s\-_]?reserva)/i,
  ],

  product: [
    /\b(?:license[\s\-_]?key|serial[\s\-_]?(?:number|key)|product[\s\-_]?key|activation[\s\-_]?(?:code|key))\b/i,
    /\b(?:registration[\s\-_]?(?:code|key)|unlock[\s\-_]?code)\b/i,
    // German (no \b — ü is non-ASCII)
    /(?:Lizenzschl(?:ü|ue)ssel|Seriennummer|Produktschl(?:ü|ue)ssel)/i,
    // Turkish (no \b — ı/ü are non-ASCII)
    /(?:lisans[\s\-_]?anahtar(?:ı|i)|seri[\s\-_]?numaras(?:ı|i)|(?:ü|u)r(?:ü|u)n[\s\-_]?anahtar(?:ı|i))/i,
  ],

  telecom: [
    /\b(?:SIM[\s\-_]?(?:unlock|code|pin)|PUK[\s\-_]?(?:code|number))\b/i,
    /\b(?:IMEI|carrier[\s\-_]?(?:code|unlock)|network[\s\-_]?unlock)\b/i,
    // Turkish (no \b — ö is non-ASCII)
    /(?:SIM[\s\-_]?kilit|operat(?:ö|o)r[\s\-_]?kodu)/i,
  ],

  government: [
    /\b(?:tax[\s\-_]?(?:id|number|code)|national[\s\-_]?(?:id|identification)[\s\-_]?(?:number)?)\b/i,
    /\b(?:social[\s\-_]?security|SSN|EIN|TIN|NIF|CURP)\b/i,
    // German
    /\b(?:Steuernummer|Steuer[\s\-_]?ID|Personalausweis)\b/i,
    // Turkish (no \b — ı is non-ASCII)
    /(?:vergi[\s\-_]?(?:numaras(?:ı|i)|kimlik)|TC[\s\-_]?kimlik[\s\-_]?(?:no|numaras(?:ı|i))?)/i,
    // French (no \b — é is non-ASCII)
    /(?:num(?:é|e)ro[\s\-_]?fiscal|carte[\s\-_]?d'identit(?:é|e))/i,
    // Spanish (no \b for número — ú/ó are non-ASCII, but DNI/NIE need \b to avoid substring matches)
    /(?:n(?:ú|u)mero[\s\-_]?(?:de[\s\-_]?)?(?:identificaci(?:ó|o)n|fiscal)|\bDNI\b|\bNIE\b)/i,
  ],

  account_setup: [
    /\b(?:create[\s\-_]?(?:a[\s\-_]?)?password|set[\s\-_]?(?:a[\s\-_]?)?password|new[\s\-_]?password)\b/i,
    /\b(?:choose[\s\-_]?(?:a[\s\-_]?)?password|confirm[\s\-_]?password|repeat[\s\-_]?password)\b/i,
    // German (no \b — ä is non-ASCII)
    /(?:Passwort[\s\-_]?(?:erstellen|festlegen|w(?:ä|ae)hlen))/i,
    // Turkish (no \b — ş is non-ASCII)
    /(?:(?:ş|s)ifre[\s\-_]?(?:olu(?:ş|s)tur|belirle)|yeni[\s\-_]?(?:ş|s)ifre)/i,
  ],
}

/**
 * Classify whether nearby text indicates a non-email-verification context
 *
 * @param combinedText - All text sources combined
 * @returns Intent classification result
 */
export function classifyNonEmailIntent(combinedText: string): NonEmailIntentResult {
  if (!combinedText || combinedText.trim().length === 0) {
    return { blocked: false, category: null, matchedKeywords: [], confidence: 0 }
  }

  for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
    for (const pattern of patterns) {
      const match = pattern.exec(combinedText)
      if (match) {
        return {
          blocked: true,
          category,
          matchedKeywords: [match[0]],
          confidence: 0.9,
        }
      }
    }
  }

  return { blocked: false, category: null, matchedKeywords: [], confidence: 0 }
}
