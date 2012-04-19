var path   = require('path')
  , temp   = require('temp')
  , wrench = require('wrench')
  , fs     = require('fs')
  , util   = require('util')
  ;

var lconfig
  , locker
  ;

exports.configurate = function () {
  if (!lconfig) {
    // override from the system temporary directory because of the locker's insane insistence on relative paths.
    temp.dir = '.';

    process.env.NODE_PATH = path.join(__dirname, '..', '..', 'Common', 'node');

    process.env.LOCKER_TEST = "oh yeah";
    process.env.LOCKER_ROOT = path.join(__dirname, '..', '..');
    process.env.LOCKER_CONFIG = path.join(__dirname, '..', 'resources');

    lconfig = require(path.join(__dirname, '..', '..', 'Common', 'node', 'lconfig.js'));
    lconfig.load(path.join(process.env.LOCKER_CONFIG, 'config.json'));
  }

  return lconfig;
};

exports.loadFixture = function (path) {
  return JSON.parse(fs.readFileSync(path));
};

