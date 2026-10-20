/* Minimal test harness for PlayMora.
   Node built-ins only. Loads classic `window.FF` scripts via vm. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');

/* A document stub sufficient for modules that touch the DOM lazily.
   Enough for element creation and tree building; not a real DOM. */
function makeDocument() {
  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      children: [],
      style: {},
      dataset: {},
      attributes: {},
      textContent: '',
      className: '',
      disabled: false,
      parentNode: null,
      _listeners: {},
      classList: {
        _set: {},
        add: function (c) { this._set[c] = true; },
        remove: function (c) { delete this._set[c]; },
        toggle: function (c, on) { if (on) this.add(c); else this.remove(c); },
        contains: function (c) { return !!this._set[c]; }
      },
      appendChild: function (c) { this.children.push(c); if (c) c.parentNode = this; return c; },
      removeChild: function (c) {
        const i = this.children.indexOf(c);
        if (i !== -1) this.children.splice(i, 1);
        if (c) c.parentNode = null;
        return c;
      },
      setAttribute: function (k, v) { this.attributes[k] = String(v); },
      getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
      addEventListener: function (t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
      removeEventListener: function (t, fn) {
        const list = this._listeners[t] || [];
        const i = list.indexOf(fn);
        if (i !== -1) list.splice(i, 1);
      },
      dispatch: function (t, ev) { (this._listeners[t] || []).slice().forEach(function (fn) { fn(ev || {}); }); },
      querySelector: function () { return null; },
      querySelectorAll: function () { return []; },
      focus: function () {},
      remove: function () { if (this.parentNode) this.parentNode.removeChild(this); }
    };
    return el;
  }
  const doc = makeEl('document');
  doc.head = makeEl('head');
  doc.body = makeEl('body');
  doc.createElement = makeEl;
  doc.createTextNode = function (t) { return { nodeType: 3, textContent: String(t) }; };
  return doc;
}

/* Load one or more FF scripts into an isolated sandbox. */
function loadFF(relativePaths) {
  const doc = makeDocument();
  const sandbox = {
    document: doc,
    navigator: { userAgent: 'node', maxTouchPoints: 0 },
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    setInterval: setInterval,
    clearInterval: clearInterval,
    Date: Date,
    Math: Math,
    JSON: JSON,
    Promise: Promise,
    Node: function Node() {}
  };
  // The slice of the browser surface these scripts touch at load time.
  const winListeners = {};
  sandbox.addEventListener = function (t, fn) { (winListeners[t] = winListeners[t] || []).push(fn); };
  sandbox.removeEventListener = function (t, fn) {
    const list = winListeners[t] || [];
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  };
  sandbox.dispatchEvent = function (ev) {
    (winListeners[(ev && ev.type) || ''] || []).slice().forEach(function (fn) { fn(ev); });
    return true;
  };
  sandbox.requestAnimationFrame = function (fn) { return setTimeout(function () { fn(Date.now()); }, 16); };
  sandbox.cancelAnimationFrame = function (id) { clearTimeout(id); };
  sandbox.innerWidth = 1024;
  sandbox.innerHeight = 768;
  sandbox.location = { href: 'http://localhost/', hash: '', search: '' };
  sandbox.matchMedia = function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; };
  sandbox.localStorage = (function () {
    let store = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      key: function (i) { return Object.keys(store)[i] || null; },
      get length() { return Object.keys(store).length; }
    };
  })();

  // In a browser `window` IS the global object, so `window.FF = {}`
  // creates a global `FF`. Model that exactly, or scripts that assign
  // via `window.FF` but read bare `FF` break.
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.createContext(sandbox);

  relativePaths.forEach(function (rel) {
    const full = path.join(ROOT, rel);
    const code = fs.readFileSync(full, 'utf8');
    try {
      vm.runInContext(code, sandbox, { filename: rel });
    } catch (e) {
      throw new Error('Failed loading ' + rel + ': ' + e.message);
    }
  });

  if (!sandbox.FF) throw new Error('Scripts did not define window.FF: ' + relativePaths.join(', '));
  sandbox.FF.__sandbox = sandbox;
  return sandbox.FF;
}

/* --- assertions --- */
class AssertionError extends Error {}

function assert(cond, msg) {
  if (!cond) throw new AssertionError(msg || 'Expected truthy value');
}

function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new AssertionError((msg || 'Values differ') + '\n    expected: ' + b + '\n    actual:   ' + a);
  }
}

function assertClose(actual, expected, tolerance, msg) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new AssertionError((msg || 'Numbers differ') +
      '\n    expected: ' + expected + ' +/- ' + tolerance + '\n    actual:   ' + actual);
  }
}

/* --- runner --- */
const tests = [];
function test(name, fn) { tests.push({ name: name, fn: fn }); }

async function run() {
  let failures = 0;
  let passes = 0;
  for (const t of tests) {
    try {
      await t.fn();
      passes++;
      console.log('  PASS  ' + t.name);
    } catch (e) {
      failures++;
      console.log('  FAIL  ' + t.name);
      console.log('        ' + String(e.message).split('\n').join('\n        '));
      if (!(e instanceof AssertionError)) console.log(e.stack);
    }
  }
  console.log('');
  console.log(passes + ' passed, ' + failures + ' failed, ' + tests.length + ' total');
  return failures;
}

module.exports = { loadFF, test, assert, assertEqual, assertClose, run, ROOT };
