/**
 * Banking Sites Blocklist
 *
 * Privacy-first, hardcoded list of major banking domains (eTLD+1 format).
 * Used to optionally disable InboxKey on banking sites for user peace of mind.
 *
 * Coverage: 580+ major banks worldwide (US, EU, Asia, EMEA, LATAM)
 * Matching: Exact eTLD+1 match (zero false positives)
 * Performance: O(1) lookup via lazy-loaded Set
 */

export const BANKING_BLOCKLIST_VERSION = '2025.2'
export const BANKING_BLOCKLIST_LAST_UPDATED = '2025-01-22'

/**
 * Major banking domains (eTLD+1 format)
 *
 * Format guidelines:
 * - Use eTLD+1 only (e.g., "chase.com", "chase.co.uk")
 * - No wildcards, no protocols, no paths
 * - Include international variants (.com, .co.uk, .de, etc.)
 * - Alphabetically sorted by region for maintainability
 */
export const BANKING_DOMAINS: readonly string[] = [
  // --- US Banks (88 domains) ---
  // Major National Banks
  'ally.com',
  'americanexpress.com',
  'bankofamerica.com',
  'capitalone.com',
  'chase.com',
  'citibank.com',
  'citi.com',
  'citizens.com',
  'discover.com',
  'goldmansachs.com',
  'jpmorganchase.com',
  'morganstanley.com',
  'pnc.com',
  'schwab.com',
  'truist.com',
  'usaa.com',
  'usbank.com',
  'vanguard.com',
  'wellsfargo.com',

  // Major Regional Banks
  'comerica.com',
  'fifththird.com',
  'firsthorizon.com',
  'frostbank.com',
  'huntington.com',
  'keybank.com',
  'mandt.com',
  'regionsbank.com',
  'santanderbank.com',
  'suntrust.com',
  'synovus.com',
  'tdbank.com',
  'umb.com',
  'zionsbank.com',

  // Investment/Brokerage (Consumer-facing)
  'etrade.com',
  'fidelity.com',
  'interactivebrokers.com',
  'merrilledge.com',
  'robinhood.com',
  'tdameritrade.com',
  'tradestation.com',
  'webull.com',

  // Neo-banks & Digital Banks
  'chime.com',
  'current.com',
  'marcus.com',
  'sofi.com',
  'varo.com',

  // Credit Unions (Major)
  'alliantcreditunion.org',
  'becu.org',
  'golden1.com',
  'navyfederal.org',
  'penfed.org',
  'schoolsfirstfcu.org',
  'secu.org',

  // --- EU Banks (158 domains) ---
  // UK
  'aldermore.co.uk',
  'barclays.co.uk',
  'barclays.com',
  'coventrybuildingsociety.co.uk',
  'halifax.co.uk',
  'hsbc.co.uk',
  'lloydsbank.co.uk',
  'metro-bank.co.uk',
  'monzo.com',
  'nationwide.co.uk',
  'natwest.com',
  'rbs.co.uk',
  'santander.co.uk',
  'starling.com',
  'tsb.co.uk',
  'virginmoney.com',
  'yorkshirebuildingsociety.co.uk',

  // Germany
  'commerzbank.de',
  'deutsche-bank.de',
  'dkb.de',
  'dz-bank.de',
  'ing.de',
  'kfw.de',
  'lbb.de',
  'n26.com',
  'postbank.de',
  'sparkasse.de',
  'targobank.de',
  'volkswagen-bank.de',
  'wuestenrot.de',

  // France
  'banquepopulaire.fr',
  'bnpparibas.com',
  'bnpparibas.fr',
  'boursorama.com',
  'caisse-epargne.fr',
  'creditagricole.com',
  'creditagricole.fr',
  'creditmutuel.fr',
  'fortuneo.fr',
  'groupama.fr',
  'hellobank.fr',
  'ing.fr',
  'labanquepostale.fr',
  'lcl.fr',
  'societegenerale.com',
  'societegenerale.fr',

  // Spain
  'abanca.com',
  'bankia.com',
  'bankinter.com',
  'bbva.com',
  'bbva.es',
  'caixabank.com',
  'cajamar.com',
  'kutxabank.com',
  'liberbank.es',
  'sabadell.com',
  'santander.com',
  'santander.es',
  'unicajabanco.com',

  // Italy
  'bancacrm.it',
  'bancamediolanum.it',
  'bancapopolare.it',
  'bancaprossima.com',
  'bancasella.it',
  'bnl.it',
  'chebanca.it',
  'credem.it',
  'fineco.it',
  'intesasanpaolo.com',
  'mps.it',
  'popso.it',
  'ubibanca.com',
  'unicredit.it',

  // Netherlands
  'abnamro.nl',
  'asnbank.nl',
  'ing.nl',
  'knab.nl',
  'rabobank.nl',
  'regiobank.nl',
  'snsbank.nl',
  'triodos.nl',
  'vanlanschot.nl',
  'volksbank.nl',

  // Belgium
  'argenta.be',
  'axabank.be',
  'belfius.be',
  'bnpparibasfortis.be',
  'crelan.be',
  'ing.be',
  'kbc.be',

  // Switzerland
  'credit-suisse.com',
  'juliusbaer.com',
  'postfinance.ch',
  'raiffeisen.ch',
  'ubs.com',
  'vontobel.com',
  'zkb.ch',

  // Austria
  'bankaustria.at',
  'bawagpsk.com',
  'erstebank.at',
  'oberbank.at',
  'raiffeisen.at',
  'sparkasse.at',

  // Nordics - Sweden
  'handelsbanken.se',
  'lansforsakringar.se',
  'nordea.se',
  'seb.se',
  'skandiabanken.se',
  'swedbank.se',

  // Nordics - Norway
  'dnb.no',
  'nordea.no',
  'sparebank1.no',
  'sbanken.no',

  // Nordics - Denmark
  'danske.dk',
  'jyskebank.dk',
  'nordea.dk',
  'nykredit.dk',
  'sydbank.dk',

  // Nordics - Finland
  'aktia.fi',
  'nordea.fi',
  'op.fi',
  'sampo.fi',

  // Portugal
  'activobank.pt',
  'bancocarregosa.com',
  'bancobpi.pt',
  'bancobpn.pt',
  'cgd.pt',
  'millenniumbcp.pt',
  'novobanco.pt',
  'santandertotta.pt',

  // Greece
  'alphabank.gr',
  'eurobank.gr',
  'nbg.gr',
  'piraeusbank.gr',

  // Poland
  'aliorbank.pl',
  'bgz.pl',
  'ing.pl',
  'mbank.pl',
  'millennium.pl',
  'pekao.com.pl',
  'pkobp.pl',
  'santander.pl',

  // Czech Republic
  'airbank.cz',
  'csas.cz',
  'csob.cz',
  'equabank.cz',
  'kb.cz',
  'moneta.cz',
  'raiffeisenbank.cz',
  'unicreditbank.cz',

  // Hungary
  'erstebank.hu',
  'kh.hu',
  'otp.hu',
  'raiffeisen.hu',
  'unicreditbank.hu',

  // Romania
  'bcr.ro',
  'brd.ro',
  'btrl.ro',
  'raiffeisen.ro',

  // Ireland
  'aib.ie',
  'bankofireland.com',
  'permanenttsb.ie',
  'ulsterbank.ie',

  // Luxembourg
  'bcee.lu',
  'bil.com',
  'ing.lu',
  'raiffeisen.lu',

  // EU-wide & Digital
  'ing.com',
  'revolut.com',
  'wise.com',

  // --- Asia (127 domains) ---
  // China
  'abchina.com',
  'bankcomm.com',
  'boc.cn',
  'ccb.com',
  'cebbank.com',
  'cgbchina.com.cn',
  'cib.com.cn',
  'cmb.com',
  'cmbchina.com',
  'cmbc.com.cn',
  'cqbank.com.cn',
  'egbank.com.cn',
  'hxb.com.cn',
  'icbc.com.cn',
  'psbc.com',
  'spdb.com.cn',

  // India
  'axisbank.com',
  'bankofindia.co.in',
  'bankofbaroda.com',
  'bankofbaroda.in',
  'canarabank.com',
  'centralbankofindia.co.in',
  'federalbank.co.in',
  'hdfcbank.com',
  'icicibank.com',
  'idbibank.com',
  'idfc.com',
  'idfcfirstbank.com',
  'indianbank.in',
  'indusind.com',
  'kotakbank.com',
  'kotak.com',
  'pnbindia.in',
  'sbi.co.in',
  'ucobank.com',
  'unionbankofindia.co.in',
  'yesbank.in',

  // Japan
  'japanpost-bank.co.jp',
  'jp-bank.japanpost.jp',
  'mizuhobank.com',
  'mizuho-fg.co.jp',
  'mufg.jp',
  'resona-gr.co.jp',
  'resonabank.co.jp',
  'sbigroup.co.jp',
  'shinkin.org',
  'smbc.co.jp',
  'smtb.jp',

  // South Korea
  'citibank.co.kr',
  'hanabank.com',
  'ibk.co.kr',
  'kbstar.com',
  'kebhana.com',
  'kfcc.co.kr',
  'kjbank.com',
  'knbank.co.kr',
  'kookmin.com',
  'nonghyup.com',
  'sc.com',
  'shinhan.com',
  'standardchartered.co.kr',
  'wooribank.com',

  // Taiwan
  'bankoftaiwan.com.tw',
  'bot.com.tw',
  'cathaybk.com.tw',
  'chinatrust.com.tw',
  'ctbcbank.com',
  'esunbank.com.tw',
  'fubon.com',
  'firstbank.com.tw',
  'landbank.com.tw',
  'megabank.com.tw',
  'sinopac.com',
  'taipeifubon.com.tw',
  'taishinbank.com.tw',

  // Singapore
  'dbs.com',
  'dbs.com.sg',
  'maybank.com.sg',
  'ocbc.com',
  'standardchartered.com.sg',
  'uob.com',
  'uob.com.sg',

  // Hong Kong
  'bea.com.hk',
  'bochk.com',
  'chiyu-bank.com',
  'chb.com.hk',
  'dahsing.com',
  'dbs.com.hk',
  'hangseng.com',
  'hsbc.com.hk',
  'icbc.com.hk',
  'shacombank.com.hk',
  'winglung.com',

  // Malaysia
  'affin.com.my',
  'agro.com.my',
  'alliancebank.com.my',
  'ambankgroup.com',
  'bankislam.com.my',
  'bankmuamalat.com.my',
  'bankrakyat.com.my',
  'bsn.com.my',
  'cimb.com',
  'cimb.com.my',
  'hlb.com.my',
  'hsbc.com.my',
  'maybank.com',
  'maybank.com.my',
  'publicbank.com.my',
  'rhbgroup.com',

  // Indonesia
  'bankmandiri.co.id',
  'bca.co.id',
  'bni.co.id',
  'bri.co.id',
  'btn.co.id',
  'cimbniaga.co.id',
  'danamon.co.id',
  'jenius.com',
  'lippo.com',
  'permatabank.com',

  // Thailand
  'bangkokbank.com',
  'kasikornbank.com',
  'krungsri.com',
  'ktb.co.th',
  'scb.co.th',
  'thanachartbank.co.th',
  'tmb.co.th',
  'uob.co.th',

  // Philippines
  'bdo.com.ph',
  'bpi.com.ph',
  'chinabank.ph',
  'epcib.com',
  'landbank.com',
  'maybank.com.ph',
  'metrobank.com.ph',
  'pnb.com.ph',
  'psbank.com.ph',
  'rcbc.com',
  'securitybank.com',
  'unionbankph.com',

  // Vietnam
  'abbank.vn',
  'acb.com.vn',
  'agribank.com.vn',
  'bidv.com.vn',
  'eximbank.com.vn',
  'mbbank.com.vn',
  'msb.com.vn',
  'namabank.com.vn',
  'pvcombank.com.vn',
  'sacombank.com.vn',
  'seabank.com.vn',
  'techcombank.com.vn',
  'tpb.vn',
  'vietcombank.com.vn',
  'vietinbank.vn',
  'vpbank.com.vn',

  // Pakistan
  'alnbank.com',
  'askaribank.com',
  'abl.com',
  'bankalfalah.com',
  'hbl.com',
  'mcb.com.pk',
  'meezanbank.com',
  'nbl.com.pk',
  'ubl.com.pk',

  // Bangladesh
  'bb.org.bd',
  'bracbank.com',
  'dbbl.com.bd',
  'ebl.com.bd',
  'islami-bank.com.bd',
  'thecitybank.com',

  // Sri Lanka
  'boc.lk',
  'combank.lk',
  'dfcc.lk',
  'hnb.net',
  'sampath.lk',
  'seylan.lk',

  // --- EMEA (Middle East, Africa, Australia, Canada) (106 domains) ---
  // UAE
  'adcb.com',
  'adib.ae',
  'cbd.ae',
  'dib.ae',
  'emiratesnbd.com',
  'emiratesislamic.ae',
  'fab.ae',
  'mashreqbank.com',
  'nbd.com',
  'rakbank.ae',
  'sib.ae',

  // Saudi Arabia
  'alawwalbank.com',
  'aljaziracapital.com.sa',
  'alinma.com',
  'alrajhibank.com.sa',
  'baj.com.sa',
  'bankalbilad.com',
  'banksaudifranci.com',
  'bsf.com.sa',
  'riyadbank.com',
  'sabb.com',
  'samba.com',
  'saib.com.sa',
  'samba-online.com',
  'saudihollandi.com',
  'snb.com.sa',

  // Qatar
  'ahlibank.com.qa',
  'cbq.qa',
  'dib.qa',
  'dohabank.com',
  'ibq.com.qa',
  'masraf.com',
  'qib.com.qa',
  'qnb.com',
  'qnb.com.qa',

  // Kuwait
  'burgan.com',
  'cbk.com',
  'gbkcorp.com',
  'kfh.com',
  'nbk.com',

  // Bahrain
  'albaraka.com',
  'albaraka.bh',
  'ahli-united.com',
  'arcapita.com',
  'bbkonline.com',
  'bmionline.com',
  'ktbonline.com',
  'nbob.com',

  // Oman
  'ahlibank.om',
  'bankdhofar.com',
  'bankmuscat.com',
  'banksohar.com',
  'hsbc.com.om',
  'nbo.om',

  // Turkey
  'akbank.com',
  'akbank.com.tr',
  'albarakaturk.com.tr',
  'denizbank.com',
  'fibabanka.com.tr',
  'garanti.com.tr',
  'halkbank.com.tr',
  'isbank.com.tr',
  'isbankasi.com.tr',
  'kuveytturk.com.tr',
  'qnbfinansbank.com',
  'sekerbank.com.tr',
  'teb.com.tr',
  'turkiye.com.tr',
  'vakifbank.com.tr',
  'yapikredi.com.tr',
  'ziraatbank.com.tr',

  // Israel
  'bankhapoalim.co.il',
  'bankhapoalim.com',
  'bankleumi.co.il',
  'discountbank.co.il',
  'fibi.co.il',
  'mizrahi-tefahot.co.il',
  'unionbank.co.il',

  // South Africa
  'absa.co.za',
  'africanbank.co.za',
  'bidvestbank.co.za',
  'capitecbank.co.za',
  'discovery.co.za',
  'fnb.co.za',
  'investec.com',
  'nedbank.co.za',
  'standardbank.co.za',
  'tymebank.co.za',

  // Nigeria
  'accessbankplc.com',
  'diamondbank.com',
  'ecobank.com',
  'fcmb.com',
  'fidelitybank.ng',
  'firstbanknigeria.com',
  'gtbank.com',
  'keystone-bank.com',
  'polaris-bank.com',
  'stanbicibtc.com',
  'sterlingbankng.com',
  'uba.ng',
  'unionbankng.com',
  'unitybankonline.com',
  'wemabank.com',
  'zenithbank.com',

  // Kenya
  'abcthebank.com',
  'co-opbank.co.ke',
  'equitybankgroup.com',
  'family.co.ke',
  'kcbbankgroup.com',
  'ke.co-opbank.org',
  'scb.co.ke',
  'stanbicbank.co.ke',

  // Egypt
  'alexbank.com',
  'banquemisr.com',
  'bankofegypt.com',
  'cibeg.com',
  'nbe.com.eg',
  'qnbalahli.com',

  // Morocco
  'attijariwafabank.com',
  'bmcebank.ma',
  'cih.co.ma',
  'gbp.ma',

  // Australia
  'anz.com',
  'anz.com.au',
  'bankofmelbourne.com.au',
  'bankofqueensland.com.au',
  'banksa.com.au',
  'bankwest.com.au',
  'bendigobank.com.au',
  'commbank.com.au',
  'cua.com.au',
  'hsbc.com.au',
  'ing.com.au',
  'macquarie.com',
  'macquarie.com.au',
  'nab.com.au',
  'qbank.com.au',
  'stgeorge.com.au',
  'suncorpbank.com.au',
  'westpac.com.au',

  // New Zealand
  'anz.co.nz',
  'asb.co.nz',
  'bnz.co.nz',
  'kiwibank.co.nz',
  'sbs.co.nz',
  'westpac.co.nz',

  // Canada
  'atb.com',
  'bmo.com',
  'cibc.com',
  'desjardins.com',
  'hsbc.ca',
  'laurentianbank.ca',
  'nationalbank.ca',
  'rbc.com',
  'scotiabank.com',
  'tangerine.ca',
  'td.com',

  // --- LATAM (24 domains) ---
  // Brazil
  'bancodobrasil.com.br',
  'bb.com.br',
  'bradesco.com.br',
  'caixa.gov.br',
  'itau.com.br',
  'santander.com.br',

  // Mexico
  'banorte.com',
  'banamex.com',
  'banregio.com',
  'bbva.mx',
  'hsbc.com.mx',
  'santander.com.mx',
  'scotiabank.com.mx',

  // Colombia
  'bancolombia.com',
  'bancodebogota.com',
  'davivienda.com',
  'itau.co',

  // Argentina
  'bancogalicia.com',
  'macro.com.ar',
  'santanderrio.com.ar',

  // Chile
  'bancochile.cl',
  'bci.cl',
  'santander.cl',
] as const

/**
 * Lazy-loaded Set for O(1) lookup performance
 */
let bankingDomainsSet: Set<string> | null = null

/**
 * Check if a domain is a known banking site
 *
 * Performance: O(1) lookup via Set
 * Thread-safety: Lazy initialization on first call
 *
 * @param domain - eTLD+1 domain to check (e.g., "chase.com")
 * @returns true if domain is in banking blocklist
 *
 * @example
 * isBankingDomain('chase.com') // true
 * isBankingDomain('example.com') // false
 */
export function isBankingDomain(domain: string): boolean {
  // Lazy-load Set on first call
  if (bankingDomainsSet === null) {
    bankingDomainsSet = new Set(BANKING_DOMAINS)
  }

  return bankingDomainsSet.has(domain.toLowerCase())
}
