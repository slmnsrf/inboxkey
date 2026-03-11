/**
 * Layer 2.5: Delivery Channel Signal Classifier
 *
 * Purpose: Distinguish between email-based codes (InboxKey can help) vs
 * authenticator app/SMS codes (InboxKey cannot help)
 *
 * Performance Budget: <0.05ms per field
 *
 * Design (Option 7 - Hybrid Channel Detection):
 * - Email keywords → +20 point boost
 * - Authenticator/SMS keywords → Rejection UNLESS email also present
 * - 21-language coverage with character set hints
 * - Priority: Authenticator+Email → Email (detect) | Authenticator-only → Reject
 *            SMS+Email → Email (detect) | SMS-only → Reject
 *
 * IMPORTANT: Hybrid scenarios (e.g., "Check your email or use authenticator app")
 * now return 'email' channel with lower confidence (0.85) to allow InboxKey to
 * help when email codes are available alongside other methods.
 */

import type { TextSources, ChannelClassification } from './types'

/**
 * Email-based code delivery patterns (21 languages)
 *
 * Priority: High-precision patterns that clearly indicate email delivery.
 * Covers: EN, ES, PT, DE, FR, IT, NL, TR, RU, UK, PL, CS, SV, FI, DA, NO, AR, HI, JA, KO, ZH
 */
