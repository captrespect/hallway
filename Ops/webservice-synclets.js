var syncManager = require('syncManager.js');

module.exports = function(locker) {

  // not sure /post is the right base here but needed it for easy bodyparser flag
  locker.post('/post/:id/:synclet', function(req, res) {
    syncManager.syncNow(req.params.id, req.params.synclet, req.body, function() {
      res.send(true);
    });
  });

  // Returns a list of the current set of friends or followers
  locker.get('/synclets/:syncletId/getCurrent/:type', function(req, res) {
    syncManager.getIJOD(req.params.syncletId, req.params.type, false, function(ijod) {
      if(!ijod) return res.send('not found', 404);
      ijod.reqCurrent(req, res);
    });
  });

  locker.get('/synclets/:syncletId/:type/id/:id', function(req, res) {
    syncManager.getIJOD(req.params.syncletId, req.params.type, false, function(ijod) {
      if(!ijod) return res.send('not found', 404);
      ijod.reqID(req, res);
    });
  });

};

