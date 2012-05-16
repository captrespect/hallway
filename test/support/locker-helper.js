var path   = require('path')
  , temp   = require('temp')
  , wrench = require('wrench')
  , fs     = require('fs')
  , util   = require('util')
  ;

var lconfig;

exports.configurate = function () {
  if (!lconfig) {
    // override from the system temporary directory because of the locker's insane insistence on relative paths.
    temp.dir = '.';

    lconfig = require(path.join(__dirname, '..', '..', 'lib', 'lconfig.js'));
    lconfig.load(path.join(process.env.LOCKER_CONFIG, 'config.json'));
  }

  return lconfig;
};

exports.loadFixture = function (path) {
  return JSON.parse(fs.readFileSync(path));
};

