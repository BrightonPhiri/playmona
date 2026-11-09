'use strict';
/* Downloads the Logo Rush logos into a staging folder (never straight into assets/).

     node tools/logos/fetch.js --cache <dir> --stage <dir> [--only id,id] [--force]

   For each brand in js/data/logos.js:
     1. theSVG (@thesvg/icons, read as text, never run): `default` (or `mono`) is the
        symbol, `wordmark` the full logo.
     2. Wikipedia: the logo in the article's infobox (title from lookup.json, else the
        brand name), from Wikimedia Commons or English Wikipedia. Used for the full logo,
        and as the symbol when theSVG has none (the contact sheet shows these for review).
     3. lookup.json may also give exact `symbolUrl` / `fullUrl` file pages or URLs.
   SVGs are cleaned (clean.js); SVGs over the size cap and other pictures become WebP
   (towebp.py, Pillow). Each file's source and licence go to <stage>/sources.json.
   Then `node tools/logos/check.js --from <stage> --install` checks and installs them.
   Node 18+ (fetch). */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { cleanSvg } = require('./clean.js');

const ROOT = path.resolve(__dirname, '..', '..');
const UA = 'PlayMonaLogoFetch/1.0 (https://playmona.com; logo quiz asset build)';
const THESVG = '@thesvg/icons@4.0.4';
const CAP = { symbol: 60 * 1024, full: 120 * 1024 };
const WIKI_GAP_MS = 1100;

function args() {
  const a = process.argv.slice(2);
  const o = { only: null, force: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--cache') o.cache = a[++i];
    else if (a[i] === '--stage') o.stage = a[++i];
    else if (a[i] === '--only') o.only = a[++i].split(',');
    else if (a[i] === '--force') o.force = true;
  }
  if (!o.cache || !o.stage) { console.error('usage: fetch.js --cache <dir> --stage <dir> [--only a,b] [--force]'); process.exit(2); }
  return o;
}

