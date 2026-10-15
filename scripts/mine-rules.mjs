/**
 * One-time tool: mine merchant rules out of a backup of the pre-wipe database.
 *
 * The old data carried two foreign category taxonomies (a Mint export and a
 * bank/aggregator export) whose names are not valid budget subcategories. Those
 * names are per-transaction signal, so we map them onto the real categories
 * first, then measure how concentrated each merchant is. Mapping before
 * measuring is what collapses "fast food"+"dining" into one deterministic
 * Restaurants rule instead of an ambiguous merchant.
 *
 * Reads:  ~/simplebudget-backups/sb-full-*.json (latest)
 * Writes: ~/simplebudget-backups/rules-proposed.json
 *         ~/simplebudget-backups/taxonomy-mapping.json
 * Writes nothing to Firebase.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.homedir(), 'simplebudget-backups');

// --- taxonomy: foreign category name -> valid subcategory name ---------------
// `null` = too vague to map; drop the label and let merchant rules re-derive it.
const CONFIDENT = {
  groceries: 'Groceries',
  dining: 'Restaurants', 'Fast Food': 'Restaurants', 'Food & Dining': 'Restaurants',
  bar: 'Restaurants', 'Alcohol & Bars': 'Restaurants',
  fuel: 'Gas',
  'Service & Parts': 'Maintenance',
  Transfer: 'Hide from Budget', 'Credit Card Payment': 'Hide from Budget',
  Paycheck: 'Income', 'Interest Income': 'Income',
  office: 'Kyle Business Expense', software: 'Kyle Business Expense',
  'Office Supplies': 'Kyle Business Expense', 'Business Services': 'Kyle Business Expense',
  Education: 'Kids Activities', Kids: 'Kids Activities', Sports: 'Kids Activities',
  home: 'Home Supplies', Home: 'Home Supplies', Furnishings: 'Home Supplies',
  'Home Improvement': 'House Projects', 'Lawn & Garden': 'House Projects',
  'Mortgage & Rent': 'Rent/Mortgage',
  'Bills & Utilities': 'Utilities', 'Mobile Phone': 'Utilities',
  entertainment: 'Entertainment', 'Movies & DVDs': 'Entertainment',
  'Newspapers & Magazines': 'Entertainment',
  charity: 'Tithe',
  health: 'Doctor', Dentist: 'Doctor', Pharmacy: 'Doctor', Eyecare: 'Doctor',
  'Personal Care': 'Hair',
  'Air Travel': 'Travel', Hotel: 'Travel', accommodation: 'Travel', Vacation: 'Travel',
  '529': 'College 529',
};
// My best guess, but a real judgment call — review these.
const NEEDS_DECISION = {
  transportation: 'Gas', 'Auto & Transport': 'Gas', Parking: 'Gas',
  'Rental Car & Taxi': 'Travel',
  Books: 'Entertainment', Television: 'Entertainment',
  'Gifts & Donations': 'Gift', Toys: 'Gift',
  Clothing: 'Kyle', 'Electronics & Software': 'Kyle Business Expense',
  'Sporting Goods': 'Kids Activities',
  Investments: 'Retirement', Financial: 'Hide from Budget',
  'Fees & Charges': 'Membership Fees',
  'State Tax': 'Property Tax', Taxes: 'Property Tax',
  Shipping: 'Kyle Business Expense', service: 'Maintenance',
};
// Too vague to carry meaning — cleared so merchant rules decide instead.
const VAGUE = ['general', 'shopping', 'Shopping'];

// --- merchant normalisation --------------------------------------------------
const STOP = new Set(['the','and','llc','inc','co','corp','com','org','net','usa','us',
  'bill','pmts','pmt','payments','purchase','web','recurring','online','store','pos']);
// Generic payment processors only. "amzn" is deliberately NOT stripped: keeping
// it separates "amzn mktp" (shopping) from "prime video" (entertainment).
const PROCESSOR = /^(sq|tst|zap|pp|sp|py|cke|ext|in)\s*\*+\s*/i;

