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
export const EMAIL_PATTERNS = [
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
  // English: "code generator app" with FP guard.
  // Matches X TOTP copy ("Generate a code using your code generator app")
  // while blocking known FP qualifiers via fixed-length negative lookbehinds.
  // `app` is REQUIRED — bare "code generator" is a common non-auth phrase
  // ("AI code generator", "visual code generator", "free code generator").
  /(?<!qr\s)(?<!qr-)(?<!barcode\s)(?<!barcode-)(?<!promo\s)(?<!promo-)(?<!coupon\s)(?<!coupon-)(?<!source\s)(?<!source-)(?<!low-)(?<!no-)\bcode[-\s]?generator[-\s]+app\b/i,

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

  // Turkish — agglutinative grammar makes \b-bounded stems unreliable.
  // JS \b is ASCII-only; Turkish dotless ı is a non-word char, breaking
  // boundaries on words like `doğrulayıcı`. Strategy: require co-occurrence
  // of `uygulama*` (prefix) within ~60 chars of an authentication anchor.
  // Anchors split into two groups:
  //   (A) safe anchors: doğrulayıcı, kimlik doğrulama (bigram, NOT bare
  //       `kimlik` which also means "identity"), 2FA, TOTP, generic English
  //       `authenticator` (used in Turkish login UIs), and brand names.
  //   (B) FP-prone anchor `kod oluşturucu` — used by Turkish QR/promo/coupon
  //       generator apps (e.g. App Store title "Me QR - QR Kod Oluşturucu
  //       Uygulaması"). Guarded with negative lookbehinds for QR / karekod /
  //       barkod / promosyon / kupon qualifiers.

  // Group A (safe anchors, bidirectional)
  /(?:doğrulayıcı|kimlik\s*doğrulama|2fa|totp|authenticator|google\s*authenticator|microsoft\s*authenticator|authy|duo\s*mobile)[\s\S]{0,60}uygulama/i,
  /uygulama[\s\S]{0,60}(?:doğrulayıcı|kimlik\s*doğrulama|2fa|totp|authenticator|google\s*authenticator|microsoft\s*authenticator|authy|duo\s*mobile)/i,

  // Group B (kod oluşturucu, guarded against QR/promo/coupon contexts)
  /(?<!qr\s)(?<!qr-)(?<!karekod\s)(?<!karekod-)(?<!barkod\s)(?<!barkod-)(?<!promosyon\s)(?<!promosyon-)(?<!kupon\s)(?<!kupon-)kod\s*oluşturucu[\s\S]{0,60}uygulama/i,
  /uygulama[\s\S]{0,60}(?<!qr\s)(?<!qr-)(?<!karekod\s)(?<!karekod-)(?<!barkod\s)(?<!barkod-)(?<!promosyon\s)(?<!promosyon-)(?<!kupon\s)(?<!kupon-)kod\s*oluşturucu/i,

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
  /(?:sms|text|phone|mobile).{0,40}verification/i,
  /(?:enter|input|type).{0,40}code.{0,80}(?:sent|delivered).{0,80}(?:phone|mobile|text|sms)/i,

  // Spanish
  /\b(?:sms|mensaje\s*de\s*texto|tel[eé]fono\s*m[oó]vil|celular)\b/i,
  /enviado.*(?:sms|tel[eé]fono|celular)/i,
  /c[oó]digo.*(?:por|en).*(?:sms|tel[eé]fono)/i,
  /verificaci[oó]n.{0,40}(?:sms|tel[eé]fono|celular)/i,
  /(?:ingres|introdu|escrib).{0,40}c[oó]digo.{0,80}enviado.{0,80}(?:tel[eé]fono|celular|sms)/i,

  // Portuguese
  /\b(?:sms|mensagem\s*de\s*texto|celular|telefone)\b/i,
  /enviado.*(?:sms|telefone|celular)/i,
  /c[oó]digo.*(?:por|no).*(?:sms|telefone)/i,
  /verifica[çc][aã]o.{0,40}(?:sms|telefone|celular)/i,
  /(?:digite|insira).{0,40}c[oó]digo.{0,80}enviado.{0,80}(?:telefone|celular|sms)/i,

  // German
  /\b(?:sms|textnachricht|handy|mobiltelefon)\b/i,
  /gesendet.*(?:sms|handy|telefon)/i,
  /code.*(?:per|via).*(?:sms|handy)/i,
  /(?:sms|telefon|handy|mobiltelefon).{0,40}(?:best[aä]tigung|verifizierung)/i,
  /(?:geben|gib).{0,40}code.{0,80}gesendet.{0,80}(?:telefon|handy|mobiltelefon|sms)/i,

  // French
  /\b(?:sms|message\s*texte|t[eé]l[eé]phone\s*mobile|portable)\b/i,
  /envoy[eé].*(?:sms|portable|t[eé]l[eé]phone)/i,
  /code.*(?:par|via).*(?:sms|portable)/i,
  /v[eé]rification.{0,40}(?:sms|t[eé]l[eé]phone|portable)/i,
  /(?:entrez|saisissez).{0,40}code.{0,80}envoy[eé].{0,80}(?:t[eé]l[eé]phone|portable|sms)/i,

  // Italian
  /\b(?:sms|messaggio\s*di\s*testo|cellulare|telefono)\b/i,
  /inviato.*(?:sms|cellulare|telefono)/i,
  /codice.*(?:via|su).*(?:sms|cellulare)/i,
  /verifica.{0,40}(?:sms|cellulare|telefono)/i,
  /(?:inserisci|immetti).{0,40}codice.{0,80}inviato.{0,80}(?:cellulare|telefono|sms)/i,

  // Dutch
  /\b(?:sms|tekstbericht|mobiel|telefoon)\b/i,
  /verstuurd.*(?:sms|mobiel|telefoon)/i,
  /code.*(?:via|per).*(?:sms|mobiel)/i,
  /verificatie.{0,40}(?:sms|mobiel|telefoon)/i,
  /(?:voer|vul).{0,40}code.{0,80}verstuurd.{0,80}(?:telefoon|mobiel|sms)/i,

  // Turkish (telefon = phone, kısa mesaj = SMS, mesaj = message)
  /\b(?:k[ıi]sa\s*mesaj|sms|telefon(?:unuz|unuza|un(?:uz)?(?:a|dan)?|u)?|telefon\s*numaras[ıi](?:na|n[ıi])?|numaras[ıi](?:na|n[ıi])?)\b/i,
  /(?:cep\s*)?telefon(?:unuz|unuza|un(?:uz)?(?:a|dan)?|u)?/i,
  /kod.*(?:telefon|numara|mesaj|sms)/i,
  /(?:telefon|numara|mesaj|sms).*(?:kod|kodu|doğrulama)/i,
  /(?:gönder(?:il(?:en|di)|ildi)?|yolla(?:nan|ndı)?).{0,80}(?:telefon|numara|sms|mesaj)/i,
  /(?:telefon|numara|sms|mesaj).{0,80}(?:gönder(?:il(?:en|di)|ildi)?|yolla(?:nan|ndı)?)/i,

  // Polish
  /\b(?:sms|wiadomo[sś][cć]\s*tekstowa|telefon\s*kom[oó]rkowy)\b/i,
  /wys[lł]any.*(?:sms|telefon)/i,
  /kod.*(?:z|na).*(?:sms|telefon)/i,
  /weryfikacj[aą].{0,40}(?:sms|telefon)/i,
  /wpisz.{0,40}kod.{0,80}wys[lł]any.{0,80}(?:telefon|sms)/i,

  // Czech
  /\b(?:sms|textov[aá]\s*zpr[aá]va|mobiln[ií]\s*telefon)\b/i,
  /odesl[aá]n.*(?:sms|telefon)/i,
  /k[oó]d.*(?:z|na).*(?:sms|telefon)/i,
  /ov[eě][rř]en[ií].{0,40}(?:sms|telefon)/i,
  /zadejte.{0,40}k[oó]d.{0,80}odesl[aá]n.{0,80}(?:telefon|sms)/i,

  // ═══════════════════════════════════════════════════════════════
  // Nordic Languages
  // ═══════════════════════════════════════════════════════════════

  // Swedish
  /\b(?:sms|textmeddelande|mobiltelefon|mobil)\b/i,
  /skickat.*(?:sms|mobil|telefon)/i,
  /kod.*(?:via|fr[aå]n).*(?:sms|mobil)/i,
  /verifiering.{0,40}(?:sms|mobil|telefon)/i,
  /ange.{0,40}kod.{0,80}skickat.{0,80}(?:telefon|mobil|sms)/i,

  // Finnish
  /\b(?:sms|tekstiviesti|matkapuhelin|puhelin|puhelimeen|puhelinnumero)\b/i,
  /l[aä]hetetty.*(?:sms|puhelin)/i,
  /koodi.*(?:viestiss[aä]|puhelimeen)/i,
  /vahvistus.{0,40}(?:sms|tekstiviesti|puhelin)/i,
  /sy[oö]t[aä].{0,40}koodi.{0,80}l[aä]hetetty.{0,80}(?:puhelin|sms|tekstiviesti)/i,

  // Danish
  /\b(?:sms|tekstbesked|mobiltelefon|mobil)\b/i,
  /sendt.*(?:sms|mobil|telefon)/i,
  /kode.*(?:via|fra).*(?:sms|mobil)/i,
  /bekr[aæ]ftelse.{0,40}(?:sms|mobil|telefon)/i,
  /indtast.{0,40}kode.{0,80}sendt.{0,80}(?:telefon|mobil|sms)/i,

  // Norwegian
  /\b(?:sms|tekstmelding|mobiltelefon|mobil)\b/i,
  /sendt.*(?:sms|mobil|telefon)/i,
  /kode.*(?:via|fra).*(?:sms|mobil)/i,
  /bekreftelse.{0,40}(?:sms|mobil|telefon)/i,
  /skriv.{0,40}kode.{0,80}sendt.{0,80}(?:telefon|mobil|sms)/i,

  // ═══════════════════════════════════════════════════════════════
  // Cyrillic Script
  // ═══════════════════════════════════════════════════════════════

  // Russian (СМС = SMS, телефон = phone, мобильный = mobile) - remove \b
  /(?:смс|текстов[оыае]+\s*сообщени[ея]|мобильн[оыаяий]+|телефон)/i,
  /отправлен.*(?:смс|телефон)/i,
  /код.*(?:по|на|из).*(?:смс|телефон)/i,
  /подтверждени[ея].{0,40}(?:смс|телефон|мобильн)/i,
  /введите.{0,40}код.{0,80}отправлен.{0,80}(?:телефон|смс|мобильн)/i,

  // Ukrainian - remove \b
  /(?:смс|текстов[еіо]+\s*повідомленн[яі]|мобільн[ийіао]+|телефон)/i,
  /надіслан.*(?:смс|телефон)/i,
  /код.*(?:на|з).*(?:смс|телефон)/i,
  /підтвердженн[яі].{0,40}(?:смс|телефон|мобільн)/i,
  /введіть.{0,40}код.{0,80}надіслан.{0,80}(?:телефон|смс|мобільн)/i,

  // ═══════════════════════════════════════════════════════════════
  // Arabic Script
  // ═══════════════════════════════════════════════════════════════

  // Arabic (رسالة نصية = text message, هاتف = phone) - remove \b
  /(?:رسالة\s*نصية|رسالة\s*قصيرة|هاتف\s*محمول)/i,
  /(?:مرسل|أرسل).*(?:رسالة|هاتف)/i,
  /رمز.*(?:على|من).*هاتف/i,
  /(?:تحقق|تأكيد).{0,40}(?:رسالة|هاتف|جوال)/i,
  /(?:أدخل|ادخل).{0,40}رمز.{0,80}(?:أرسل|مرسل).{0,80}(?:هاتف|جوال|رسالة)/i,

  // ═══════════════════════════════════════════════════════════════
  // Devanagari Script
  // ═══════════════════════════════════════════════════════════════

  // Hindi (एसएमएस = SMS, मोबाइल = mobile) - remove \b
  /(?:एसएमएस|मोबाइल|फ़ोन)/i,
  /भेजा.*(?:एसएमएस|मोबाइल|फ़ोन)/i,
  /कोड.*(?:एसएमएस|मोबाइल)/i,
  /(?:सत्यापन|पुष्टि).{0,40}(?:एसएमएस|मोबाइल|फ़ोन)/i,
  /(?:दर्ज|भरें).{0,40}कोड.{0,80}भेजा.{0,80}(?:मोबाइल|फ़ोन|एसएमएस)/i,

  // ═══════════════════════════════════════════════════════════════
  // CJK Scripts
  // ═══════════════════════════════════════════════════════════════

  // Japanese (SMS, 携帯 = mobile, 電話 = phone) - remove \b
  /(?:ショートメール|携帯電話|携帯)/i,
  /送信.*(?:携帯|電話)/i,
  /コード.*(?:携帯)/i,
  /(?:確認|認証).{0,40}(?:sms|ショートメール|携帯|電話)/i,
  /(?:入力).{0,40}コード.{0,80}送信.{0,80}(?:携帯|電話|sms|ショートメール)/i,

  // Korean (문자 메시지 = text message, 휴대폰 = mobile) - remove \b
  /(?:문자\s*메시지|문자|휴대폰|휴대전화)/i,
  /전송.*(?:문자|휴대폰)/i,
  /코드.*(?:문자|휴대폰)/i,
  /(?:확인|인증).{0,40}(?:sms|문자|휴대폰|휴대전화)/i,
  /입력.{0,40}코드.{0,80}전송.{0,80}(?:문자|휴대폰|휴대전화|sms)/i,

  // Chinese Simplified (短信 = SMS, 手机 = mobile phone) - remove \b
  /(?:短信|手机|移动电话)/i,
  /发送.*(?:短信|手机)/i,
  /代码.*(?:短信|手机)/i,
  /输入.*短信/i,  // "enter SMS"
  /(?:验证|确认).{0,40}(?:短信|手机|移动电话)/i,
  /输入.{0,40}(?:验证码|代码).{0,80}发送.{0,80}(?:手机|短信|移动电话)/i,

  // Chinese Traditional - remove \b
  /(?:簡訊|手機|行動電話)/i,
  /發送.*(?:簡訊|手機)/i,
  /代碼.*(?:簡訊|手機)/i,
  /輸入.*簡訊/i,  // "enter SMS"
  /(?:驗證|確認).{0,40}(?:簡訊|手機|行動電話)/i,
  /輸入.{0,40}(?:驗證碼|代碼).{0,80}發送.{0,80}(?:手機|簡訊|行動電話)/i,
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
  // General masked phone endings across supported languages. Requires
  // phone/SMS delivery context so masked cards/accounts do not become SMS.
  /(?:phone|mobile|cell|sms|text|tel[eé]fono|celular|telefone|handy|mobiltelefon|portable|cellulare|telefoon|telefon|numara|telefonu|kom[oó]rkowy|mobiln[ií]|mobil|puhelin|смс|телефон|мобільн|هاتف|جوال|رسالة|मोबाइल|फ़ोन|एसएमएस|携帯|電話|ショートメール|문자|휴대폰|휴대전화|短信|手机|簡訊|手機)[^.!?\n]{0,100}[\*•●x]{2,}(?:[\s\-][\*•●x]{2,}){0,4}[\s\-]?\d{2,4}/i,
  /[\*•●x]{2,}(?:[\s\-][\*•●x]{2,}){0,4}[\s\-]?\d{2,4}[^.!?\n]{0,100}(?:phone|mobile|cell|sms|text|tel[eé]fono|celular|telefone|handy|mobiltelefon|portable|cellulare|telefoon|telefon|numara|telefonu|kom[oó]rkowy|mobiln[ií]|mobil|puhelin|смс|телефон|мобільн|هاتف|جوال|رسالة|मोबाइल|फ़ोन|एसएमएस|携帯|電話|ショートメール|문자|휴대폰|휴대전화|短信|手机|簡訊|手機)/i,
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