function brands() {
  const ctx = { window: {} };
  ctx.window.FF = ctx.FF = {};
  vm.createContext(ctx);
  vm.runInContext('var window = this.window; var FF = window.FF;' + fs.readFileSync(path.join(ROOT, 'js/data/logos.js'), 'utf8'), ctx);
  return ctx.window.FF.data.logos.brands;
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- theSVG ---------- */

function grab(s, k) {
  const at = s.indexOf('exports.' + k + ' = ');
  if (at === -1) return null;
  const start = at + ('exports.' + k + ' = ').length;
  try { return JSON.parse(s.slice(start, s.indexOf(';\n', start))); } catch (e) { return null; }
}
function variantsOf(s) {
  const out = {};
  const vb = s.indexOf('const variantSvgs = {');
  if (vb === -1) return out;
  const body = s.slice(vb, s.indexOf('\n};', vb));
  const re = /"(\w+)": `([\s\S]*?)`/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].replace(/\\`/g, '`').replace(/\\\$/g, '$');
  return out;
}

function thesvgIndex(cache) {
  const idxFile = path.join(cache, 'thesvg-index.json');
  if (fs.existsSync(idxFile)) return JSON.parse(fs.readFileSync(idxFile, 'utf8'));
  const pkg = path.join(cache, 'thesvg');
  fs.mkdirSync(pkg, { recursive: true });
  if (!fs.existsSync(path.join(pkg, 'package', 'dist'))) {
    execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', THESVG, '--silent'], { cwd: pkg, stdio: 'inherit', shell: process.platform === 'win32' });
    const tgz = fs.readdirSync(pkg).find((f) => f.endsWith('.tgz'));
    execFileSync('tar', ['-xzf', tgz], { cwd: pkg });
  }
  const dist = path.join(pkg, 'package', 'dist');
  const idx = {};
  fs.readdirSync(dist).filter((f) => f.endsWith('.cjs')).forEach((f) => {
    const s = fs.readFileSync(path.join(dist, f), 'utf8');
    const row = { slug: grab(s, 'slug'), title: grab(s, 'title'), aliases: grab(s, 'aliases') || [], license: grab(s, 'license'), file: path.join(dist, f) };
    [row.title, row.slug].concat(row.aliases).forEach((n) => { const k = norm(n); if (k && !idx[k]) idx[k] = row; });
  });
  fs.writeFileSync(idxFile, JSON.stringify(idx));
  return idx;
}

function fromTheSvg(idx, b, look) {
  if (look.thesvg === false) return null;
  const keys = look.thesvg ? [norm(look.thesvg)] : [norm(b.name), norm(b.id)].concat(b.aliases.map(norm));
  const row = keys.map((k) => idx[k]).find(Boolean);
  if (!row) return null;
  const v = variantsOf(fs.readFileSync(row.file, 'utf8'));
  const url = 'https://thesvg.org/icons/' + row.slug + '/';
  return {
    symbol: v.default || v.mono ? { svg: v.default || v.mono, url: url + (v.default ? 'default' : 'mono') + '.svg', from: 'thesvg', licence: row.license || 'unknown', title: row.title } : null,
    full: v.wordmark ? { svg: v.wordmark, url: url + 'wordmark.svg', from: 'thesvg', licence: row.license || 'unknown', title: row.title } : null
  };
}

/* ---------- Wikipedia ---------- */

let lastWiki = 0;
async function wikiJson(url) {
  for (let tries = 0; tries < 5; tries++) {
    const wait = lastWiki + WIKI_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastWiki = Date.now();
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    const text = await r.text();
    if (r.ok && text[0] === '{') return JSON.parse(text);
    await sleep(5000 * (tries + 1));
  }
  throw new Error('Wikipedia keeps refusing: ' + url);
}
const API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&';

async function fileInfo(file) {
  const j = await wikiJson(API + 'action=query&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=512&titles=File:' + encodeURIComponent(file));
  const pg = j.query && j.query.pages && j.query.pages[0];
  const info = pg && pg.imageinfo && pg.imageinfo[0];
  if (!info) return null;
  const md = info.extmetadata || {};
  return {
    file, url: info.url, thumb: info.thumburl, mime: info.mime, size: info.size,
    page: info.descriptionurl, licence: (md.LicenseShortName || {}).value || 'unknown', from: 'wikipedia'
  };
}

async function wikiLogo(title) {
  const j = await wikiJson(API + 'action=parse&redirects=1&prop=wikitext&section=0&page=' + encodeURIComponent(title));
  if (!j.parse) return { err: 'no page "' + title + '"' };
  const w = j.parse.wikitext;
  if (/\{\{\s*(disambiguation|disambig|dab)\b|may refer to:/i.test(w)) return { err: '"' + title + '" is a disambiguation page' };
  const m = w.match(/\|\s*(?:logo|image|club_crest|crest)\s*=\s*(?:\[\[)?\s*(?:File:|Image:)?([^|\]\n}]+?\.(?:svg|png|jpe?g|gif|webp))/i);
  if (!m) return { err: 'no logo in the infobox of "' + j.parse.title + '"' };
  const info = await fileInfo(m[1].trim());
  return info ? { info, article: j.parse.title } : { err: 'no file info for ' + m[1] };
}

/* ---------- saving ---------- */

async function download(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(r.status + ' for ' + url);
  return Buffer.from(await r.arrayBuffer());
}

function toWebp(buf, out) {
  const tmp = out + '.src';
  fs.writeFileSync(tmp, buf);
  try {
    execFileSync('python', ['-I', path.join(__dirname, 'towebp.py'), tmp, out, '512']);
  } finally { fs.unlinkSync(tmp); }
}

/* Writes one file of a brand; returns its extension, or null. */
async function save(stage, name, kind, pick) {
  for (const ext of ['svg', 'webp']) { const p = path.join(stage, name + '.' + ext); if (fs.existsSync(p)) fs.unlinkSync(p); }
  if (pick.svg != null || (pick.mime === 'image/svg+xml')) {
    const raw = pick.svg != null ? pick.svg : (await download(pick.url)).toString('utf8');
    const c = cleanSvg(raw);
    const textOk = kind === 'full' || c.problems.indexOf('has <text>') === -1;
    if (c.svg && textOk && Buffer.byteLength(c.svg) <= CAP[kind] && c.problems.filter((p) => p !== 'has <text>').length === 0) {
      fs.writeFileSync(path.join(stage, name + '.svg'), c.svg);
      return 'svg';
    }
  }
  const src = pick.thumb || (pick.svg == null ? pick.url : null);
  if (!src) return null;
  toWebp(await download(src), path.join(stage, name + '.webp'));
  return 'webp';
}

(async function main() {
  const o = args();
  fs.mkdirSync(o.stage, { recursive: true });
  fs.mkdirSync(o.cache, { recursive: true });
  const lookup = JSON.parse(fs.readFileSync(path.join(__dirname, 'lookup.json'), 'utf8'));
  const srcFile = path.join(o.stage, 'sources.json');
  const sources = fs.existsSync(srcFile) ? JSON.parse(fs.readFileSync(srcFile, 'utf8')) : {};
  const idx = thesvgIndex(o.cache);
  const tally = { thesvg: 0, wikipedia: 0, missingSymbol: [], missingFull: [], errors: [] };
  const list = brands().filter((b) => !o.only || o.only.indexOf(b.id) !== -1);

  for (const b of list) {
    if (sources[b.id] && !o.force) continue;
    const look = lookup[b.id] || {};
    const entry = {};
    try {
      const t = fromTheSvg(idx, b, look);
      let wiki = null;
      const wikiOf = async () => {
        if (wiki || look.wiki === false) return wiki;
        const r = await wikiLogo(look.wiki || b.name);
        if (r.err) { tally.errors.push(b.id + ': ' + r.err); wiki = null; } else wiki = r.info;
        return wiki;
      };
      let sym = look.symbolUrl ? await fileInfo(look.symbolUrl.replace(/^File:/, '')) : (t && t.symbol);
      if (!sym) { sym = await wikiOf(); if (sym) sym = Object.assign({ guess: true }, sym); }
      let full = look.fullUrl ? await fileInfo(look.fullUrl.replace(/^File:/, '')) : (t && t.full);
      if (!full) full = await wikiOf();
      // The same picture twice: keep the symbol only (the reveal then writes the name under it).
      if (full && sym && full.url === sym.url) full = null;
      if (sym) {
        const ext = await save(o.stage, b.id, 'symbol', sym);
        if (ext) { entry.symbol = { url: sym.page || sym.url, from: sym.from, licence: sym.licence, ext, guess: !!sym.guess }; tally[sym.from]++; }
      }
      if (!entry.symbol) tally.missingSymbol.push(b.id);
      if (full) {
        const ext = await save(o.stage, b.id + '-full', 'full', full);
        if (ext) entry.full = { url: full.page || full.url, from: full.from, licence: full.licence, ext };
      }
      if (!entry.full) tally.missingFull.push(b.id);
    } catch (e) {
      tally.errors.push(b.id + ': ' + e.message);
    }
    sources[b.id] = entry;
    fs.writeFileSync(srcFile, JSON.stringify(sources, null, 1));
    process.stdout.write(b.id + (entry.symbol ? ' S:' + entry.symbol.from[0] : ' S:-') + (entry.full ? ' F:' + entry.full.from[0] : ' F:-') + '\n');
  }
  console.log('\nsymbols from theSVG ' + tally.thesvg + ', from Wikipedia ' + tally.wikipedia);
  console.log('no symbol (' + tally.missingSymbol.length + '): ' + tally.missingSymbol.join(', '));
  console.log('no full logo (' + tally.missingFull.length + '): ' + tally.missingFull.join(', '));
  if (tally.errors.length) console.log('problems:\n  ' + tally.errors.join('\n  '));
})();
