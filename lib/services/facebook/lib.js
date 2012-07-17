/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs          = require('fs');
var request     = require('request');
var async       = require('async');
var util        = require('util');
var lutil       = require('lutil');
var querystring = require('querystring');
var urllib      = require('url');

var API_HOST = 'graph.facebook.com';

var PAGE_SIZE = 500;
var SMALL_PAGE_SIZE = 100;
var TIMEOUT = 60000;

// Enumerate of all fields on a user for open graph. They're not all default.
var ALL_USER_FIELDS = [
  "bio",
  "birthday",
  "education",
  "email",
  "favorite_athletes",
  "favorite_teams",
  "first_name",
  "gender",
  "hometown",
  "id",
  "interested_in",
  "languages",
  "last_name",
  "link",
  "locale",
  "location",
  "middle_name",
  "name",
  "political",
  "quotes",
  "relationship_status",
  "religion",
  "significant_other",
  "third_party_id",
  "timezone",
  "updated_time",
  "username",
  "verified",
  "video_upload_limits",
  "website",
  "work"
].join(',');

function getPage(uri, cbDone) {
  if(!uri) return cbDone("no uri");

  request.get({
    uri     : uri,
    json    : true,
    timeout : TIMEOUT
  }, function(err, resp, json) {
    if(err) return cbDone(err);

    // Request failed
    if(resp.statusCode !== 200) {
      return cbDone(
        "Status code " + resp.statusCode + ": " + util.inspect(json)
      );
    }

    // Didn't get back JSON
    if(json === null || typeof json !== "object") {
      return cbDone("Response wasn't a JSON object " + util.inspect(json));
    }

    // Success!
    return cbDone(null, json);
  });
}

function getPages(arg, cbEach, cbDone) {
  if(!arg.uri) return cbDone("URI is required");
  if(!arg.total) arg.total = 0;

  getPage(arg.uri, function(err, json) {
    if(err) return cbDone(err);

    if(!Array.isArray(json.data)) {
      return cbDone(
        "Response didn't include a JSON array: " + util.inspect(json)
      );
    }

    // Kick back each item
    for(var i = 0; i < json.data.length; i++) {
      cbEach(json.data[i]);
    }

    // Bail out if we've hit our limit
    arg.total += json.data.length;
    if(arg.limit && arg.limit > 0 && arg.total >= arg.limit) return cbDone();

    // Last page
    if(!json.paging || !json.paging.next) return cbDone();

    // Continue paging
    arg.uri = json.paging.next;
    if(arg.since && arg.uri.indexOf("since=") === -1) {
      arg.uri += "&since=" + arg.since;
    }

    return getPages(arg, cbEach, cbDone);
  });
}

function getData(arg, path, cbEach, cbDone) {
  var params = {
    limit: arg.limit || PAGE_SIZE
  };
  if (arg.since) params.since = arg.since;
  arg.uri = exports.apiUrl(arg, path, params);

  getPages(arg, cbEach, cbDone);
}

exports.apiUrl = function(arg, path, params) {
  if (arg) params.access_token = arg.accessToken;
  if (!params.date_format) params.date_format = 'U';

  return urllib.format({
    protocol : 'https',
    host     : API_HOST,
    pathname : path,
    query    : params
  });
};

exports.getPostPhotos = function(arg, posts, cbDone) {
  var photoIDs = [];

  posts.data.forEach(function(post) {
    if(post.type === "photo") photoIDs.push(post.object_id);
  });

  exports.getObjects({
    ids         : photoIDs,
    accessToken : arg.accessToken
  }, cbDone);
};

