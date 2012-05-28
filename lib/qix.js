var mmh = require('murmurhash3');
var natural = require('natural');
var unfreq = "lcumwfgypbvkjxqz"; // least popular letters
// stopwords from mysql, stemmed
var stop = {"abl":1,"about":1,"abov":1,"according":1,"accordingli":1,"across":1,"actual":1,"after":1,"afterward":1,"again":1,"against":1,"ain":1,"all":1,"allow":1,"almost":1,"alon":1,"along":1,"alreadi":1,"also":1,"although":1,"alwai":1,"among":1,"amongst":1,"and":1,"anoth":1,"ani":1,"anybodi":1,"anyhow":1,"anyon":1,"anything":1,"anywai":1,"anywher":1,"apart":1,"appear":1,"appreci":1,"appropri":1,"aren":1,"around":1,"asid":1,"ask":1,"asking":1,"associated":1,"avail":1,"awai":1,"awfulli":1,"becam":1,"becaus":1,"becom":1,"been":1,"befor":1,"beforehand":1,"behind":1,"believ":1,"below":1,"besid":1,"best":1,"better":1,"between":1,"beyond":1,"both":1,"brief":1,"but":1,"mon":1,"came":1,"can":1,"cannot":1,"cant":1,"caus":1,"certain":1,"certainli":1,"chang":1,"clearli":1,"com":1,"come":1,"concern":1,"consequ":1,"consid":1,"contain":1,"correspond":1,"could":1,"couldn":1,"cours":1,"current":1,"definit":1,"describ":1,"despit":1,"did":1,"didn":1,"differ":1,"doe":1,"doesn":1,"don":1,"done":1,"down":1,"downward":1,"dure":1,"each":1,"edu":1,"eight":1,"either":1,"els":1,"elsewher":1,"enough":1,"entir":1,"especi":1,"etc":1,"even":1,"ever":1,"everi":1,"everybodi":1,"everyon":1,"everything":1,"everywher":1,"exactli":1,"exampl":1,"except":1,"far":1,"few":1,"fifth":1,"first":1,"five":1,"follow":1,"for":1,"former":1,"formerli":1,"forth":1,"four":1,"from":1,"further":1,"furthermor":1,"get":1,"given":1,"give":1,"goe":1,"gone":1,"got":1,"gotten":1,"greet":1,"had":1,"hadn":1,"happen":1,"hardli":1,"hasn":1,"have":1,"haven":1,"hello":1,"help":1,"henc":1,"her":1,"here":1,"hereaft":1,"herebi":1,"herein":1,"hereupon":1,"herself":1,"him":1,"himself":1,"hither":1,"hopefulli":1,"how":1,"howbeit":1,"howev":1,"ignored":1,"immedi":1,"inasmuch":1,"inc":1,"inde":1,"indic":1,"indicated":1,"inner":1,"insofar":1,"instead":1,"into":1,"inward":1,"isn":1,"itself":1,"just":1,"keep":1,"kept":1,"know":1,"known":1,"last":1,"late":1,"later":1,"latter":1,"latterli":1,"least":1,"less":1,"lest":1,"let":1,"like":1,"littl":1,"look":1,"ltd":1,"mainli":1,"mani":1,"mai":1,"mayb":1,"mean":1,"meanwhil":1,"mere":1,"might":1,"more":1,"moreov":1,"most":1,"mostli":1,"much":1,"must":1,"myself":1,"name":1,"near":1,"nearli":1,"necessari":1,"need":1,"neither":1,"never":1,"nevertheless":1,"new":1,"next":1,"nine":1,"nobodi":1,"non":1,"none":1,"noon":1,"nor":1,"normal":1,"not":1,"noth":1,"novel":1,"now":1,"nowher":1,"obvious":1,"off":1,"often":1,"okai":1,"old":1,"onc":1,"onli":1,"onto":1,"other":1,"otherwis":1,"ought":1,"our":1,"ourselv":1,"out":1,"outsid":1,"over":1,"overal":1,"own":1,"particular":1,"particularli":1,"per":1,"perhap":1,"place":1,"pleas":1,"plu":1,"possibl":1,"presum":1,"probabl":1,"provid":1,"que":1,"quit":1,"rather":1,"realli":1,"reason":1,"regard":1,"regardless":1,"rel":1,"respect":1,"right":1,"said":1,"same":1,"saw":1,"sai":1,"second":1,"secondli":1,"see":1,"seem":1,"seen":1,"self":1,"selv":1,"sensibl":1,"sent":1,"seriou":1,"serious":1,"seven":1,"sever":1,"shall":1,"she":1,"should":1,"shouldn":1,"sinc":1,"six":1,"some":1,"somebodi":1,"somehow":1,"someon":1,"someth":1,"sometim":1,"somewhat":1,"somewher":1,"soon":1,"sorri":1,"specifi":1,"still":1,"sub":1,"such":1,"sup":1,"sure":1,"take":1,"taken":1,"tell":1,"tend":1,"than":1,"thank":1,"thanx":1,"that":1,"the":1,"their":1,"them":1,"themselv":1,"then":1,"thenc":1,"there":1,"thereaft":1,"therebi":1,"therefor":1,"therein":1,"thereupon":1,"these":1,"thei":1,"think":1,"third":1,"thi":1,"thorough":1,"thoroughli":1,"those":1,"though":1,"three":1,"through":1,"throughout":1,"thru":1,"thu":1,"togeth":1,"too":1,"took":1,"toward":1,"tri":1,"truli":1,"try":1,"trying":1,"twice":1,"two":1,"under":1,"unfortun":1,"unless":1,"unlik":1,"until":1,"unto":1,"upon":1,"used":1,"using":1,"usual":1,"valu":1,"variou":1,"veri":1,"via":1,"viz":1,"want":1,"wasn":1,"wai":1,"welcom":1,"well":1,"went":1,"were":1,"weren":1,"what":1,"whatev":1,"when":1,"whenc":1,"whenev":1,"where":1,"whereaft":1,"wherea":1,"wherebi":1,"wherein":1,"whereupon":1,"wherev":1,"whether":1,"which":1,"while":1,"whither":1,"who":1,"whoever":1,"whole":1,"whom":1,"whose":1,"why":1,"will":1,"wish":1,"with":1,"within":1,"without":1,"won":1,"wonder":1,"would":1,"wouldn":1,"yet":1,"you":1,"your":1,"yourself":1,"yourselv":1,"zero":1,"http":1}; // plus some!

