/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file (up to the line below) are subject to the Mozilla
 * Public License Version 1.1 (the "License"); you may not use this code except
 * in compliance with the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * T. Joseph <ttjoseph@gmail.com>
 *
 * ***** END LICENSE BLOCK ***** */
 
// These are functions extracted from AdBlock Plus for use in content scripts.
// Please see the original functions for explanations about what they are doing.

// ABP content type flags
var TypeMap = {
  OTHER: 1, SCRIPT: 2, IMAGE: 4, STYLESHEET: 8, OBJECT: 16,
  SUBDOCUMENT: 32, DOCUMENT: 64, BACKGROUND: 256, XBL: 512,
  PING: 1024, XMLHTTPREQUEST: 2048, OBJECT_SUBREQUEST: 4096,
  DTD: 8192, MEDIA: 16384, FONT: 32768, ELEMHIDE: 0xFFFD
};

var TagToType = {
    "SCRIPT": TypeMap.SCRIPT,
    "IMG": TypeMap.IMAGE,
    "LINK": TypeMap.STYLESHEET,
    "OBJECT": TypeMap.OBJECT,
    "EMBED": TypeMap.OBJECT,
    "IFRAME": TypeMap.SUBDOCUMENT
};

var MAX_CACHE_ENTRIES = 1000;
var SHORTCUT_LENGTH = 8;

function Filter_isActiveOnDomain(me, docDomain) {
  // If the document has no host name, match only if the filter isn't restricted to specific domains
  if (!docDomain)
    return (!me.includeDomains);

  if (!me.includeDomains && !me.excludeDomains)
    return true;

  docDomain = docDomain.replace(/\.+$/, "").toUpperCase();

  while (true) {
    if (me.includeDomains && docDomain in me.includeDomains)
      return true;
    if (me.excludeDomains && docDomain in me.excludeDomains)
      return false;

    var nextDot = docDomain.indexOf(".");
    if (nextDot < 0)
      break;
    docDomain = docDomain.substr(nextDot + 1);
  }
  return (me.includeDomains == null);
}

function Filter_matches(me, location, contentType, docDomain, thirdParty)
{
    if(!me.regexp) {
        me.regexp = new RegExp(me.regexpSource, me.matchCase ? "" : "i");
    }
    var x = (me.regexp.test(location) &&
//            (RegExpFilter.typeMap[contentType] & me.contentType) != 0 &&
        (!contentType || (contentType & me.contentType) != 0) && // Avoid a string-indexed lookup
        (me.thirdParty == null || me.thirdParty == thirdParty) &&
        Filter_isActiveOnDomain(docDomain));
    //
    return x;
}

 
function Matcher_matchesAnyInternal(me, location, contentType, docDomain, thirdParty) {
    if (me.hasShortcuts) {
        // Optimized matching using shortcuts
        var text = location.toLowerCase();
        var len = SHORTCUT_LENGTH;
        var endPos = text.length - len + 1;
        for (var i = 0; i <= endPos; i++) {
            var substr = text.substr(i, len);
            if (substr in me.shortcutHash) {
                var filter = me.shortcutHash[substr];
                if (Filter_matches(filter, location, contentType, docDomain, thirdParty)) {
                    return filter;
                }
            }
        }
    }

    // Slow matching for filters without shortcut
    for (i in me.regexps) {
       var filter = me.regexps[i];
       if (Filter_matches(filter, location, contentType, docDomain, thirdParty))
           return filter;
    }

    return null;
}
 
function Matcher_matchesAny(me, location, contentType, docDomain, thirdParty) {
    var key = location + " " + contentType + " " + docDomain + " " + thirdParty;
    
    if (key in me.resultCache) {
        return me.resultCache[key];
    }

    var result = Matcher_matchesAnyInternal(me, location, contentType, docDomain, thirdParty);

    if (me.cacheEntries >= MAX_CACHE_ENTRIES) {
        me.resultCache = {__proto__: null};
        me.cacheEntries = 0;
    }

    me.resultCache[key] = result;
    me.cacheEntries++;

    return result;
}

// End MPL-licensed source code
// =====================================================

// The part of this file below (c) T. Joseph <ttjoseph@gmail.com>
// Everyone can use, modify and distribute this code without restriction.

var abp = {}; // AdBlock Plus data parent variable
var elemhideSelectorStrings = []; // Cache the elemhide selector strings
var SELECTOR_GROUP_SIZE = 20;
var FLASH_SELECTORS = 'embed[type*="application/x-shockwave-flash"],embed[src*=".swf"],object[type*="application/x-shockwave-flash"],object[codetype*="application/x-shockwave-flash"],object[src*=".swf"],object[codebase*="swflash.cab"],object[classid*="D27CDB6E-AE6D-11cf-96B8-444553540000"],object[classid*="d27cdb6e-ae6d-11cf-96b8-444553540000"]';
var TEMP_adservers = null;