// Brands that appear under several spellings. First match wins, so order the
// more specific patterns (prime video) ahead of the generic brand (amazon).
const ALIAS = [
  [/prime\s*video/, 'prime video'],
  [/amazon\s*prime|amzn\s*prime/, 'amazon prime'],
  [/(amazon|amzn)\s*(mktp|mktpl|mktplace|marketplace)/, 'amazon marketplace'],
  [/\b(amazon|amzn)\b/, 'amazon'],
  [/wal[\s-]*mart/, 'walmart'],
  [/dollar\s*tree/, 'dollar tree'],
  [/domino/, 'dominos'],
  [/trader\s*joe/, 'trader joes'],
  [/strong\s*towns/, 'strong towns'],
  [/cigna/, 'cigna'],
  [/autodesk/, 'autodesk'],
  [/ace\s*hardware|avenue\s*ace|ralson\s*ace/, 'ace hardware'],
  [/hearth\s*(denver|uptown)/, 'hearth'],
  [/harkins/, 'harkins'],
  [/frontier\s*airlines/, 'frontier airlines'],
  [/photoprint|freeprints/, 'photo prints'],
  [/ingalls/, 'ingalls homestead'],
  [/alipayusinc/, 'alipay'],
  [/advance\s*auto|auto\s*parts/, 'auto parts'],
  [/call\s*to\s*arms|arms\s*brewing/, 'call to arms brewing'],
  [/cityofdenver/, 'city of denver'],
  [/leevers/, 'leevers'],
  [/in[\s-]*n[\s-]*out/, 'in n out'],
  [/enterprise\s*cowork/, 'enterprise coworking'],
  [/king\s*soopers.*fuel|soopers\s*fuel/, 'king soopers fuel'],
  [/king\s*soopers/, 'king soopers'],
  [/automatic\s*payment|payment\s*thank\s*you/, 'card payment'],
];

