// we're applying react-like state => UI
var currentState = {
  searchInputFocused: false,
  searchResults: [],
  // index within searchResults array, -1 means not selected
  selectedSearchResultIdx: -1
};

var currentSearchTerm = "";

// polyfil for Object.is
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is
if (!Object.is) {
  Object.is = function(x, y) {
    // SameValue algorithm
    if (x === y) {
      // Steps 1-5, 7-10
      // Steps 6.b-6.e: +0 != -0
      return x !== 0 || 1 / x === 1 / y;
    } else {
      // Step 6.a: NaN == NaN
      return x !== x && y !== y;
    }
  };
}

// accessor functions for items in gBookToc array:
// 	[${chapter or aticle url}, ${parentIdx}, ${title}, ${synonim 1}, ${synonim 2}, ...],
// as generated in gen_book_toc_search.go and stored in books/${book}/toc_search.js

var itemIdxIsExpanded = 0;
var itemIdxURL = 1;
var itemIdxParent = 2;
var itemIdxFirstChild = 3;
var itemIdxTitle = 4;
var itemIdxFirstSynonym = 5;

function tocItemIsExpanded(item) {
  return item[itemIdxIsExpanded];
}

function tocItemSetIsExpanded(item, isExpanded) {
  item[itemIdxIsExpanded] = isExpanded;
}

function tocItemURL(item) {
  while (item) {
    var uri = item[itemIdxURL];
    if (uri != "") {
      return uri;
    }
    item = tocItemParent(item);
  }
  return "";
}

function tocItemFirstChildIdx(item) {
  return item[itemIdxFirstChild];
}

function tocItemHasChildren(item) {
  return tocItemFirstChildIdx(item) != -1;
}

// returns true if has children and some of them articles
// (as opposed to children that are headers within articles)
function tocItemHasArticleChildren(item) {
  var idx = tocItemFirstChildIdx(item)
  if (idx == -1) {
    return false
  }
  var item = gBookToc[idx];
  var parentIdx = item[itemIdxParent];
  while (idx < gBookToc.length) {
    item = gBookToc[idx];
    if (parentIdx != item[itemIdxParent]) {
      return false;
    }
    var uri = item[itemIdxURL];
    if (uri.indexOf("#") === -1) {
      return true;
    }
    idx += 1
  }
  return false;
}

function tocItemParent(item) {
  var idx = tocItemParentIdx(item);
  if (idx == -1) {
    return null;
  }
  return gBookToc[idx];
}

function tocItemIsRoot(item) {
  return tocItemParentIdx(item) == -1;
}

function tocItemParentIdx(item) {
  return item[itemIdxParent];
}

function tocItemTitle(item) {
  return item[itemIdxTitle];
}

// all searchable items: title + search synonyms
function tocItemSearchable(item) {
  return item.slice(itemIdxTitle);
}