// this qix system builds a micro index of fixed 28 bytes out of any string
// works best with smaller strings
exports.buf = function(str)
{
  var buf = new Buffer(Array(32));
  if(!str) return buf;
  var arr = defl8(tok(str));
  if(!arr || arr.length == 0) return buf;
  arr.forEach(function(str){
    shifty(str, buf);
  });
  return buf;
}

exports.chunk = function(str)
{
  return defl8(tok(str));
}

// micro index a string into a fixed buffer by shifting bits
function shifty(str, buf)
{
  var mask = 0x1;
  var sum = 0;
  for(var i=0; i < str.length; i++)
  {
    var code = str.charCodeAt(i);
    code = (code > 96 && code < 123) ? code - 97 : 26; // alpha preserved, rest punctuated, to get our micro index
    buf[code] |= mask; // flip the bit at this offset for this character
    mask <<= 1; // move to the next bit
    sum += code;
  }
  // if a smaller word, throw in terminator
  if(str.length != 8) buf[27+(code % 4)] |= mask;
  return buf;
}

// make sure everything in the array is 3+ <8 chars, anything longer compress it
function defl8(arr)
{
  var ret = [];
  for(var i=0;i < arr.length; i++)
  {
    var str = arr[i].toLowerCase();
    str = natural.PorterStemmer.stem(str);
    if(str.length <= 2) continue;
    if(stop[str]) continue;
    if(str.length <= 8 && str.split(/\D+/).length > 1) { ret.push(str); continue } // smaller w/ some alpha in them
    // rest hash'd
    var x = mmh.murmur32HexSync(str);
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
      || (code > 127 && (code < 8192 || code > 8303)) // utf8 non-punctuation
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