/**
 * Full-automation safety gates.
 *
 * These checks do not block detection or autofill. They only demote
 * full-automation to autofill so InboxKey never clicks payment/banking
 * confirmation controls.
 */

import { isBankingDomain } from '@/lib/data/banking-blocklist'
import { classifyNonEmailIntent } from '@/lib/detection/non-email-contexts'
import {
  getAriaDescribedbyText,
  getAriaLabelledbyText,
  getExplicitLabelText,
} from '@/lib/detection/detection-utils'
import { extractDomain } from '@/lib/utils/domain'

export type FullAutomationDemotionReason =
  | 'banking-domain'
  | 'payment-provider-domain'
  | 'payment-context'
  | 'banking-context'

export interface FullAutomationSafetyInput {
  url: string
  field: HTMLInputElement
}

export interface FullAutomationSafetyResult {
  shouldDemote: boolean
  reasons: FullAutomationDemotionReason[]
}

const PAYMENT_PROVIDER_DOMAINS = new Set([
  '2checkout.com',
  'adyen.com',
  'adyenpayments.com',
  'affirm.com',
  'afterpay.com',
  'authorize.net',
  'braintreepayments.com',
  'cardinalcommerce.com',
  'checkout.com',
  'checkout.fi',
  'cloudpayments.ru',
  'cybersource.com',
  'dlocal.com',
  'ebanx.com',
  'flutterwave.com',
  'gocardless.com',
  'globalpayments.com',
  'hipay.com',
  'iyzico.com',
  'klarna.com',
  'liqpay.ua',
  'mercadopago.com',
  'mercadopago.com.ar',
  'mercadopago.com.br',
  'mercadopago.com.co',
  'mercadopago.com.mx',
  'mollie.com',
  'netopia-payments.com',
  'neteller.com',
  'oppwa.com',
  'param.com.tr',
  'payoneer.com',
  'paypal.com',
  'paypal.ca',
  'paypal.co.jp',
  'paypal.co.kr',
  'paypal.co.uk',
  'paypal.com.au',
  'paypal.com.br',
  'paypal.com.hk',
  'paypal.com.mx',
  'paypal.com.sg',
  'paypal.com.tr',
  'paypal.de',
  'paypal.es',
  'paypal.fr',
  'paypal.it',
  'paypal.me',
  'paypal.nl',
  'paypal.pl',
  'paypal.se',
  'paysafe.com',
  'paystack.com',
  'payulatam.com',
  'paytr.com',
  'payu.com',
  'payu.co',
  'payu.com.br',
  'payu.com.tr',
  'payu.in',
  'payu.pl',
  'payplug.com',
  'paysera.com',
  'razorpay.com',
  'redsys.es',
  'robokassa.ru',
  'sezzle.com',
  'shopier.com',
  'skrill.com',
  'squareup.com',
  'stripe.com',
  'stripe.network',
  'tabby.ai',
  'tamara.co',
  'telr.com',
  'venmo.com',
  'worldpay.com',
  'worldpayglobal.com',
  'yookassa.ru',
  'zip.co',
])

const PAYMENT_PROVIDER_HOSTS = new Set([
  'pay.amazon.com',
  'payments.amazon.com',
  'pay.google.com',
  'payments.google.com',
])

