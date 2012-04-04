var url = require("url");
var crypto = require("crypto");
var mmh = require("murmurhash3");

exports.parse = function(idrStr) {
  if (typeof idrstr == "object") return idrStr;
  var idr = url.parse(idrStr);
  console.dir(idr);
  if (idr.hash) {
    if (idr.hash[0] == "#") idr.hash = idr.hash.substring(1);
    idr.id = idr.hash;
  }

  return idr;
}

exports.toString = function(idr) {
  idr = exports.parse(idr);
  if (!idr.hash && idr.id) idr.hash = "#" + idr.id;
  return url.format(idr);
}

/// Returns just the base of the given idr
exports.base = function(idr) {
  idr = exports.parse(idr);
  baseIdr = {
    href:idr.href,
    protocol:idr.protocol,
    auth:idr.auth,
    host:idr.host,
    pathname:idr.pathname
  };

  return baseIdr;
}

exports.clone = function(idr) {
  // XXX man this feels so nasty!
  return exports.parse(exports.toString(idr));
}

exports.hash = function(idr) {
  console.dir(exports.toString(exports.parse(idr)));
  return mmh.murmur128HexSync(exports.toString(exports.parse(idr)));
}

exports.baseHash = function(idr) {
  return mmh.murmur128HexSync(exports.toString(exports.base(exports.parse(idr))));
}