const EMAIL_PATTERNS = [
  // ═══════════════════════════════════════════════════════════════
  // Latin Script (Western European + Turkish + Polish + Czech)
  // ═══════════════════════════════════════════════════════════════

  // English
  /\b(?:e-?mail|inbox|mailbox)\b/i,
  /sent\s*(?:to|via).*(?:e-?mail|inbox)/i,
  /check.*(?:e-?mail|inbox)/i,
  /code.*(?:in|from|via).*(?:e-?mail|inbox)/i,
  // Masked or full email addresses as email evidence (j***@gmail.com, user@company.com)
  /[\w][\w.*]*@[\w.-]+\.\w{2,}/i,

  // Spanish
  /\b(?:correo\s*electr[oó]nico|correo|buz[oó]n)\b/i,
  /enviado.*(?:correo|e-?mail)/i,
  /c[oó]digo.*(?:en|de).*correo/i,

  // Portuguese
  /\b(?:e-?mail|correio\s*eletr[oô]nico|caixa\s*de\s*entrada)\b/i,
  /enviado.*(?:e-?mail|correio)/i,
  /c[oó]digo.*(?:no|do).*(?:e-?mail|correio)/i,

  // German
  /\b(?:e-?mail|postfach|posteingang)\b/i,
  /gesendet.*(?:e-?mail|postfach)/i,
  /code.*(?:in|von|per).*e-?mail/i,

  // French
  /\b(?:e-?mail|courrier|bo[iî]te\s*(?:de\s*)?r[eé]ception)\b/i,
  /envoy[eé].*(?:e-?mail|courrier)/i,
  /code.*(?:dans|par).*(?:e-?mail|courrier)/i,

  // Italian
  /\b(?:e-?mail|posta|casella\s*(?:di\s*)?posta)/i,
  /inviato.*(?:e-?mail|posta)/i,
  /codice.*(?:nella|via).*(?:e-?mail|posta)/i,

  // Dutch
  /\b(?:e-?mail|inbox|postvak)\b/i,
  /verstuurd.*(?:e-?mail|postvak)/i,
  /code.*(?:in|via).*e-?mail/i,

  // Turkish (e-posta)
  /\be[-\s]?posta\b/i,
  /(?:gelen|posta)\s*kutusu/i,
  /(?:e[-\s]?posta|posta).*gönder/i,
  /kod.*(?:e[-\s]?posta)/i,

  // Polish
  /\b(?:e-?mail|poczta|skrzynka)/i,
  /wys[lł]any.*(?:e-?mail|poczt[aę])/i,
  /kod.*(?:w|z).*(?:e-?mail|poczt)/i,

  // Czech
  /\b(?:e-?mail|po[sš]ta|schr[aá]nka)/i,
  /odesl[aá]n.*(?:e-?mail|po[sš]t)/i,
  /k[oó]d.*(?:v|z).*(?:e-?mail|po[sš]t)/i,

  // ═══════════════════════════════════════════════════════════════
  // Nordic Languages (Swedish, Finnish, Danish, Norwegian)
  // ═══════════════════════════════════════════════════════════════

  // Swedish
  /\b(?:e-?post|inkorg|brevl[aå]da)\b/i,
  /skickat.*(?:e-?post|inkorg)/i,
  /kod.*(?:i|fr[aå]n).*e-?post/i,

  // Finnish
  /\b(?:s[aä]hk[oö]posti|postilaatikko)\b/i,
  /l[aä]hetetty.*s[aä]hk[oö]posti/i,
  /koodi.*s[aä]hk[oö]posti/i,

  // Danish
  /\b(?:e-?mail|indbakke|postkasse)\b/i,
  /sendt.*e-?mail/i,
  /kode.*(?:i|fra).*e-?mail/i,

  // Norwegian
  /\b(?:e-?post|innboks|postboks)\b/i,
  /sendt.*e-?post/i,
  /kode.*(?:i|fra).*e-?post/i,

  // ═══════════════════════════════════════════════════════════════
  // Cyrillic Script (Russian, Ukrainian)
  // ═══════════════════════════════════════════════════════════════

  // Russian (remove \b - doesn't work with Cyrillic)
  /(?:электронн[аяыой]+\s*почт[аыуе]+|почт[аыуе]|ящик)/i,
  /отправлен.*почт/i,
  /код.*(?:в|из|по).*почт/i,
  /провер.*почт/i,  // "check mail"

  // Ukrainian
  /(?:електронн[аяіої]+\s*пошт[аіуїєо]+|пошт[аіуїєо]|скринька)/i,
  /надіслан.*пошт/i,
  /код.*(?:в|з|на).*пошт/i,

  // ═══════════════════════════════════════════════════════════════
  // Arabic Script
  // ═══════════════════════════════════════════════════════════════

  // Arabic (email, inbox, sent) - remove \b
  /(?:بريد\s*إلكتروني|بريد|صندوق\s*الوارد)/i,
  /(?:مرسل|أرسل).*بريد/i,
  /رمز.*(?:في|من).*بريد/i,

  // ═══════════════════════════════════════════════════════════════
  // Devanagari Script (Hindi)
  // ═══════════════════════════════════════════════════════════════

  // Hindi (email, inbox) - remove \b
  /(?:ईमेल|इनबॉक्स|डाक\s*पेटी)/i,
  /भेजा.*ईमेल/i,
  /कोड.*ईमेल/i,

  // ═══════════════════════════════════════════════════════════════
  // CJK Scripts (Japanese, Korean, Chinese)
  // ═══════════════════════════════════════════════════════════════

  // Japanese (メール = email, 受信箱 = inbox) - remove \b
  /(?:メール|受信箱|電子メール)/i,
  /送信.*メール/i,
  /コード.*メール/i,

  // Korean (이메일 = email, 받은편지함 = inbox) - remove \b
  /(?:이메일|받은편지함|전자우편)/i,
  /전송.*이메일/i,
  /코드.*이메일/i,

  // Chinese Simplified (电子邮件 = email, 收件箱 = inbox) - remove \b
  /(?:电子邮件|邮件|收件箱)/i,
  /发送.*邮件/i,
  /代码.*邮件/i,
  /请.*查看.*邮件/i,  // "please check email"
  /您的.*邮件/i,  // "your email"

  // Chinese Traditional (電子郵件 = email, 收件匣 = inbox) - remove \b
  /(?:電子郵件|郵件|收件匣)/i,
  /發送.*郵件/i,
  /代碼.*郵件/i,
  /請.*查看.*郵件/i,  // "please check email"
  /您的.*郵件/i,  // "your email"
] as const

/**
 * Authenticator app patterns (21 languages)
 *
 * Priority: High-precision patterns for authenticator apps.
 * Includes: Google Authenticator, Microsoft Authenticator, Authy, etc.
 */
