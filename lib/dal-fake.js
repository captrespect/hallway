fakes = [];
noOps = [
  /^BEGIN$/i,
  /^COMMIT$/i,
  /^CREATE/i
];

function FakeDB() {
};
FakeDB.prototype.query = function(sql, binds, cb) {
  if (!Array.isArray(binds)) {
    cb = binds;
    binds = undefined;
  }
  if (!cb) cb = function() {};

  if (exports.debug) console.log("FakeDB: %s - %j", sql, binds);

  var done = fakes.some(function(fake) {
    if ((RegExp.prototype.isPrototypeOf(fake.sql) && fake.sql.test(sql)) || fake.sql == sql) {
      var rows = fakes[fake.rows];
      if (Function.prototype.isPrototypeOf(rows)) {
        cb(null, rows(binds));
      } else {
        cb(null, rows);
      }
      return true;
    }
    return false;
  })

  done = done || noOps.some(function(noop) {
    if (noop.test(sql)) {
      cb(null, []);
      return true;
    }
    return false;
  })

  if (!done) cb(new Error("Unknown sql: " + sql));
  process.stderr.write("********* Returning " + sql + "\n");
  return {sql:sql};
};

exports.create = function(config, callback) {
  callback(null, new FakeDB());
};
exports.debug = false;

exports.addFake = function(sql, rows) {
  fakes.push({sql:sql, rows:rows});
};
exports.addFakeFromFile = function(sql, filename) {
  exports.addFake(sql, JSON.parse(fs.readFileSync(filename)));
};
exports.addNoOp = function(re) {
  fakes.push({sql:re, rows:[]});
};
exports.reset = function() {
  fakes = {};
}
