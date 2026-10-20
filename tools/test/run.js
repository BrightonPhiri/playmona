#!/usr/bin/env node
/* Runs every tools/test/*.test.js file. Usage: node tools/test/run.js */
'use strict';

const fs = require('fs');
const path = require('path');
const harness = require('./harness');

const dir = __dirname;
const files = fs.readdirSync(dir)
  .filter(function (f) { return f.endsWith('.test.js'); })
  .sort();

if (!files.length) {
  console.error('No .test.js files found in ' + dir);
  process.exit(1);
}

console.log('PlayMora test suite');
console.log('');
files.forEach(function (f) {
  console.log(f);
  require(path.join(dir, f));
});
console.log('');

harness.run().then(function (failures) {
  process.exit(failures > 0 ? 1 : 0);
});