const AUTHENTICATOR_PATTERNS = [
  // ═══════════════════════════════════════════════════════════════
  // Brand names (multilingual)
  // ═══════════════════════════════════════════════════════════════
  /\b(?:google\s*authenticator|microsoft\s*authenticator|authy|duo\s*mobile)\b/i,

  // ═══════════════════════════════════════════════════════════════
  // Latin Script
  // ═══════════════════════════════════════════════════════════════

  // English
  /\b(?:authenticat(?:or|ion)\s*app|auth\s*app)\b/i,
  /\bauth(?:entication)?\s*application\b/i,
  /code\s*(?:from|in).*(?:authenticat|auth\s*app)/i,
  /(?:open|use|check).*(?:authenticat|auth\s*app)/i,

  // Spanish
  /\b(?:aplicaci[oó]n\s*de\s*autenticaci[oó]n|app\s*de\s*autenticaci[oó]n)\b/i,
  /autenticador/i,
  /c[oó]digo.*(?:de|en).*(?:aplicaci[oó]n|app)/i,

  // Portuguese
  /\b(?:aplicativo\s*de\s*autentica[çc][aã]o|app\s*de\s*autentica[çc][aã]o)\b/i,
  /autenticador/i,
  /c[oó]digo.*(?:do|no).*(?:aplicativo|app)/i,

  // German
  /\b(?:authentifizierungs[-\s]?app|authenticator[-\s]?app)\b/i,
  /authentifizierungs[-\s]?anwendung/i,
  /code.*(?:aus|von).*(?:app|anwendung)/i,

  // French
  /\b(?:application\s*d'authentification|app\s*d'authentification)\b/i,
  /authentificateur/i,
  /code.*(?:de|dans).*(?:application|app)/i,

  // Italian
  /\b(?:app\s*di\s*autenticazione|applicazione\s*di\s*autenticazione)\b/i,
  /autenticatore/i,
  /codice.*(?:dall['']|nell['']).*app/i,

  // Dutch
  /\b(?:authenticatie[-\s]?app|verificatie[-\s]?app)\b/i,
  /authenticatie[-\s]?applicatie/i,
  /code.*(?:van|in).*app/i,

  // Turkish (uygulama = app, kimlik doğrulayıcı = authenticator)
  /\b(?:kimlik\s*doğrulayıcı|doğrulayıcı\s*uygulama)\b/i,
  /\buygulama(?:nız(?:da|dan)?|dan)?\b/i,
  /kod.*(?:uygulamadan|uygulamanızdan)/i,

  // Polish
  /\b(?:aplikacja\s*uwierzytelniaj[aą]ca|aplikacja\s*do\s*uwierzytelniania)\b/i,
  /uwierzytelniacz/i,
  /kod.*(?:z|w).*aplikacj/i,

  // Czech
  /\b(?:ov[eě][rř]ovac[ií]\s*aplikace|autentiza[čc]n[ií]\s*aplikace)\b/i,
  /ov[eě][rř]ovatel/i,
  /k[oó]d.*(?:z|v).*aplikac/i,

  // ═══════════════════════════════════════════════════════════════
  // Nordic Languages
  // ═══════════════════════════════════════════════════════════════

  // Swedish
  /\b(?:autentiseringsapp|verifieringsapp)\b/i,
  /autentiserare/i,
  /kod.*(?:fr[aå]n|i).*app/i,

  // Finnish
  /\b(?:todennussovellus|tunnistautumissovellus)\b/i,
  /todentaja/i,
  /koodi.*(?:sovelluksesta|sovelluksessa)/i,

  // Danish
  /\b(?:godkendelsesapp|bekr[aæ]ftelsesapp)\b/i,
  /godkender/i,
  /kode.*(?:fra|i).*app/i,

  // Norwegian
  /\b(?:autentiseringsapp|godkjenningsapp)\b/i,
  /autentiserer/i,
  /kode.*(?:fra|i).*app/i,

  // ═══════════════════════════════════════════════════════════════
  // Cyrillic Script
  // ═══════════════════════════════════════════════════════════════

  // Russian (приложение = app, аутентификатор = authenticator) - remove \b
  /(?:приложение\s*(?:для\s*)?аутентификац|аутентификатор)/i,
  /код.*(?:из|в).*приложени/i,

  // Ukrainian - remove \b
  /(?:додаток\s*(?:для\s*)?автентифікац|автентифікатор)/i,
  /код.*(?:з|в).*додатк/i,

  // ═══════════════════════════════════════════════════════════════
  // Arabic Script
  // ═══════════════════════════════════════════════════════════════

  // Arabic (تطبيق = app, مصادقة = authentication) - remove \b
  /(?:تطبيق\s*المصادقة|تطبيق\s*التحقق)/i,
  /رمز.*(?:من|في).*تطبيق/i,

  // ═══════════════════════════════════════════════════════════════
  // Devanagari Script
  // ═══════════════════════════════════════════════════════════════

  // Hindi (प्रमाणक = authenticator, ऐप = app) - remove \b
  /(?:प्रमाणक\s*ऐप|प्रमाणीकरण\s*ऐप)/i,
  /कोड.*ऐप/i,

  // ═══════════════════════════════════════════════════════════════
  // CJK Scripts
  // ═══════════════════════════════════════════════════════════════

  // Japanese (認証アプリ = authentication app) - remove \b
  /(?:認証アプリ|二段階認証アプリ)/i,
  /コード.*アプリ/i,

  // Korean (인증 앱 = authentication app) - remove \b
  /(?:인증\s*앱|2단계\s*인증\s*앱)/i,
  /코드.*앱/i,

  // Chinese Simplified (身份验证器 = authenticator) - remove \b
  /(?:身份验证.*应用|验证器.*应用|身份验证)/i,
  /代码.*应用/i,
  /打开.*(?:身份验证|验证器|应用)/i,  // "open authenticator/app"

  // Chinese Traditional - remove \b
  /(?:身分驗證.*應用|驗證器.*應用|身分驗證)/i,
  /代碼.*應用/i,
  /打開.*(?:身分驗證|驗證器|應用)/i,  // "open authenticator/app"
] as const

