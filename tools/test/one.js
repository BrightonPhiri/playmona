// node tools/test/one.js <file.test.js> : runs one test file.
require('./' + process.argv[2]);
require('./harness').run().then(function (f) { process.exit(f ? 1 : 0); });
