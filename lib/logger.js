/**
* Forked from Mikeal Rogers Stoopid project at http://github.com/mikeal/stoopid.
*/
var util = require('util')
  , colors = require('colors')
  , fs = require('fs')
  ;
var moment = require("moment");

var globals = {}
  , levels = 
    { silly: 10
    , verbose: 100
    , debug: 200
    , info: 300
    , warn: 400
    , error: 500
    }
  , rlevels = {}
  ;

colors.setTheme(
  { silly: 'rainbow'
  , input: 'grey'
  , verbose: 'green'
  , prompt: 'grey'
  , info: 'cyan'
  , data: 'grey'
  , help: 'cyan'
  , warn: 'yellow'
  , debug: 'green'
  , error: 'red'
  }
)

function Handler () {}
Handler.prototype.msg = function () {
  return util.format.apply(this, arguments)
}

function Console () {
  this.filter = -1
}
util.inherits(Console, Handler)
Console.prototype.onLog = function (logger, level, arguments) {
  var self = this
  if (level < this.filter) return;
  var msg = util.format.apply(this, arguments);
  msg = msg[rlevels[level]] || msg
  msg = "[" + moment().format("MM/DD/YYYY HH:mm:ss").grey + ']['+logger.name.cyan + '] - '+ msg 
  if (logger.stripColors) msg = msg.stripColors;
  process.stdout.write(msg+'\n')
}

function File (path) {
  this.filter = -1
  this.path = path
  this.writer = fs.createWriteStream(path, {flags: 'a+'})
}
util.inherits(File, Handler)
File.prototype.onLog = function (logger, level, arguments) {
  var self = this
  if (level < this.filter) return
  var msg = this.msg.apply(this, arguments)
  msg = '['+logger.name + '] - '+msg 
  this.writer.write(msg+'\n')
}

function Logger (name, parent) {
  var self = this
  self.stripColors = false;
  self.name = name
  self.parent = parent  
  self._l = false
  if (parent) {
    self.handlers = parent.handlers
  } else {
    self.handlers = []
  }
}
Logger.prototype.logger = function (name) {
  return new Logger(name, this)
}

Logger.prototype._log = function () {
  var args = Array.prototype.slice.apply(arguments)
    , self = this
    ;
  if (!self._l) {
    var level = args.shift()
  } else {
    var level = self._l
  }
  self.handlers.forEach(function (h) {
    h.onLog(self, level, args)
  })
}

for (i in levels) {
  (function (i) {
    Logger.prototype[i] = function () { 
      this._l = levels[i]
      this._log.apply(this, arguments)
      this._l = false
    }
    rlevels[levels[i]] = i
  })(i)
}

Logger.prototype.log = Logger.prototype.info
Logger.prototype.dir = Logger.prototype.log
Logger.prototype.time = function (label) {
  this.times = {}
  times[label] = Date.now()
}
Logger.prototype.timeEnd = function (label) {
  var duration = Date.now() - this.times[label]
  this.log('%s: %dms', label, duration)
}
var realError = Logger.prototype.error;
Logger.prototype.error = function() {
  realError.apply(this, arguments);
  this.trace();
}
Logger.prototype.trace = function(label) {
  // TODO probably can to do this better with V8's debug object once that is
  // exposed.
  var err = new Error
  err.name = 'Trace'
  err.message = label || ''
  Error.captureStackTrace(err, arguments.callee)
  realError.apply(this, [err.stack])
}
Logger.prototype.assert = function (expression) {
  if (!expression) {
    var arr = Array.prototype.slice.call(arguments, 1)
    require('assert').ok(false, util.format.apply(this, arr))
  }
}
Logger.prototype.errorObject = function(err) {
  this.error(err);
  return err;
};

var handlerMap = 
  { console: Console
  , file: File
  }
Logger.prototype.addHandler = function (handler, options) {
  if (typeof handler === 'string') {
    if (!handlerMap[handler]) throw new Error('no handler named '+handler)
    handler = new handlerMap[handler](options)
  }
  this.handlers.push(handler)
}

module.exports = new Logger('process')
module.exports.addHandler('console')


