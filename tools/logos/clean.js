'use strict';
/* Cleans a downloaded logo SVG so it is safe and small to ship:
   no scripts, event handlers, foreignObject, outside links or editor
   clutter; always a viewBox, so the logo scales inside an <img>.

     const { cleanSvg } = require('./clean.js');
     const { svg, problems } = cleanSvg(text);   // problems: strings, empty when fine

   Used by tools/logos/fetch.js. Node built-ins only. */

function attr(tag, name) {
  const m = tag.match(new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? (m[2] != null ? m[2] : m[3]) : null;
}
function dropAttr(tag, name) {
  return tag.replace(new RegExp('\\s' + name + '\\s*=\\s*("[^"]*"|\'[^\']*\')', 'gi'), '');
}
function num(v) {
  const m = String(v || '').match(/^\s*([\d.]+)\s*(px)?\s*$/);
  return m ? Number(m[1]) : null;
}

function cleanSvg(text) {
  const problems = [];
  let s = String(text || '');
  s = s.replace(/^\uFEFF/, '');
  s = s.replace(/<\?xml[\s\S]*?\?>/gi, '');
  s = s.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  ['script', 'foreignObject', 'metadata', 'sodipodi:namedview', 'title', 'desc'].forEach((t) => {
    s = s.replace(new RegExp('<' + t + '\\b[\\s\\S]*?</' + t + '>', 'gi'), '');
    s = s.replace(new RegExp('<' + t + '\\b[^>]*/>', 'gi'), '');
  });
  // Elements and attributes from drawing programs (inkscape:, sodipodi:).
  s = s.replace(/<(inkscape|sodipodi):[^>]*\/>/gi, '');
  s = s.replace(/\s(?:inkscape|sodipodi):[\w-]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  // Event handlers.
  s = s.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, '');
  // Pictures fetched from elsewhere go; links are unwrapped, keeping what they hold.
  s = s.replace(/<image\b[^>]*(?:xlink:)?href\s*=\s*["']https?:[^>]*?(?:\/>|>[\s\S]*?<\/image>)/gi, '');
  s = s.replace(/<a\b[^>]*>/gi, '').replace(/<\/a>/gi, '');
  s = s.replace(/\s(?:xlink:)?href\s*=\s*("https?:[^"]*"|'https?:[^']*')/gi, '');
  s = s.replace(/@import[^;]+;/gi, '');

  const open = s.match(/<svg\b[^>]*>/i);
  if (!open) return { svg: '', problems: ['not an SVG'] };
  let root = open[0];
  if (!attr(root, 'viewBox')) {
    const w = num(attr(root, 'width'));
    const h = num(attr(root, 'height'));
    if (w && h) root = root.replace(/^<svg\b/i, '<svg viewBox="0 0 ' + w + ' ' + h + '"');
    else problems.push('no viewBox and no plain width/height');
  }
  root = dropAttr(dropAttr(root, 'width'), 'height');
  if (!/xmlns=/.test(root)) root = root.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  s = s.slice(0, open.index) + root + s.slice(open.index + open[0].length);
  s = s.slice(s.search(/<svg\b/i));
  s = s.replace(/>\s+</g, '><').trim();
  if (/<text[\s>]/i.test(s)) problems.push('has <text>');
  return { svg: s, problems };
}

module.exports = { cleanSvg };