// Walk a friends list, getting/caching each one
exports.getFriends = function(arg, cbEach, cbDone) {
  var uri = exports.apiUrl(arg, '/' + arg.id + '/friends', {limit: PAGE_SIZE});
  getPage(uri, function(err, friends) {
    if(err || !Array.isArray(friends.data)) return cbDone(err);

    // this is super intense, but is it ok?
    var ids = [];
    friends.data.forEach(function(friend) {
      ids.push(friend.id);
    });

    var friendsURI = exports.apiUrl(arg, '/', {ids: ids.join(',')});
    getPage(friendsURI, function(err, friends){
      if(err || typeof friends !== 'object') return cbDone(err);
      Object.keys(friends).forEach(function(key) {
        cbEach(friends[key]);
      });
      cbDone();
    });
  });
};

function processPageLikes(pages, arg, cbDone){
	var done = false;
  if (pages.length === 0) {
    cbDone(true, arg);
  } else {
    var pageIDs = [];
    pages.forEach(function(page){
      pageIDs.push(page.page_id);
    });

    var uri = exports.apiUrl(arg, '/', {ids: pageIDs.join(',')});
    getPage(uri, function(err, resp) {
      if (err || !resp) {
        err = err || new Error("Invalid response");
        return cbDone(err);
      }
      Object.keys(resp).forEach(function(key) {
        arg.pageLikes.push((resp[key]));
      });
      cbDone(null, done, arg);
    });
  }
}

// FQL query to get all pages that a user has liked after a since time.
// Results converted into page objects.
exports.getPageLikes = function(arg, cbDone) {
  if (!arg.offset) arg.offset = 0;
	if (!arg.pageLikes) arg.pageLikes = [];

  arg.fql = 'SELECT page_id,created_time FROM page_fan' +
            ' WHERE uid=me() AND created_time > ' + arg.since +
            ' LIMIT ' + SMALL_PAGE_SIZE + ' OFFSET ' + arg.offset;

  exports.getFQL(arg, function(err, pages){
		if(err) return cbDone(err);

		if (arg.offset === 0 && pages[0]) arg.newSince = pages[0].created_time;

		processPageLikes(pages, arg, function(err, done, arg){
      if (err) return cbDone(err);
			if (done) {
        cbDone(null, arg.pageLikes, arg.newSince);
      } else {
				arg.offset += SMALL_PAGE_SIZE;
				exports.getPageLikes(arg, cbDone);
			}
		});
	});
};

//Function to process the response and handle the paging recursion for url likes.
function processUrls(likes, arg, cbDone){
	var urls = arg.urls || [];
	var done = false;

	if (likes.length === 0) {
    done = true;
  } else {
		likes.every(function(like){
			if (like.url === arg.newestUrl.url){
				done = true;
				return false;
			} else {
				urls.push(like);
				return true;
			}
		});
	}

	arg.urls = urls;
	cbDone(null, done, arg);
}

// FQL query to get URL likes up to the most recently seen url.
exports.getUrlLikes = function(arg, cbDone) {
	if (!arg.offset) arg.offset = 0;
  arg.fql = 'SELECT url FROM url_like' +
            ' WHERE user_id = ' + arg.id +
            ' LIMIT ' + SMALL_PAGE_SIZE + ' OFFSET ' + arg.offset;

  exports.getFQL(arg, function(err, urls) {
		if(err) return cbDone(err);

		processUrls(urls, arg, function(err, done, arg){
      if (err) return cbDone(err);
			if (done) return cbDone(null, arg.urls);

      arg.offset += SMALL_PAGE_SIZE;
      exports.getUrlLikes(arg, cbDone);
    });
	});
};

function processStreamLikes(likes, arg, cbDone){
	if (likes.length === 0) return cbDone(null, true, arg);

	var done = false;
  var ids = [];

  likes.every(function(like){
    ids.push(like.object_id);
    ids.push(arg.id + '_' + like.object_id);
    if (like.object_id === arg.newestObjId) {
      done = true;
      return false;
    } else {
      return true;
    }
  });

  var uri = exports.apiUrl(arg, '/', {ids: ids.join(',')});
  getPage(uri, function(err, resp){
    if (err || !resp) {
      err = err || new Error("Invalid response");
      return cbDone(err);
    }
    Object.keys(resp).forEach(function(key) {
      arg.streamLikes.push((resp[key]));
    });

    cbDone(null, done, arg);
  });
}

