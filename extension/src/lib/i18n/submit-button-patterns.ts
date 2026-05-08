/**
 * Multi-language submit button patterns for auto-submit detection
 *
 * Aligned with extraction-core language coverage for consistency.
 * Safety-first: dangerous patterns block auto-submit regardless of safe matches.
 */

/**
 * Safe button text patterns by language
 * These patterns indicate a button is safe to auto-click
 */
export const SUBMIT_BUTTON_PATTERNS_BY_LANG: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  en: ['verify', 'submit', 'continue', 'confirm', 'next', 'send', 'sign in', 'log in', 'login', 'signin'],
  es: ['verificar', 'enviar', 'continuar', 'confirmar', 'siguiente', 'iniciar sesión', 'conectarse'],
  fr: ['vérifier', 'soumettre', 'continuer', 'confirmer', 'suivant', 'se connecter', 'connexion'],
  de: ['verifizieren', 'absenden', 'weiter', 'bestätigen', 'nächste', 'anmelden', 'einloggen'],
  it: ['verifica', 'invia', 'continua', 'conferma', 'prossimo', 'accedi', 'accesso'],
  pt: ['verificar', 'enviar', 'continuar', 'confirmar', 'próximo', 'entrar', 'login'],
  nl: ['verifiëren', 'verzenden', 'doorgaan', 'bevestigen', 'volgende', 'inloggen', 'aanmelden'],
  sv: ['verifiera', 'skicka', 'fortsätt', 'bekräfta', 'nästa', 'logga in', 'inloggning'],
  fi: ['vahvista', 'lähetä', 'jatka', 'seuraava', 'kirjaudu', 'kirjautuminen'],
  da: ['verificer', 'send', 'fortsæt', 'bekræft', 'næste', 'log ind', 'login'],
  no: ['bekreft', 'send', 'fortsett', 'neste', 'logg inn', 'innlogging'],
  pl: ['weryfikuj', 'wyślij', 'kontynuuj', 'potwierdź', 'dalej', 'zaloguj', 'logowanie'],
  cs: ['ověřit', 'odeslat', 'pokračovat', 'potvrdit', 'další', 'přihlásit', 'přihlášení'],
  tr: ['doğrula', 'gönder', 'devam', 'onayla', 'sonraki', 'giriş', 'oturum aç'],
  ru: ['проверить', 'отправить', 'продолжить', 'подтвердить', 'далее', 'войти', 'вход'],
  uk: ['перевірити', 'надіслати', 'продовжити', 'підтвердити', 'далі', 'увійти', 'вхід'],
  ar: ['تحقق', 'إرسال', 'متابعة', 'تأكيد', 'التالي', 'تسجيل الدخول', 'دخول'],
  hi: ['सत्यापित करें', 'जमा करें', 'जारी रखें', 'पुष्टि करें', 'अगला', 'भेजें', 'लॉगिन', 'साइन इन'],
  ja: ['確認', '送信', '続ける', '次へ', 'ログイン', 'サインイン'],
  ko: ['확인', '제출', '계속', '다음', '로그인', '로그인하기'],
  zh: ['验证', '提交', '继续', '确认', '下一步', '登录', '登入']
})

/**
 * Dangerous button text patterns by language
 * These patterns indicate a button should NEVER be auto-clicked
 */
