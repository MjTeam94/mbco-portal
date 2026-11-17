/* MBCO – البوابة الموحدة · الواجهة (بدون مكتبات) */
(function () {
  'use strict';
  var CFG = window.MBCO_CONFIG || {};
  var DEMO = !CFG.HUB_URL || /[?&]demo=1/.test(location.search);
  var I18N = window.MBCO_I18N;
  var $app = document.getElementById('app');

  /* ---------------- الحالة ---------------- */
  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
    json: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  };
  /* نسخة محلية من آخر بيانات: تظهر فوراً، ثم تتحدث في الخلفية */
  var CC = 'mbco_c_';
  function ccKey(k) { return CC + ((st.user && st.user.emp_id) || 'x') + '_' + k; }
  function ccGet(k) {
    var o = ls.json(ccKey(k));
    return o && o.d && Date.now() - o.t < 12 * 3600e3 ? o.d : null;
  }
  function ccClear() {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(CC) === 0) localStorage.removeItem(k); }); } catch (e) {}
  }
  function ccSet(k, d) {
    var v = JSON.stringify({ t: Date.now(), d: d });
    if (v.length > 1500000) return;                       // جداول كبيرة جداً لا تُحفظ محلياً
    try { localStorage.setItem(ccKey(k), v); }
    catch (e) { ccClear(); try { localStorage.setItem(ccKey(k), v); } catch (e2) {} }
  }
  function setSync(on) {
    var b = document.getElementById('refBtn');
    if (b) { b.classList.toggle('spinning', !!on); b.setAttribute('aria-busy', on ? 'true' : 'false'); }
  }

  var st = {
    token: ls.get('mbco_token'), user: ls.json('mbco_user'), sections: ls.json('mbco_sections') || [],
    mustChange: ls.get('mbco_must') === '1',
    lang: ls.get('mbco_lang') || 'ar', theme: document.documentElement.getAttribute('data-theme') || 'light',
    date: '', heatDays: 7, home: null, homeKey: '', homeAt: 0, sec: {}, timer: null, fresh: false
  };

  /* ترجمة القيم القادمة من الأنظمة في الوضع الإنجليزي: قاموس ثابت (i18n.js) + قاموس الـ Hub (تبويب Translations وأسماء الموظفين) */
  var DATA = window.MBCO_DATA_EN || { exact: {}, patterns: [] };
  var DICT = {};
  (function () { var ex = {}; Object.keys(DATA.exact || {}).forEach(function (k) { ex[String(k).replace(/[\u064B-\u0652\u0640]/g, '').replace(/\s+/g, ' ').trim()] = DATA.exact[k]; }); DATA.exact = ex; })();
  function addDict(d) { if (d) Object.keys(d).forEach(function (k) { if (d[k]) DICT[normAr(k)] = d[k]; }); }
  function normAr(v) { return String(v).replace(/[\u064B-\u0652\u0640]/g, '').replace(/\s+/g, ' ').trim(); }
  function tr(v) {
    if (st.lang !== 'en' || v === null || v === undefined || v === '' || typeof v !== 'string' || !/[\u0600-\u06FF]/.test(v)) return v;
    var k = normAr(v);
    if (DICT[k]) return DICT[k];
    if (DATA.exact[k]) return DATA.exact[k];
    for (var i = 0; i < DATA.patterns.length; i++) {
      var m = k.match(DATA.patterns[i][0]);
      if (m) return DATA.patterns[i][1](m, tr);
    }
    if (k.indexOf(' · ') > 0) return k.split(' · ').map(tr).join(' · ');
    if (k.indexOf(' + ') > 0) return k.split(' + ').map(tr).join(' + ');
    var n = k.match(/^(.+?) \(([^()\u0600-\u06FF]+)\)$/);
    if (n) return tr(n[1]) + ' (' + n[2] + ')';
    return v;
  }
  function t(k) { return (I18N[st.lang] && I18N[st.lang][k]) || I18N.ar[k] || k; }
  function esc(v) { return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtN(n) { return n === null || n === undefined || n === '' ? '—' : (typeof n === 'number' ? n.toLocaleString('en') : esc(n)); }
  function todayStr() { var d = new Date(Date.now() + 3 * 3600e3 - 7 * 3600e3); return d.toISOString().slice(0, 10); } // اليوم التشغيلي بتوقيت الرياض
  function route() { var h = (location.hash || '').replace(/^#\/?/, ''); return h || 'home'; }
  function toneColor(tone) { return { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', accent: 'var(--accent)', muted: 'var(--muted)' }[tone] || 'var(--accent)'; }

  /* ---------------- الاتصال بالـ Hub ---------------- */
  function api(action, payload) {
    payload = Object.assign({ action: action, token: st.token }, payload || {});
    if (DEMO) return window.MBCO_DEMO.handle(payload);
    return fetch(CFG.HUB_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .catch(function () { throw new Error('net'); })
      .then(function (j) {
        if (!j.ok) {
          if (j.error === 'auth') { logout(true); }
          throw new Error(j.error || 'generic');
        }
        return j;
      });
  }
  function errText(e) { var m = String(e && e.message || e); return t('e_' + m) !== 'e_' + m ? t('e_' + m) : (t('e_generic') + ': ' + m); }

  function saveSession(j) {
    if (j.token) { st.token = j.token; ls.set('mbco_token', j.token); }
    if (j.user) { st.user = j.user; ls.set('mbco_user', JSON.stringify(j.user)); }
    if (j.sections) { st.sections = j.sections; ls.set('mbco_sections', JSON.stringify(j.sections)); }
    if (j.mustChange !== undefined) { st.mustChange = !!j.mustChange; ls.set('mbco_must', j.mustChange ? '1' : null); }
  }
  function logout(expired) {
    ccClear();
    ['mbco_token', 'mbco_user', 'mbco_sections', 'mbco_must'].forEach(function (k) { ls.set(k, null); });
    st.token = null; st.user = null; st.home = null; st.sec = {};
    if (expired) toast(t('e_auth'));
    location.hash = '';
    render();
  }

  /* ---------------- اللغة والوضع ---------------- */
  function applyLang() {
    document.documentElement.lang = st.lang;
    document.documentElement.dir = st.lang === 'ar' ? 'rtl' : 'ltr';
    document.title = 'MBCO · ' + t('portal');
  }
  function toggleLang() { st.lang = st.lang === 'ar' ? 'en' : 'ar'; ls.set('mbco_lang', st.lang); applyLang(); render(); }
  function toggleTheme() {
    st.theme = st.theme === 'dark' ? 'light' : 'dark';
    ls.set('mbco_theme', st.theme);
    document.documentElement.setAttribute('data-theme', st.theme);
    var b = document.getElementById('themeBtn');
    if (b) { b.innerHTML = icon(st.theme === 'dark' ? 'sun' : 'moon'); b.setAttribute('aria-label', st.theme === 'dark' ? t('light') : t('dark')); b.title = b.getAttribute('aria-label'); }
  }

  /* ---------------- الأيقونات ---------------- */
  var ICONS = {
    home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    cdc: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
    ins: 'M9 3h6v3H9zM7 4.5H5V21h14V4.5h-2M9 13l2 2 4-4',
    car: 'M5 16h14M6 16l1.5-6h9L18 16M5 16v3h3v-3M16 16v3h3v-3',
    roster: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
    att: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-6 7-6s7 2 7 6M16 11l2 2 4-4',
    leaves: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
    requests: 'M4 13l3-8h10l3 8v6H4zM4 13h5l1 2h4l1-2h5',
    people: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    reports: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9M12 3C9.5 5.5 8.2 8.5 8.2 12s1.3 6.5 3.8 9',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
    alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
    print: 'M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    send: 'M21 3L10 14M21 3l-7 18-4-7-7-4z'
  };
  function icon(n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + ICONS[n] + '"/></svg>'; }

  function toast(msg) {
    var d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = msg;
    document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3500);
  }

  /* ---------------- الرسم ---------------- */
  function render() {
    applyLang();
    clearInterval(st.timer);
    if (!st.token) return renderLogin();
    if (st.mustChange) return renderChangePin(true);
    renderShell();
    var r = route();
    if (!st.sections.some(function (s) { return s.key === r; })) r = 'home';
    if (r === 'home') loadHome(false);
    else if (r === 'reports') loadHome(true);
    else if (r === 'settings') renderSettings();
    else loadSection(r);
  }

  function loginTools() {
    return '<div class="tools"><button type="button" class="btn sm" id="langBtn" aria-label="' + esc(t('lang_label')) + '">' + icon('globe') + '<span>' + t('lang_btn') + '</span></button>' +
      '<button type="button" class="btn icon sm" id="themeBtn" aria-label="' + esc(st.theme === 'dark' ? t('light') : t('dark')) + '">' + icon(st.theme === 'dark' ? 'sun' : 'moon') + '</button></div>';
  }
  function bindTools() {
    var l = document.getElementById('langBtn'); if (l) l.onclick = toggleLang;
    var th = document.getElementById('themeBtn'); if (th) th.onclick = toggleTheme;
  }

  function renderLogin() {
    $app.innerHTML = '<div class="login"><form class="loginbox" id="lf" autocomplete="on">' +
      '<div class="logo"><b>MBCO</b><small>Modern Bus Company Limited</small></div>' +
      '<h1>' + t('login_title') + ' · ' + esc(t('portal')) + '</h1>' +
      (DEMO ? '<span class="notice">' + t('demo') + ' – 10190 / 1234</span>' : '') +
      '<label class="field">' + t('emp_id') + '<input class="input num" id="emp" inputmode="numeric" autocomplete="username" required></label>' +
      '<label class="field">' + t('pin') + '<input class="input num" id="pin" type="password" inputmode="numeric" autocomplete="current-password" required></label>' +
      '<div class="err" id="err" role="alert"></div>' +
      '<button class="btn primary" type="submit">' + t('login') + '</button>' + loginTools() + '</form></div>';
    bindTools();
    document.getElementById('lf').onsubmit = function (e) {
      e.preventDefault();
      var btn = this.querySelector('button[type=submit]'); btn.disabled = true;
      var digits = function (s) { return s.replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).trim(); };
      api('login', { emp_id: digits(document.getElementById('emp').value), pin: digits(document.getElementById('pin').value) })
        .then(function (j) { saveSession(j); render(); })
        .catch(function (err) { document.getElementById('err').textContent = errText(err); btn.disabled = false; });
    };
  }

  function renderChangePin(forced, target) {
    var html = '<form class="' + (forced ? 'loginbox' : 'card') + '" id="pf" style="max-width:420px">' +
      (forced ? '<div class="logo"><b>MBCO</b><small>Modern Bus Company Limited</small></div>' : '') +
      '<h2 style="margin:0">' + t('change_pin') + '</h2>' + (forced ? '<p class="muted" style="margin:0">' + t('change_pin_note') + '</p>' : '') +
      '<label class="field">' + t('old_pin') + '<input class="input num" id="p0" type="password" inputmode="numeric" autocomplete="current-password" required></label>' +
      '<label class="field">' + t('new_pin') + '<input class="input num" id="p1" type="password" inputmode="numeric" autocomplete="new-password" required></label>' +
      '<label class="field">' + t('confirm_pin') + '<input class="input num" id="p2" type="password" inputmode="numeric" autocomplete="new-password" required></label>' +
      '<div class="err" id="perr" role="alert"></div><button class="btn primary" type="submit">' + t('save') + '</button>' +
      (forced ? loginTools() : '') + '</form>';
    if (forced) { $app.innerHTML = '<div class="login">' + html + '</div>'; bindTools(); } else target.innerHTML = html;
    document.getElementById('pf').onsubmit = function (e) {
      e.preventDefault();
      var p1 = document.getElementById('p1').value, p2 = document.getElementById('p2').value;
      var er = document.getElementById('perr');
      if (p1 !== p2) { er.textContent = t('pin_mismatch'); return; }
      api('changePin', { old: document.getElementById('p0').value, 'new': p1 })
        .then(function (j) { saveSession({ token: j.token, mustChange: false }); toast(t('pin_saved')); render(); })
        .catch(function (err) { er.textContent = errText(err); });
    };
  }

  function renderShell() {
    var r = route();
    var groups = { '': '', ops: t('g_ops'), staff: t('g_staff'), analysis: t('g_analysis'), system: t('g_system') };
    var last = null, nav = '';
    var badges = (st.home && st.home.badges) || {};
    st.sections.forEach(function (s) {
      if (s.group !== last && groups[s.group]) nav += '<span class="grp">' + esc(groups[s.group]) + '</span>';
      last = s.group;
      var b = badges[s.key];
      nav += '<a class="nav' + (s.key === r ? ' active' : '') + '" href="#/' + esc(s.key) + '"' + (s.key === r ? ' aria-current="page"' : '') + '>' +
        icon(ICONS[s.key] ? s.key : 'reports') + '<span class="l">' + esc(st.lang === 'en' ? s.en : s.ar) + '</span>' +
        (b ? '<span class="badge num" data-badge="' + esc(s.key) + '">' + b + '</span>' : '') + '</a>';
    });
    var u = st.user || {};
    $app.innerHTML =
      '<header class="topbar"><div class="brand"><div class="logo"><b>MBCO</b><small>Modern Bus Company Limited</small></div><div class="vsep"></div>' +
      '<div class="title"><b>' + t('portal') + '</b><small>' + t('systems_line') + '</small></div></div><div class="spacer"></div>' +
      '<div class="controls">' +
      '<label class="field noprint" id="dateField">' + t('op_day') + '<input class="input num" type="date" id="dateIn" value="' + esc(st.date || todayStr()) + '" max="' + todayStr() + '"></label>' +
      '<button type="button" class="btn" id="langBtn" aria-label="' + esc(t('lang_label')) + '" title="' + esc(t('lang_label')) + '">' + icon('globe') + '<span>' + t('lang_btn') + '</span></button>' +
      '<button type="button" class="btn icon" id="themeBtn" aria-label="' + esc(st.theme === 'dark' ? t('light') : t('dark')) + '" title="' + esc(st.theme === 'dark' ? t('light') : t('dark')) + '">' + icon(st.theme === 'dark' ? 'sun' : 'moon') + '</button>' +
      '<button type="button" class="btn primary" id="refBtn">' + icon('refresh') + '<span>' + t('refresh') + '</span></button>' +
      '</div></header>' +
      '<div class="wrap"><nav class="side" aria-label="sections">' + nav +
      '<div class="usercard"><div class="avatar">' + esc((u.name || '?').charAt(0)) + '</div><div class="who"><b>' + esc(u.name || '') + ' · <span class="num">' + esc(u.emp_id || '') + '</span></b><small>' + esc(u.role || '') + ' · ' + esc(u.team_name || '') + '</small></div>' +
      '<button type="button" class="btn icon" id="outBtn" aria-label="' + esc(t('logout')) + '" title="' + esc(t('logout')) + '">' + icon('logout') + '</button></div></nav>' +
      '<main class="main" id="main"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></main></div>' +
      '<footer class="foot"><span>' + t('source') + '</span><span>' + t('opday_note') + '</span><span class="ltr">MBCO · Modern Bus Company Limited</span></footer>';
    bindTools();
    document.getElementById('outBtn').onclick = function () { logout(false); };
    document.getElementById('refBtn').onclick = function () {
      st.fresh = true; st.homeAt = 0;
      Object.keys(st.sec).forEach(function (k) { st.sec[k].at = 0; });
      render();
    };
    var di = document.getElementById('dateIn');
    var showDate = r === 'home' || r === 'reports';
    document.getElementById('dateField').classList.toggle('hide', !showDate);
    di.onchange = function () { st.date = di.value; render(); };
  }

  function setBadges() {
    var b = (st.home && st.home.badges) || {};
    st.sections.forEach(function (s) {
      var a = document.querySelector('.side a[href="#/' + s.key + '"]');
      if (!a) return;
      var el = a.querySelector('.badge');
      if (b[s.key]) { if (!el) { el = document.createElement('span'); el.className = 'badge num'; a.appendChild(el); } el.textContent = b[s.key]; }
      else if (el) el.remove();
    });
  }

  function failBox(target, err, retry) {
    target.innerHTML = '<div class="card"><div class="err">' + esc(errText(err)) + '</div><button type="button" class="btn" id="retry">' + t('retry') + '</button></div>';
    document.getElementById('retry').onclick = retry;
  }

  /* ---------------- الرئيسية + التقرير اليومي ---------------- */
  function loadHome(isReport) {
    var main = document.getElementById('main');
    var key = (st.date || todayStr()) + '|' + st.heatDays;
    var ck = 'home|' + key;
    var page = isReport ? 'reports' : 'home';
    var draw = function (d) {
      if (route() !== page) return;
      main.innerHTML = isReport
        ? '<div class="reptool noprint"><div><h1 style="margin:0;font-size:22px">' + t('report_title') + '</h1><div class="muted" style="font-size:13px">' + t('rep_hint') + '</div></div><span class="spacer"></span>' +
          (DEMO ? '<span class="notice">' + t('demo') + '</span>' : '') +
          '<span id="repStatus" class="muted" role="status" style="font-size:13px"></span>' +
          '<button type="button" class="btn" id="repDl">' + icon('download') + t('rep_download') + '</button>' +
          '<button type="button" class="btn primary" id="repSend">' + icon('send') + t('rep_send') + '</button></div>' +
          '<div class="sheet" id="reportSheet">' + homeHTML(d, true) + '</div>'
        : homeHTML(d, false);
      bindHome(isReport);
    };
    var go = function (force) {
      var mem = st.home && st.homeKey === key ? st.home : null;
      var shown = mem || ccGet(ck);
      if (shown && !force) { addDict(shown.dict); draw(shown); if (!mem) { st.home = shown; st.homeKey = key; setBadges(); } }
      if (mem && !force && !st.fresh && Date.now() - st.homeAt < 60000) return;
      var fresh = st.fresh; st.fresh = false;
      setSync(true);
      api('home', { date: st.date || '', heatDays: st.heatDays, fresh: fresh }).then(function (j) {
        addDict(j.data.dict); st.home = j.data; st.homeKey = key; st.homeAt = Date.now(); ccSet(ck, j.data); setBadges();
        draw(j.data);
      }).catch(function (e) {
        if (shown) toast(errText(e)); else if (route() === page) failBox(main, e, function () { go(true); });
      }).then(function () { setSync(false); });
    };
    go(false);
    if (!isReport) st.timer = setInterval(function () { if (!document.hidden && route() === 'home' && (!st.date || st.date === todayStr())) go(true); }, 300000);
  }

  function bindHome(isReport) {
    document.querySelectorAll('[data-heat]').forEach(function (b) {
      b.onclick = function () { st.heatDays = Number(b.getAttribute('data-heat')); loadHome(isReport); };
    });
    var sb = document.getElementById('repSend'); if (sb) sb.onclick = function () { makeReport(true); };
    var db = document.getElementById('repDl'); if (db) db.onclick = function () { makeReport(false); };
  }

  function ring(pct, color, inner, size) {
    size = size || 92; var hole = Math.round(size * 0.78);
    var p = pct === null || pct === undefined ? 0 : Math.max(0, Math.min(100, pct));
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px;background:conic-gradient(' + color + ' 0 ' + p + '%, var(--track) ' + p + '% 100%)">' +
      '<div style="width:' + hole + 'px;height:' + hole + 'px">' + inner + '</div></div>';
  }

  function homeHTML(d, isReport) {
    var L = st.lang === 'en';
    var secOK = function (k) { return st.sections.some(function (s) { return s.key === k; }); };
    var openLink = function (k) { return secOK(k) && !isReport ? '<a class="open noprint" href="#/' + k + '">' + t('open_section') + '</a>' : ''; };
    var h = '';
    if (isReport) {
      h += '<div class="rephead"><div class="logo"><b>MBCO</b><small>Modern Bus Company Limited</small></div><div class="vsep"></div>' +
        '<div class="reptitle"><b>' + t('report_title') + '</b><span>' + t('report_sub') + '</span></div><span class="spacer"></span>' +
        '<div class="repmeta"><span class="tag b-accent ltr">' + t('daily') + ' · ' + esc(d.date) + '</span>' +
        '<span class="muted">' + t('prepared') + ' <span class="num ltr">' + esc(d.updated || '') + '</span>' + (st.user ? ' · ' + esc(st.user.name) : '') + '</span></div></div>';
    } else {
      h += '<div class="pagehead"><div><h1>' + t('home_title') + '</h1><div class="sub num">' + esc(d.date) + (d.isToday ? ' · ' + t('last_update') + ' ' + esc(d.updated) : '') + '</div></div>' +
        (DEMO ? '<span class="notice">' + t('demo') + '</span>' : '') + '</div>';
    }

    // الورديات
    if (!isReport) h += '<section class="card" aria-label="' + esc(t('shifts_now')) + '"><div class="chead"><span class="bar4"></span><h2>' + (d.isToday ? t('shifts_now') : t('shifts_day')) + '</h2></div><div class="shifts">';
    if (!isReport && !d.shifts.length) h += '<div class="empty">' + t('no_data') + '</div>';
    if (!isReport) d.shifts.forEach(function (s) {
      h += '<div class="shift"><div class="t"><b>' + esc(tr(s.team)) + '</b><span class="muted ltr num" style="font-size:12px">' + esc(s.time) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>TL: ' + esc(tr(s.lead)) + '</span><span class="pill ' + ({ running: 'b-ok', upcoming: 'b-muted', ended: 'b-accent' }[s.state]) + '">' + t(s.state) + '</span></div>' +
        '<div class="chips"><span class="chip">' + t('attendance') + ' <span class="num ltr">' + esc(s.att) + '</span></span><span class="chip t-' + s.dist.tone + '">' + t('distribution') + ': ' + esc(tr(s.dist.label)) + '</span><span class="chip t-' + s.prep.tone + '">' + t('preparation') + ': ' + esc(tr(s.prep.label)) + '</span></div></div>';
    });
    if (!isReport) h += '</div></section>';

    // مؤشرات الالتزام
    h += '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + t('kpis_title') + ' <small>' + t('kpis_sub') + '</small></h2></div><div class="rings">';
    d.kpis.forEach(function (k) {
      var tone = k.val === null ? 'muted' : k.val >= k.target ? 'ok' : k.target - k.val <= 10 ? 'warn' : 'bad';
      h += '<div class="ringbox">' + ring(k.val, toneColor(tone), '<b class="num t-' + tone + '" style="font-size:19px">' + (k.val === null ? '—' : k.val + '%') + '</b>') +
        '<span class="l">' + esc(tr(k.label)) + '</span><span class="s">' + esc(tr(k.sys)) + ' · ' + t('target') + ' ' + k.target + '%</span></div>';
    });
    h += '</div></section>';

    h += '<div class="grid3">';
    // CDC
    var c = d.cdc;
    var outTotal = c.outcomes.reduce(function (a, b) { return a + b.n; }, 0);
    var oc = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];
    h += '<section class="card"><div class="chead"><span class="numtag">1</span><h2>' + t('cdc_title') + ' <small>CDC</small></h2>' + openLink('cdc') + '</div>' +
      '<div class="kpis"><div class="kpi"><span class="l">' + t('cdc_today') + '</span><span class="v num">' + fmtN(c.today) + '</span></div>' +
      '<div class="kpi ' + (c.open ? 'bad' : '') + '"><span class="l">' + t('cdc_open') + '</span><span class="v num">' + fmtN(c.open) + '</span></div>' +
      '<div class="kpi"><span class="l">' + t('cdc_avg') + '</span><span class="v num">' + fmtN(c.avgArrive) + ' <small>' + t('min') + '</small></span></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:13px;font-weight:600">' + t('outcomes') + '</span>' +
      (outTotal ? '<div class="stack">' + c.outcomes.map(function (o, i) { return '<span style="flex:' + o.n + ' 1 0;background:' + oc[i % 4] + '"></span>'; }).join('') + '</div>' +
        '<div class="legend">' + c.outcomes.map(function (o, i) { return '<span><i style="background:' + oc[i % 4] + '"></i>' + esc(tr(o.name)) + ' <b class="num">' + o.n + '</b></span>'; }).join('') + '</div>'
        : '<div class="empty">' + t('no_data') + '</div>') + '</div>' +
      '<div class="cfoot"><span class="muted">' + t('waiting_patrol') + '</span><b class="num">' + fmtN(c.waitingPatrol) + '</b></div></section>';

    // الفحص
    var ins = d.ins;
    var max7 = Math.max.apply(null, ins.last7.map(function (x) { return x.n; }).concat([1]));
    var dayN = L ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    h += '<section class="card"><div class="chead"><span class="numtag">2</span><h2>' + t('ins_title') + '</h2>' + openLink('ins') + '</div>' +
      '<div class="kpis"><div class="kpi"><span class="l">' + t('inspections') + '</span><span class="v num">' + fmtN(ins.inspections) + '</span></div>' +
      '<div class="kpi"><span class="l">' + t('violations') + '</span><span class="v num">' + fmtN(ins.violations) + '</span></div>' +
      '<div class="kpi"><span class="l">' + t('fines') + '</span><span class="v num">' + fmtN(ins.fines) + ' <small>' + t('sar') + '</small></span></div></div>' +
      '<div style="display:flex;flex-direction:column;gap:6px"><span style="font-size:13px;font-weight:600">' + t('last7') + '</span>' +
      '<div class="bars">' + ins.last7.map(function (x, i) { return '<span class="' + (i === 6 ? 'cur' : '') + '" style="height:' + Math.round(x.n / max7 * 100) + '%" title="' + esc(x.date) + ': ' + x.n + '"></span>'; }).join('') + '</div>' +
      '<div class="barlbl">' + ins.last7.map(function (x, i) { var p = x.date.split('-'); var wd = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); return '<span' + (i === 6 ? ' style="color:var(--text);font-weight:700"' : '') + '>' + (i === 6 && d.isToday ? t('today') : dayN[wd]) + '</span>'; }).join('') + '</div></div>' +
      '<div class="cfoot"><span class="muted">' + t('coverage') + '</span><b class="num">' + fmtN(ins.coverageH) + ' ' + t('hours') + '</b></div></section>';

    // الروستر
    var r = d.rst;
    h += '<section class="card"><div class="chead"><span class="numtag">3</span><h2>' + t('rst_title') + '</h2>' + openLink('att') + '</div>' +
      '<div style="display:flex;align-items:center;gap:16px">' + ring(r.rate, 'var(--accent)', '<b class="num" style="font-size:20px">' + (r.rate === null ? '—' : r.rate + '%') + '</b><span class="muted" style="font-size:11px">' + t('attendance') + '</span>', 96) +
      '<div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));flex:1 1 auto">' +
      '<div class="kpi sm"><span class="l">' + t('present') + '</span><span class="v num ltr">' + r.present + ' / ' + r.expected + '</span></div>' +
      '<div class="kpi sm ' + (r.absent ? 'bad' : '') + '"><span class="l">' + t('absent') + '</span><span class="v num">' + r.absent + '</span></div>' +
      '<div class="kpi sm ' + (r.late ? 'warn' : '') + '"><span class="l">' + t('late') + '</span><span class="v num">' + r.late + ' <small>(' + r.lateMin + ' ' + t('min') + ')</small></span></div>' +
      '<div class="kpi sm"><span class="l">' + t('leave_off') + '</span><span class="v num">' + r.leaveOff + '</span></div></div></div>' +
      '<div class="cfoot"><span class="muted">' + t('exits') + '</span><b class="num ltr">' + r.permissions + ' / ' + r.withdrawals + '</b></div></section>';

    // الطلبات
    var q = d.req;
    h += '<section class="card"><div class="chead"><span class="numtag">4</span><h2>' + t('req_title') + '</h2>' + openLink('leaves') + '</div>' +
      '<div class="kpis"><div class="kpi ' + (q.pendingSup ? 'warn' : '') + '"><span class="l">' + t('pending_sup') + '</span><span class="v num">' + q.pendingSup + '</span></div>' +
      '<div class="kpi accent"><span class="l">' + t('pending_mena') + '</span><span class="v num">' + q.pendingMena + '</span></div>' +
      '<div class="kpi"><span class="l">' + t('admin_new') + '</span><span class="v num">' + q.adminNew + '</span></div></div>' +
      '<div class="list">' + (q.recent.length ? q.recent.map(function (x) {
        return '<div class="it"><b style="flex:1 1 auto">' + esc(tr(x.type)) + '</b><span class="muted">' + esc(tr(x.who)) + '</span><span class="tag b-' + x.tone + '">' + esc(tr(x.status)) + '</span></div>';
      }).join('') : '<div class="empty">' + t('no_data') + '</div>') + '</div></section>';

    // السيارات
    var car = d.car;
    h += '<section class="card"><div class="chead"><span class="numtag">5</span><h2>' + t('car_title') + ' <small>Carlog</small></h2>' + openLink('car') + '</div>' +
      vehiclesHTML(car.vehicles) +
      '<div class="cfoot"><span class="muted">' + t('km_today') + '</span><b class="num">' + fmtN(car.kmToday) + ' ' + t('km') + ' · ' + car.handoversToday + '</b></div></section>';

    // التنبيهات
    h += '<section class="card"><div class="chead"><span class="numtag red">' + icon('alert').replace('<svg', '<svg width="18" height="18"') + '</span><h2>' + t('alerts_title') + '</h2>' +
      (d.alertsTotal ? '<span class="badge num">' + d.alertsTotal + '</span>' : '') + '</div><div class="alerts">' +
      (d.alerts.length ? d.alerts.map(function (a) {
        return '<div class="alert ' + (a.tone === 'bad' ? 'b-bad' : a.tone === 'warn' ? 'b-warn' : 'b-muted') + '" style="color:var(--text)"><span class="s t-' + a.tone + '">' + esc(tr(a.sys)) + '</span><span class="x">' + esc(tr(a.text)) + '</span></div>';
      }).join('') : '<div class="empty t-ok">' + t('no_alerts') + '</div>') + '</div></section>';
    h += '</div>';

    // الخريطة الحرارية + المحطات
    var hm = d.heat;
    var lvl = function (n) { return n === 0 ? 0 : n <= 2 ? 1 : n <= 5 ? 2 : n <= 9 ? 3 : 4; };
    h += '<div class="row2"><section class="card wide"><div class="chead"><span class="bar4"></span><h2>' + t('heat_title') + ' <small>' + t('heat_sub') + '</small></h2>' +
      '<div class="noprint" style="display:flex;gap:4px" role="group"><button type="button" class="btn sm ' + (d.heatDays === 7 ? 'on' : '') + '" data-heat="7" aria-pressed="' + (d.heatDays === 7) + '">' + t('days7') + '</button>' +
      '<button type="button" class="btn sm ' + (d.heatDays === 30 ? 'on' : '') + '" data-heat="30" aria-pressed="' + (d.heatDays === 30) + '">' + t('days30') + '</button></div></div>' +
      '<div class="heatwrap"><div class="heat" role="table"><div class="hr" role="row"><span></span>' + hm.cols.map(function (x) { return '<span class="hd ltr num" role="columnheader">' + esc(x) + '</span>'; }).join('') + '</div>' +
      hm.rows.map(function (row) {
        return '<div class="hr" role="row"><span class="rl" role="rowheader">' + t('route') + ' ' + esc(row.route) + '</span>' +
          row.cells.map(function (n) { return '<span class="c num h' + lvl(n) + '" role="cell">' + n + '</span>'; }).join('') + '</div>';
      }).join('') + '</div></div>' +
      '<div class="scale"><span>' + t('less') + '</span><i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><span>' + t('more') + '</span><span class="spacer"></span>' +
      (hm.top ? '<span style="color:var(--text)">' + t('top_cell') + ': <b>' + t('route') + ' ' + esc(hm.top.route) + ' · <span class="ltr">' + esc(hm.top.col) + '</span></b> (' + hm.top.n + ') ← ' + t('suggest') + '</span>' : '') + '</div></section>';
    var smax = Math.max.apply(null, d.stations.map(function (s) { return s.n; }).concat([1]));
    h += '<section class="card narrow"><div class="chead"><span class="bar4"></span><h2>' + t('top_stations') + '</h2></div><div style="display:flex;flex-direction:column;gap:10px">' +
      (d.stations.length ? d.stations.map(function (s) {
        return '<div style="display:flex;flex-direction:column;gap:4px"><div style="display:flex;justify-content:space-between;font-size:13px"><b style="font-weight:600">' + esc(tr(s.name)) + '</b><b class="num">' + s.n + '</b></div><div class="hbar"><div style="width:' + Math.round(s.n / smax * 100) + '%"></div></div></div>';
      }).join('') : '<div class="empty">' + t('no_data') + '</div>') + '</div>' +
      '<div class="chead"><span class="bar4"></span><h2>' + t('repeat_buses') + '</h2></div><div class="list">' +
      (d.buses.length ? d.buses.map(function (b) { return '<div class="it"><b class="ltr" style="flex:1 1 auto">' + esc(b.no) + '</b><span class="muted">' + esc(tr(b.what)) + '</span><b class="num">' + b.n + '</b></div>'; }).join('') : '<div class="empty">' + t('no_data') + '</div>') +
      '</div></section></div>';

    // الموظفون
    if (!isReport) {
    h += '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + t('people_title') + ' <small>' + t('people_sub') + '</small></h2>' +
      (!isReport && secOK('reports') ? '<a class="btn sm noprint" href="#/reports">' + icon('print') + t('daily_report') + '</a>' : '') + '</div>' +
      '<div class="tblwrap"><table class="tbl" style="min-width:760px"><thead><tr><th>' + t('col_emp') + '</th><th>' + t('col_team') + '</th><th>' + t('col_post') + '</th><th>' + t('col_cdc') + '</th><th>' + t('col_ins') + '</th><th>' + t('col_vio') + '</th><th>' + t('col_car') + '</th><th>' + t('col_att') + '</th></tr></thead><tbody>' +
      (d.people.length ? d.people.map(function (p) {
        return '<tr><td><b>' + esc(tr(p.name)) + '</b> <span class="muted num">' + esc(p.id) + '</span></td><td>' + esc(tr(p.team)) + '</td><td>' + esc(tr(p.post) || '—') + '</td><td class="b num">' + p.cdc + '</td><td class="b num">' + p.ins + '</td><td class="b num">' + p.vio + '</td><td class="ltr num">' + esc(p.car || '—') + '</td><td>' + (p.att ? '<span class="tag b-' + p.attTone + '">' + esc(tr(p.att)) + '</span>' : '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">' + t('no_data') + '</td></tr>') + '</tbody></table></div></section>';
    }
    if (isReport) h += '<div class="repfoot"><span>' + t('source') + '</span><span class="ltr">MBCO · Modern Bus Company Limited · ' + esc(d.date) + '</span></div>';
    return h;
  }

  function vehiclesHTML(vs) {
    if (!vs || !vs.length) return '<div class="empty">' + t('no_data') + '</div>';
    return '<span style="font-size:13px;font-weight:600">' + t('oil_left') + '</span><div class="vehicles">' + vs.map(function (v) {
      var center = v.inShop ? '<b class="t-bad" style="font-size:16px">' + t('workshop') + '</b><span class="muted" style="font-size:11px">' + t('in_maint') + '</span>'
        : v.oilLeft === null ? '<b class="muted" style="font-size:16px">—</b><span class="muted" style="font-size:11px">' + t('no_record') + '</span>'
          : '<b class="num ltr t-' + v.oilTone + '" style="font-size:17px">' + (v.oilLeft < 0 ? '-' : '') + Math.abs(v.oilLeft).toLocaleString('en') + '</b><span class="muted" style="font-size:11px">' + (v.oilLeft < 0 ? t('overdue') : t('km_oil')) + '</span>';
      var pct = v.inShop ? 100 : v.oilPct;
      var col = v.inShop ? 'var(--bad-soft)' : toneColor(v.oilTone);
      return '<div class="ringbox">' + ring(pct, col, center, 104) +
        '<b class="ltr" style="font-size:14px">' + esc(v.plate) + '</b>' +
        '<span style="display:flex;align-items:center;gap:5px;font-size:11px"><span class="dot" style="background:' + toneColor(v.tone) + '"></span>' + esc(tr(v.where)) + '</span>' +
        '<span class="muted ltr num" style="font-size:11px">' + (v.odo ? v.odo.toLocaleString('en') + ' km' : '—') + '</span></div>';
    }).join('') + '</div>';
  }

  /* ---------------- التقرير اليومي PDF ----------------
     يرسم التقرير كما يظهر في المتصفح (SVG foreignObject ← Canvas ← JPEG) ويحوّله لملف PDF صفحة واحدة،
     بدون أي مكتبة خارجية. الخط يُضمَّن من Google Fonts إن أمكن، وإلا يُستخدم خط النظام. */
  var FONT_CSS = null;
  function timeoutP(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), out = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) out += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(out);
  }
  function fontCss() {
    if (FONT_CSS !== null) return Promise.resolve(FONT_CSS);
    var url = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;700;800&display=swap';
    return timeoutP(fetch(url).then(function (r) { return r.text(); }), 6000).then(function (css) {
      var keep = css.split('/*').slice(1).filter(function (b) { return /^\s*(arabic|latin)\s*\*\//.test(b); }).map(function (b) { return b.replace(/^[^*]*\*\//, ''); }).join('\n');
      var urls = keep.match(/url\((https:[^)]+)\)/g) || [];
      return timeoutP(Promise.all(urls.map(function (u) {
        var src = u.slice(4, -1);
        return fetch(src).then(function (r) { return r.arrayBuffer(); }).then(function (b) { keep = keep.split(src).join('data:font/woff2;base64,' + bufToB64(b)); });
      })), 10000).then(function () { return keep; });
    }).catch(function () { return ''; }).then(function (c) { FONT_CSS = c; return c; });
  }
  function pageCss() {
    var css = '';
    try {
      Array.prototype.forEach.call(document.styleSheets, function (sh) {
        try { if (sh.href && sh.href.indexOf(location.origin) !== 0 && location.protocol !== 'file:') return; Array.prototype.forEach.call(sh.cssRules, function (r) { css += r.cssText + '\n'; }); } catch (e) {}
      });
    } catch (e) {}
    return css ? Promise.resolve(css) : fetch('style.css').then(function (r) { return r.text(); }).catch(function () { return ''; });
  }
  function renderReportCanvas(d) {
    var W = 1280, SCALE = 2;
    var box = document.createElement('div');
    box.className = 'pdfsheet';
    box.setAttribute('data-theme', st.theme);
    box.setAttribute('dir', st.lang === 'ar' ? 'rtl' : 'ltr');
    box.setAttribute('lang', st.lang);
    box.style.cssText = 'position:fixed;top:0;left:-30000px;width:' + W + 'px';
    box.innerHTML = '<div class="sheet">' + homeHTML(d, true) + '</div>';
    document.body.appendChild(box);
    return Promise.all([pageCss(), fontCss(), document.fonts ? document.fonts.ready : null]).then(function (res) {
      var H = Math.ceil(box.scrollHeight);
      var clone = box.cloneNode(true);
      clone.style.cssText = 'width:' + W + 'px;height:' + H + 'px';
      var styleEl = document.createElement('style');
      styleEl.textContent = res[1] + '\n' + res[0] + '\n.pdfsheet{font-family:"Noto Sans Arabic",Tahoma,"Segoe UI",Arial,sans-serif}';
      clone.insertBefore(styleEl, clone.firstChild);
      document.body.removeChild(box);
      var xhtml = new XMLSerializer().serializeToString(clone);
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W * SCALE + '" height="' + H * SCALE + '" viewBox="0 0 ' + W + ' ' + H + '">' +
        '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '">' + xhtml + '</foreignObject></svg>';
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () {
          var c = document.createElement('canvas');
          c.width = W * SCALE; c.height = H * SCALE;
          var ctx = c.getContext('2d');
          ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#ffffff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          resolve(c);
        };
        img.onerror = function () { reject(new Error('render')); };
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      });
    });
  }
  /** PDF صفحة واحدة فيها صورة JPEG (عرض A4 والارتفاع حسب المحتوى) */
  function jpegToPdf(jpg, wPx, hPx) {
    var enc = function (str) { var a = new Uint8Array(str.length); for (var i = 0; i < str.length; i++) a[i] = str.charCodeAt(i) & 255; return a; };
    var Wpt = 595.28, Hpt = +(Wpt * hPx / wPx).toFixed(2);
    var chunks = [], len = 0, offs = [];
    var push = function (x) { var b = typeof x === 'string' ? enc(x) : x; chunks.push(b); len += b.length; };
    var obj = function (n, body) { offs[n] = len; push(n + ' 0 obj\n'); body(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n');
    obj(1, function () { push('<< /Type /Catalog /Pages 2 0 R >>'); });
    obj(2, function () { push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'); });
    obj(3, function () { push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + Wpt + ' ' + Hpt + '] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'); });
    obj(4, function () { push('<< /Type /XObject /Subtype /Image /Width ' + wPx + ' /Height ' + hPx + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + jpg.length + ' >>\nstream\n'); push(jpg); push('\nendstream'); });
    var content = 'q ' + Wpt + ' 0 0 ' + Hpt + ' 0 0 cm /Im0 Do Q';
    obj(5, function () { push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'); });
    var xref = len;
    var x = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) x += ('0000000000' + offs[i]).slice(-10) + ' 00000 n \n';
    push(x + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    var out = new Uint8Array(len), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  }
  function reportCaption(d) {
    var en = st.lang === 'en', r = d.rst || {}, c = d.cdc || {}, i = d.ins || {}, car = d.car || {};
    return en
      ? '📊 MBCO · Daily performance report\n📅 ' + d.date + '\nCDC: ' + c.today + ' cases · ' + c.open + ' open\nInspections: ' + i.inspections + ' · Violations: ' + i.violations +
        '\nAttendance: ' + (r.rate === null || r.rate === undefined ? '—' : r.rate + '%') + ' (' + r.present + '/' + r.expected + ')\nVehicles: ' + car.kmToday + ' km · ' + car.handoversToday + ' custodies\n👤 ' + (st.user ? st.user.name : '')
      : '📊 MBCO · تقرير الأداء اليومي\n📅 ' + d.date + '\nCDC: ' + c.today + ' بلاغ · ' + c.open + ' مفتوح\nالفحص: ' + i.inspections + ' · المخالفات: ' + i.violations +
        '\nالحضور: ' + (r.rate === null || r.rate === undefined ? '—' : r.rate + '%') + ' (' + r.present + '/' + r.expected + ')\nالسيارات: ' + car.kmToday + ' كم · ' + car.handoversToday + ' عهدة\n👤 أرسله: ' + (st.user ? st.user.name : '');
  }
  function makeReport(send) {
    var d = st.home; if (!d) return;
    var status = document.getElementById('repStatus');
    var btns = [document.getElementById('repSend'), document.getElementById('repDl')];
    var busy = function (on, msg) { btns.forEach(function (b) { if (b) b.disabled = on; }); if (status) status.textContent = msg || ''; };
    var filename = 'MBCO-Daily-Report-' + d.date + '.pdf';
    busy(true, t('rep_making'));
    renderReportCanvas(d).then(function (canvas) {
      var jpgB64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
      var bin = atob(jpgB64), jpg = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) jpg[i] = bin.charCodeAt(i);
      var pdf = jpegToPdf(jpg, canvas.width, canvas.height);
      window.__lastReport = { name: filename, size: pdf.length, png: canvas.toDataURL('image/png') };
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      a.download = filename;
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      if (!send) { busy(false, t('rep_saved')); return; }
      busy(true, t('rep_sending'));
      return api('sendReport', { date: d.date, filename: filename, caption: reportCaption(d), pdf: bufToB64(pdf.buffer) })
        .then(function () { busy(false, t('rep_sent')); toast(t('rep_sent')); });
    }).catch(function (e) {
      busy(false, '');
      if (/render|Security|tainted/i.test(String(e && e.message || e)) || (e && e.name === 'SecurityError')) { toast(t('rep_fallback')); window.print(); }
      else toast(errText(e));
    });
  }

  /* ---------------- صفحات الأقسام ---------------- */
  function loadSection(key) {
    var main = document.getElementById('main');
    var s = st.sec[key] || { from: '', to: '', q: '' };
    st.sec[key] = s;
    var sec = st.sections.filter(function (x) { return x.key === key; })[0] || {};
    var head = '<div class="pagehead"><div><h1>' + esc(st.lang === 'en' ? sec.en : sec.ar) + '</h1></div>' + (DEMO ? '<span class="notice">' + t('demo') + '</span>' : '') + '</div>' +
      '<div class="card"><div class="toolbar noprint">' +
      '<label class="field">' + t('from') + '<input class="input num" type="date" id="sFrom" value="' + esc(s.from) + '"></label>' +
      '<label class="field">' + t('to') + '<input class="input num" type="date" id="sTo" value="' + esc(s.to) + '"></label>' +
      '<button type="button" class="btn primary" id="sGo">' + t('apply') + '</button>' +
      '<label class="field search">' + t('search') + '<input class="input" type="search" id="sQ" value="' + esc(s.q) + '"></label>' +
      '<button type="button" class="btn" id="sCsv">' + icon('download') + t('export') + '</button>' +
      '<button type="button" class="btn hide" id="sDash">' + icon('external') + t('open_dash') + '</button></div><div id="sBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div></div>';
    main.innerHTML = head;
    var apply = function (d) {
      addDict(d.dict); s.data = d; s.from = d.from; s.to = d.to;
      document.getElementById('sFrom').value = s.from; document.getElementById('sTo').value = s.to;
      document.getElementById('sDash').classList.toggle('hide', !d.canOpenDashboard);
      drawSection(key);
    };
    var fetchIt = function (force) {
      var ck = 'sec|' + key + '|' + s.from + '|' + s.to;
      var mem = s.data && s.dataKey === ck ? s.data : null;
      var shown = mem || ccGet(ck);
      if (shown) apply(shown);
      else document.getElementById('sBody').innerHTML = '<div class="loading"><div class="spin"></div>' + t('loading') + '</div>';
      if (mem && !force && !st.fresh && Date.now() - (s.at || 0) < 60000) return;
      var fresh = st.fresh; st.fresh = false;
      setSync(true);
      api('section', { key: key, from: s.from, to: s.to, fresh: fresh }).then(function (j) {
        if (route() !== key) return;
        apply(j.data);
        s.at = Date.now(); s.dataKey = 'sec|' + key + '|' + s.from + '|' + s.to;
        ccSet(ck, j.data); if (s.dataKey !== ck) ccSet(s.dataKey, j.data);
      }).catch(function (e) {
        if (shown) toast(errText(e)); else failBox(document.getElementById('sBody'), e, function () { fetchIt(true); });
      }).then(function () { setSync(false); });
    };
    document.getElementById('sGo').onclick = function () { s.from = document.getElementById('sFrom').value; s.to = document.getElementById('sTo').value; fetchIt(true); };
    document.getElementById('sQ').oninput = function () { s.q = this.value; if (s.data) drawTable(key); };
    document.getElementById('sCsv').onclick = function () { if (s.data) csv(key); };
    document.getElementById('sDash').onclick = function () {
      api('dashLink', { key: key }).then(function (j) { if (j.url) window.open(j.url, '_blank', 'noopener'); });
    };
    fetchIt(false);
  }

  function drawSection(key) {
    var d = st.sec[key].data;
    var body = document.getElementById('sBody');
    var down = d.systems.filter(function (x) { return !x.ok; });
    body.innerHTML =
      (down.length ? '<div class="alert b-bad" style="margin-bottom:10px">' + down.map(function (x) { return esc(x.name) + ': ' + esc(x.error); }).join(' · ') + '</div>' : '') +
      '<div class="kpis k4">' + d.kpis.map(function (k) { return '<div class="kpi ' + (k.tone || '') + '"><span class="l">' + esc(tr(k.label)) + '</span><span class="v num">' + fmtN(k.value) + '</span></div>'; }).join('') + '</div>' +
      (d.vehicles ? '<div style="margin-top:14px">' + vehiclesHTML(d.vehicles) + '</div>' : '') +
      '<div id="sTable" style="margin-top:14px"></div>';
    drawTable(key);
  }

  function filtered(key) {
    var s = st.sec[key], d = s.data, q = (s.q || '').trim().toLowerCase();
    return q ? d.rows.filter(function (r) { return d.columns.some(function (c) { return String(r[c.key]).toLowerCase().indexOf(q) >= 0 || String(tr(r[c.key])).toLowerCase().indexOf(q) >= 0; }); }) : d.rows;
  }

  function drawTable(key) {
    var d = st.sec[key].data, rows = filtered(key);
    var L = st.lang === 'en';
    var tone = function (v) { v = String(v); return /مغلق|معتمد|منفذ|حاضر|سليمة/.test(v) ? 'ok' : /مفتوح|بانتظار|جديد|متأخر|قيد/.test(v) ? 'warn' : /غائب|مرفوض|رفض|متوقف/.test(v) ? 'bad' : ''; };
    var isStatus = function (k) { return /status|att_status/.test(k); };
    var show = rows.slice(0, 500);
    document.getElementById('sTable').innerHTML =
      '<div class="muted" style="font-size:12px;margin-bottom:6px"><span class="num">' + rows.length.toLocaleString('en') + '</span> ' + t('rows') + (d.truncated ? ' · ' + t('truncated') + ' ' + d.truncated : '') + (rows.length > 500 ? ' · 500 ↓ CSV' : '') + '</div>' +
      '<div class="tblwrap" style="max-height:70vh"><table class="tbl"><thead><tr>' + d.columns.map(function (c) { return '<th>' + esc(L ? c.en : c.ar) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (show.length ? show.map(function (r) {
        return '<tr>' + d.columns.map(function (c) {
          var v = r[c.key];
          if (isStatus(c.key) && v !== '') { var tn = tone(v); return '<td>' + (tn ? '<span class="tag b-' + tn + '">' + esc(tr(v)) + '</span>' : esc(tr(v))) + '</td>'; }
          return '<td class="' + (typeof v === 'number' ? 'num b' : '') + '">' + (v === '' ? '<span class="muted">—</span>' : /^\d{4}-\d{2}-\d{2}|^[A-Z]{2,4}-/.test(String(v)) ? '<span class="ltr">' + esc(v) + '</span>' : esc(typeof v === 'number' ? v.toLocaleString('en') : tr(v))) + '</td>';
        }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="' + d.columns.length + '" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>';
  }

  function csv(key) {
    var d = st.sec[key].data, rows = filtered(key), L = st.lang === 'en';
    var q = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var out = [d.columns.map(function (c) { return q(L ? c.en : c.ar); }).join(',')].concat(rows.map(function (r) { return d.columns.map(function (c) { return q(typeof r[c.key] === 'string' ? tr(r[c.key]) : r[c.key]); }).join(','); })).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + out], { type: 'text/csv;charset=utf-8' }));
    a.download = 'MBCO_' + key + '_' + d.from + '_' + d.to + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------------- الإعدادات ---------------- */
  function renderSettings() {
    var main = document.getElementById('main');
    var isAdmin = st.user && st.user.role === 'Admin';
    main.innerHTML = '<div class="pagehead"><h1>' + esc(t('my_account')) + '</h1></div><div class="row2"><div class="narrow" id="pinBox"></div>' +
      (isAdmin ? '<section class="card wide"><div class="chead"><span class="bar4"></span><h2>' + t('systems_status') + '</h2><button type="button" class="btn sm" id="pingBtn">' + t('test') + '</button></div><div id="pingOut" class="list"></div></section>' : '') + '</div>' +
      (isAdmin ? '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + t('users') + '</h2></div><div id="usersOut"><div class="loading"><div class="spin"></div></div></div></section>' : '');
    renderChangePin(false, document.getElementById('pinBox'));
    if (!isAdmin) return;
    var ping = function () {
      var o = document.getElementById('pingOut'); o.innerHTML = '<div class="loading"><div class="spin"></div></div>';
      api('ping').then(function (j) {
        o.innerHTML = j.systems.map(function (s) { return '<div class="it"><span class="dot" style="background:' + (s.ok ? 'var(--ok)' : 'var(--bad)') + '"></span><b style="flex:1 1 auto">' + esc(s.name) + '</b><span class="muted">' + esc(s.ok ? (s.file + ' · ' + s.ms + ' ms') : s.error) + '</span><span class="tag ' + (s.ok ? 'b-ok' : 'b-bad') + '">' + (s.ok ? t('sys_ok') : t('sys_fail')) + '</span></div>'; }).join('');
      }).catch(function (e) { o.innerHTML = '<div class="err">' + esc(errText(e)) + '</div>'; });
    };
    document.getElementById('pingBtn').onclick = ping; ping();
    var users = function () {
      api('users').then(function (j) {
        document.getElementById('usersOut').innerHTML = '<div class="tblwrap"><table class="tbl"><thead><tr><th>' + t('emp_id') + '</th><th>' + t('col_emp') + '</th><th>' + t('col_team') + '</th><th>' + t('role') + '</th><th>' + t('access') + '</th><th>' + t('last_login') + '</th><th></th></tr></thead><tbody>' +
          j.users.map(function (u) {
            return '<tr><td class="num">' + esc(u.emp_id) + '</td><td><b>' + esc(u.name) + '</b></td><td>' + esc(u.team) + '</td>' +
              '<td><select class="input" style="min-width:120px;height:36px" data-role="' + esc(u.emp_id) + '" aria-label="' + esc(t('role')) + '">' + ['Admin', 'Supervisor', 'Officer'].map(function (r) { return '<option' + (r === u.role ? ' selected' : '') + '>' + r + '</option>'; }).join('') + '</select></td>' +
              '<td><button type="button" class="btn sm ' + (u.access === 'لا' ? '' : 'on') + '" data-access="' + esc(u.emp_id) + '" data-v="' + (u.access === 'لا' ? 'نعم' : 'لا') + '" aria-pressed="' + (u.access !== 'لا') + '">' + (u.access === 'لا' ? t('no') : t('yes')) + '</button></td>' +
              '<td class="num muted"><span class="ltr">' + esc(u.last_login || '—') + '</span></td><td><button type="button" class="btn sm" data-reset="' + esc(u.emp_id) + '">' + t('new_pin_btn') + '</button></td></tr>';
          }).join('') + '</tbody></table></div>';
        var out = document.getElementById('usersOut');
        out.querySelectorAll('[data-role]').forEach(function (s) { s.onchange = function () { api('setUser', { emp_id: s.getAttribute('data-role'), role: s.value }).then(function () { toast('✓'); }); }; });
        out.querySelectorAll('[data-access]').forEach(function (b) { b.onclick = function () { api('setUser', { emp_id: b.getAttribute('data-access'), access: b.getAttribute('data-v') }).then(users); }; });
        out.querySelectorAll('[data-reset]').forEach(function (b) {
          b.onclick = function () { api('setUser', { emp_id: b.getAttribute('data-reset'), resetPin: true }).then(function (j2) { b.outerHTML = '<span class="tag b-accent num" title="' + esc(t('pin_for')) + '">PIN: ' + esc(j2.pin) + '</span>'; }); };
        });
      }).catch(function (e) { document.getElementById('usersOut').innerHTML = '<div class="err">' + esc(errText(e)) + '</div>'; });
    };
    users();
  }

  /* ---------------- التشغيل ---------------- */
  window.addEventListener('hashchange', function () { if (st.token && !st.mustChange) render(); });
  if (DEMO && !window.MBCO_DEMO) {
    var s = document.createElement('script'); s.src = 'demo.js'; s.onload = render; document.head.appendChild(s);
  } else render();
})();
