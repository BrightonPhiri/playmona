#!/usr/bin/env node
/* Runs a few tools/test files by name. Usage: node tools/test/one.js points bibleQuiz */
'use strict';

const path = require('path');
const harness = require('./harness');

const names = process.argv.slice(2);
if (!names.length) {
  console.error('Usage: node tools/test/one.js <name> [<name> ...]   (name = file without .test.js)');
  process.exit(1);
}
names.forEach(function (n) {
  console.log(n + '.test.js');
  require(path.join(__dirname, n.replace(/\.test\.js$/, '') + '.test.js'));
});
console.log('');
harness.run().then(function (failures) { process.exit(failures > 0 ? 1 : 0); });