/**
 * SMS/Mobile phone patterns (21 languages)
 *
 * Priority: High-precision patterns for SMS/text message delivery.
 */
const SMS_PATTERNS = [
  // ═══════════════════════════════════════════════════════════════
  // Latin Script
  // ═══════════════════════════════════════════════════════════════

  // English
  /\b(?:sms|text\s*message|mobile\s*(?:phone|number)?)\b/i,
  /sent\s*(?:to|via).*(?:sms|text|mobile|phone)/i,
  /\bphone\s*number\b/i,
  /code.*(?:via|from|in).*(?:sms|text|mobile)/i,
  /check.*(?:sms|text\s*message|mobile)/i,

  // Spanish
  /\b(?:sms|mensaje\s*de\s*texto|tel[eé]fono\s*m[oó]vil|celular)\b/i,
  /enviado.*(?:sms|tel[eé]fono|celular)/i,
  /c[oó]digo.*(?:por|en).*(?:sms|tel[eé]fono)/i,

  // Portuguese
  /\b(?:sms|mensagem\s*de\s*texto|celular|telefone)\b/i,
  /enviado.*(?:sms|telefone|celular)/i,
  /c[oó]digo.*(?:por|no).*(?:sms|telefone)/i,

  // German
  /\b(?:sms|textnachricht|handy|mobiltelefon)\b/i,
  /gesendet.*(?:sms|handy|telefon)/i,
  /code.*(?:per|via).*(?:sms|handy)/i,

  // French
  /\b(?:sms|message\s*texte|t[eé]l[eé]phone\s*mobile|portable)\b/i,
  /envoy[eé].*(?:sms|portable|t[eé]l[eé]phone)/i,
  /code.*(?:par|via).*(?:sms|portable)/i,

  // Italian
  /\b(?:sms|messaggio\s*di\s*testo|cellulare|telefono)\b/i,
  /inviato.*(?:sms|cellulare|telefono)/i,
  /codice.*(?:via|su).*(?:sms|cellulare)/i,

  // Dutch
  /\b(?:sms|tekstbericht|mobiel|telefoon)\b/i,
  /verstuurd.*(?:sms|mobiel|telefoon)/i,
  /code.*(?:via|per).*(?:sms|mobiel)/i,

  // Turkish (telefon = phone, kısa mesaj = SMS, mesaj = message)
  /\b(?:k[ıi]sa\s*mesaj|sms|telefon(?:un(?:uz)?(?:a|dan)?)?)\b/i,
  /(?:cep\s*)?telefon(?:un(?:uz)?)?(?:a|dan)/i,
  /kod.*(?:telefon|mesaj|sms)/i,
  /(?:telefon|mesaj|sms).*(?:kod|kodu)/i,

  // Polish
  /\b(?:sms|wiadomo[sś][cć]\s*tekstowa|telefon\s*kom[oó]rkowy)\b/i,
  /wys[lł]any.*(?:sms|telefon)/i,
  /kod.*(?:z|na).*(?:sms|telefon)/i,

  // Czech
  /\b(?:sms|textov[aá]\s*zpr[aá]va|mobiln[ií]\s*telefon)\b/i,
  /odesl[aá]n.*(?:sms|telefon)/i,
  /k[oó]d.*(?:z|na).*(?:sms|telefon)/i,

  // ═══════════════════════════════════════════════════════════════
  // Nordic Languages
  // ═══════════════════════════════════════════════════════════════

  // Swedish
  /\b(?:sms|textmeddelande|mobiltelefon|mobil)\b/i,
  /skickat.*(?:sms|mobil|telefon)/i,
  /kod.*(?:via|fr[aå]n).*(?:sms|mobil)/i,

  // Finnish
  /\b(?:sms|tekstiviesti|matkapuhelin)\b/i,
  /l[aä]hetetty.*(?:sms|puhelin)/i,
  /koodi.*(?:viestiss[aä]|puhelimeen)/i,

  // Danish
  /\b(?:sms|tekstbesked|mobiltelefon|mobil)\b/i,
  /sendt.*(?:sms|mobil|telefon)/i,
  /kode.*(?:via|fra).*(?:sms|mobil)/i,

  // Norwegian
  /\b(?:sms|tekstmelding|mobiltelefon|mobil)\b/i,
  /sendt.*(?:sms|mobil|telefon)/i,
  /kode.*(?:via|fra).*(?:sms|mobil)/i,

  // ═══════════════════════════════════════════════════════════════
  // Cyrillic Script
  // ═══════════════════════════════════════════════════════════════

  // Russian (СМС = SMS, телефон = phone, мобильный = mobile) - remove \b
  /(?:смс|текстов[оыае]+\s*сообщени[ея]|мобильн[оыаяий]+|телефон)/i,
  /отправлен.*(?:смс|телефон)/i,
  /код.*(?:по|на|из).*(?:смс|телефон)/i,

  // Ukrainian - remove \b
  /(?:смс|текстов[еіо]+\s*повідомленн[яі]|мобільн[ийіао]+|телефон)/i,
  /надіслан.*(?:смс|телефон)/i,
  /код.*(?:на|з).*(?:смс|телефон)/i,

  // ═══════════════════════════════════════════════════════════════
  // Arabic Script
  // ═══════════════════════════════════════════════════════════════

  // Arabic (رسالة نصية = text message, هاتف = phone) - remove \b
  /(?:رسالة\s*نصية|رسالة\s*قصيرة|هاتف\s*محمول)/i,
  /(?:مرسل|أرسل).*(?:رسالة|هاتف)/i,
  /رمز.*(?:على|من).*هاتف/i,

  // ═══════════════════════════════════════════════════════════════
  // Devanagari Script
  // ═══════════════════════════════════════════════════════════════

  // Hindi (एसएमएस = SMS, मोबाइल = mobile) - remove \b
  /(?:एसएमएस|मोबाइल|फ़ोन)/i,
  /भेजा.*(?:एसएमएस|मोबाइल|फ़ोन)/i,
  /कोड.*(?:एसएमएस|मोबाइल)/i,

  // ═══════════════════════════════════════════════════════════════
  // CJK Scripts
  // ═══════════════════════════════════════════════════════════════

  // Japanese (SMS, 携帯 = mobile, 電話 = phone) - remove \b
  /(?:ショートメール|携帯電話|携帯)/i,
  /送信.*(?:携帯|電話)/i,
  /コード.*(?:携帯)/i,

  // Korean (문자 메시지 = text message, 휴대폰 = mobile) - remove \b
  /(?:문자\s*메시지|문자|휴대폰|휴대전화)/i,
  /전송.*(?:문자|휴대폰)/i,
  /코드.*(?:문자|휴대폰)/i,

  // Chinese Simplified (短信 = SMS, 手机 = mobile phone) - remove \b
  /(?:短信|手机|移动电话)/i,
  /发送.*(?:短信|手机)/i,
  /代码.*(?:短信|手机)/i,
  /输入.*短信/i,  // "enter SMS"

  // Chinese Traditional - remove \b
  /(?:簡訊|手機|行動電話)/i,
  /發送.*(?:簡訊|手機)/i,
  /代碼.*(?:簡訊|手機)/i,
  /輸入.*簡訊/i,  // "enter SMS"
] as const

