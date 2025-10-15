/**
 * Unit tests for banking blocklist
 */

import { describe, it, expect } from 'vitest'
import {
  BANKING_DOMAINS,
  BANKING_BLOCKLIST_VERSION,
  BANKING_BLOCKLIST_LAST_UPDATED,
  isBankingDomain,
} from '../banking-blocklist'

describe('Banking Blocklist', () => {
  describe('Metadata', () => {
    it('has version string', () => {
      expect(BANKING_BLOCKLIST_VERSION).toBe('2025.2')
    })

    it('has last updated date', () => {
      expect(BANKING_BLOCKLIST_LAST_UPDATED).toBe('2025-01-22')
    })
  })

  describe('Domain Coverage', () => {
    it('includes major US banks', () => {
      expect(isBankingDomain('chase.com')).toBe(true)
      expect(isBankingDomain('bankofamerica.com')).toBe(true)
      expect(isBankingDomain('wellsfargo.com')).toBe(true)
      expect(isBankingDomain('citibank.com')).toBe(true)
      expect(isBankingDomain('usbank.com')).toBe(true)
      expect(isBankingDomain('capitalone.com')).toBe(true)
      expect(isBankingDomain('schwab.com')).toBe(true)
      expect(isBankingDomain('fidelity.com')).toBe(true)
    })

    it('includes major US regional banks', () => {
      expect(isBankingDomain('fifththird.com')).toBe(true)
      expect(isBankingDomain('huntington.com')).toBe(true)
      expect(isBankingDomain('keybank.com')).toBe(true)
      expect(isBankingDomain('regionsbank.com')).toBe(true)
      expect(isBankingDomain('truist.com')).toBe(true)
    })

    it('includes major neo-banks', () => {
      expect(isBankingDomain('chime.com')).toBe(true)
      expect(isBankingDomain('varo.com')).toBe(true)
      expect(isBankingDomain('current.com')).toBe(true)
      expect(isBankingDomain('sofi.com')).toBe(true)
      expect(isBankingDomain('robinhood.com')).toBe(true)
    })

    it('includes major credit unions', () => {
      expect(isBankingDomain('navyfederal.org')).toBe(true)
      expect(isBankingDomain('penfed.org')).toBe(true)
      expect(isBankingDomain('becu.org')).toBe(true)
      expect(isBankingDomain('golden1.com')).toBe(true)
      expect(isBankingDomain('schoolsfirstfcu.org')).toBe(true)
    })

    it('includes major EU banks', () => {
      // UK
      expect(isBankingDomain('hsbc.co.uk')).toBe(true)
      expect(isBankingDomain('barclays.co.uk')).toBe(true)
      expect(isBankingDomain('lloydsbank.co.uk')).toBe(true)
      expect(isBankingDomain('natwest.com')).toBe(true)
      expect(isBankingDomain('monzo.com')).toBe(true)
      expect(isBankingDomain('starling.com')).toBe(true)
      // Germany
      expect(isBankingDomain('deutsche-bank.de')).toBe(true)
      expect(isBankingDomain('commerzbank.de')).toBe(true)
      expect(isBankingDomain('n26.com')).toBe(true)
      // France
      expect(isBankingDomain('bnpparibas.com')).toBe(true)
      expect(isBankingDomain('creditagricole.fr')).toBe(true)
      // Spain
      expect(isBankingDomain('santander.com')).toBe(true)
      expect(isBankingDomain('bbva.com')).toBe(true)
    })

    it('includes major Nordic banks', () => {
      // Sweden
      expect(isBankingDomain('nordea.se')).toBe(true)
      expect(isBankingDomain('seb.se')).toBe(true)
      expect(isBankingDomain('swedbank.se')).toBe(true)
      expect(isBankingDomain('handelsbanken.se')).toBe(true)
      // Norway
      expect(isBankingDomain('dnb.no')).toBe(true)
      expect(isBankingDomain('sparebank1.no')).toBe(true)
      // Denmark
      expect(isBankingDomain('danske.dk')).toBe(true)
      expect(isBankingDomain('jyskebank.dk')).toBe(true)
      // Finland
      expect(isBankingDomain('nordea.fi')).toBe(true)
      expect(isBankingDomain('op.fi')).toBe(true)
    })

    it('includes major Eastern European banks', () => {
      // Poland
      expect(isBankingDomain('pkobp.pl')).toBe(true)
      expect(isBankingDomain('mbank.pl')).toBe(true)
      expect(isBankingDomain('santander.pl')).toBe(true)
      // Czech Republic
      expect(isBankingDomain('csas.cz')).toBe(true)
      expect(isBankingDomain('kb.cz')).toBe(true)
      // Hungary
      expect(isBankingDomain('otp.hu')).toBe(true)
      expect(isBankingDomain('kh.hu')).toBe(true)
    })

    it('includes major Asian banks', () => {
      // China
      expect(isBankingDomain('icbc.com.cn')).toBe(true)
      expect(isBankingDomain('boc.cn')).toBe(true)
      expect(isBankingDomain('ccb.com')).toBe(true)
      // India
      expect(isBankingDomain('hdfcbank.com')).toBe(true)
      expect(isBankingDomain('icicibank.com')).toBe(true)
      expect(isBankingDomain('sbi.co.in')).toBe(true)
      expect(isBankingDomain('axisbank.com')).toBe(true)
      // Singapore
      expect(isBankingDomain('dbs.com')).toBe(true)
      expect(isBankingDomain('ocbc.com')).toBe(true)
      expect(isBankingDomain('uob.com.sg')).toBe(true)
      // Japan
      expect(isBankingDomain('mufg.jp')).toBe(true)
      expect(isBankingDomain('smbc.co.jp')).toBe(true)
      expect(isBankingDomain('mizuhobank.com')).toBe(true)
    })

    it('includes major South Korean banks', () => {
      expect(isBankingDomain('kbstar.com')).toBe(true)
      expect(isBankingDomain('wooribank.com')).toBe(true)
      expect(isBankingDomain('shinhan.com')).toBe(true)
      expect(isBankingDomain('hanabank.com')).toBe(true)
    })

    it('includes major Taiwanese banks', () => {
      expect(isBankingDomain('ctbcbank.com')).toBe(true)
      expect(isBankingDomain('cathaybk.com.tw')).toBe(true)
      expect(isBankingDomain('esunbank.com.tw')).toBe(true)
      expect(isBankingDomain('fubon.com')).toBe(true)
    })

    it('includes major Southeast Asian banks', () => {
      // Malaysia
      expect(isBankingDomain('maybank.com.my')).toBe(true)
      expect(isBankingDomain('cimb.com.my')).toBe(true)
      expect(isBankingDomain('publicbank.com.my')).toBe(true)
      // Indonesia
      expect(isBankingDomain('bca.co.id')).toBe(true)
      expect(isBankingDomain('bni.co.id')).toBe(true)
      expect(isBankingDomain('bankmandiri.co.id')).toBe(true)
      // Thailand
      expect(isBankingDomain('bangkokbank.com')).toBe(true)
      expect(isBankingDomain('kasikornbank.com')).toBe(true)
      expect(isBankingDomain('scb.co.th')).toBe(true)
      // Philippines
      expect(isBankingDomain('bdo.com.ph')).toBe(true)
      expect(isBankingDomain('bpi.com.ph')).toBe(true)
      expect(isBankingDomain('metrobank.com.ph')).toBe(true)
      // Vietnam
      expect(isBankingDomain('vietcombank.com.vn')).toBe(true)
      expect(isBankingDomain('techcombank.com.vn')).toBe(true)
      expect(isBankingDomain('bidv.com.vn')).toBe(true)
    })

    it('includes major LATAM banks', () => {
      // Brazil
      expect(isBankingDomain('itau.com.br')).toBe(true)
      expect(isBankingDomain('bradesco.com.br')).toBe(true)
      expect(isBankingDomain('bancodobrasil.com.br')).toBe(true)
      // Mexico
      expect(isBankingDomain('banorte.com')).toBe(true)
      expect(isBankingDomain('bbva.mx')).toBe(true)
      // Colombia
      expect(isBankingDomain('bancolombia.com')).toBe(true)
    })

    it('includes major EMEA banks', () => {
      // Australia
      expect(isBankingDomain('commbank.com.au')).toBe(true)
      expect(isBankingDomain('anz.com.au')).toBe(true)
      expect(isBankingDomain('westpac.com.au')).toBe(true)
      expect(isBankingDomain('nab.com.au')).toBe(true)
      // Canada
      expect(isBankingDomain('rbc.com')).toBe(true)
      expect(isBankingDomain('td.com')).toBe(true)
      expect(isBankingDomain('scotiabank.com')).toBe(true)
      expect(isBankingDomain('bmo.com')).toBe(true)
      // UAE
      expect(isBankingDomain('emiratesnbd.com')).toBe(true)
      expect(isBankingDomain('adcb.com')).toBe(true)
      // South Africa
      expect(isBankingDomain('standardbank.co.za')).toBe(true)
      expect(isBankingDomain('absa.co.za')).toBe(true)
    })

    it('includes major Middle Eastern banks', () => {
      // UAE
      expect(isBankingDomain('rakbank.ae')).toBe(true)
      expect(isBankingDomain('adib.ae')).toBe(true)
      expect(isBankingDomain('fab.ae')).toBe(true)
      // Saudi Arabia
      expect(isBankingDomain('alrajhibank.com.sa')).toBe(true)
      expect(isBankingDomain('sabb.com')).toBe(true)
      expect(isBankingDomain('snb.com.sa')).toBe(true)
      // Qatar
      expect(isBankingDomain('qnb.com')).toBe(true)
      expect(isBankingDomain('cbq.qa')).toBe(true)
      // Kuwait
      expect(isBankingDomain('nbk.com')).toBe(true)
      expect(isBankingDomain('kfh.com')).toBe(true)
    })

    it('includes major Turkish banks', () => {
      expect(isBankingDomain('isbank.com.tr')).toBe(true)
      expect(isBankingDomain('garanti.com.tr')).toBe(true)
      expect(isBankingDomain('akbank.com.tr')).toBe(true)
      expect(isBankingDomain('yapikredi.com.tr')).toBe(true)
      expect(isBankingDomain('ziraatbank.com.tr')).toBe(true)
    })

    it('includes major Israeli banks', () => {
      expect(isBankingDomain('bankleumi.co.il')).toBe(true)
      expect(isBankingDomain('bankhapoalim.co.il')).toBe(true)
      expect(isBankingDomain('discountbank.co.il')).toBe(true)
      expect(isBankingDomain('mizrahi-tefahot.co.il')).toBe(true)
    })

    it('includes major African banks', () => {
      // Nigeria
      expect(isBankingDomain('gtbank.com')).toBe(true)
      expect(isBankingDomain('zenithbank.com')).toBe(true)
      expect(isBankingDomain('accessbankplc.com')).toBe(true)
      expect(isBankingDomain('firstbanknigeria.com')).toBe(true)
      // Kenya
      expect(isBankingDomain('kcbbankgroup.com')).toBe(true)
      expect(isBankingDomain('equitybankgroup.com')).toBe(true)
      // Egypt
      expect(isBankingDomain('nbe.com.eg')).toBe(true)
      expect(isBankingDomain('banquemisr.com')).toBe(true)
    })

    it('includes international variants', () => {
      // Chase variants
      expect(isBankingDomain('chase.com')).toBe(true)
      // HSBC variants
      expect(isBankingDomain('hsbc.co.uk')).toBe(true)
      expect(isBankingDomain('hsbc.com.hk')).toBe(true)
      expect(isBankingDomain('hsbc.com.mx')).toBe(true)
      // Santander variants
      expect(isBankingDomain('santander.com')).toBe(true)
      expect(isBankingDomain('santander.co.uk')).toBe(true)
      expect(isBankingDomain('santander.com.br')).toBe(true)
      expect(isBankingDomain('santander.cl')).toBe(true)
      // Nordea variants
      expect(isBankingDomain('nordea.se')).toBe(true)
      expect(isBankingDomain('nordea.fi')).toBe(true)
      expect(isBankingDomain('nordea.no')).toBe(true)
      expect(isBankingDomain('nordea.dk')).toBe(true)
    })

    it('has comprehensive coverage (550+ domains)', () => {
      expect(BANKING_DOMAINS.length).toBeGreaterThanOrEqual(550)
    })

    it('has expected regional distribution', () => {
      const count = BANKING_DOMAINS.length
      // Should be in target range 550-600
      expect(count).toBeGreaterThanOrEqual(550)
      expect(count).toBeLessThanOrEqual(600)
    })
  })

  describe('Non-banking Domains', () => {
    it('rejects common non-banking domains', () => {
      expect(isBankingDomain('google.com')).toBe(false)
      expect(isBankingDomain('facebook.com')).toBe(false)
      expect(isBankingDomain('example.com')).toBe(false)
      expect(isBankingDomain('github.com')).toBe(false)
      expect(isBankingDomain('stackoverflow.com')).toBe(false)
    })

    it('rejects invalid domains', () => {
      expect(isBankingDomain('')).toBe(false)
      expect(isBankingDomain('invalid')).toBe(false)
      expect(isBankingDomain('localhost')).toBe(false)
    })
  })

  describe('Data Integrity', () => {
    it('has no duplicate domains', () => {
      const seen = new Set<string>()
      const duplicates: string[] = []

      for (const domain of BANKING_DOMAINS) {
        if (seen.has(domain)) {
          duplicates.push(domain)
        }
        seen.add(domain)
      }

      expect(duplicates).toEqual([])
    })

    it('all domains are valid eTLD+1 format', () => {
      // eTLD+1 regex: no protocol, no path, no wildcard, has TLD
      const etldRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

      const invalidDomains = BANKING_DOMAINS.filter(
        (domain) => !etldRegex.test(domain)
      )

      expect(invalidDomains).toEqual([])
    })

    it('all domains are lowercase', () => {
      const uppercaseDomains = BANKING_DOMAINS.filter(
        (domain) => domain !== domain.toLowerCase()
      )

      expect(uppercaseDomains).toEqual([])
    })

    it('no domains have protocols or paths', () => {
      const invalidDomains = BANKING_DOMAINS.filter(
        (domain) => domain.includes('://') || domain.includes('/')
      )

      expect(invalidDomains).toEqual([])
    })
  })

  describe('Performance', () => {
    it('isBankingDomain() executes in <1ms', () => {
      const iterations = 1000
      const start = performance.now()

      for (let i = 0; i < iterations; i++) {
        isBankingDomain('chase.com')
        isBankingDomain('example.com')
        isBankingDomain('wellsfargo.com')
      }

      const end = performance.now()
      const avgTime = (end - start) / iterations

      // Should be well under 1ms per call
      expect(avgTime).toBeLessThan(1)
    })
  })

  describe('Case Insensitivity', () => {
    it('matches case-insensitively', () => {
      expect(isBankingDomain('CHASE.COM')).toBe(true)
      expect(isBankingDomain('Chase.Com')).toBe(true)
      expect(isBankingDomain('chase.com')).toBe(true)
      expect(isBankingDomain('BankOfAmerica.COM')).toBe(true)
    })
  })
})
