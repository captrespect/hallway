var async = require('async');
var fs = require('fs');
var git = require('gift');
var path = require('path');
var request = require('request');
var url = require('url');

// Get the hash of the current git revision
exports.currentRevision = function(cb) {
  var repo = git('.');

  repo.commits('production', 1, function(err, commits) {
    if (!commits) {
      return cb(err);
    }

    cb(err, commits[0].id);
  });
};

// simple util for consistent but flexible binary options
exports.isTrue = function(field) {
  if (!field) return false;
  if (field === true) return true;
  if (field == "true") return true;
  if (field == "1") return true;
  if (field == "yes") return true;

  return false;
};

/**
 * Adopted from jquery's extend method. Under the terms of MIT License.
 *
 * http://code.jquery.com/jquery-1.4.2.js
 *
 * Modified by Brian White to use Array.isArray instead of the custom isArray method
 */
exports.extend = function() {
  // copy reference to target object
  var target = arguments[0] || {}, i = 1, length = arguments.length, deep = false, options, name, src, copy;

  // Handle a deep copy situation
  if (typeof target === "boolean") {
    deep = target;
    target = arguments[1] || {};
    // skip the boolean and the target
    i = 2;
  }

  // Handle case when target is a string or something (possible in deep copy)
  if (typeof target !== "object" && typeof target !== 'function')
    target = {};

  var isPlainObject = function(obj) {
    // Must be an Object.
    // Because of IE, we also have to check the presence of the constructor property.
    // Make sure that DOM nodes and window objects don't pass through, as well
    if (!obj || toString.call(obj) !== "[object Object]" || obj.nodeType || obj.setInterval)
      return false;

    var has_own_constructor = hasOwnProperty.call(obj, "constructor");
    var has_is_property_of_method = hasOwnProperty.call(obj.constructor.prototype, "isPrototypeOf");
    // Not own constructor property must be Object
    if (obj.constructor && !has_own_constructor && !has_is_property_of_method)
      return false;

    // Own properties are enumerated firstly, so to speed up,
    // if last one is own, then all properties are own.

    var last_key;
    for (var key in obj)
      last_key = key;

    return typeof last_key === "undefined" || hasOwnProperty.call(obj, last_key);
  };

  for (; i < length; i++) {
    // Only deal with non-null/undefined values
    if ((options = arguments[i]) !== null) {
      // Extend the base object
      for (name in options) {
        src = target[name];
        copy = options[name];

        // Prevent never-ending loop
        if (target === copy)
          continue;

        // Recurse if we're merging object literal values or arrays
        if (deep && copy && (isPlainObject(copy) || Array.isArray(copy))) {
          var clone = src && (isPlainObject(src) || Array.isArray(src)) ? src : Array.isArray(copy) ? [] : {};

          // Never move original objects, clone them
          target[name] = exports.extend(deep, clone, copy);

          // Don't bring in undefined values
        } else if (typeof copy !== "undefined")
          target[name] = copy;
      }
    }
  }

  // Return the modified object
  return target;
};

// Found on http://bonsaiden.github.com/JavaScript-Garden/#types.typeof
exports.is = function(type, obj) {
  var clas = Object.prototype.toString.call(obj).slice(8, -1);
  return obj !== undefined && obj !== null && clas === type;
};

exports.addAll = function(thisArray, anotherArray) {
  if (!(thisArray && anotherArray && anotherArray.length))
    return;
  for(var i = 0; i < anotherArray.length; i++)
    thisArray.push(anotherArray[i]);
};

exports.ucfirst = function(str) {
  return str.charAt(0).toUpperCase() + str.substring(1).toLowerCase();
};

exports.getPropertyInObject = function(jsonObject, propertyName, callback) {
  var foundValues = [];

  function recurseObject(jsonObject, propertyName) {
    if (exports.is("Object", jsonObject)) {
      for (var m in jsonObject) {
        if (jsonObject.hasOwnProperty(m)) {
          if (m === propertyName) {
            foundValues.push(jsonObject[m]);
          }
          else if (exports.is("Object", jsonObject[m])) {
            recurseObject(jsonObject[m], propertyName);
          }
          else if (exports.is("Array", jsonObject[m])) {
            for (var n=0; n<jsonObject[m].length; n++) {
              recurseObject(jsonObject[m][n], propertyName);
            }
          }
        }
      }
    }
  }
  recurseObject(jsonObject, propertyName);
  callback(foundValues);
};

// quick/dirty sanitization ripped from the Jade template engine
exports.sanitize = function(term) {
  return String(term)
    .replace(/&(?!\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

exports.trim = function(str) {
  return str.replace(/^\s+|\s+$/g, '');
};

exports.atomicWriteFileSync = function(dest, data) {
  var tmp = dest + '.tmp';
  var bkp = dest + '.bkp';
  var stat;

  try {
    stat = fs.statSync(dest);
  } catch (err) {
  }

  // make a backup if the destination file already exists
  if (stat)
    fs.writeFileSync(bkp, fs.readFileSync(dest));

  // write out the new contents to a temp file
  fs.writeFileSync(tmp, data);

  // check if it worked
  if (data.length && fs.statSync(tmp).size !== Buffer.byteLength(data, 'utf8')) throw new Error('atomic write error! file size !== data.length');

  // atomically rename the temp file into place
  fs.renameSync(tmp, dest);
};

// processes a json newline stream, cbEach(json, callback) and cbDone(err) when done
exports.streamFromUrl = function(url, cbEach, cbDone) {
  var ended = false;
  var q = async.queue(function(chunk, cb) {
    if (chunk === "") return cb();
    var js;
    try { js = JSON.parse(chunk); } catch (E) { return cb(); }
    cbEach(js, cb);
  },1);
  var error;
  var req = request.get({uri:url}, function(err) {
    if (err) error = err;
    ended = true;
    q.push(""); // this triggers the drain if there was no data, GOTCHA
  });
  var buff = "";
  req.on("data",function(data) {
    buff += data.toString();
    var chunks = buff.split('\n');
    buff = chunks.pop(); // if was end \n, == '', if mid-stream it'll be a not-yet-complete chunk of json
    chunks.forEach(q.push);
  });
  q.drain = function() {
    if (!ended) return; // drain can be called many times, we only care when it's after data is done coming in
    cbDone(error);
  };
  req.on("end",function() {
    ended = true;
    q.push(""); // this triggers the drain if there was no data, GOTCHA
  });
};

/// An async forEachSeries
/**
* The async implementation can explode the stack, this version will not.
*/
exports.forEachSeries = function(items, cbEach, cbDone) {
  function runOne(idx) {
    idx = idx || 0;
    if (idx >= items.length) return cbDone();
    cbEach(items[idx], function(err) {
      if (err) return cbDone(err)
      process.nextTick(function() {
        runOne(idx + 1);
      });
    });
  }
  runOne();
};

exports.jsonErr = function(msg, extras) {
  return exports.extend(extras || {}, {error: exports.sanitize(msg)});
};
