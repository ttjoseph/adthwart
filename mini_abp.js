/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
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

var MAX_CACHE_ENTRIES = 1000;
var SHORTCUT_LENGTH = 8;

function Filter_isActiveOnDomain(me, docDomain) {
  // If the document has no host name, match only if the filter isn't restricted to specific domains
  if (!docDomain)
    return (!me.includeDomains);

  if (!me.includeDomains && !me.excludeDomains)
    return true;

  docDomain = docDomain.replace(/\.+$/, "").toUpperCase();

  while (true)
  {
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
        // (contentType & me.contentType) != 0 && // Avoid a string-indexed lookup
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
 
 
// blacklistMatcher.matchesAny(request.url, request.type, request.domain, thirdParty)
 
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