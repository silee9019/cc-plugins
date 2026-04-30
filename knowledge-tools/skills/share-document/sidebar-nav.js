(function () {
  // ─── Fixed-duration body scroll (~800ms, burst start → smooth land) ──────
  var SCROLL_DURATION = 800;
  var scrollAnimId = null;
  // easeOutQuint: very fast at start (burst), gentle deceleration into target
  function easeOutQuint(t) { return 1 - Math.pow(1 - t, 5); }
  function smoothScrollTo(targetY) {
    if (scrollAnimId !== null) cancelAnimationFrame(scrollAnimId);
    var startY = window.scrollY;
    var maxY = document.documentElement.scrollHeight - window.innerHeight;
    targetY = Math.max(0, Math.min(maxY, targetY));
    var delta = targetY - startY;
    if (Math.abs(delta) < 1) return;
    var startTime = performance.now();
    function step(now) {
      var elapsed = now - startTime;
      var t = Math.min(1, elapsed / SCROLL_DURATION);
      var y = startY + delta * easeOutQuint(t);
      window.scrollTo(0, y);
      if (t < 1) scrollAnimId = requestAnimationFrame(step);
      else { window.scrollTo(0, targetY); scrollAnimId = null; }
    }
    scrollAnimId = requestAnimationFrame(step);
  }

  // ─── Options panel (always-visible top-right controls) ───────────────────
  var STORAGE_PREFIX = 'share-doc:';
  function loadPref(key, def) {
    try { var v = localStorage.getItem(STORAGE_PREFIX + key); return v == null ? def : v; }
    catch (e) { return def; }
  }
  function savePref(key, val) {
    try { localStorage.setItem(STORAGE_PREFIX + key, val); } catch (e) {}
  }

  function buildOptionsPanel() {
    var panel = document.createElement('div');
    panel.id = 'options-panel';
    panel.innerHTML = [
      '<div class="opt-group toggle" title="Content width" role="radiogroup" aria-label="Content width">',
      '  <button data-opt="width" data-val="narrow" role="radio" aria-label="Narrow"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 5v14M15 5v14"/></svg></button>',
      '  <button data-opt="width" data-val="wide" role="radio" aria-label="Wide"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 5v14M21 5v14M7 12h10M7 9l-3 3 3 3M17 9l3 3-3 3"/></svg></button>',
      '</div>',
      '<div class="opt-divider"></div>',
      '<div class="opt-group toggle" title="Theme" role="radiogroup" aria-label="Theme">',
      '  <button data-opt="theme" data-val="light" role="radio" aria-label="Light">☀</button>',
      '  <button data-opt="theme" data-val="dark" role="radio" aria-label="Dark">☾</button>',
      '</div>'
    ].join('');
    document.body.appendChild(panel);

    function setOpt(opt, val) {
      if (opt === 'width') document.body.dataset.width = val;
      else if (opt === 'theme') document.documentElement.dataset.theme = val;
      panel.querySelectorAll('button[data-opt="' + opt + '"]').forEach(function (b) {
        b.setAttribute('aria-pressed', b.dataset.val === val ? 'true' : 'false');
      });
      savePref(opt, val);
    }

    panel.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-opt]');
      if (!btn || btn.disabled) return;
      setOpt(btn.dataset.opt, btn.dataset.val);
    });

    // Keyboard navigation within radiogroup toggles (ArrowLeft/Right)
    panel.querySelectorAll('[role="radiogroup"]').forEach(function (group) {
      group.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        var btns = Array.prototype.slice.call(group.querySelectorAll('button[role="radio"]'));
        var idx = btns.indexOf(document.activeElement);
        if (idx === -1) return;
        e.preventDefault();
        var next = e.key === 'ArrowRight'
          ? (idx + 1) % btns.length
          : (idx - 1 + btns.length) % btns.length;
        btns[next].focus();
        btns[next].click();
      });
    });

    setOpt('width', loadPref('width', 'narrow'));
    setOpt('theme', loadPref('theme', 'light'));
  }

  // ─── TOC chrome: scroll wrapper, jump buttons, depth stepper footer ─────
  var DEPTH_MIN = 1, DEPTH_MAX = 4;

  function buildTocChrome(toc) {
    // Wrap existing <ul> in a scrollable container
    var topUl = toc.querySelector(':scope > ul');
    if (!topUl) return null;

    var scroll = document.createElement('div');
    scroll.className = 'toc-scroll';
    toc.insertBefore(scroll, topUl);
    scroll.appendChild(topUl);

    // Top/bottom jump buttons (always visible)
    var jumpTop = document.createElement('button');
    jumpTop.className = 'toc-jump top';
    jumpTop.setAttribute('aria-label', 'Scroll to top');
    jumpTop.textContent = '▲';
    jumpTop.addEventListener('click', function () {
      smoothScrollTo(0);
    });
    toc.appendChild(jumpTop);

    var jumpBottom = document.createElement('button');
    jumpBottom.className = 'toc-jump bottom';
    jumpBottom.setAttribute('aria-label', 'Scroll to bottom');
    jumpBottom.textContent = '▼';
    jumpBottom.addEventListener('click', function () {
      smoothScrollTo(document.documentElement.scrollHeight);
    });
    toc.appendChild(jumpBottom);

    // Footer with depth stepper
    var footer = document.createElement('div');
    footer.className = 'toc-footer';
    footer.innerHTML = [
      '<span class="opt-label">Level</span>',
      '<button data-act="dec" aria-label="Decrease level">−</button>',
      '<span class="opt-value" data-display="depth">L2</span>',
      '<button data-act="inc" aria-label="Increase level">+</button>'
    ].join('');
    toc.appendChild(footer);

    function applyDepth(val) {
      document.body.dataset.tocDepth = val;
      footer.querySelector('[data-display="depth"]').textContent = 'L' + val;
      footer.querySelector('button[data-act="dec"]').disabled = parseInt(val, 10) <= DEPTH_MIN;
      footer.querySelector('button[data-act="inc"]').disabled = parseInt(val, 10) >= DEPTH_MAX;
      savePref('depth', val);
    }

    footer.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-act]');
      if (!btn || btn.disabled) return;
      var cur = parseInt(loadPref('depth', '2'), 10) || 2;
      var delta = btn.dataset.act === 'inc' ? 1 : -1;
      var next = Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, cur + delta));
      if (next !== cur) applyDepth(String(next));
    });

    applyDepth(loadPref('depth', '2'));

    return scroll;
  }

  // ─── TOC sidebar logic ───────────────────────────────────────────────────
  var toc = document.getElementById('TOC');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildOptionsPanel);
  } else {
    buildOptionsPanel();
  }

  if (!toc) return;

  // Build chrome (scroll wrapper, jump buttons, depth footer) before
  // capturing scroll/links references.
  var scroll = buildTocChrome(toc);
  if (!scroll) return;

  var links = Array.prototype.slice.call(scroll.querySelectorAll('a[href^="#"]'));
  if (!links.length) return;

  var idToLink = {};
  var orderedIds = [];
  links.forEach(function (a) {
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    idToLink[id] = a;
  });

  // Cache heading positions when nothing is sticky-stuck (i.e., scrollY=0).
  var positions = {};
  function cachePositions() {
    var savedY = window.scrollY;
    var prevBehavior = document.documentElement.style.scrollBehavior;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, 0);
    positions = {};
    orderedIds = [];
    Object.keys(idToLink).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) positions[id] = el.getBoundingClientRect().top + window.scrollY;
    });
    orderedIds = Object.keys(positions).sort(function (a, b) {
      return positions[a] - positions[b];
    });
    window.scrollTo(0, savedY);
    document.documentElement.style.scrollBehavior = prevBehavior;
  }

  // Set virtual padding inside ul so first/last *visible* link can land
  // EXACTLY at anchorRatio without scroll bounce/clamp.
  var ANCHOR_RATIO = 0.15;
  // offsetTop walks up offsetParent chain — needed because li now has
  // position:relative (for hover absolute), so a.offsetTop is no longer
  // relative to the scroll wrapper.
  function offsetTopIn(el, container) {
    var top = 0;
    var node = el;
    while (node && node !== container) {
      top += node.offsetTop;
      node = node.offsetParent;
    }
    return top;
  }

  function setExactFitPadding() {
    var ul = scroll.querySelector(':scope > ul');
    if (!ul) return;
    ul.style.paddingTop = '0px';
    ul.style.paddingBottom = '0px';
    var visible = links.filter(function (a) { return a.offsetParent !== null; });
    if (!visible.length) return;
    var firstLink = visible[0];
    var lastLink = visible[visible.length - 1];
    var navH = scroll.clientHeight;
    var anchorPx = navH * ANCHOR_RATIO;
    var firstOffset = offsetTopIn(firstLink, scroll);
    var topPad = Math.max(0, anchorPx - firstOffset);
    ul.style.paddingTop = topPad + 'px';
    var lastLinkH = lastLink.offsetHeight;
    var bottomPad = Math.max(0, navH - anchorPx - lastLinkH);
    ul.style.paddingBottom = bottomPad + 'px';
  }

  function applyDistanceFade(activeLink) {
    // Distance counted across VISIBLE links only — hidden depth items
    // shouldn't inflate the gap between adjacent visible rows.
    var visible = links.filter(function (l) { return l.offsetParent !== null; });
    var activeVi = visible.indexOf(activeLink);
    var SHARP_RANGE = 6;
    var BASE = 0.7;
    function opAt(d) {
      if (d === 0) return 1;
      if (d <= SHARP_RANGE) return 1 - (d / SHARP_RANGE) * (1 - BASE);
      return BASE;
    }
    links.forEach(function (l) {
      if (l.offsetParent === null) { l.style.opacity = ''; return; }
      var i = visible.indexOf(l);
      var d = activeVi < 0 ? Infinity : Math.abs(i - activeVi);
      l.style.opacity = String(opAt(d));
    });
  }

  function centerActive(active) {
    var target = offsetTopIn(active, scroll) - (scroll.clientHeight * ANCHOR_RATIO);
    target = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, target));
    // instant — keeps active link visually pinned at 15% with no lag
    scroll.scrollTop = target;
  }

  var clickedId = null;
  var lastActiveId = null;

  function determineActive() {
    if (!orderedIds.length) return null;
    var threshold = window.scrollY + 80;
    var bestId = null;
    // Walk in document order; skip headings whose TOC link is currently hidden
    // (filtered by depth). This naturally maps deep sections to their visible
    // ancestor in the TOC.
    for (var i = 0; i < orderedIds.length; i++) {
      var id = orderedIds[i];
      if (positions[id] > threshold) break;
      var link = idToLink[id];
      if (!link || link.offsetParent === null) continue;
      bestId = id;
    }
    if (bestId) return bestId;
    // before any visible heading: use first visible
    for (var j = 0; j < orderedIds.length; j++) {
      var l = idToLink[orderedIds[j]];
      if (l && l.offsetParent !== null) return orderedIds[j];
    }
    return null;
  }

  function updateActive() {
    var id = clickedId || determineActive();
    if (!id || id === lastActiveId) return;
    lastActiveId = id;
    var active = idToLink[id];
    if (!active) return;
    links.forEach(function (l) { l.classList.remove('active'); });
    active.classList.add('active');
    applyDistanceFade(active);
    centerActive(active);
  }

  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { clickedId = null; }, { passive: true });
  });

  function refresh() {
    cachePositions();
    setExactFitPadding();
    lastActiveId = null;
    updateActive();
  }

  function init() {
    refresh();
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init);

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(refresh, 200);
  });

  // depth/width toggles in panel call cachePositions; also refresh padding.
  // Clear click override so a previously-clicked deep link doesn't lock the
  // active state to a now-hidden TOC entry.
  var optObserver = new MutationObserver(function () {
    setTimeout(function () {
      clickedId = null;
      setExactFitPadding();
      lastActiveId = null;
      updateActive();
    }, 50);
  });
  optObserver.observe(document.body, { attributes: true, attributeFilter: ['data-toc-depth', 'data-width'] });

  var rafPending = false;
  window.addEventListener('scroll', function () {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      updateActive();
    });
  }, { passive: true });

  var STICKY_OFFSET = 0;
  links.forEach(function (a) {
    a.addEventListener('click', function (e) {
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var id = decodeURIComponent(href.slice(1));
      var pos = positions[id];
      if (typeof pos !== 'number') return;
      e.preventDefault();
      var top = Math.max(0, pos - STICKY_OFFSET);
      smoothScrollTo(top);
      if (history.replaceState) history.replaceState(null, '', '#' + id);
      clickedId = id;
      lastActiveId = null;
      updateActive();
    });
  });
})();
