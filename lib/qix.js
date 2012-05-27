var mmh = require('murmurhash3');
var unfreq = "lcumwfgypbvkjxqz"; // least popular letters

// this qix system builds a micro index of fixed 28 bytes out of any string
// works best with smaller strings
exports.buf = function(str)
{
  if(!str) return undefined;
  var arr = defl8(tok(str));
  if(!arr || arr.length == 0) return undefined;
  var buf = new Buffer(Array(28));
  arr.forEach(function(str){
    shifty(str, buf);
  });
  return buf;
}

// micro index a string into a fixed buffer by shifting bits
function shifty(str, buf)
{
  var mask = 0x1;
  for(var i=0; i < str.length; i++)
  {
    var code = str.charCodeAt(i);
    code = (code > 96 && code < 123) ? code - 97 : 26; // alpha preserved, rest punctuated, to get our micro index
    buf[code] |= mask; // flip the bit at this offset for this character
    mask <<= 1; // move to the next bit
  }
  // if a smaller word, throw in terminator
  if(str.length != 8) buf[27] |= mask;
  return buf;
}

// make sure everything in the array is 3+ <8 chars, anything longer compress it
function defl8(arr)
{
  var ret = [];
  for(var i=0;i < arr.length; i++)
  {
    if(arr[i].length <= 2) continue;
    if(arr[i].length <= 8) { ret.push(arr[i].toLowerCase()); continue }
    var x = mmh.murmur128HexSync(arr[i]);
    var ss = ""
    // use only the first 8 nibbles of the hash and make as unique a key as possible translating into the unpopular character ranges
    for(var j=0; j < 8; j++)
    {
      ss += unfreq.substr(parseInt(x.substr(j,1),16),1);
    }
    ret.push(ss);
  }
  return ret;
}

// simple tokenizer around all normal punctuation stuff
function tok(str)
{
  var ret = [];
  var chunk = ""
  for(var i=0;i<str.length;i++)
  {
    var code = str.charCodeAt(i);
    if( // we're allowing alphanumerics and all unicode/higher chars as string sequences
      (code > 47 && code < 58) // 0-9
      || (code > 64 && code < 91) // A-Z
      || (code > 96 && code < 123) // a-z
      || (code > 127) // utf8
    ) {
      chunk += str.substr(i,1);
    }else{
      if(chunk.length > 0) ret.push(chunk);
      chunk = "";
    }
  }
  if(chunk.length > 0) ret.push(chunk);
  return ret
}