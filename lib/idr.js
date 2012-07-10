var url = require("url");
var crypto = require("crypto");
var mmh = require("murmurhash3");

/*
   IDR

   A simple way to store a rich extensible id structure as a parseable/serializeable string key, examples:

   IDR - TL;DR

   There are an innumerable amount of things that need to be "addressed" within the locker, and not just externally, but strong internal references to the actual local storage identifiers as well.  These addressible entities are not simple GUIDs either, they have a critical set of metadata that makes up their identity, most importantly the originating network, the type of entity it is on that network, and the unique identifier assigned to it by that network.  Often equally important is the context in which it was discovered from that network, the common example being a tweet, from twitter, encountered as a mention.  Other locally important attributes sometimes need to be tracked as well, such as the account id that the entity originated from.

   All of these attributes are required to uniquely resolve a reference to an entity to the actual data, either locally (requiring the context and account bits) or globally (just the type, network, and id bits).  While programmatically each of these is independently important, as identifiers they need to be stored in a consistent way as a unique string for simple KV lookups/matching.  There is a standard and built-in library perfect for this job, URLs! They're also very familiar to read and the tools handle all the encoding, parsing, etc.
*/

// make sure it's parsed and clean up url-ish bits of the data we don't want
exports.parse = function(idrStr) {
  if (typeof idrStr == "object") return idrStr;
  var idr = url.parse(idrStr);
  if (idr.hash && idr.hash[0] == "#") idr.hash = idr.hash.substring(1);
  if (idr.protocol && idr.protocol.substr(-1) == ":") idr.protocol = idr.protocol.substring(0,idr.protocol.length-1);
  if (idr.path && idr.path[0] == "/") idr.path = idr.path.substring(1);
  if (idr.pathname && idr.pathname[0] == "/") idr.pathname = idr.pathname.substring(1);
  return idr;
}

exports.toString = function(idr) {
  idr = exports.parse(idr);
  if (idr.path && idr.path[0] != "/") idr.path = "/" + idr.path;
  if (idr.pathname && idr.pathname[0] != "/") idr.pathname = "/" + idr.pathname;
  return url.format(idr);
}

/// Returns just the "profile id" as we call it
exports.pid = function(idr) {
  idr = exports.parse(idr);
  if(!idr.auth || idr.auth.length == 0) return idr.host;
  return idr.auth + '@' + idr.host;
}

/// Returns just the base of the given idr
exports.base = function(idr) {
  idr = exports.parse(idr);
  var baseIdr = {
    protocol:idr.protocol,
    auth:idr.auth,
    host:idr.host,
    pathname:idr.pathname
  };
  if (baseIdr.pathname && baseIdr.pathname[0] == "/") baseIdr.pathname = baseIdr.pathname.substring(1);

  return baseIdr;
}

/// Returns the global of the given idr
exports.global = function(idr) {
  idr = exports.parse(idr);
  var gIdr = {
    hash:idr.hash,
    protocol:idr.protocol,
    host:idr.host
  };
  return gIdr;
}

/// type:service/path is the key, no auth or hash
exports.key = function(idr) {
  idr = exports.parse(idr);
  var kIdr = {
    protocol:idr.protocol,
    host:idr.host,
    pathname:idr.pathname
  };
  return kIdr;
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

exports.id = function(idr) {
  var idh = exports.hash(idr);
  var idb = mmh.murmur128HexSync(exports.pid(idr));
  return idh + '_' + idb.substr(0,9);
}