function normalize(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(PROCESSOR, '')
    .replace(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/g, ' ')   // phone numbers
    .replace(/#\s*\d+/g, ' ')                        // store numbers
    .replace(/\b[a-z0-9]*\d{4,}[a-z0-9]*\b/g, ' ')   // reference codes
    .replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function merchantKey(raw) {
  const text = normalize(raw);
  for (const [pattern, canonical] of ALIAS) if (pattern.test(text)) return canonical;
  const words = text.split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  // Two tokens is the sweet spot: enough to identify a brand, few enough that a
  // trailing city ("trader joe s #308 WESTMINSTER") does not split the merchant.
  const key = words.slice(0, 2).join(' ');
  return key.length >= 4 ? key : words.slice(0, 3).join(' ');
}

// --- load --------------------------------------------------------------------
const backup = fs.readdirSync(DIR).filter((f) => f.startsWith('sb-full-')).sort().pop();
if (!backup) throw new Error(`no sb-full-*.json backup in ${DIR}`);
const data = JSON.parse(fs.readFileSync(path.join(DIR, backup), 'utf8'));
const toArray = (v) => (Array.isArray(v) ? v : Object.values(v || {})).filter(Boolean);

const transactions = toArray(data.transactions);
const validCategories = new Set();
for (const category of toArray(data.categories)) {
  for (const sub of toArray(category.subcategories)) validCategories.add(sub.name);
}

// --- map each row's source label onto a real category ------------------------
const MAPPING = { ...CONFIDENT, ...NEEDS_DECISION };
const unmapped = new Map();

function mappedCategory(label) {
  if (!label) return null;
  const name = label.trim();
  if (!name || VAGUE.includes(name)) return null;
  if (validCategories.has(name)) return name;            // already a real one
  if (MAPPING[name]) return MAPPING[name];
  unmapped.set(name, (unmapped.get(name) || 0) + 1);     // shouldn't happen
  return null;
}

// --- build the merchant -> category distribution -----------------------------
const merchants = new Map();
for (const t of transactions) {
  const key = merchantKey(t.Description);
  if (!key) continue;
  if (!merchants.has(key)) merchants.set(key, { rows: 0, signal: 0, dist: new Map(), sample: t.Description });
  const entry = merchants.get(key);
  entry.rows++;
  const category = mappedCategory(t.Category);
  if (category) {
    entry.signal++;
    entry.dist.set(category, (entry.dist.get(category) || 0) + 1);
  }
}


// --- hand-authored categories for merchants the old data had no signal for ---
// Mined signal is preferred; this only fills gaps. `true` as the second element
// means always-review: a default is filled in but the row still goes to review.
const HAND = {
  // groceries
  safeway: 'Groceries', leevers: 'Groceries', 'weis markets': 'Groceries',
  // coffee
  'honey hill': 'Coffee Shops', 'steam espresso': 'Coffee Shops', 'red silo': 'Coffee Shops',
  'blue nest': 'Coffee Shops', 'doppio coffee': 'Coffee Shops', 'huckleberry roasters': 'Coffee Shops',
  'wake coffee': 'Coffee Shops', 'french press': 'Coffee Shops', 'pinwheel coffee': 'Coffee Shops',
  'novo congress': 'Coffee Shops', 'ziggis federal': 'Coffee Shops', 'donutsville bakery': 'Coffee Shops',
  // restaurants
  'flyteco brewing': 'Restaurants', 'miyauchi snack': 'Restaurants', hearth: 'Restaurants',
  'mt rushmore': 'Restaurants', 'lsu white': 'Restaurants', 'zoo simply': 'Restaurants',
  wendy: 'Restaurants', 'call to arms brewing': 'Restaurants', 'bliss frozen': 'Restaurants',
  'panera bread': 'Restaurants', 'kona ice': 'Restaurants', 'jimmy johns': 'Restaurants',
  'tropical smoothie': 'Restaurants', 'kalaka mexican': 'Restaurants', 'falls overlook': 'Restaurants',
  'thai basil': 'Restaurants', 'improper city': 'Restaurants', 'berkeley alley': 'Restaurants',
  'dang soft': 'Restaurants', 'curly fries': 'Restaurants', 'little man': 'Restaurants',
  'dca food': 'Restaurants', 'berliner haus': 'Restaurants', 'denver beer': 'Restaurants',
  'maracuchos cafe': 'Restaurants', 'grand lake': 'Restaurants',
  // fuel & car
  conoco: 'Gas', 'phillips 66': 'Gas', circle: 'Gas', eleven: 'Gas', 'denver pay': 'Gas',
  'urban autocare': 'Maintenance', 'auto parts': 'Maintenance', 'big brand': 'Maintenance',
  'urban motors': 'Maintenance',
  // health
  cigna: 'Insurance', vsp: 'Insurance', 'delta dental': 'Insurance',
  'afc urgent': 'Doctor', 'natl jewish': 'Doctor', 'north park': 'Doctor',
  'med uchealth': 'Doctor', 'phr children': 'Doctor', eyebuydirect: 'Doctor', 'warby parker': 'Doctor',
  // kids
  'act denver': 'Kids Activities', 'skate city': 'Kids Activities', 'soccer shots': 'Kids Activities',
  'denver public': 'Kids Activities', 'jeffco public': 'Kids Activities', 'tigar gymnastics': 'Kids Activities',
  'jfi urban': 'Kids Activities', 'library standley': 'Kids Activities', 'kid to': 'Kids Activities',
  'denver botanic': 'Kids Activities',
  // business
  autodesk: 'Kyle Business Expense', apstylebook: 'Kyle Business Expense',
  namecheap: 'Kyle Business Expense', cursor: 'Kyle Business Expense',
  'secretary state': 'Kyle Business Expense', 'enterprise coworking': 'Kyle Business Expense',
  // home
  'dollar tree': 'Home Supplies', 'ace hardware': 'House Projects', 'hobby lobby': 'Home Supplies',
  'city floral': 'House Projects', 'echters greenhouse': 'House Projects', wayfair: 'Home Supplies',
  goodwill: 'Home Supplies', 'westminster arc': 'Home Supplies', 'abode home': 'Home Services',
  // utilities
  'city of denver': 'Utilities', 'city county': 'Utilities', 'public works': 'Utilities',
  // travel & recreation
  'southwest airlines': 'Travel', 'frontier airlines': 'Travel', united: 'Travel',
  'recreation gov': 'Travel', 'earlybird check': 'Travel', 'ingalls homestead': 'Travel',
  'vail ski': 'Skiing',
  // entertainment
  harkins: 'Entertainment', stubhub: 'Entertainment', 'vivid seats': 'Entertainment',
  'armk den': 'Entertainment', 'thrift books': 'Entertainment', 'barnes noble': 'Entertainment',
  // giving
  'strong towns': 'Tithe', 'word of': 'Tithe',
  // misc
  'card payment': 'Hide from Budget', 'annual membership': 'Membership Fees',
  'talulah jones': 'Gift', 'photo prints': 'Gift', 'dorian studio': 'Gift', 'pez candy': 'Gift',
  tatcha: 'Beth', 'lady nomada': 'Beth',
  // genuinely ambiguous -> default + always review
  amazon: ['Home Supplies', true], 'amazon marketplace': ['Home Supplies', true],
  costco: ['Groceries', true], etsy: ['Gift', true], apple: ['Kyle', true],
  alipay: ['Home Supplies', true], 'paypal alipay': ['Home Supplies', true],
  'summit county': ['Utilities', true], 'nyx nayax': ['Restaurants', true],
};

// Mined signal that is simply wrong in the source export. These beat the data.
const OVERRIDE = {
  // The source labels disagree with the raw text here: rows reading
  // "KING SOOPERS #0685 FUEL" were labelled groceries while bland
  // "King Soopers" rows were labelled gas. Trust the text, and let the longer
  // "king soopers fuel" rule win on the fuel ones via longest-match.
  'king soopers fuel': 'Gas',
  'anthropic claude': 'Kyle Business Expense',
  uwm: 'Rent/Mortgage',
  'great sand': 'Travel',
  'moving beyond': 'Kids Activities',
};

const MIN_SUPPORT = 3;        // fewer signal rows than this is not evidence
const DETERMINISTIC = 0.9;    // >= this share of one category -> plain rule

const deterministic = [], ambiguous = [], noSignal = [];
for (const [key, e] of merchants) {
  const ranked = [...e.dist].sort((a, b) => b[1] - a[1]);
  const record = {
    matchText: key, _rows: e.rows, _signalRows: e.signal, _sample: e.sample,
    _distribution: Object.fromEntries(ranked),
  };
  if (e.signal < MIN_SUPPORT) {
    const hand = HAND[key];
    if (hand) {
      const [category, review] = Array.isArray(hand) ? hand : [hand, false];
      const entry = { ...record, category, _source: 'hand-authored' };
      if (review) { entry.alwaysReview = true; ambiguous.push(entry); } else { deterministic.push(entry); }
    } else {
      noSignal.push(record);
    }
    continue;
  }
  if (OVERRIDE[key]) {
    deterministic.push({ ...record, category: OVERRIDE[key], _source: 'override' });
    continue;
  }
  const [topCategory, topCount] = ranked[0];
  if (topCount / e.signal >= DETERMINISTIC) {
    deterministic.push({ ...record, category: topCategory });
  } else {
    ambiguous.push({ ...record, category: topCategory, alwaysReview: true });
  }
}

// A shorter matchText already matches everything a longer one does (matching is
// substring-based), so a longer rule with the same outcome is dead weight. Rules
// that differ in category are kept: that is what longest-match-wins is for.
function prune(lists) {
  const all = lists.flat();
  const dead = new Set();
  for (const a of all) {
    for (const b of all) {
      if (a === b || dead.has(b)) continue;
      if (b.matchText.length <= a.matchText.length) continue;
      if (!b.matchText.includes(a.matchText)) continue;
      if (b.category !== a.category) continue;
      if (!!b.alwaysReview !== !!a.alwaysReview) continue;
      dead.add(b);
    }
  }
  return { kept: lists.map((l) => l.filter((r) => !dead.has(r))), removed: dead.size };
}
const { kept: [detKept, ambKept], removed } = prune([deterministic, ambiguous]);
deterministic.length = 0; deterministic.push(...detKept);
ambiguous.length = 0; ambiguous.push(...ambKept);
console.log(`pruned ${removed} rules already covered by a shorter identical-outcome rule\n`);

const bySize = (a, b) => b._rows - a._rows;
deterministic.sort(bySize); ambiguous.sort(bySize); noSignal.sort(bySize);

// --- write -------------------------------------------------------------------
const out = {
  _generatedFrom: backup,
  _generatedAt: new Date().toISOString(),
  _instructions: [
    'Review and edit, then run scripts/apply-rules.mjs to save these to Firebase.',
    'Fields prefixed with _ are review metadata and are stripped before saving.',
    'alwaysReview:true means the rule fills in `category` but always sends the',
    'transaction to the review screen instead of being accepted silently.',
    'Delete any entry you do not want. `category` must be a valid subcategory.',
  ],
  _validCategories: [...validCategories].sort(),
  deterministic, ambiguous, noSignal,
};
fs.writeFileSync(path.join(DIR, 'rules-proposed.json'), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(DIR, 'taxonomy-mapping.json'), JSON.stringify({
  _instructions: ['confident: applied as-is. needsDecision: my guess, please confirm.',
                  'vague: label discarded, merchant rules re-derive the category.'],
  confident: CONFIDENT, needsDecision: NEEDS_DECISION, vague: VAGUE,
}, null, 2));

// --- report ------------------------------------------------------------------
const rowsOf = (list) => list.reduce((s, r) => s + r._rows, 0);
console.log(`source backup: ${backup}`);
console.log(`transactions: ${transactions.length}  valid categories: ${validCategories.size}`);
console.log(`distinct merchants: ${merchants.size}\n`);
console.log(`deterministic rules : ${String(deterministic.length).padStart(4)}  covering ${rowsOf(deterministic)} rows`);
console.log(`always-review rules: ${String(ambiguous.length).padStart(4)}  covering ${rowsOf(ambiguous)} rows`);
console.log(`no usable signal   : ${String(noSignal.length).padStart(4)}  covering ${rowsOf(noSignal)} rows`);
if (unmapped.size) {
  console.log(`\n!! source labels with no mapping entry (${unmapped.size}):`);
  for (const [n, c] of [...unmapped].sort((a, b) => b[1] - a[1])) console.log(`   ${String(c).padStart(4)} ${n}`);
}
console.log(`\n--- always-review (genuinely split merchants) ---`);
for (const r of ambiguous.slice(0, 15)) {
  console.log(`${String(r._rows).padStart(5)}  ${r.matchText.padEnd(24)} ${JSON.stringify(r._distribution)}`);
}
console.log(`\n--- biggest merchants with no usable signal ---`);
for (const r of noSignal.slice(0, 15)) {
  console.log(`${String(r._rows).padStart(5)}  ${r.matchText.padEnd(24)} sample: ${r._sample}`);
}

// --- verification: simulate the real matcher over every transaction ----------
// Mirrors lib/categorization.ts matchRule(): normalised substring, longest
// matchText wins. Run twice to show what stripping store numbers buys us.
const finalRules = [...deterministic, ...ambiguous];

function simulate(stripStoreNumbers) {
  const norm = (v) => {
    let t = String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (stripStoreNumbers) t = t.replace(/#\s*\d+/g, ' ').replace(/\s+/g, ' ').trim();
    return t;
  };
  let matched = 0, review = 0, missed = 0;
  for (const t of transactions) {
    const haystack = norm(t.Description);
    let best = null, bestLength = 0;
    for (const rule of finalRules) {
      const needle = norm(rule.matchText);
      if (!needle || !haystack.includes(needle)) continue;
      if (needle.length > bestLength) { best = rule; bestLength = needle.length; }
    }
    if (!best) missed++;
    else if (best.alwaysReview) review++;
    else matched++;
  }
  return { matched, review, missed };
}

const plain = simulate(false);
const stripped = simulate(true);
const pct = (n) => `${((100 * n) / transactions.length).toFixed(1)}%`;
console.log(`\n--- simulated against all ${transactions.length} transactions ---`);
console.log(`                      current matcher      + store-number stripping`);
console.log(`auto-categorized      ${String(plain.matched).padStart(5)} ${pct(plain.matched).padStart(7)}        ${String(stripped.matched).padStart(5)} ${pct(stripped.matched).padStart(7)}`);
console.log(`flagged for review    ${String(plain.review).padStart(5)} ${pct(plain.review).padStart(7)}        ${String(stripped.review).padStart(5)} ${pct(stripped.review).padStart(7)}`);
console.log(`no rule (review as    ${String(plain.missed).padStart(5)} ${pct(plain.missed).padStart(7)}        ${String(stripped.missed).padStart(5)} ${pct(stripped.missed).padStart(7)}`);
console.log(`  uncategorized)`);