const PAYMENT_CONTEXT_TERMS_BY_LANG: Readonly<Record<string, readonly string[]>> = Object.freeze({
  en: ['payment', 'pay now', 'checkout', 'secure checkout', 'billing', 'credit card', 'debit card', 'card number', 'confirm payment', 'authorize payment', '3d secure', '3ds', 'transaction', 'purchase', 'order total'],
  es: ['pago', 'pagar ahora', 'finalizar compra', 'caja', 'facturación', 'tarjeta de crédito', 'tarjeta de débito', 'confirmar pago', 'autorizar pago', 'transacción'],
  fr: ['paiement', 'payer maintenant', 'caisse', 'facturation', 'carte bancaire', 'carte de crédit', 'confirmer le paiement', 'autoriser le paiement', 'transaction'],
  de: ['zahlung', 'jetzt bezahlen', 'kasse', 'rechnung', 'kreditkarte', 'debitkarte', 'zahlung bestätigen', 'zahlung autorisieren', 'transaktion'],
  it: ['pagamento', 'paga ora', 'cassa', 'fatturazione', 'carta di credito', 'carta di debito', 'conferma pagamento', 'autorizza pagamento', 'transazione'],
  pt: ['pagamento', 'pagar agora', 'checkout', 'finalizar compra', 'faturamento', 'cartão de crédito', 'cartão de débito', 'confirmar pagamento', 'autorizar pagamento', 'transação'],
  nl: ['betaling', 'nu betalen', 'afrekenen', 'facturering', 'creditcard', 'betaalpas', 'betaling bevestigen', 'betaling autoriseren', 'transactie'],
  sv: ['betalning', 'betala nu', 'kassa', 'fakturering', 'kreditkort', 'betalkort', 'bekräfta betalning', 'auktorisera betalning', 'transaktion'],
  fi: ['maksu', 'maksa nyt', 'kassa', 'laskutus', 'luottokortti', 'pankkikortti', 'vahvista maksu', 'valtuuta maksu', 'tapahtuma'],
  da: ['betaling', 'betal nu', 'kasse', 'fakturering', 'kreditkort', 'betalingskort', 'bekræft betaling', 'godkend betaling', 'transaktion'],
  no: ['betaling', 'betal nå', 'kasse', 'fakturering', 'kredittkort', 'betalingskort', 'bekreft betaling', 'godkjenn betaling', 'transaksjon'],
  pl: ['płatność', 'zapłać teraz', 'kasa', 'rozliczenie', 'karta kredytowa', 'karta debetowa', 'potwierdź płatność', 'autoryzuj płatność', 'transakcja'],
  cs: ['platba', 'zaplatit nyní', 'pokladna', 'fakturace', 'kreditní karta', 'debetní karta', 'potvrdit platbu', 'autorizovat platbu', 'transakce'],
  tr: ['ödeme', 'şimdi öde', 'ödemeyi tamamla', 'fatura', 'kredi kartı', 'banka kartı', 'ödeme onayı', 'ödemeyi onayla', 'işlem'],
  ru: ['платеж', 'оплата', 'оплатить сейчас', 'оформление заказа', 'банковская карта', 'кредитная карта', 'подтвердить платеж', 'авторизовать платеж', 'транзакция'],
  uk: ['платіж', 'оплата', 'сплатити зараз', 'оформлення замовлення', 'банківська картка', 'кредитна картка', 'підтвердити платіж', 'авторизувати платіж', 'транзакція'],
  ar: ['الدفع', 'ادفع الآن', 'إتمام الشراء', 'الفوترة', 'بطاقة ائتمان', 'بطاقة خصم', 'تأكيد الدفع', 'تفويض الدفع', 'معاملة'],
  hi: ['भुगतान', 'अभी भुगतान करें', 'चेकआउट', 'बिलिंग', 'क्रेडिट कार्ड', 'डेबिट कार्ड', 'भुगतान की पुष्टि', 'भुगतान अधिकृत करें', 'लेनदेन'],
  ja: ['支払い', '今すぐ支払う', 'チェックアウト', '請求', 'クレジットカード', 'デビットカード', '支払いを確認', '支払いを承認', '取引'],
  ko: ['결제', '지금 결제', '체크아웃', '청구', '신용카드', '직불카드', '결제 확인', '결제 승인', '거래'],
  zh: ['支付', '立即支付', '结账', '付款', '账单', '信用卡', '借记卡', '确认付款', '授权付款', '交易'],
})

const BANKING_CONTEXT_TERMS_BY_LANG: Readonly<Record<string, readonly string[]>> = Object.freeze({
  en: ['bank verification', 'banking app', 'bank account', 'bank transfer', 'wire transfer', 'routing number'],
  es: ['verificación bancaria', 'aplicación bancaria', 'cuenta bancaria', 'transferencia bancaria'],
  fr: ['vérification bancaire', 'application bancaire', 'compte bancaire', 'virement bancaire'],
  de: ['bankverifizierung', 'banking app', 'bankkonto', 'banküberweisung'],
  it: ['verifica bancaria', 'app bancaria', 'conto bancario', 'bonifico bancario'],
  pt: ['verificação bancária', 'aplicativo bancário', 'conta bancária', 'transferência bancária'],
  nl: ['bankverificatie', 'bankieren app', 'bankrekening', 'bankoverschrijving'],
  sv: ['bankverifiering', 'bankapp', 'bankkonto', 'banköverföring'],
  fi: ['pankkivahvistus', 'pankkisovellus', 'pankkitili', 'pankkisiirto'],
  da: ['bankbekræftelse', 'bankapp', 'bankkonto', 'bankoverførsel'],
  no: ['bankbekreftelse', 'bankapp', 'bankkonto', 'bankoverføring'],
  pl: ['weryfikacja bankowa', 'aplikacja bankowa', 'konto bankowe', 'przelew bankowy'],
  cs: ['bankovní ověření', 'bankovní aplikace', 'bankovní účet', 'bankovní převod'],
  tr: ['banka doğrulama', 'bankacılık uygulaması', 'banka hesabı', 'banka transferi', 'havale'],
  ru: ['банковская проверка', 'банковское приложение', 'банковский счет', 'банковский перевод'],
  uk: ['банківська перевірка', 'банківський застосунок', 'банківський рахунок', 'банківський переказ'],
  ar: ['التحقق البنكي', 'تطبيق البنك', 'حساب بنكي', 'تحويل بنكي'],
  hi: ['बैंक सत्यापन', 'बैंकिंग ऐप', 'बैंक खाता', 'बैंक ट्रांसफर'],
  ja: ['銀行確認', '銀行アプリ', '銀行口座', '銀行振込'],
  ko: ['은행 인증', '뱅킹 앱', '은행 계좌', '은행 이체'],
  zh: ['银行验证', '银行应用', '银行账户', '银行转账'],
})

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildContextRegex(termsByLang: Readonly<Record<string, readonly string[]>>): RegExp {
  const alternatives = Object.values(termsByLang).flat().map((term) => {
    const escaped = escapeRegExp(term)
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(term)) {
      return escaped
    }
    return `(?<![\\p{L}\\p{M}\\p{N}])${escaped}(?![\\p{L}\\p{M}\\p{N}])`
  })
  return new RegExp(`(${alternatives.join('|')})`, 'ui')
}

