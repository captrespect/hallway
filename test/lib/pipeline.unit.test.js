var lconfig = require("lconfig");
if (!lconfig.database) lconfig.database = {};
lconfig.database.maxConnections = 1;
var pipeline = require('pipeline');

describe("Pipeline", function() {
  describe("takes bad data", function() {
    it("should not crash", function(done){
      pipeline.inject({pumps:[],'related:42@foo/bar':[{'_id':4242}]}, done);
    });
  });
});