/**
 * Phone number patterns that indicate SMS delivery
 * Matches masked/partial phone numbers commonly shown in verification UIs
 * Examples: ***89, "ending in 1234", +90 *** *** **42, (555) ***-**12
 */
const PHONE_NUMBER_PATTERNS = [
  // Masked phone: ***89, **1234, ***-**42 (preceded by context words)
  // Constrained to 40 chars max gap, stops at sentence boundaries
  /(?:sent|code|kod|código|kode|koodi)[^.!?\n]{0,40}(?:\*{2,}[\s\-]?\d{2,4})/i,
  // "ending in NNNN" pattern - requires phone/SMS context to avoid card masking
  /(?:phone|number|mobile|cell|sms|tel).*(?:ending|ends)\s+(?:in|with)\s+\d{2,4}/i,
  // International format with masking: +NN *** *** **NN
  /\+\d{1,3}\s+\*[\s\-*\d]{5,}/i,
  // US format with masking: (NNN) ***-**NN
  /\(\d{3}\)\s*\*[\s\-*\d]{4,}/i,
  // Turkish: "numarasına gönderildi" near masked numbers
  /\*{2,}[\s\-]?\d{2,4}.*(?:numara|gönder)/i,
  /(?:numara|gönder).*\*{2,}[\s\-]?\d{2,4}/i,
] as const

