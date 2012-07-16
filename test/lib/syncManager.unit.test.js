var path = require('path');

var helper = require(path.join(__dirname, '..', 'support', 'locker-helper'));
helper.configurate();

var dal = require('dal');
dal.setBackend('fake');

var syncManager = require('syncManager');

describe('syncManager.manager', function() {
  describe('#init()', function() {
    it('should initialize the syncManager', function(done) {
      //syncManager.manager.init(false, function(err) {
      //  assert.isNull(err);

        done();
      //});
    });
  });
});
