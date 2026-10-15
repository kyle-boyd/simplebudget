#!/usr/bin/env node
/**
 * Renders rules-proposed.json into a single self-contained HTML page for review.
 *
 * A page rather than editing the JSON by hand because the useful context for
 * deciding a rule - how many rows it covers, a sample description, what the old
 * data claimed - is review metadata that never reaches Firebase, so it cannot be
 * reviewed in the app's own Rules screen.
 *
 * The data is inlined rather than fetched: opening the file over file:// blocks
 * fetch, so the page has to carry everything it needs.
 *
 *   node scripts/build-review-page.mjs && open ~/simplebudget-backups/rules-review.html
 *
 * Editing happens in the browser; "Download" writes a replacement
 * rules-proposed.json which scripts/apply-rules.mjs then consumes unchanged.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DIR = path.join(os.homedir(), 'simplebudget-backups');
const proposal = JSON.parse(fs.readFileSync(path.join(DIR, 'rules-proposed.json'), 'utf8'));
const taxonomy = JSON.parse(fs.readFileSync(path.join(DIR, 'taxonomy-mapping.json'), 'utf8'));

const rules = [...(proposal.deterministic || []), ...(proposal.ambiguous || [])]
  .map((rule, index) => ({ ...rule, _index: index }))
  .sort((a, b) => b._rows - a._rows);

const payload = {
  rules,
  categories: proposal._validCategories || [],
  taxonomy: taxonomy.needsDecision || {},
  generatedFrom: proposal._generatedFrom,
};

// </script> inside a script tag would end it early.
const inlined = JSON.stringify(payload).replace(/<\//g, '<\\/');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Simple Budget - rule review</title>
<style>
  :root {
    --bg: #fbfbfa; --panel: #fff; --line: #e4e4e2; --ink: #1c1c1a;
    --muted: #6b6b66; --accent: #2f6f4f; --warn: #8a5a00; --warn-bg: #fff8e6;
    --drop: #a33; --drop-bg: #fdf1f1;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a19; --panel: #232322; --line: #37372f; --ink: #ececea;
      --muted: #9a9a94; --accent: #7fc0a0; --warn: #e0b250; --warn-bg: #2e2714;
      --drop: #e08080; --drop-bg: #2e1a1a;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  header {
    position: sticky; top: 0; z-index: 5; background: var(--bg);
    border-bottom: 1px solid var(--line); padding: 14px 20px;
    display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
  }
  h1 { font-size: 16px; margin: 0 12px 0 0; font-weight: 600; }
  .count { color: var(--muted); font-size: 13px; }
  .grow { flex: 1 1 auto; }
  input[type=search], input[type=text], select {
    font: inherit; padding: 6px 8px; border: 1px solid var(--line);
    border-radius: 6px; background: var(--panel); color: var(--ink);
  }
  input[type=search] { min-width: 220px; }
  button {
    font: inherit; font-weight: 500; padding: 7px 12px; border-radius: 6px;
    border: 1px solid var(--line); background: var(--panel); color: var(--ink);
    cursor: pointer;
  }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  button:hover { filter: brightness(0.97); }
  main { padding: 20px; max-width: 1100px; margin: 0 auto; }
  section { margin-bottom: 28px; }
  h2 { font-size: 14px; margin: 0 0 4px; }
  .hint { color: var(--muted); font-size: 13px; margin: 0 0 12px; }
  .rule {
    display: grid; gap: 10px; align-items: center; padding: 10px 12px;
    grid-template-columns: 26px 1fr 72px 1fr 190px 92px;
    background: var(--panel); border: 1px solid var(--line);
    border-radius: 8px; margin-bottom: 6px;
  }
  .rule.changed { border-color: var(--accent); }
  .rule.dropped { background: var(--drop-bg); opacity: .65; }
  .rule.dropped .pattern { text-decoration: line-through; }
  .pattern {
    font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    width: 100%; border: 1px solid transparent; background: transparent;
    color: var(--ink); padding: 4px 6px; border-radius: 4px;
  }
  .pattern:hover, .pattern:focus { border-color: var(--line); background: var(--bg); }
  .rows { color: var(--muted); font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
  .sample { color: var(--muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .flag { font-size: 11px; display: flex; align-items: center; gap: 5px; color: var(--muted); }
  .note { background: var(--warn-bg); color: var(--warn); font-size: 12px; padding: 6px 10px;
          border-radius: 6px; margin: 0 0 12px; }
  .tax { display: grid; grid-template-columns: 1fr auto 1fr; gap: 6px 12px; font-size: 13px;
         background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
  .tax code { font-size: 12px; }
  details { margin-top: 4px; }
  summary { cursor: pointer; font-size: 13px; color: var(--muted); padding: 6px 0; }
  .bulk { display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
          background: var(--panel); border: 1px solid var(--line);
          border-radius: 8px; padding: 10px 12px; margin-bottom: 14px; }
  textarea { width: 100%; height: 180px; font: 11px/1.4 ui-monospace, Menlo, monospace;
             border: 1px solid var(--line); border-radius: 6px; background: var(--panel);
             color: var(--ink); padding: 8px; }
  @media (max-width: 820px) {
    .rule { grid-template-columns: 26px 1fr; }
    .rows, .sample { display: none; }
  }
</style>
</head>
<body>
<header>
  <h1>Rule review</h1>
  <span class="count" id="summary"></span>
  <span class="grow"></span>
  <input type="search" id="search" placeholder="Filter pattern, category, sample...">
  <label class="flag"><input type="checkbox" id="onlyFlagged"> needs attention only</label>
  <button id="download" class="primary">Download JSON</button>
</header>
<main>
  <p class="note" id="banner"></p>

  <div class="bulk">
    <strong style="font-size:13px">Bulk change:</strong>
    <span>every rule filed as</span>
    <select id="bulkFrom"></select>
    <span>becomes</span>
    <select id="bulkTo"></select>
    <button id="bulkApply">Apply</button>
    <span class="count">Use this when a whole category mapping was wrong.</span>
  </div>

  <section>
    <h2>1. Always review &mdash; merchants that span several categories</h2>
    <p class="hint">The rule fills in the default, but the transaction still stops at the
      review screen. Untick "review" to make a rule file silently instead.</p>
    <div id="groupAmbiguous"></div>
  </section>

  <section>
    <h2>2. My guesses &mdash; no signal in your old data, 8+ rows</h2>
    <p class="hint">I inferred these from the merchant name alone. Most likely to be wrong.</p>
    <div id="groupHand"></div>
  </section>

  <section>
    <h2>3. Overrides &mdash; where I disagreed with your old data</h2>
    <p class="hint">Your export said one thing; I filed it differently on purpose.</p>
    <div id="groupOverride"></div>
  </section>

  <section>
    <h2>4. Everything else</h2>
    <p class="hint">Mined from your own labels, or affecting only a few rows each.</p>
    <details><summary id="restToggle">Show the rest</summary><div id="groupRest"></div></details>
  </section>

  <section>
    <h2>Category mapping I applied while mining</h2>
    <p class="hint">Already baked into the categories above. Shown for context &mdash; to change
      one, use the bulk control at the top.</p>
    <div class="tax" id="taxonomy"></div>
  </section>

  <section>
    <h2>Output</h2>
    <p class="hint">Download replaces <code>~/simplebudget-backups/rules-proposed.json</code>,
      then run <code>node scripts/apply-rules.mjs</code>. Or copy from here.</p>
    <textarea id="output" readonly></textarea>
  </section>
</main>
<script>
const DATA = ${inlined};
const state = DATA.rules.map(r => ({
  ...r,
  _dropped: false,
  _origCategory: r.category,
  _origPattern: r.matchText,
  _origReview: !!r.alwaysReview,
}));

const el = id => document.getElementById(id);
const changed = r => r._dropped || r.category !== r._origCategory
  || r.matchText !== r._origPattern || !!r.alwaysReview !== r._origReview;

function bucket(r) {
  if (r.alwaysReview || r._origReview) return 'Ambiguous';
  if (r._source === 'override') return 'Override';
  if (r._source === 'hand-authored' && r._rows >= 8) return 'Hand';
  return 'Rest';
}

function categoryOptions(selected) {
  return DATA.categories
    .map(c => '<option' + (c === selected ? ' selected' : '') + '>' + c + '</option>')
    .join('');
}

function distribution(r) {
  const d = r._distribution || {};
  const keys = Object.keys(d);
  if (!keys.length) return '';
  return ' · old data: ' + keys.map(k => k + ' ' + d[k]).join(', ');
}

function render() {
  const needle = el('search').value.trim().toLowerCase();
  const flaggedOnly = el('onlyFlagged').checked;
  const groups = { Ambiguous: [], Hand: [], Override: [], Rest: [] };

  for (const r of state) {
    const haystack = (r.matchText + ' ' + r.category + ' ' + (r._sample || '')).toLowerCase();
    if (needle && !haystack.includes(needle)) continue;
    const g = bucket(r);
    if (flaggedOnly && g === 'Rest') continue;
    groups[g].push(r);
  }

  for (const [name, target] of [['Ambiguous','groupAmbiguous'], ['Hand','groupHand'],
                                ['Override','groupOverride'], ['Rest','groupRest']]) {
    const list = groups[name];
    el(target).innerHTML = list.length
      ? list.map(row).join('')
      : '<p class="hint">Nothing here' + (needle ? ' matches the filter.' : '.') + '</p>';
  }
  el('restToggle').textContent = 'Show the rest (' + groups.Rest.length + ')';

  const kept = state.filter(r => !r._dropped);
  const edits = state.filter(changed).length;
  el('summary').textContent = kept.length + ' rules · ' +
    kept.filter(r => r.alwaysReview).length + ' always-review · ' + edits + ' edited';
  el('banner').textContent = 'Generated from ' + DATA.generatedFrom +
    '. Nothing is saved until you download this and run apply-rules.mjs.';
  el('output').value = JSON.stringify(output(), null, 2);
}

function row(r) {
  const cls = 'rule' + (r._dropped ? ' dropped' : changed(r) ? ' changed' : '');
  return '<div class="' + cls + '">'
    + '<input type="checkbox" title="Keep this rule" ' + (r._dropped ? '' : 'checked')
    +   ' onchange="setDropped(' + r._index + ', !this.checked)">'
    + '<input class="pattern" value="' + escapeAttr(r.matchText)
    +   '" onchange="setPattern(' + r._index + ', this.value)">'
    + '<span class="rows">' + r._rows + ' rows</span>'
    + '<span class="sample" title="' + escapeAttr((r._sample || '') + distribution(r)) + '">'
    +   escapeHtml(r._sample || '') + escapeHtml(distribution(r)) + '</span>'
    + '<select onchange="setCategory(' + r._index + ', this.value)">'
    +   categoryOptions(r.category) + '</select>'
    + '<label class="flag"><input type="checkbox" ' + (r.alwaysReview ? 'checked' : '')
    +   ' onchange="setReview(' + r._index + ', this.checked)"> review</label>'
    + '</div>';
}

const escapeHtml = s => String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const escapeAttr = s => escapeHtml(s).replace(/"/g, '&quot;');
const find = i => state.find(r => r._index === i);

window.setDropped = (i, v) => { find(i)._dropped = v; render(); };
window.setCategory = (i, v) => { find(i).category = v; render(); };
window.setReview = (i, v) => { const r = find(i); if (v) r.alwaysReview = true; else delete r.alwaysReview; render(); };
window.setPattern = (i, v) => { find(i).matchText = v; render(); };

function output() {
  const kept = state.filter(r => !r._dropped);
  const clean = r => {
    const out = { matchText: r.matchText, category: r.category,
                  _rows: r._rows, _signalRows: r._signalRows, _sample: r._sample,
                  _distribution: r._distribution };
    if (r._source) out._source = r._source;
    if (r.alwaysReview) out.alwaysReview = true;
    return out;
  };
  return {
    _generatedFrom: DATA.generatedFrom,
    _reviewedAt: new Date().toISOString(),
    _validCategories: DATA.categories,
    deterministic: kept.filter(r => !r.alwaysReview).map(clean),
    ambiguous: kept.filter(r => r.alwaysReview).map(clean),
    noSignal: [],
  };
}

el('download').onclick = () => {
  const blob = new Blob([JSON.stringify(output(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rules-proposed.json';
  a.click();
  URL.revokeObjectURL(a.href);
};

el('bulkApply').onclick = () => {
  const from = el('bulkFrom').value, to = el('bulkTo').value;
  if (from === to) return;
  let n = 0;
  for (const r of state) if (!r._dropped && r.category === from) { r.category = to; n++; }
  render();
  if (n) el('banner').textContent = 'Moved ' + n + ' rule(s) from ' + from + ' to ' + to + '.';
};

el('bulkFrom').innerHTML = categoryOptions();
el('bulkTo').innerHTML = categoryOptions();
el('taxonomy').innerHTML = Object.entries(DATA.taxonomy)
  .map(([f, t]) => '<code>' + escapeHtml(f) + '</code><span>&rarr;</span><span>' + escapeHtml(t) + '</span>')
  .join('');
el('search').oninput = render;
el('onlyFlagged').onchange = render;
render();
</script>
</body>
</html>
`;

const out = path.join(DIR, 'rules-review.html');
fs.writeFileSync(out, html);
console.log(`wrote ${out}`);
console.log(`${rules.length} rules, ${rules.filter((r) => r.alwaysReview).length} always-review`);
console.log(`open it with:  open "${out}"`);