/**
 * Detect character set for performance optimization
 * Returns hint for which pattern sets to prioritize
 */
function detectCharacterSet(text: string): 'latin' | 'cyrillic' | 'arabic' | 'devanagari' | 'cjk' {
  // CJK (fastest to detect - distinct Unicode ranges)
  if (/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text)) {
    return 'cjk'
  }

  // Arabic (RTL script)
  if (/[\u0600-\u06ff\u0750-\u077f]/.test(text)) {
    return 'arabic'
  }

  // Devanagari (Hindi)
  if (/[\u0900-\u097f]/.test(text)) {
    return 'devanagari'
  }

  // Cyrillic (Russian, Ukrainian)
  if (/[\u0400-\u04ff]/.test(text)) {
    return 'cyrillic'
  }

  // Default to Latin (covers majority of cases)
  return 'latin'
}

/**
 * Classify delivery channel from text sources
 *
 * Priority order (Option 7 - Hybrid Detection):
 * 1. Scan ALL patterns (no short-circuit) to detect multiple channels
 * 2. Build allChannels array and channelConfidences object
 * 3. Enhanced decision logic:
 *    - Authenticator + Email → Return 'email' (confidence 0.85) - DETECT
 *    - Authenticator only → Return 'authenticator' - REJECT
 *    - SMS + Email → Return 'email' (confidence 0.85) - DETECT
 *    - SMS only → Return 'sms' - REJECT
 *    - Email only → Return 'email' (confidence 0.95) - DETECT
 *    - Unknown → Return 'unknown' - NEUTRAL
 *
 * IMPORTANT: Hybrid scenarios now DETECT when email is available alongside
 * other methods. This allows InboxKey to help on pages like GitHub/Steam that
 * offer both email codes AND authenticator apps.
 *
 * Performance: <0.05ms per field via character set hints
 *
 * @param sources - Text sources to analyze
 * @returns Channel classification result with allChannels tracking
 */
