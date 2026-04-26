/**
 * Page-level keywords for detecting passwordless sign-in waiting screens.
 *
 * These phrases are matched against page copy (headings, body text) —
 * NOT email body content. They describe what users see in the browser
 * after they submit an email address on a sign-in form, e.g. the
 * "Check your inbox" interstitial shown by Notion, Slack, Vercel, Linear,
 * Auth0, Magic.link, etc.
 *
 * Storage convention: all lowercase. The detector lowercases page text
 * before matching, so casing in source copy is irrelevant.
 *
 * Minimum phrase length: 8 characters (prevents noisy single-word matches).
 *
 * Languages: 21 (ISO 639-1 codes as keys).
 */
export const PASSWORDLESS_PAGE_KEYWORDS_BY_LANG: Readonly<
  Record<string, ReadonlyArray<string>>
> = Object.freeze({
  en: Object.freeze([
    // What users see on the waiting screen
    'check your email',
    'check your inbox',
    'we sent you a sign-in link',
    'we sent you a magic link',
    'we sent a sign-in link',
    'sign-in link sent',
    'magic link sent',
    'passwordless sign in',
    'passwordless login',
    'click the link in your email',
    'click the link in your inbox',
    'click the link to sign in',
    'click the link to log in',
    'a link has been sent',
    'an email is on its way',
    'email on its way',
    'we emailed you a link',
    'check your email to continue',
    'open your email to sign in',
    'sign in without a password',
    'log in without a password',
    'no password needed',
    'no password required',
    'link expires in',
    'link is valid for',
  ]),

  tr: Object.freeze([
    // Turkish sign-in waiting screen copy
    'e-postanızı kontrol edin',
    'gelen kutunuzu kontrol edin',
    'size bir giriş bağlantısı gönderdik',
    'size bir sihirli bağlantı gönderdik',
    'giriş bağlantısı gönderildi',
    'sihirli bağlantı gönderildi',
    'şifresiz giriş',
    'şifre gerektirmeyen giriş',
    'e-postanızdaki bağlantıya tıklayın',
    'giriş yapmak için e-postanızı açın',
    'şifre olmadan giriş yapın',
    'bağlantı gönderildi',
    'e-postanızı kontrol ederek devam edin',
  ]),

  de: Object.freeze([
    // German sign-in waiting screen copy
    'prüfen sie ihre e-mail',
    'schauen sie in ihr postfach',
    'wir haben ihnen einen anmeldelink geschickt',
    'wir haben ihnen einen magic link geschickt',
    'anmeldelink gesendet',
    'magic link gesendet',
    'passwortlose anmeldung',
    'anmeldung ohne passwort',
    'klicken sie auf den link in ihrer e-mail',
    'öffnen sie ihre e-mail, um sich anzumelden',
    'ohne passwort anmelden',
    'der link ist gültig für',
    'link wurde gesendet',
  ]),

  es: Object.freeze([
    // Spanish sign-in waiting screen copy
    'revisa tu correo',
    'revisa tu bandeja de entrada',
    'te enviamos un enlace para acceder',
    'te enviamos un enlace mágico',
    'enlace de acceso enviado',
    'enlace mágico enviado',
    'inicio de sesión sin contraseña',
    'acceso sin contraseña',
    'haz clic en el enlace de tu correo',
    'abre tu correo para iniciar sesión',
    'inicia sesión sin contraseña',
    'el enlace expira en',
    'enlace enviado',
  ]),

  fr: Object.freeze([
    // French sign-in waiting screen copy
    'vérifiez votre e-mail',
    'vérifiez votre boîte de réception',
    'nous vous avons envoyé un lien de connexion',
    'nous vous avons envoyé un lien magique',
    'lien de connexion envoyé',
    'lien magique envoyé',
    'connexion sans mot de passe',
    'authentification sans mot de passe',
    'cliquez sur le lien dans votre e-mail',
    'ouvrez votre e-mail pour vous connecter',
    'connectez-vous sans mot de passe',
    'le lien expire dans',
    'un lien a été envoyé',
  ]),

  it: Object.freeze([
    // Italian sign-in waiting screen copy
    'controlla la tua email',
    'controlla la tua casella di posta',
    'ti abbiamo inviato un link di accesso',
    'ti abbiamo inviato un link magico',
    'link di accesso inviato',
    'link magico inviato',
    'accesso senza password',
    'autenticazione senza password',
    'clicca sul link nella tua email',
    'apri la tua email per accedere',
    'accedi senza password',
    'il link scade tra',
    'link inviato',
  ]),

  pt: Object.freeze([
    // Portuguese sign-in waiting screen copy
    'verifique seu e-mail',
    'verifique sua caixa de entrada',
    'enviamos um link de acesso para você',
    'enviamos um link mágico para você',
    'link de acesso enviado',
    'link mágico enviado',
    'login sem senha',
    'acesso sem senha',
    'clique no link no seu e-mail',
    'abra seu e-mail para entrar',
    'entre sem senha',
    'o link expira em',
    'link enviado',
  ]),

  nl: Object.freeze([
    // Dutch sign-in waiting screen copy
    'controleer je e-mail',
    'controleer je inbox',
    'we stuurden je een inloglink',
    'we stuurden je een magic link',
    'inloglink verzonden',
    'magic link verzonden',
    'wachtwoordloos inloggen',
    'inloggen zonder wachtwoord',
    'klik op de link in je e-mail',
    'open je e-mail om in te loggen',
    'log in zonder wachtwoord',
    'de link verloopt over',
    'link verzonden',
  ]),

  pl: Object.freeze([
    // Polish sign-in waiting screen copy
    'sprawdź swoją pocztę',
    'sprawdź swoją skrzynkę odbiorczą',
    'wysłaliśmy ci link do logowania',
    'wysłaliśmy ci magiczny link',
    'link do logowania wysłany',
    'magiczny link wysłany',
    'logowanie bez hasła',
    'zaloguj się bez hasła',
    'kliknij link w swoim e-mailu',
    'otwórz e-mail, aby się zalogować',
    'link wygasa za',
    'link został wysłany',
  ]),

  ru: Object.freeze([
    // Russian sign-in waiting screen copy
    'проверьте вашу почту',
    'проверьте входящие',
    'мы отправили вам ссылку для входа',
    'мы отправили вам magic link',
    'ссылка для входа отправлена',
    'вход без пароля',
    'войдите без пароля',
    'нажмите на ссылку в письме',
    'откройте письмо для входа',
    'ссылка действительна',
    'ссылка истекает через',
    'войти без пароля',
  ]),

  ja: Object.freeze([
    // Japanese sign-in waiting screen copy
    'メールを確認してください',
    '受信トレイを確認してください',
    'サインインリンクをメールに送りました',
    'マジックリンクを送りました',
    'サインインリンクを送信しました',
    'マジックリンクを送信しました',
    'パスワードなしでサインイン',
    'パスワード不要でログイン',
    'メール内のリンクをクリックしてください',
    'メールを開いてサインインしてください',
    'リンクの有効期限',
    'リンクが送信されました',
  ]),

  zh: Object.freeze([
    // Chinese (Simplified) sign-in waiting screen copy
    '请查看您的电子邮件',
    '请检查您的收件箱',
    '我们向您发送了登录链接',
    '我们向您发送了魔法链接',
    '您的登录链接已发送',
    '您的魔法链接已发送',
    '无需密码即可登录',
    '使用免密码方式登录',
    '请点击邮件中的链接',
    '请打开邮件以完成登录',
    '链接的有效期将在到期',
    '链接有效时间有限',
    '登录链接已成功发送',
  ]),

  ko: Object.freeze([
    // Korean sign-in waiting screen copy
    '이메일을 확인하세요',
    '받은 편지함을 확인하세요',
    '로그인 링크를 이메일로 보냈습니다',
    '매직 링크를 이메일로 보냈습니다',
    '로그인 링크가 전송되었습니다',
    '매직 링크가 전송되었습니다',
    '비밀번호 없이 로그인',
    '비밀번호 없는 로그인',
    '이메일의 링크를 클릭하세요',
    '이메일을 열어 로그인하세요',
    '링크 유효 시간',
    '링크가 전송되었습니다',
  ]),

  ar: Object.freeze([
    // Arabic sign-in waiting screen copy
    'تحقق من بريدك الإلكتروني',
    'تحقق من صندوق الوارد',
    'أرسلنا لك رابط تسجيل الدخول',
    'أرسلنا لك رابطًا سحريًا',
    'تم إرسال رابط تسجيل الدخول',
    'تم إرسال الرابط السحري',
    'تسجيل الدخول بدون كلمة مرور',
    'انقر على الرابط في بريدك الإلكتروني',
    'افتح بريدك الإلكتروني لتسجيل الدخول',
    'صلاحية الرابط تنتهي في غضون',
    'تم إرسال الرابط',
  ]),

  he: Object.freeze([
    // Hebrew sign-in waiting screen copy
    'בדוק את הדואר האלקטרוני שלך',
    'בדוק את תיבת הדואר הנכנס',
    'שלחנו לך קישור להתחברות',
    'שלחנו לך קישור קסם',
    'קישור ההתחברות נשלח',
    'קישור קסם נשלח',
    'התחברות ללא סיסמה',
    'לחץ על הקישור בדואר האלקטרוני',
    'פתח את הדואר האלקטרוני כדי להתחבר',
    'תוקף הקישור פג בעוד',
    'הקישור נשלח',
  ]),

  sv: Object.freeze([
    // Swedish sign-in waiting screen copy
    'kontrollera din e-post',
    'kontrollera din inkorg',
    'vi skickade dig en inloggningslänk',
    'vi skickade dig en magic link',
    'inloggningslänk skickad',
    'magic link skickad',
    'lösenordsfri inloggning',
    'logga in utan lösenord',
    'klicka på länken i ditt e-postmeddelande',
    'öppna din e-post för att logga in',
    'länken går ut om',
    'länk skickad',
  ]),

  da: Object.freeze([
    // Danish sign-in waiting screen copy
    'tjek din e-mail',
    'tjek din indbakke',
    'vi sendte dig et login-link',
    'vi sendte dig et magic link',
    'login-link sendt',
    'magic link sendt',
    'adgangskodefri login',
    'log ind uden adgangskode',
    'klik på linket i din e-mail',
    'åbn din e-mail for at logge ind',
    'linket udløber om',
    'link sendt',
  ]),

  no: Object.freeze([
    // Norwegian sign-in waiting screen copy
    'sjekk e-posten din',
    'sjekk innboksen din',
    'vi sendte deg en innloggingslenke',
    'vi sendte deg en magic link',
    'innloggingslenke sendt',
    'magic link sendt',
    'passordfri pålogging',
    'logg inn uten passord',
    'klikk på lenken i e-posten din',
    'åpne e-posten din for å logge inn',
    'lenken utløper om',
    'lenke sendt',
  ]),

  fi: Object.freeze([
    // Finnish sign-in waiting screen copy
    'tarkista sähköpostisi',
    'tarkista postilaatikkosi',
    'lähetimme sinulle kirjautumislinkin',
    'lähetimme sinulle magic linkin',
    'kirjautumislinkki lähetetty',
    'magic link lähetetty',
    'salasanaton kirjautuminen',
    'kirjaudu ilman salasanaa',
    'napsauta sähköpostissasi olevaa linkkiä',
    'avaa sähköpostisi kirjautuaksesi',
    'linkki vanhenee',
    'linkki lähetetty',
  ]),

  cs: Object.freeze([
    // Czech sign-in waiting screen copy
    'zkontrolujte svůj e-mail',
    'zkontrolujte svou schránku',
    'poslali jsme vám přihlašovací odkaz',
    'poslali jsme vám magic link',
    'přihlašovací odkaz odeslán',
    'magic link odeslán',
    'přihlášení bez hesla',
    'přihlaste se bez hesla',
    'klikněte na odkaz ve svém e-mailu',
    'otevřete e-mail pro přihlášení',
    'odkaz vyprší za',
    'odkaz byl odeslán',
  ]),

  uk: Object.freeze([
    // Ukrainian sign-in waiting screen copy
    'перевірте вашу пошту',
    'перевірте вхідні',
    'ми надіслали вам посилання для входу',
    'ми надіслали вам magic link',
    'посилання для входу надіслано',
    'вхід без пароля',
    'увійдіть без пароля',
    'натисніть на посилання в листі',
    'відкрийте лист для входу',
    'посилання дійсне протягом',
    'посилання надіслано',
  ]),
})