export const DANGEROUS_BUTTON_PATTERNS_BY_LANG: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  en: ['cancel', 'clear', 'close account', 'deactivate', 'delete', 'delete account', 'delete payment', 'deny', 'log out', 'logout', 'opt out', 'reject', 'remove', 'remove card', 'request new code', 'resend', 'resend code', 'reset password', 'send again', 'sign out', 'signout', 'unsubscribe'],
  es: ['borrar', 'cancelar', 'cerrar cuenta', 'cerrar sesión', 'desactivar', 'deshacerse', 'eliminar', 'eliminar cuenta', 'eliminar pago', 'enviar de nuevo', 'negar', 'nuevo código', 'rechazar', 'reenviar', 'reenviar código', 'remover tarjeta', 'restablecer contraseña', 'salir'],
  fr: ['annuler', 'déconnexion', 'désactiver', 'désabonner', 'effacer', 'envoyer à nouveau', 'fermer compte', 'nouveau code', 'refuser', 'rejeter', 'renvoyer', 'renvoyer le code', 'réinitialiser mot de passe', 'retirer carte', 'se déconnecter', 'supprimer', 'supprimer compte', 'supprimer paiement'],
  de: ['abbrechen', 'ablehnen', 'abmelden', 'ausloggen', 'code erneut anfordern', 'code erneut senden', 'deaktivieren', 'entfernen', 'erneut senden', 'karte entfernen', 'konto löschen', 'konto schließen', 'löschen', 'neuen code', 'passwort zurücksetzen', 'verweigern', 'zahlung löschen', 'zurückweisen'],
  it: ['annulla', 'chiudi account', 'disiscrivi', 'disattiva', 'disconnetti', 'elimina', 'elimina account', 'elimina pagamento', 'esci', 'invia di nuovo', 'nega', 'nuovo codice', 'reimposta password', 'reinvia', 'reinvia codice', 'rifiuta', 'rimuovi', 'rimuovi carta'],
  pt: ['cancelar', 'desativar', 'desconectar', 'enviar novamente', 'excluir', 'excluir conta', 'excluir pagamento', 'fechar conta', 'negar', 'novo código', 'recusar', 'redefinir senha', 'reenviar', 'reenviar código', 'remover', 'remover cartão', 'sair'],
  nl: ['afmelden', 'annuleren', 'code opnieuw verzenden', 'deactiveren', 'nieuwe code', 'opnieuw verzenden', 'opzeggen', 'uitloggen', 'verwijder', 'verwijder account', 'verwijder betaling', 'wachtwoord resetten', 'weigeren', 'wissen'],
  sv: ['avbryt', 'avregistrera', 'avsluta konto', 'avvisa', 'deaktivera', 'logga ut', 'neka', 'ny kod', 'radera', 'radera betalning', 'radera konto', 'skicka igen', 'skicka kod igen', 'ta bort', 'ta bort kort', 'återställ lösenord'],
  fi: ['hylkää', 'kirjaudu ulos', 'lopeta tilaus', 'lähetä uudelleen', 'peruuta', 'poista', 'poista kortti', 'poista maksu', 'poista tili', 'sulje tili', 'uusi koodi', 'älä hyväksy'],
  da: ['afmeld', 'afvis', 'annuller', 'deaktiver', 'fjern', 'fjern betaling', 'fjern kort', 'log ud', 'luk konto', 'ny kode', 'nulstil adgangskode', 'send igen', 'slet', 'slet konto'],
  no: ['avbryt', 'avmeld', 'avvis', 'deaktiver', 'fjern', 'fjern betaling', 'fjern kort', 'logg ut', 'lukk konto', 'nekt', 'ny kode', 'send på nytt', 'slett', 'slett konto', 'tilbakestill passord'],
  pl: ['anuluj', 'dezaktywuj', 'nowy kod', 'odrzuć', 'rezygnuj', 'usuń', 'usuń konto', 'usuń kartę', 'usuń płatność', 'wyloguj', 'wyślij ponownie', 'zamknij konto', 'zresetuj hasło'],
  cs: ['deaktivovat', 'nový kód', 'odeslat znovu', 'odhlásit', 'odmítnout', 'odhlásit odběr', 'odstranit kartu', 'smazat', 'smazat platbu', 'smazat účet', 'zavřít účet', 'zrušit'],
  tr: ['devre dışı bırak', 'hesabı sil', 'iptal', 'kapat hesap', 'kartı kaldır', 'kodu tekrar gönder', 'reddet', 'sil', 'tekrar gönder', 'yeni kod', 'ödemeyi sil', 'şifre sıfırla', 'çıkış'],
  ru: ['выйти', 'деактивировать', 'закрыть аккаунт', 'новый код', 'отказаться', 'отклонить', 'отменить', 'отправить код повторно', 'отправить повторно', 'сбросить пароль', 'удалить', 'удалить аккаунт', 'удалить карту', 'удалить платеж'],
  uk: ['видалити', 'видалити акаунт', 'видалити картку', 'видалити платіж', 'вийти', 'відхилити', 'деактивувати', 'закрити акаунт', 'надіслати повторно', 'новий код', 'скасувати', 'скинути пароль'],
  ar: ['إلغاء', 'إلغاء الاشتراك', 'إعادة الإرسال', 'إعادة تعيين كلمة المرور', 'أرسل مرة أخرى', 'تسجيل الخروج', 'حذف', 'حذف الحساب', 'حذف الدفع', 'رفض', 'رمز جديد', 'إزالة البطاقة', 'تعطيل', 'إغلاق الحساب'],
  hi: ['अस्वीकार करें', 'कार्ड हटाएं', 'खाता बंद करें', 'खाता हटाएं', 'नया कोड', 'निष्क्रिय करें', 'पासवर्ड रीसेट', 'फिर से भेजें', 'भुगतान हटाएं', 'रद्द करें', 'लॉगआउट', 'साइन आउट', 'हटाएं'],
  ja: ['キャンセル', 'コードを再送信', 'サインアウト', 'パスワードリセット', 'ログアウト', '再送信', '削除', '拒否', '支払い削除', '新しいコード', '無効化', '登録解除', '解約', 'アカウント削除', 'カード削除', 'アカウント閉鎖'],
  ko: ['거부', '계정 삭제', '계정 폐쇄', '구독 취소', '다시 보내기', '로그아웃', '비밀번호 재설정', '비활성화', '삭제', '새 코드', '카드 삭제', '취소', '코드 재전송', '결제 삭제'],
  zh: ['重新发送', '重发', '删除', '删除账户', '删除支付', '关闭账户', '取消', '取消订阅', '拒绝', '新验证码', '注销', '禁用', '移除卡片', '退出', '重置密码']
})

/**
 * Build a combined regex pattern from all languages
 */
function buildCombinedPattern(patterns: typeof SUBMIT_BUTTON_PATTERNS_BY_LANG): RegExp {
  const allPatterns = Object.values(patterns).flat()
  const patternAlternatives = allPatterns.map((pattern) => {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

    // Require Unicode letter/number boundaries for spaced-word scripts so
    // "send" does not match "resend". Compact CJK/Korean/Japanese labels
    // still match inside common button text such as "ログインする".
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(pattern)) {
      return escaped
    }

    return `(?<![\\p{L}\\p{M}\\p{N}])${escaped}(?![\\p{L}\\p{M}\\p{N}])`
  })

  return new RegExp(`(${patternAlternatives.join('|')})`, 'ui')
}

/**
 * Pre-compiled regex for safe patterns (all languages)
 */
export const SAFE_PATTERN_REGEX = buildCombinedPattern(SUBMIT_BUTTON_PATTERNS_BY_LANG)

/**
 * Pre-compiled regex for dangerous patterns (all languages)
 */
export const DANGEROUS_PATTERN_REGEX = buildCombinedPattern(DANGEROUS_BUTTON_PATTERNS_BY_LANG)

/**
 * Test if text matches any safe submit pattern
 */
export function matchesSafePattern(text: string): boolean {
  return SAFE_PATTERN_REGEX.test(text)
}

/**
 * Test if text matches any dangerous pattern
 */
export function matchesDangerousPattern(text: string): boolean {
  return DANGEROUS_PATTERN_REGEX.test(text)
}
