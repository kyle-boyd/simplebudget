#!/usr/bin/env node
/**
 * Saves the reviewed rules from rules-proposed.json into Firebase, and
 * optionally clears the transactions list ahead of a fresh CSV import.
 *
 * Dry run by default: nothing is written without --yes. Every write is preceded
 * by a fresh backup, because `transactions` is a single array at a single path
 * and a bad write replaces the whole history in one shot.
 *
 *   node scripts/apply-rules.mjs                      # show what would happen
 *   node scripts/apply-rules.mjs --yes                # write the rules
 *   node scripts/apply-rules.mjs --yes --wipe         # clear transactions too
 *
 * Once rules exist they are left alone unless --replace-rules is passed. The
 * Rules screen writes edits straight to Firebase, so a second run of this
 * script would otherwise silently overwrite hand edits with the stale contents
 * of rules-proposed.json.
 *
 * Categories are deliberately never touched: they are hand-built.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const UID = process.env.SB_UID || 'VEi4HcUmOnXWYWquGc0sEFTpJus2';
const PROJECT = process.env.SB_PROJECT || 'simple-budgeting-5f9cb';
const DIR = path.join(os.homedir(), 'simplebudget-backups');

const args = new Set(process.argv.slice(2));
const commit = args.has('--yes');
const wipe = args.has('--wipe');
const replaceRules = args.has('--replace-rules');

const firebase = (cliArgs) =>
  execFileSync('npx', ['--no-install', 'firebase', ...cliArgs, '--project', PROJECT], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

// --- load the reviewed proposal ---------------------------------------------
const proposalPath = path.join(DIR, 'rules-proposed.json');
if (!fs.existsSync(proposalPath)) {
  console.error(`missing ${proposalPath} - run scripts/mine-rules.mjs first`);
  process.exit(1);
}
const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
const reviewed = [...(proposal.deterministic || []), ...(proposal.ambiguous || [])];

// --- validate against the categories actually in the database ---------------
// Categories are referenced by name, so a rule naming a category that does not
// exist would file transactions under an invalid name: they render as an error
// and drop out of budget totals.
const liveCategories = JSON.parse(
  firebase(['database:get', `/users/${UID}/categories`])
);
const toArray = (v) => (Array.isArray(v) ? v : Object.values(v || {})).filter(Boolean);
const valid = new Set();
for (const category of toArray(liveCategories)) {
  for (const sub of toArray(category.subcategories)) valid.add(sub.name);
}

const invalid = reviewed.filter((rule) => !valid.has(rule.category));
if (invalid.length) {
  console.error(`${invalid.length} rule(s) name a category that does not exist:`);
  for (const rule of invalid.slice(0, 20)) console.error(`   ${rule.matchText} -> ${rule.category}`);
  console.error('\nfix rules-proposed.json (or add the category) and re-run.');
  process.exit(1);
}

const blank = reviewed.filter((rule) => !rule.matchText || !rule.matchText.trim());
if (blank.length) {
  console.error(`${blank.length} rule(s) have a blank matchText, which would match nothing.`);
  process.exit(1);
}

// --- shape them the way useRules expects ------------------------------------
// useRules reads this node with Object.entries(...).map(([key, val]) => ({...val, id: key})),
// so the keys become rule ids. Only the four Rule fields are written: the `_`
// review metadata stays out of the database, and alwaysReview is omitted rather
// than written false so absent and false do not both appear.
const createdAt = new Date().toISOString();
const payload = {};
reviewed.forEach((rule, index) => {
  const id = `mined-${String(index).padStart(4, '0')}`;
  payload[id] = {
    matchText: rule.matchText.trim(),
    category: rule.category,
    createdAt,
    ...(rule.alwaysReview ? { alwaysReview: true } : {}),
  };
});

const existingRules = JSON.parse(firebase(['database:get', `/users/${UID}/rules`])) || {};
const existingCount = Object.keys(existingRules).length;

// Rules already in the database win over the file: they may carry edits made on
// the Rules screen since the file was generated.
const writeRules = existingCount === 0 || replaceRules;

console.log(`project ${PROJECT}  uid ${UID}`);
console.log(`rules in file  : ${reviewed.length} (${reviewed.filter((r) => r.alwaysReview).length} always-review)`);
console.log(`rules present  : ${existingCount}`);
console.log(
  `rules action   : ${
    writeRules
      ? existingCount
        ? 'REPLACING all stored rules with the file'
        : 'writing the file'
      : 'left alone (pass --replace-rules to overwrite, which discards edits made in the app)'
  }`
);
console.log(`categories     : ${valid.size} valid, 0 rules pointing outside them`);
console.log(`transactions   : ${wipe ? 'WILL BE CLEARED' : 'left alone'}`);

if (!writeRules && !wipe) {
  console.log('\nnothing to do.');
  process.exit(0);
}

if (!commit) {
  console.log('\ndry run - nothing written. re-run with --yes to apply.');
  process.exit(0);
}

// --- back up, then write -----------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
const backup = path.join(DIR, `sb-full-${stamp}-preapply.json`);
firebase(['database:get', `/users/${UID}`, '-o', backup]);
console.log(`\nbacked up to ${backup}`);

if (writeRules) {
  const tmp = path.join(os.tmpdir(), `sb-rules-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(payload));
  firebase(['database:set', `/users/${UID}/rules`, tmp, '--force']);
  fs.rmSync(tmp);
  console.log(`wrote ${reviewed.length} rules`);
} else {
  console.log(`left the ${existingCount} stored rules untouched`);
}

if (wipe) {
  firebase(['database:remove', `/users/${UID}/transactions`, '--force']);
  console.log('cleared transactions - import your CSVs next, rules apply on the way in');
}
console.log('done');