const PAYMENT_CONTEXT_REGEX = buildContextRegex(PAYMENT_CONTEXT_TERMS_BY_LANG)
const BANKING_CONTEXT_REGEX = buildContextRegex(BANKING_CONTEXT_TERMS_BY_LANG)

export function isPaymentProviderDomain(domain: string): boolean {
  return PAYMENT_PROVIDER_DOMAINS.has(domain.toLowerCase())
}

function isPaymentProviderHost(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    for (const providerHost of PAYMENT_PROVIDER_HOSTS) {
      if (hostname === providerHost || hostname.endsWith(`.${providerHost}`)) {
        return true
      }
    }
  } catch {
    // Invalid URLs are handled by returning false.
  }
  return false
}

function addReason(reasons: FullAutomationDemotionReason[], reason: FullAutomationDemotionReason): void {
  if (!reasons.includes(reason)) {
    reasons.push(reason)
  }
}

function safeText(element: Element | null, maxLength = 1200): string {
  return (element?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function collectPaymentContextText(url: string, field: HTMLInputElement): string {
  const parts: string[] = []
  parts.push(document.title || '')

  try {
    const parsed = new URL(url)
    parts.push(parsed.pathname.replace(/[\/_-]+/g, ' '))
  } catch {
    // Ignore invalid URLs; domain checks already fail closed.
  }

  parts.push(field.placeholder || '')
  parts.push(field.getAttribute('aria-label') || '')
  parts.push(getAriaDescribedbyText(field))
  parts.push(getAriaLabelledbyText(field))
  parts.push(getExplicitLabelText(field))

  const containers = [
    field.closest('form'),
    field.closest('[role="form"]'),
    field.closest('[role="dialog"]'),
    field.closest('section'),
    field.closest('main'),
    field.parentElement,
  ]

  const seen = new Set<Element>()
  for (const container of containers) {
    if (container && !seen.has(container)) {
      seen.add(container)
      parts.push(safeText(container))
    }
  }

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000)
}

export function getFullAutomationSafety(input: FullAutomationSafetyInput): FullAutomationSafetyResult {
  const reasons: FullAutomationDemotionReason[] = []
  const domain = extractDomain(input.url)

  if (domain) {
    if (isBankingDomain(domain)) {
      addReason(reasons, 'banking-domain')
    }
    if (isPaymentProviderDomain(domain)) {
      addReason(reasons, 'payment-provider-domain')
    }
  }
  if (isPaymentProviderHost(input.url)) {
    addReason(reasons, 'payment-provider-domain')
  }

  const contextText = collectPaymentContextText(input.url, input.field)
  const nonEmailIntent = classifyNonEmailIntent(contextText)
  if (nonEmailIntent.blocked && nonEmailIntent.category === 'payment') {
    addReason(reasons, 'payment-context')
  }
  if (PAYMENT_CONTEXT_REGEX.test(contextText)) {
    addReason(reasons, 'payment-context')
  }
  if (BANKING_CONTEXT_REGEX.test(contextText)) {
    addReason(reasons, 'banking-context')
  }

  return {
    shouldDemote: reasons.length > 0,
    reasons,
  }
}
