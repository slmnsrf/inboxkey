import { describe, it, expect } from 'vitest'
import { extractOTPs } from '../extraction/otp-extractor'

describe('Hepsiburada Real-World HTML Test', () => {
  it('should extract code 432961 from full Hepsiburada HTML email', () => {
    const fullHtml = `<div style="margin:0;padding:0"><img src="http://euromessage-livem.ebultenim.com/email/signal/trnrs?Data=1-pI3qrexjwBdkCnb9HU2qvQhPbrbvAgK1pJAUMYBYetClf3H-RDHlkk6aQJcMg2oIbCULAr6opcU4WrljBasf72mhHNCHeAt9Mrb0NzsJdVlTteeDv4CvNoEYgn-coSYysWx_k2i-UvQIaVPI6enXkLM79Czhubi59GUb017saMZtO56mxb_u7aQEDxxqHMM3noO4ai1bivccWMoZoErKGEA-55Gir2kaNA4z47bz-geciNB-wV_SKBBNuHzfZBHJHhAxr264NpJS_JES_yepB85OQFw8QVwbbvrRx2eKQ" style="display:none" border="0" alt="">
<table border="0" cellpadding="0" cellspacing="0" style="width:100%!important">
  <tbody>
    <tr>
      <td style="font-family:sans-serif;font-size:24px;font-weight:bold;line-height:42px;color:#1da1f2;padding-top:16px">Hesabınızı doğrulayın</td>
    </tr>
    <tr>
      <td style="font-family:sans-serif;font-size:14px;font-weight:normal;line-height:21px;color:#646464;padding-top:8px">Değerli müşterimiz</td>
    </tr>
    <tr>
      <td style="font-family:sans-serif;font-size:14px;font-weight:normal;line-height:21px;color:#646464;padding-top:8px">Hesabınızı doğrulayabilmek için, lütfen aşağıdaki kodu giriniz.</td>
    </tr>
    <tr>
      <td style="font-family:sans-serif;font-size:16px;font-weight:700;line-height:24px;color:#484848;padding-top:8px">432961</td>
    </tr>
    <tr>
      <td style="font-family:sans-serif;font-size:14px;font-weight:normal;line-height:21px;color:#646464;padding-top:16px">Bu kodu kimseyle paylaşmayın. Müşteri hizmetlerimiz sizden asla parolanızı, kodu, kredi kartı veya banka bilgilerinizi istemez.</td>
    </tr>
  </tbody>
</table>
</div>`

    const result = extractOTPs(fullHtml)
    
    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('432961')
    expect(result[0].confidence).toBeGreaterThan(0.7)
  })

  it('should extract from text content only', () => {
    const text = `Hesabınızı doğrulayın
Değerli müşterimiz
Hesabınızı doğrulayabilmek için, lütfen aşağıdaki kodu giriniz.
432961
Bu kodu kimseyle paylaşmayın.`

    const result = extractOTPs(text)
    
    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('432961')
  })

  it('should handle bold-styled code in HTML', () => {
    const html = `
      <td style="font-weight:700">432961</td>
      <td>Hesabınızı doğrulayabilmek için kodu giriniz</td>
    `
    
    const result = extractOTPs(html)
    
    expect(result).toHaveLength(1)
    expect(result[0].code).toBe('432961')
  })
})