// WebKit apparently chokes when the selector list in a CSS rule is huge.
// So we split the elemhide selectors into groups.
function makeSelectorStrings(selectors) {
    var ptr = 0;
    if(!selectors) return;
    for(var i = 0; i < selectors.length; i += SELECTOR_GROUP_SIZE) {
        elemhideSelectorStrings[ptr++] = selectors.slice(i, i + SELECTOR_GROUP_SIZE).join(",");
    }
}

// Makes a string containing CSS rules for elemhide filters
function getElemhideCSSString() {
    var s = "";
    for(var i in elemhideSelectorStrings) {
        s += elemhideSelectorStrings[i] + " { display: none !important } ";
    }
    return s;
}

// Remove a particular element.
function nukeSingleElement(elt) {
    // console.log("Nuking", elt);
    if(elt.innerHTML) elt.innerHTML = "";
    if(elt.innerText) elt.innerText = "";
    elt.style.display = "none";
    elt.style.visibility = "hidden";

    var pn = elt.parentNode;
    if(pn) pn.removeChild(elt);

    // Get rid of OBJECT tag enclosing EMBED tag
    if(pn && pn.tagName == "EMBED" && pn.parentNode && pn.parentNode.tagName == "OBJECT")
        pn.parentNode.removeChild(pn);
}

// Extracts a domain name from a URL
function TEMP_extractDomainFromURL(url) {
    if(!url) return "";
    var x = url.substr(url.indexOf("://") + 3);
    x = x.substr(0, x.indexOf("/"));
    x = x.substr(x.indexOf("@") + 1);
    colPos = x.indexOf(":");
    if(colPos >= 0)
        x = x.substr(0, colPos);
    return x;
}

// Horrible hack
function TEMP_isAdServer(docDomain) {
  docDomain = docDomain.replace(/\.+$/, "").toLowerCase();

  for(;;) {
    if (docDomain in TEMP_adservers)
      return true;
    var nextDot = docDomain.indexOf(".");
    if(nextDot < 0)
      break;
    docDomain = docDomain.substr(nextDot + 1);
  }
  return false;
}

// Make sure this is really an HTML page, as Chrome runs these scripts on just about everything
if (document instanceof HTMLDocument) {
    // Use a style element for elemhide selectors and to hide page elements that might be ads.
    // We'll remove the latter CSS rules later.
    var styleElm = document.createElement("style");
    styleElm.title = "__adthwart__"; // So we know which one to remove later

    chrome.extension.sendRequest({reqtype: "get-initialhide-options"}, function(response) {
        makeSelectorStrings(response.selectors);
        if(response.enabled && response.shouldInject) {
            if(!document.domain.match(/youtube.com$/i)) {
                // XXX: YouTube's new design apparently doesn't load the movie player if we hide it.
                // I'm guessing Chrome doesn't bother to load the Flash object if it isn't displayed,
                // but later removing that CSS rule doesn't cause it to actually be loaded. The
                // rest of the Internet - and YouTube's old design - seem to be OK, though, so I dunno.
                styleElm.innerText += FLASH_SELECTORS + " { display: none !important } ";
            }
            styleElm.innerText += "iframe { visibility: hidden !important; } ";
            styleElm.innerText += getElemhideCSSString();
	        document.documentElement.insertBefore(styleElm, null);
	    }
    });

    // We break this out into a "parallel" request in the hope it will get done faster
    chrome.extension.sendRequest({reqtype: "get-beforeload-options"}, function(response) {
        // HACK to hopefully block stuff on beforeload event.
        // Because we are in an asynchronous callback, the page may be partially loaded before
        // the event handler gets attached. So some things might get through at the beginning.
        if(response.enabled && response.beforeloadBlocking) {
            abp.blacklistMatcher = JSON.parse(response.bm);
            abp.whitelistMatcher = JSON.parse(response.wm);
            TEMP_adservers = response.TEMP_adservers;
            document.addEventListener("beforeload", function (e) {
                var eltDomain = TEMP_extractDomainFromURL(e.url);
                // Primitive version of third-party check
                if(eltDomain && !TEMP_isAdServer(document.domain) && TEMP_isAdServer(eltDomain)) {
                    e.preventDefault();
                    nukeSingleElement(e.target);
                } else {
                    var thirdParty = !(document.domain === eltDomain);
                    var type = TagToType[e.target.tagName];
                    if(Matcher_matchesAny(abp.whitelistMatcher, e.url, type, document.domain, thirdParty))
                        return;
                    if(Matcher_matchesAny(abp.blacklistMatcher, e.url, type, document.domain, thirdParty)) {
                        e.preventDefault();
                        nukeSingleElement(e.target);
                    }
                }
            }, true);
        }
    });
}