// from https://github.com/component/escape-html/blob/master/index.js
var matchHtmlRegExp = /["'&<>]/;
function escapeHTML(string) {
  var str = "" + string;
  var match = matchHtmlRegExp.exec(str);

  if (!match) {
    return str;
  }

  var escape;
  var html = "";
  var index = 0;
  var lastIndex = 0;

  for (index = match.index; index < str.length; index++) {
    switch (str.charCodeAt(index)) {
      case 34: // "
        escape = "&quot;";
        break;
      case 38: // &
        escape = "&";
        break;
      case 39: // '
        escape = "&#39;";
        break;
      case 60: // <
        escape = "&lt;";
        break;
      case 62: // >
        escape = "&gt;";
        break;
      default:
        continue;
    }

    if (lastIndex !== index) {
      html += str.substring(lastIndex, index);
    }

    lastIndex = index + 1;
    html += escape;
  }

  return lastIndex !== index ? html + str.substring(lastIndex, index) : html;
}

// splits a string in two parts at a given index
// ("foobar", 2) => ["fo", "obar"]
function splitStringAt(s, idx) {
  var res = ["", ""];
  if (idx == 0) {
    res[1] = s;
  } else {
    res[0] = s.substring(0, idx);
    res[1] = s.substring(idx);
  }
  return res;
}

function tagOpen(name, cls, id) {
  var s = "<" + name;
  if (cls) {
    s += " " + attr("class", cls);
  }
  if (id) {
    s += " " + attr("id", id);
  }
  return s + ">";
}

function tagClose(tagName) {
  return "</" + tagName + ">";
}

function inTag(tagName, contentHTML, cls, id) {
  return tagOpen(tagName, cls, id) + contentHTML + tagClose(tagName);
}

function inTagRaw(tagName, content, cls, id) {
  var contentHTML = escapeHTML(content);
  return tagOpen(tagName, cls, id) + contentHTML + tagClose(tagName);
}
function attr(name, val) {
  return name + "='" + val + "'";
}

function span(s, cls) {
  return inTagRaw("span", s, cls);
}

function div(html, opt) {
  var classes = opt.classes || [];
  if (opt.cls) {
    classes.push(cls);
  }
  var cls = classes.join(" ");
  return inTag("div", html, cls, opt && opt.id);
}

function a(uri, txt, cls) {
  txt = escapeHTML(txt);
  if (cls) {
    return '<a href="' + uri + '" class="' + cls + '">' + txt + "</a>";
  }
  return '<a href="' + uri + '">' + txt + "</a>";
}

var rebuildUITimer = null;
function triggerUIRebuild() {
  rebuildUITimer = null;
  rebuildUIFromState();
}

function requestRebuildUI(now) {
  // debounce the requests
  if (rebuildUITimer != null) {
    window.cancelAnimationFrame(rebuildUITimer);
    rebuildUITimer = null;
  }
  if (now) {
    triggerUIRebuild();
  } else {
    window.requestAnimationFrame(triggerUIRebuild);
  }
}

function setState(newState, now = false) {
  var vOld, vNew;
  var stateChanged = false;
  for (var k in newState) {
    vOld = currentState[k];
    vNew = newState[k];
    if (stateChanged) {
      // avoid calling areValuesEqual if we're updating the state anyway
      currentState[k] = vNew;
    } else if (!Object.is(vOld, vNew)) {
      stateChanged = true;
      currentState[k] = vNew;
    }
  }
  if (stateChanged) {
    requestRebuildUI(now);
  }
}

function isChapterOrArticleURL(s) {
  return s.startsWith("a-");
}

function getLocationLastElement() {
  var loc = window.location.pathname;
  var parts = loc.split("/");
  var lastIdx = parts.length - 1;
  return parts[lastIdx];
}

function getLocationLastElementWithHash() {
  var loc = window.location.pathname;
  var parts = loc.split("/");
  var lastIdx = parts.length - 1;
  return parts[lastIdx] + window.location.hash;
}

function navigateToSearchResult(idx) {
  var loc = window.location.pathname;
  var parts = loc.split("/");
  var lastIdx = parts.length - 1;
  var lastURL = parts[lastIdx];
  var selected = currentState.searchResults[idx];
  var tocItem = selected.tocItem;

  // either replace chapter/article url or append to book url
  var uri = tocItemURL(tocItem);
  if (isChapterOrArticleURL(lastURL)) {
    parts[lastIdx] = uri;
  } else {
    parts.push(uri);
  }
  loc = parts.join("/");
  clearSearchResults();
  window.location = loc;
}

// create HTML to highlight part of s starting at idx and with length len
function hilightSearchResult(txt, matches) {
  var prevIdx = 0;
  var n = matches.length;
  var res = "";
  var s = "";
  // alternate non-higlighted and highlihted strings
  for (var i = 0; i < n; i++) {
    var el = matches[i];
    var idx = el[0];
    var len = el[1];

    var nonHilightLen = idx - prevIdx;
    if (nonHilightLen > 0) {
      s = txt.substring(prevIdx, prevIdx + nonHilightLen);
      res += span(s);
    }
    s = txt.substring(idx, idx + len);
    res += span(s, "hili");
    prevIdx = idx + len;
  }
  var txtLen = txt.length;
  nonHilightLen = txtLen - prevIdx;
  if (nonHilightLen > 0) {
    s = txt.substring(prevIdx, prevIdx + nonHilightLen);
    res += span(s);
  }
  return res;
}

// return true if term is a search synonym inside tocItem
function isMatchSynonym(tocItem, term) {
  term = term.toLowerCase();
  var title = tocItemTitle(tocItem).toLowerCase();
  return title != term;
}

function getParentTitle(tocItem) {
  var parentIdx = tocItemParentIdx(tocItem);
  if (parentIdx == -1) {
    return null;
  }
  var parent = gBookToc[parentIdx];
  return tocItemTitle(parent);
}

// if search matched synonym returns "${chapterTitle} / ${articleTitle}"
// otherwise empty string
function getArticlePath(tocItem, term) {
  if (!isMatchSynonym(tocItem, term)) {
    return null;
  }
  var title = tocItemTitle(tocItem);
  var parentTitle = getParentTitle(tocItem);
  if (parentTitle == "") {
    return title;
  }
  return parentTitle + " / " + title;
}

/* results is array of items:
{
  tocItem: [],
  term: "",
  match: [[idx, len], ...],
}
*/
function buildResultsHTML(results, selectedIdx) {
  var a = [];
  var n = results.length;
  for (var i = 0; i < n; i++) {
    var r = results[i];
    var tocItem = r.tocItem;
    var term = r.term;
    var matches = r.match;

    var html = hilightSearchResult(term, matches);
    var articlePath = getArticlePath(tocItem, term);
    if (articlePath) {
      var s = "in: " + articlePath;
      html += " " + inTagRaw("span", s, "search-result-in");
    } else {
      var parentTitle = getParentTitle(tocItem);
      if (parentTitle) {
        var s = "in: " + parentTitle;
        html += " " + inTagRaw("span", s, "search-result-in");
      }
    }

    var opt = {
      id: "search-result-no-" + i,
      classes: ["search-result"]
    };
    if (i == selectedIdx) {
      opt.classes.push("search-result-selected");
    }
    var s = div(html, opt);
    a.push(s);
  }
  return a.join("\n");
}

// https://github.com/Treora/scroll-into-view/blob/master/polyfill.js
// TODO: passing options = { center: true } doesn't work
function scrollElementIntoView(el, options) {
  // Use traditional scrollIntoView when traditional argument is given.
  if (options === undefined || options === true || options === false) {
    el.scrollIntoView(el, arguments);
    return;
  }

  var win = el.ownerDocument.defaultView;

  // Read options.
  if (options === undefined)  options = {};
  if (options.center === true) {
    options.vertical = 0.5;
    options.horizontal = 0.5;
  }
  else {
    if (options.block === "start")  options.vertical = 0.0;
    else if (options.block === "end")  options.vertical = 0.0;
    else if (options.vertical === undefined)  options.vertical = 0.0;

    if (options.horizontal === undefined)  options.horizontal = 0.0;
  }

  // Fetch positional information.
  var rect = el.getBoundingClientRect();

  // Determine location to scroll to.
  var targetY = win.scrollY + rect.top - (win.innerHeight - el.offsetHeight) * options.vertical;
  var targetX = win.scrollX + rect.left - (win.innerWidth - el.offsetWidth) * options.horizontal;

  // Scroll.
  win.scroll(targetX, targetY);

  // If window is inside a frame, center that frame in the parent window. Recursively.
  if (win.parent !== win) {
    // We are inside a scrollable element.
    var frame = win.frameElement;
    scrollIntoView.call(frame, options);
  }
}

function rebuildSearchResultsUI() {
  var html;
  var results = currentState.searchResults;
  var selectedIdx = currentState.selectedSearchResultIdx;
  var searchWindow = document.getElementById("search-results-window");
  var blurOverlay = document.getElementById("blur-overlay");
  var searchResults = document.getElementById("search-results");
  if (results.length == 0) {
    if (currentSearchTerm == "") {
      searchWindow.style.display = "none";
      blurOverlay.style.display = "none";
    } else {
      searchWindow.style.display = "block";
      blurOverlay.style.display = "block";
      html =
        "<div class='no-search-results'>No search results for '" +
        currentSearchTerm +
        "'</div>";
      searchResults.innerHTML = html;
    }
    return;
  }
  searchWindow.style.display = "block";
  blurOverlay.style.display = "block";
  html = buildResultsHTML(results, selectedIdx);
  searchResults.innerHTML = html;

  // ensure element is scrolled into view
  window.requestAnimationFrame(() => {
    if (selectedIdx < 0) {
      return;
    }
    var id = "search-result-no-" + selectedIdx;
    var el = document.getElementById(id);
    scrollElementIntoView(el, true);
  });
}

function getItemsIdxForParent(parentIdx) {
  var res = [];
  var n = gBookToc.length;
  for (var i = 0; i < n; i++) {
    var tocItem = gBookToc[i];
    if (tocItemParentIdx(tocItem) == parentIdx) {
      res.push(i);
    }
  }
  return res;
}

function expandedSvg() {
  return '<svg class="arrow"><use xlink:href="#arrow-expanded"></use></svg>';
}

function notExpandedSvg() {
  return '<svg class="arrow"><use xlink:href="#arrow-not-expanded"></use></svg>';
}

function genTocExpanded(tocItem, tocItemIdx, level, isCurrent) {
  var titleHTML = escapeHTML(tocItemTitle(tocItem));
  var uri = tocItemURL(tocItem);
  var divInner = expandedSvg() + a(uri, titleHTML, "toc-link");
  var opt = {
    classes: ["toc-item", "lvl" + level],
    id: "ti-" + tocItemIdx
  };
  if (isCurrent) {
    opt.classes.push("bold");
  }
  var html = div(divInner, opt);
  return html;
}

function genTocNotExpanded(tocItem, tocItemIdx, level) {
  var titleHTML = escapeHTML(tocItemTitle(tocItem));
  var uri = tocItemURL(tocItem);
  var divInner = notExpandedSvg() + a(uri, titleHTML, "toc-link");
  var opt = {
    classes: ["toc-item", "lvl" + level],
    id: "ti-" + tocItemIdx
  };
  var html = div(divInner, opt);
  return html;
}

function genTocNoChildren(tocItem, tocItemIdx, level, isCurrent) {
  var uri = tocItemURL(tocItem);
  // TODO: tweak this logic some more
  if (uri.indexOf("#") != -1) {
    var parent = tocItemParent(tocItem);
    var isChapter = tocItemIsRoot(parent);
    var hasChildren = tocItemHasChildren(parent);
    var onlyArticleChildren = tocItemHasArticleChildren(parent);
    if (isChapter && hasChildren && onlyArticleChildren) {
      level += 1;
    }
  }

  var opt = {
    classes: ["toc-item", "lvl" + level],
    id: "ti-" + tocItemIdx
  };
  var titleHTML = escapeHTML(tocItemTitle(tocItem));
  if (isCurrent) {
    opt.classes.push("bold");
    return div(titleHTML, opt);
  }
  var divInner = a(uri, titleHTML, "toc-link");
  var html = div(divInner, opt);
  return html;
}

var selectedTocItemIdx = -1;

function buildTOCHTMLLevel(level, parentIdx) {
  var opt = {};
  var tocItemIdx, tocItem, el;
  var itemsIdx = getItemsIdxForParent(parentIdx);
  if (itemsIdx.length == 0) {
    return "";
  }
  var currURI = getLocationLastElementWithHash();
  //console.log("currURI:", currURI);
  var html = "";
  var n = itemsIdx.length;
  for (var i = 0; i < n; i++) {
    tocItemIdx = itemsIdx[i];
    tocItem = gBookToc[tocItemIdx];

    var uri = tocItemURL(tocItem);
    var isCurrent = currURI === uri;
    if (isCurrent) {
      selectedTocItemIdx = tocItemIdx;
    }
    if (!tocItemHasChildren(tocItem)) {
      el = genTocNoChildren(tocItem, tocItemIdx, level, isCurrent);
    } else {
      if (tocItemIsExpanded(tocItem)) {
        el = genTocExpanded(tocItem, tocItemIdx, level, isCurrent);
      } else {
        el = genTocNotExpanded(tocItem, tocItemIdx, level);
      }
    }
    html += el;

    if (tocItemIsExpanded(tocItem)) {
      var htmlChild = buildTOCHTMLLevel(level + 1, tocItemIdx);
      html += htmlChild;
    }
  }
  return html;
}

function buildTOCHTML() {
  return buildTOCHTMLLevel(0, -1);
}

function setIsExpandedUpwards(i) {
  var tocItem = gBookToc[i];
  tocItemSetIsExpanded(tocItem, true);
  tocItem = tocItemParent(tocItem);
  while (tocItem != null) {
    tocItemSetIsExpanded(tocItem, true);
    tocItem = tocItemParent(tocItem);
  }
}

function tocUnexpandAll() {
  var tocItem;
  var n = gBookToc.length;
  for (var i = 0; i < n; i++) {
    tocItem = gBookToc[i];
    tocItemSetIsExpanded(tocItem, false);
  }
}

function setTocExpandedForCurrentURL() {
  var currURI = getLocationLastElementWithHash();
  var n = gBookToc.length;
  var tocItem, uri;
  for (var i = 0; i < n; i++) {
    tocItem = gBookToc[i];
    uri = tocItemURL(tocItem);
    if (uri === currURI) {
      setIsExpandedUpwards(i);
      return;
    }
  }
}

function locationHashChanged(e) {
  tocUnexpandAll();
  setTocExpandedForCurrentURL();
  recreateTOC();
}

// returns id of selected toc item or ""
function createTOC() {
  selectedTocItemIdx = -1;
  var el = document.getElementById("toc");
  var html = buildTOCHTML();
  el.innerHTML = html;
  if (selectedTocItemIdx === -1) {
    return ""
  }
  return "ti-" + selectedTocItemIdx
}

function recreateTOC() {
  var el = document.getElementById("toc");
  var scrollTop = el.scrollTop;
  createTOC();
  el = document.getElementById("toc");
  el.scrollTop = scrollTop;
}

function getSearchInputElement() {
  return document.getElementById("search-input");
}

function setSearchInputFocus() {
  var el = getSearchInputElement();
  var wantsFocus = currentState.searchInputFocused;
  var isFocused = document.activeElement === el;
  //console.log("wantsFocus:", wantsFocus, "isFocused:", isFocused);
  if (!wantsFocus) {
    el.value = "";
  }
  if (isFocused == wantsFocus) {
    return;
  }
  el.value = "";
  if (wantsFocus) {
    el.focus();
  } else {
    el.blur();
    clearSearchResults();
  }
}

function rebuildUIFromState() {
  //console.log("rebuildUIFromState");
  setSearchInputFocus();
  rebuildSearchResultsUI();
}

function clearSearchResults() {
  currentSearchTerm = "";
  setState({
    searchResults: [],
    selectedSearchResultIdx: -1
  });
}

var maxSearchResults = 25;

// el is [idx, len]
// sort by idx.
// if idx is the same, sort by reverse len
// (i.e. bigger len is first)
function sortSearchByIdx(el1, el2) {
  var res = el1[0] - el2[0];
  if (res == 0) {
    res = el2[1] - el1[1];
  }
  return res;
}

// [[idx, len], ...]
// sort by idx, if there is an overlap, drop overlapped elements
function sortSearchMatches(a) {
  if (a.length < 2) {
    return a;
  }
  a.sort(sortSearchByIdx);
  var lastIdx = a[0][0] + a[0][1]; // start + len
  var n = a.length;
  var res = [a[0]];
  for (var i = 1; i < n; i++) {
    var el = a[i];
    var idx = el[0];
    var len = el[1];
    if (idx >= lastIdx) {
      res.push(el);
      lastIdx = idx + len;
    }
  }
  return a;
}

// searches s for toFind and toFindArr.
// returns null if no match
// returns array of [idx, len] position in $s where $toFind or $toFindArr matches
function searchMatch(s, toFind, toFindArr) {
  s = s.toLowerCase();

  // try exact match
  var idx = s.indexOf(toFind);
  if (idx != -1) {
    return [[idx, toFind.length]];
  }

  // now see if matches for search for AND of components in toFindArr
  if (!toFindArr) {
    return null;
  }

  var n = toFindArr.length;
  var res = Array(n);
  for (var i = 0; i < n; i++) {
    toFind = toFindArr[i];
    idx = s.indexOf(toFind);
    if (idx == -1) {
      return null;
    }
    res[i] = [idx, toFind.length];
  }
  return sortSearchMatches(res);
}

/*
returns null if no match
returns: {
  term: "",
  match: [[idx, len], ...]
}
*/
function searchMatchMulti(toSearchArr, toFind) {
  var toFindArr = toFind.split(" ").filter(notEmptyString);
  var n = toSearchArr.length;
  for (var i = 0; i < n; i++) {
    var toSearch = toSearchArr[i];
    var match = searchMatch(toSearch, toFind, toFindArr);
    if (match) {
      return {
        term: toSearch,
        match: match,
        tocItem: null // will be filled later
      };
    }
  }
  return null;
}

function notEmptyString(s) {
  return s.length > 0;
}

// if search term is multiple words like "blank id",
// we search for both the exact match and if we match all
// terms ("blank", "id") separately
function doSearch(searchTerm) {
  searchTerm = searchTerm.trim();
  if (searchTerm == currentSearchTerm) {
    return;
  }
  searchTerm = searchTerm.toLowerCase();
  currentSearchTerm = searchTerm;
  if (searchTerm.length == 0) {
    clearSearchResults();
    return;
  }

  // console.log("search for:", searchTerm);
  var a = gBookToc; // loaded via toc_search.js, generated in gen_book_toc_search.go
  var n = a.length;
  var res = [];
  for (var i = 0; i < n && res.length < maxSearchResults; i++) {
    var tocItem = a[i];
    var searchable = tocItemSearchable(tocItem);
    var match = searchMatchMulti(searchable, searchTerm);
    if (!match) {
      continue;
    }
    match.tocItem = tocItem;
    res.push(match);
  }
  // console.log("search results:", res);
  setState({
    searchResults: res,
    selectedSearchResultIdx: 0
  });
}

// returns a debouncer function. Usage:
// var debouncer = makeDebouncer(250);
// function fn() { ... }
// debouncer(fn)
function makeDebouncer(timeInMs) {
  let interval;
  return function(f) {
    clearTimeout(interval);
    interval = setTimeout(() => {
      interval = null;
      f();
    }, timeInMs);
  };
}

// TODO: maybe just use debouncer from https://gist.github.com/nmsdvid/8807205
// and do addEventListener("input", debounce(onSearchInputChanged, 250, false))
var searchInputDebouncer = makeDebouncer(250);

function extractIntID(id) {
  var parts = id.split("-");
  var nStr = parts[parts.length - 1];
  var n = parseInt(nStr, 10);
  return isNaN(n) ? -1 : n;
}

function getIdxFromSearchResultElementId(id) {
  if (!id) {
    return -1;
  }
  if (!id.startsWith("search-result-no-")) {
    return -1;
  }
  return extractIntID(id);
}

function toggleTocItem(idx) {
  console.log("toggleTocItem:", idx);
  var tocItem = gBookToc[idx];
  var isExpanded = tocItemIsExpanded(tocItem);
  tocItemSetIsExpanded(tocItem, !isExpanded);
  recreateTOC();
}

function getTocItemFromElementId(id) {
  if (!id) {
    return -1;
  }
  if (!id.startsWith("ti-")) {
    return -1;
  }
  return extractIntID(id);
}

// if search result item is
function onClick(ev) {
  var el = ev.target;
  if (el.id === "blur-overlay") {
    dismissSearch();
    ev.stopPropagation();
    return;
  }

  /*
  We want to detect 2 kinds of clicks:
    - on search results
    - on toc item
  Since a child element might be clicked, we need to
  traverse up until we find desired parent or top
  of document
  */
  while (el) {
    var idx = getIdxFromSearchResultElementId(el.id);
    if (idx >= 0) {
      navigateToSearchResult(idx);
      ev.stopPropagation();
      return;
    }
    idx = getTocItemFromElementId(el.id);
    if (idx >= 0) {
      toggleTocItem(idx);
      ev.stopPropagation();
      return;
    }
    el = el.parentNode;
  }
  // possibly dismiss search results
  setState({
    selectedSearchResultIdx: -1
  });
}

function dismissSearch() {
  clearSearchResults();
  setState(
    {
      selectedSearchResultIdx: -1,
      searchInputFocused: false
    },
    true
  );
}

// when we're over elements with id "search-result-no-${id}", set this one
// as selected element
function onMouseMove(ev) {
  var el = ev.target;
  var idx = getIdxFromSearchResultElementId(el.id);
  if (idx < 0) {
    return;
  }
  //console.log("ev.target:", el, "id:", el.id, "idx:", idx);
  setState({
    selectedSearchResultIdx: idx
  });
  ev.stopPropagation();
}

function onEnter(ev) {
  var selIdx = currentState.selectedSearchResultIdx;
  if (selIdx == -1) {
    return;
  }
  navigateToSearchResult(selIdx);
}

function onKeySlash(ev) {
  setState({
    searchInputFocused: true
  });
  ev.preventDefault();
}

function onEscape(ev) {
  dismissSearch();
  ev.preventDefault();
}

function onUpDown(ev) {
  var dir = ev.key == "ArrowUp" ? -1 : 1;
  var results = currentState.searchResults;
  var n = results.length;
  var selIdx = currentState.selectedSearchResultIdx;
  if (n <= 0 || selIdx < 0) {
    return;
  }
  var newIdx = selIdx + dir;
  if (newIdx >= 0 && newIdx < n) {
    setState({
      selectedSearchResultIdx: newIdx
    });
    ev.preventDefault();
  }
}

function onKeyDown(ev) {
  // console.log(ev);
  if (ev.key == "/") {
    onKeySlash(ev);
    return;
  }

  if (ev.key == "Escape") {
    onEscape(ev);
    return;
  }

  if (ev.key == "Enter") {
    onEnter(ev);
    return;
  }

  if (ev.key == "ArrowUp" || ev.key == "ArrowDown") {
    onUpDown(ev);
    return;
  }
}

function onSearchInputChanged(ev) {
  var s = ev.target.value;
  var fn = doSearch.bind(this, s);
  searchInputDebouncer(fn);
}

function onSearchInputFocus(ev) {
  setState({
    searchInputFocused: true
  });
  ev.preventDefault();
}

function onSearchInputBlur(ev) {
  setState({
    searchInputFocused: false
  });
  ev.preventDefault();
}

function start() {
  //console.log("started");

  document.addEventListener("keydown", onKeyDown, true);

  var el = getSearchInputElement();
  el.addEventListener("input", onSearchInputChanged, true);
  el.addEventListener("focus", onSearchInputFocus, true);
  el.addEventListener("blur", onSearchInputBlur, true);

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("click", onClick, false);

  var uri = getLocationLastElement();
  if (!isChapterOrArticleURL(uri)) {
    return;
  }
  // if this is chapter or article, we generate toc
  window.onhashchange = locationHashChanged;
  tocUnexpandAll();
  setTocExpandedForCurrentURL();
  var tocItemElementID = createTOC();
  // ensure that the slected toc item is visible
  if (tocItemElementID === "") {
    return;
  }
  function makeTocVisible() {
    var el = document.getElementById(tocItemElementID);
    if (el) {
      scrollElementIntoView(el, true);
    } else {
      console.log("tried to scroll toc item to non-existent element with id: '"+tocItemElementID+"'");
    }
  }
  window.requestAnimationFrame(makeTocVisible);
}

// we don't want to run javascript on about etc. pages
var isAppPage = window.location.pathname.indexOf("essential/") != -1;
if (isAppPage) {
  // we don't want this in e.g. about page
  document.addEventListener("DOMContentLoaded", start);
}
