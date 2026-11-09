'use strict';
/* Writes tools/logos/sheet.html (git-ignored): every Logo Rush brand as a card — the
   symbol on its tile, the full logo, name, category, tier and source — to check by eye
   that no symbol shows the brand's name. Pictures are inlined, so the page works alone.
   Tap a card to flag it; the bar at the top lists flagged ids to copy.

     node tools/logos/sheet.js [--only-wiki]     --only-wiki: just symbols that came from Wikipedia */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, 'assets', 'images', 'games', 'logoRush');

function load(file) {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext('var window = this.window; window.FF = {}; var FF = window.FF;' + fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx);
  return ctx.window.FF.data;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function dataUri(name, ext) {
  if (!ext) return '';
  const buf = fs.readFileSync(path.join(DIR, name + '.' + ext));
  return 'data:' + (ext === 'svg' ? 'image/svg+xml' : 'image/webp') + ';base64,' + buf.toString('base64');
}

const onlyWiki = process.argv.indexOf('--only-wiki') !== -1;
const logos = load('js/data/logos.js').logos;
const files = load('js/data/logoFiles.js').logoFiles;
const sources = JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'), 'utf8'));
const cats = logos.categories;

const cards = logos.brands.filter((b) => !onlyWiki || ((sources[b.id] || {}).symbol || {}).from === 'wikipedia').map((b) => {
  const f = files[b.id] || ['', ''];
  const src = sources[b.id] || {};
  const sym = f[0] ? '<img src="' + dataUri(b.id, f[0]) + '" alt="">' : (b.crop ? '<em>crop</em>' : '<em>none</em>');
  const full = f[1] ? '<img src="' + dataUri(b.id + '-full', f[1]) + '" alt="">' : '<em>—</em>';
  const wiki = (src.symbol || {}).from === 'wikipedia';
  return '<button class="card' + (wiki ? ' card--wiki' : '') + '" data-id="' + b.id + '" data-cat="' + b.cat + '"' + (b.africa ? ' data-africa="1"' : '') + '>' +
    '<span class="tile tile--' + b.bg + '">' + sym + '</span><span class="full">' + full + '</span>' +
    '<b>' + esc(b.name) + '</b><small>' + b.id + ' · ' + b.cat + ' · tier ' + b.tier + (b.africa ? ' · Africa' : '') + '</small>' +
    '<small>symbol: ' + esc((src.symbol || {}).from || '—') + (wiki ? ' (check!)' : '') + ' · ' + esc((src.symbol || {}).licence || '') + '</small></button>';
}).join('\n');

const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Logo Rush contact sheet</title><style>' +
  ':root{--bg:#f4f2ee;--card:#fff;--ink:#1c1b19;--muted:#6b6760;--line:#dcd8d0;--flag:#d4380d;--wiki:#b7791f}' +
  '@media (prefers-color-scheme:dark){:root{--bg:#17161a;--card:#222127;--ink:#eeeae4;--muted:#a19c94;--line:#34323a;--flag:#ff7a45;--wiki:#f6c453}}' +
  'body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.4 system-ui,sans-serif}' +
  'header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;z-index:1}' +
  'h1{font-size:18px;margin:0 0 6px}p{margin:0 0 8px;color:var(--muted)}' +
  '.filters button,.copy{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;padding:4px 10px;margin:2px;cursor:pointer}' +
  '.filters button.on{background:var(--ink);color:var(--bg)}#flags{font-family:ui-monospace,monospace;word-break:break-all;color:var(--flag)}' +
  'main{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;padding:16px}' +
  '.card{font:inherit;color:inherit;text-align:left;display:flex;flex-direction:column;gap:6px;background:var(--card);border:2px solid var(--line);border-radius:14px;padding:10px;cursor:pointer}' +
  '.card--wiki{border-color:var(--wiki)}.card.flagged{border-color:var(--flag);box-shadow:0 0 0 3px var(--flag)}' +
  '.tile{display:grid;place-items:center;height:110px;border-radius:10px;padding:10px}.tile--light{background:#fff;border:1px solid #e4e0d8}.tile--dark{background:#1d1b22}' +
  '.tile img{max-width:100%;max-height:90px}.full{display:grid;place-items:center;height:44px}.full img{max-width:100%;max-height:40px;background:#fff;border-radius:4px;padding:2px}' +
  'small{color:var(--muted);font-size:12px}em{color:var(--muted)}.hide{display:none}' +
  '</style><header><h1>Logo Rush contact sheet (' + logos.brands.length + ' brands)</h1>' +
  '<p>The big tile is what players see. Tap any card whose symbol shows the brand name, looks wrong or old, or is hard to see. Gold borders came from Wikipedia: check those first.</p>' +
  '<div class="filters"><button class="on" data-f="all">All</button>' + cats.map((c) => '<button data-f="' + c.id + '">' + esc(c.name) + '</button>').join('') +
  '<button data-f="africa">African brands</button><button data-f="wiki">From Wikipedia</button><button data-f="flagged">Flagged</button></div>' +
  '<p>Flagged: <span id="flags">none</span> <button class="copy" id="copy">Copy list</button></p></header><main>' + cards + '</main>' +
  '<script>var KEY="logoRushSheetFlags";var flags={};try{flags=JSON.parse(localStorage.getItem(KEY)||"{}")}catch(e){}' +
  'function draw(){document.querySelectorAll(".card").forEach(function(c){c.classList.toggle("flagged",!!flags[c.dataset.id])});var l=Object.keys(flags);document.getElementById("flags").textContent=l.length?l.join(", "):"none";try{localStorage.setItem(KEY,JSON.stringify(flags))}catch(e){}}' +
  'document.querySelector("main").addEventListener("click",function(e){var c=e.target.closest(".card");if(!c)return;if(flags[c.dataset.id])delete flags[c.dataset.id];else flags[c.dataset.id]=1;draw()});' +
  'document.querySelector(".filters").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;document.querySelectorAll(".filters button").forEach(function(x){x.classList.toggle("on",x===b)});var f=b.dataset.f;' +
  'document.querySelectorAll(".card").forEach(function(c){var show=f==="all"||c.dataset.cat===f||(f==="africa"&&c.dataset.africa)||(f==="wiki"&&c.classList.contains("card--wiki"))||(f==="flagged"&&flags[c.dataset.id]);c.classList.toggle("hide",!show)})});' +
  'document.getElementById("copy").addEventListener("click",function(){var t=Object.keys(flags).join(", ");if(navigator.clipboard)navigator.clipboard.writeText(t)});draw();</script></html>';

fs.writeFileSync(path.join(__dirname, 'sheet.html'), html);
console.log('wrote tools/logos/sheet.html (' + Math.round(html.length / 1024) + ' KB)');
