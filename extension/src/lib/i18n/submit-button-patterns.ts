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
  he: ['אמת', 'שלח', 'המשך', 'אשר', 'הבא', 'התחבר', 'כניסה'],
  ja: ['確認', '送信', '続ける', '次へ', 'ログイン', 'サインイン'],
  ko: ['확인', '제출', '계속', '다음', '로그인', '로그인하기'],
  zh: ['验证', '提交', '继续', '确认', '下一步', '登录', '登入']
})

/**
 * Dangerous button text patterns by language
 * These patterns indicate a button should NEVER be auto-clicked
 */
export const DANGEROUS_BUTTON_PATTERNS_BY_LANG: Readonly<Record<string, ReadonlyArray<string>>> = Object.freeze({
  en: ['cancel', 'clear', 'close account', 'deactivate', 'delete', 'delete account', 'delete payment', 'deny', 'log out', 'logout', 'opt out', 'reject', 'remove', 'remove card', 'reset password', 'sign out', 'signout', 'unsubscribe'],
  es: ['borrar', 'cancelar', 'cerrar cuenta', 'cerrar sesión', 'desactivar', 'deshacerse', 'eliminar', 'eliminar cuenta', 'eliminar pago', 'negar', 'rechazar', 'remover tarjeta', 'restablecer contraseña', 'salir'],
  fr: ['annuler', 'déconnexion', 'désactiver', 'désabonner', 'effacer', 'fermer compte', 'refuser', 'rejeter', 'réinitialiser mot de passe', 'retirer carte', 'se déconnecter', 'supprimer', 'supprimer compte', 'supprimer paiement'],
  de: ['abbrechen', 'ablehnen', 'abmelden', 'ausloggen', 'deaktivieren', 'entfernen', 'karte entfernen', 'konto löschen', 'konto schließen', 'löschen', 'passwort zurücksetzen', 'verweigern', 'zahlung löschen', 'zurückweisen'],
  it: ['annulla', 'chiudi account', 'disiscrivi', 'disattiva', 'disconnetti', 'elimina', 'elimina account', 'elimina pagamento', 'esci', 'nega', 'reimposta password', 'rifiuta', 'rimuovi', 'rimuovi carta'],
  pt: ['cancelar', 'desativar', 'desconectar', 'excluir', 'excluir conta', 'excluir pagamento', 'fechar conta', 'negar', 'recusar', 'redefinir senha', 'remover', 'remover cartão', 'sair'],
  nl: ['afmelden', 'annuleren', 'deactiveren', 'opzeggen', 'uitloggen', 'verwijder', 'verwijder account', 'verwijder betaling', 'wachtwoord resetten', 'weigeren', 'wissen'],
  sv: ['avbryt', 'avregistrera', 'avsluta konto', 'avvisa', 'deaktivera', 'logga ut', 'neka', 'radera', 'radera betalning', 'radera konto', 'ta bort', 'ta bort kort', 'återställ lösenord'],
  fi: ['hylkää', 'kirjaudu ulos', 'lopeta tilaus', 'peruuta', 'poista', 'poista kortti', 'poista maksu', 'poista tili', 'sulje tili', 'älä hyväksy'],
  da: ['afmeld', 'afvis', 'annuller', 'deaktiver', 'fjern', 'fjern betaling', 'fjern kort', 'log ud', 'luk konto', 'nulstil adgangskode', 'slet', 'slet konto'],
  no: ['avbryt', 'avmeld', 'avvis', 'deaktiver', 'fjern', 'fjern betaling', 'fjern kort', 'logg ut', 'lukk konto', 'nekt', 'slett', 'slett konto', 'tilbakestill passord'],
  pl: ['anuluj', 'dezaktywuj', 'odrzuć', 'rezygnuj', 'usuń', 'usuń konto', 'usuń kartę', 'usuń płatność', 'wyloguj', 'zamknij konto', 'zresetuj hasło'],
  cs: ['deaktivovat', 'odhlásit', 'odmítnout', 'odhlásit odběr', 'odstranit kartu', 'smazat', 'smazat platbu', 'smazat účet', 'zavřít účet', 'zrušit'],
  tr: ['devre dışı bırak', 'iptal', 'kapat hesap', 'kartı kaldır', 'ödemeyi sil', 'reddet', 'sil', 'hesabı sil', 'şifre sıfırla', 'çıkış'],
  ru: ['выйти', 'деактивировать', 'закрыть аккаунт', 'отказаться', 'отклонить', 'отменить', 'сбросить пароль', 'удалить', 'удалить аккаунт', 'удалить карту', 'удалить платеж'],
  uk: ['видалити', 'видалити акаунт', 'видалити картку', 'видалити платіж', 'вийти', 'відхилити', 'деактивувати', 'закрити акаунт', 'скасувати', 'скинути пароль'],
  ar: ['إلغاء', 'إلغاء الاشتراك', 'إعادة تعيين كلمة المرور', 'تسجيل الخروج', 'حذف', 'حذف الحساب', 'حذف الدفع', 'رفض', 'إزالة البطاقة', 'تعطيل', 'إغلاق الحساب'],
  he: ['איפוס סיסמה', 'ביטול', 'ביטול הרשמה', 'דחה', 'הסר', 'הסר כרטיס', 'השבת', 'התנתק', 'מחק', 'מחק חשבון', 'מחק תשלום', 'סגור חשבון'],
  ja: ['キャンセル', 'サインアウト', 'パスワードリセット', 'ログアウト', '削除', '拒否', '支払い削除', '無効化', '登録解除', '解約', 'アカウント削除', 'カード削除', 'アカウント閉鎖'],
  ko: ['거부', '계정 삭제', '계정 폐쇄', '구독 취소', '로그아웃', '비밀번호 재설정', '비활성화', '삭제', '카드 삭제', '취소', '결제 삭제'],
  zh: ['删除', '删除账户', '删除支付', '关闭账户', '取消', '取消订阅', '拒绝', '注销', '禁用', '移除卡片', '退出', '重置密码']
})

/**
 * Build a combined regex pattern from all languages
 */
function buildCombinedPattern(patterns: typeof SUBMIT_BUTTON_PATTERNS_BY_LANG): RegExp {
  const allPatterns = Object.values(patterns).flat()
  // Escape special regex characters and join with |
  const escapedPatterns = allPatterns.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  // Use word boundaries for Latin scripts, but allow matching anywhere for non-Latin scripts
  // Word boundaries (\b) only work with ASCII [a-zA-Z0-9_], not with Chinese, Arabic, Cyrillic, etc.
  // Instead, we'll match the pattern anywhere in the string (case-insensitive)
  // The 'u' flag enables proper Unicode matching for non-Latin scripts (Chinese, Arabic, Cyrillic, etc.)
  return new RegExp(`(${escapedPatterns.join('|')})`, 'ui')
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
