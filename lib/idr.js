var url = require("url");
var crypto = require("crypto");
var mmh = require("murmurhash3");

exports.parse = function(idrStr) {
  if (typeof idrStr == "object") return idrStr;
  var idr = url.parse(idrStr);
  if (idr.hash && idr.hash[0] == "#") idr.hash = idr.hash.substring(1);
  if (idr.hash && idr.hash[0] == "#") idr.hash = idr.hash.substring(1);
  return idr;
}

exports.toString = function(idr) {
  idr = exports.parse(idr);
  return url.format(idr);
}

/// Returns just the base of the given idr
exports.base = function(idr) {
  idr = exports.parse(idr);
  baseIdr = {
    protocol:idr.protocol,
    auth:idr.auth,
    host:idr.host,
    pathname:idr.pathname
  };

  return baseIdr;
}

/// Returns the global of the given idr
exports.global = function(idr) {
  idr = exports.parse(idr);
  gIdr = {
    hash:idr.hash,
    protocol:idr.protocol,
    host:idr.host
  };
  return gIdr;
}

exports.clone = function(idr) {
  // XXX man this feels so nasty!
  return exports.parse(exports.toString(idr));
}

exports.hash = function(idr) {
  return mmh.murmur128HexSync(exports.toString(exports.parse(idr)));
}

exports.baseHash = function(idr) {
  return mmh.murmur128HexSync(exports.toString(exports.base(exports.parse(idr))));
}