// Get stream likes (which is more than home stream) up to the most recent ID.
// Get actual stream objects with graph query.
// Type routing is handled in likes.js.
exports.getStreamLikes = function(arg, cbDone) {
	if (!arg.offset) arg.offset = 0;
	if (!arg.streamLikes) arg.streamLikes = [];

  arg.fql = 'SELECT object_id FROM like' +
            ' WHERE user_id = ' + arg.id +
            ' LIMIT ' + SMALL_PAGE_SIZE + ' OFFSET ' + arg.offset;

  exports.getFQL(arg, function(err, likes) {
		if(err) return cbDone(err);

		if(arg.offset === 0 && likes[0]) arg.newSince = likes[0].object_id;

		processStreamLikes(likes, arg, function(err, done, arg){
      if (err) return cbDone(err);
			if (done) return cbDone(null, arg.streamLikes, arg.newSince);

      arg.offset += SMALL_PAGE_SIZE;
      exports.getStreamLikes(arg, cbDone);
		});
	});
};

// Get as much as we can about any single person
exports.getPerson = function(arg, cbEach, cbDone) {
  // should check cache here of people/id.json and use that if it's recent
  var uri = exports.apiUrl(arg, '/' + arg.id, {fields: ALL_USER_FIELDS});
  getPage(uri,function(err, person){
    if(err) return cbDone(err);
    cbEach(person);
    cbDone();
  });
};

// Fetch all checkins
exports.getCheckins = function(arg, cbEach, cbDone) {
  var path = '/' + arg.id + '/checkins';
  getData(arg, path, cbEach, cbDone);
};

// Get all the photos in an album
exports.getAlbum = function(arg, cbEach, cbDone) {
  var path = '/' + arg.id + '/photos';
  getData(arg, path, cbEach, cbDone);
};

exports.getAlbums = function (arg, cbDone) {
  if (!arg.albumSince) arg.albumSince = 0;
  arg.fql = 'SELECT object_id, modified FROM album' +
            ' WHERE owner=me() AND modified > ' + arg.albumSince;
  exports.getFQL(arg, cbDone);
};

// Get all the posts for a person and type (home or feed)
exports.getPosts = function(arg, cbEach, cbDone) {
  var path = '/' + arg.id + '/' + arg.type;
  getData(arg, path, cbEach, cbDone);
};

// Dumb wrapper to just pass back a single page
exports.getPostPage = function(arg, cbDone) {
  var params = {
    limit: arg.limit || PAGE_SIZE
  };
  if (arg.since) params.since = arg.since;
  var uri = exports.apiUrl(arg, '/' + arg.id + '/' + arg.type, params);
  getPage(uri, cbDone);
};

// Get a list of objects
exports.getObjects = function(arg, cbDone) {
  if(!arg.ids || arg.ids.length === 0) return cbDone();

  var uri = exports.apiUrl(arg, '/', {ids: arg.ids.join(',')});
  getPage(uri,function(err, data){
    if(err || typeof data !== 'object') return cbDone(err);
    var ret = [];
    Object.keys(data).forEach(function(key){
      ret.push(data[key]);
    });
    cbDone(null, ret);
  });
};

exports.getProfile = function(arg, cbDone) {
  var uri = exports.apiUrl(arg, '/me', {fields: ALL_USER_FIELDS});
  getPage(uri, cbDone);
};


// Simple FQL wrapper
exports.getFQL = function(arg, cbDone) {
  var uri = exports.apiUrl(arg, '/fql', {q: arg.fql});
  getPage(uri, function(err, json){
    if(err) return cbDone(err);
    if(!Array.isArray(json.data)) return cbDone("Missing data array");
    cbDone(null, json.data);
  });
};

