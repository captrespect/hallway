var fakeweb = require('node-fakeweb');
var friends = require('../Connectors/Twitter/friends');
var timeline = require('../Connectors/Twitter/timeline');
var tweets = require('../Connectors/Twitter/tweets');
var mentions = require('../Connectors/Twitter/mentions');
var assert = require("assert");
var RESTeasy = require('api-easy');
var vows = require("vows");
var suite = RESTeasy.describe("Twitter Synclets");
var fs = require('fs');
var curDir = process.cwd();

process.setMaxListeners(0);
process.on('uncaughtException',function(error){
    console.dir(error.stack);
});

var mePath = '/Data/twitter-1';
var pinfo = JSON.parse(fs.readFileSync(__dirname + mePath + '/me.json'));

/*}).addBatch({
    "Can handle failwhale" : {
        topic: function() {
            fakeweb.allowNetConnect = false;
            fakeweb.registerUri({uri : 'https://api.twitter.com:443/1/account/verify_credentials.json?path=%2Faccount%2Fverify_credentials.json&include_entities=true',
                file : __dirname + '/fixtures/twitter/verify_credentials.js' });
            fakeweb.registerUri({uri : 'https://api.twitter.com:443/1/statuses/home_timeline.json?screen_name=ctide&since_id=1&path=%2Fstatuses%2Fhome_timeline.json&include_entities=true&page=1',
                body : '<html>jer cant find a real example</html>'});
            timeline.sync(pinfo, this.callback)
        },
        "successfully" : function(err, response) {
            assert.equal(response, undefined);
            // assert.equal(response.data.timeline.length, 0);
        }
    }
 */
suite.next().suite.addBatch({
    "Can get tweets" : {
        topic: function() {
            fakeweb.allowNetConnect = false;
            fakeweb.registerUri({uri : 'https://api.twitter.com:443/1/account/verify_credentials.json?path=%2Faccount%2Fverify_credentials.json&include_entities=true',
                file : __dirname + '/fixtures/twitter/verify_credentials.js' });
            fakeweb.registerUri({uri : 'https://api.twitter.com:443/1/statuses/user_timeline.json?screen_name=ctide&since_id=1&path=%2Fstatuses%2Fuser_timeline.json&include_rts=true&count=200&include_entities=true&page=1',
                file : __dirname + '/fixtures/twitter/home_timeline.js' });
                fakeweb.registerUri({uri : 'https://api.twitter.com:443/1/statuses/user_timeline.json?screen_name=ctide&since_id=1&path=%2Fstatuses%2Fuser_timeline.json&include_rts=true&count=200&include_entities=true&page=2',
                    body :'[]' });
            tweets.sync(pinfo, this.callback)
        },
        "successfully" : function(err, response) {
            assert.equal(response.data.tweets[0].obj.id_str, '71348168469643264');
        }
    }
}).addBatch({
    "cleanup" : {
        topic: [],
        "after itself": function(topic) {
            process.chdir(curDir);
            assert.equal(process.cwd(), curDir);
        }
    }
})

suite.export(module);
