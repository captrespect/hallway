var should = require('should');
var lconfig = require("lconfig");
if (!lconfig.database) lconfig.database = {};
lconfig.database.maxConnections = 1;
var dMap = require("dMap");

describe("dMap", function() {
  it("should load a services dMap");
  it("should be able to retrieve an entry field");
  describe("returns types", function() {
    it("have photos", function(done){
      var bases = dMap.types('photos',['42@facebook','42@instagram']);
      bases.length.should.equal(2);
      bases[0].should.equal('photo:42@facebook/photos');
      done();
    });
  });
});