export function classifyDeliveryChannel(sources: TextSources): ChannelClassification {
  // Combine all text sources
  const combinedText = [
    sources.label,
    sources.placeholder,
    sources.nearbyText,
    sources.ariaLabel,
    sources.ariaDescribedby,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (!combinedText.trim()) {
    return {
      channel: 'unknown',
      confidence: 0,
      matchedKeywords: [],
      language: null,
    }
  }

  // Performance optimization: detect character set
  const charSet = detectCharacterSet(combinedText)

  // ═══════════════════════════════════════════════════════════════
  // Scan ALL Patterns (No Short-Circuit)
  // ═══════════════════════════════════════════════════════════════
  // Track which channels are detected in the text
  const detectedChannels = {
    authenticator: null as RegExpExecArray | null,
    sms: null as RegExpExecArray | null,
    email: null as RegExpExecArray | null,
  }

  // Check authenticator patterns
  for (const pattern of AUTHENTICATOR_PATTERNS) {
    const match = pattern.exec(combinedText)
    if (match) {
      detectedChannels.authenticator = match
      break // Only need first match for each channel
    }
  }

  // Check SMS patterns
  for (const pattern of SMS_PATTERNS) {
    const match = pattern.exec(combinedText)
    if (match) {
      detectedChannels.sms = match
      break
    }
  }

  // Check phone number patterns (SMS evidence from masked/partial numbers)
  if (!detectedChannels.sms) {
    for (const pattern of PHONE_NUMBER_PATTERNS) {
      const match = pattern.exec(combinedText)
      if (match) {
        detectedChannels.sms = match
        break
      }
    }
  }

  // Check email patterns
  for (const pattern of EMAIL_PATTERNS) {
    const match = pattern.exec(combinedText)
    if (match) {
      detectedChannels.email = match
      break
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Build allChannels Array (InboxKey capability order)
  // ═══════════════════════════════════════════════════════════════
  const allChannels: Array<'email' | 'sms' | 'authenticator'> = []
  if (detectedChannels.email) allChannels.push('email')
  if (detectedChannels.sms) allChannels.push('sms')
  if (detectedChannels.authenticator) allChannels.push('authenticator')

  // Build channelConfidences object
  const channelConfidences: {
    email?: number
    sms?: number
    authenticator?: number
  } = {}
  if (detectedChannels.email) channelConfidences.email = 0.95
  if (detectedChannels.sms) channelConfidences.sms = 1.0
  if (detectedChannels.authenticator) channelConfidences.authenticator = 1.0

  // ═══════════════════════════════════════════════════════════════
  // Enhanced Decision Logic (Option 7 - Hybrid Detection)
  // ═══════════════════════════════════════════════════════════════

  // Priority 1: Authenticator + Email → DETECT as email (hybrid scenario)
  if (detectedChannels.authenticator && detectedChannels.email) {
    return {
      channel: 'email',
      confidence: 0.85, // Lower confidence due to hybrid ambiguity
      matchedKeywords: [detectedChannels.email[0], detectedChannels.authenticator[0]],
      language: detectLanguageFromCharSet(charSet),
      allChannels,
      channelConfidences,
    }
  }

  // Priority 2: Authenticator only (no email) → REJECT
  if (detectedChannels.authenticator) {
    return {
      channel: 'authenticator',
      confidence: 1.0,
      matchedKeywords: [detectedChannels.authenticator[0]],
      language: detectLanguageFromCharSet(charSet),
      allChannels,
      channelConfidences,
    }
  }

  // Priority 3: SMS + Email → DETECT as email (hybrid scenario)
  if (detectedChannels.sms && detectedChannels.email) {
    return {
      channel: 'email',
      confidence: 0.85, // Lower confidence due to hybrid ambiguity
      matchedKeywords: [detectedChannels.email[0], detectedChannels.sms[0]],
      language: detectLanguageFromCharSet(charSet),
      allChannels,
      channelConfidences,
    }
  }

  // Priority 4: SMS only (no email) → REJECT
  if (detectedChannels.sms) {
    return {
      channel: 'sms',
      confidence: 1.0,
      matchedKeywords: [detectedChannels.sms[0]],
      language: detectLanguageFromCharSet(charSet),
      allChannels,
      channelConfidences,
    }
  }

  // Priority 5: Email only → DETECT
  if (detectedChannels.email) {
    return {
      channel: 'email',
      confidence: 0.95,
      matchedKeywords: [detectedChannels.email[0]],
      language: detectLanguageFromCharSet(charSet),
      allChannels,
      channelConfidences,
    }
  }

  // Priority 6: No matches → Unknown
  return {
    channel: 'unknown',
    confidence: 0,
    matchedKeywords: [],
    language: null,
    // No allChannels for unknown
  }
}

/**
 * Map character set to ISO 639-1 language code (approximate)
 */
function detectLanguageFromCharSet(charSet: string): string | null {
  switch (charSet) {
    case 'cyrillic':
      return 'ru' // Russian (could be UK, but RU most common)
    case 'arabic':
      return 'ar'
    case 'devanagari':
      return 'hi'
    case 'cjk':
      return 'zh' // Chinese most common, could be JA/KO
    case 'latin':
    default:
      return 'en' // Default to English for Latin script
  }
}
