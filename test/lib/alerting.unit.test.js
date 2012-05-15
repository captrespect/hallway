var alerting = require("alerting");
var should = require("should");
var fakeweb = require("node-fakeweb");

fakeweb.allowNetConnect = false;

describe("Hallway reporting", function() {
 it ("should require a pager duty key to be initialized", function() {
   alerting.init({});
   should.strictEqual(alerting.api_key, undefined);
   alerting.init({"key":"present"});
   alerting.api_key.should.equal("present");
 });
 it("should be able to post an alert to pager duty", function() {
   // Fakeweb issues preventing this from going futher yet
   //alerting.alert("A test alert", "testing", {detail:true});
 });
});
