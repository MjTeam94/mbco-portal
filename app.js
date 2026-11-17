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
  var CDC_SESSION = 'cdc-noticket-session';        // نفس مفتاح جلسة صفحة البلاغات (نفس النطاق github.io)
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
    date: '', heatDays: 7, home: null, homeKey: '', homeAt: 0, sec: {}, timer: null, fresh: false, embeds: {}
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
    ['mbco_token', 'mbco_user', 'mbco_sections', 'mbco_must', 'mbco_cdc_sso', CDC_SESSION].forEach(function (k) { ls.set(k, null); });
    st.embeds = {};
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
  /* ---------------- لوحات التحكم المضمّنة (v1.6) ----------------
     كل قسم نظام له وضعان: «لوحة التحكم» = صفحة النظام نفسها بكل إجراءاتها داخل البوابة،
     و«السجلات» = الجدول الموحد. CDC يدخل تلقائياً بحساب الموظف في نظام البلاغات. */
  var EMBED_KEYS = { cdc: 1, ins: 1, car: 1, roster: 1, att: 1, leaves: 1, requests: 1 };
  function secMode(key) {
    if (!EMBED_KEYS[key]) return 'rec';
    var m = ls.get('mbco_mode_' + key);
    if (m === 'ctl' || m === 'rec') return m;
    return key === 'cdc' || (st.user && st.user.role !== 'Officer') ? 'ctl' : 'rec';
  }
  function modeSwitch(key, mode) {
    if (!EMBED_KEYS[key]) return '';
    return '<div class="seg noprint" role="tablist">' + [['ctl', 'ctl_tab'], ['rec', 'rec_tab']].map(function (m) {
      return '<button type="button" role="tab" data-m="' + m[0] + '" class="' + (mode === m[0] ? 'on' : '') + '" aria-selected="' + (mode === m[0]) + '">' + t(m[1]) + '</button>';
    }).join('') + '</div>';
  }
  function bindModeSwitch(key) {
    Array.prototype.forEach.call(document.querySelectorAll('.seg [data-m]'), function (b) {
      b.onclick = function () { ls.set('mbco_mode_' + key, b.getAttribute('data-m')); loadSection(key); };
    });
  }
  function withParam(url, p) {
    var h = url.indexOf('#'), hash = h >= 0 ? url.slice(h) : '', base = h >= 0 ? url.slice(0, h) : url;
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + p + hash;
  }
  function getEmbed(key, renew) {
    if (DEMO) return Promise.resolve({ reason: 'demo' });
    if (key === 'cdc') {
      var memo = ls.json('mbco_cdc_sso'), cur = ls.json(CDC_SESSION);
      if (!renew && memo && cur && cur.token === memo.token && memo.emp === st.user.emp_id && Date.now() - memo.at < (memo.hours - 1) * 3600e3)
        return Promise.resolve({ kind: 'cdc', url: memo.url });
      return api('embed', { key: 'cdc', renew: !!renew }).then(function (j) {
        if (!j.session) return j;
        ls.set(CDC_SESSION, JSON.stringify(j.session));
        ls.set('mbco_cdc_sso', JSON.stringify({ token: j.session.token, emp: st.user.emp_id, at: Date.now(), hours: j.hours || 12, url: j.url }));
        return { kind: 'cdc', url: j.url };
      });
    }
    if (st.embeds[key] && !renew) return Promise.resolve(st.embeds[key]);
    return api('embed', { key: key }).then(function (j) { if (j.url) st.embeds[key] = j; return j; });
  }
  function reasonText(j) {
    var m = { demo: 'ctl_demo', role: 'ctl_role', no_url: 'ctl_nourl', cdc_no_user: 'ctl_cdc_nouser', cdc_old_api: 'ctl_cdc_oldapi', cdc_error: 'ctl_cdc_err', none: 'ctl_none' }[j.reason] || 'ctl_cdc_err';
    return t(m).replace('{emp}', st.user ? st.user.emp_id : '').replace('{sys}', j.sys || '') + (j.reason === 'cdc_error' && j.error ? ' (' + j.error + ')' : '');
  }
  function renderControl(key, wrap, renew, retried) {
    wrap.innerHTML = '<div class="ctlload" id="ctlLoad"><div class="spin"></div>' + t('ctl_loading') + '</div>';
    getEmbed(key, renew).then(function (j) {
      if (route() !== key || !wrap.isConnected) return;
      if (!j.url) {
        wrap.innerHTML = '<div class="ctlmsg"><div>' + icon('alert') + '</div><p>' + esc(reasonText(j)) + '</p><button type="button" class="btn" id="toRec">' + t('rec_tab') + '</button></div>';
        document.getElementById('toRec').onclick = function () { ls.set('mbco_mode_' + key, 'rec'); loadSection(key); };
        return;
      }
      var url = j.kind === 'cdc' ? withParam(j.url, 'embed=1') + (j.url.indexOf('#') < 0 ? '#board' : '') : j.url;
      var f = document.createElement('iframe');
      f.className = 'ctlframe'; f.title = t('ctl_tab');
      f.setAttribute('allow', 'clipboard-write; camera; geolocation; fullscreen');
      f.onload = function () {
        var l = document.getElementById('ctlLoad'); if (l) l.remove();
        if (j.kind === 'cdc') tuneCdc(f, key, wrap, retried);
        else tuneSameOrigin(f);
      };
      f.src = url;
      wrap.appendChild(f);
      var nw = document.getElementById('ctlNew');
      if (nw) { nw.classList.remove('hide'); nw.onclick = function () { window.open(url.replace(/[?&]embed=1/, ''), '_blank'); }; }
    }).catch(function (e) {
      if (route() !== key) return;
      failBox(wrap, e, function () { renderControl(key, wrap, true); });
    });
  }
  /* صفحة البلاغات من نفس النطاق: نخفي ترويستها (البوابة لها ترويستها) ونجدد الجلسة لو انتهت */
  function tuneCdc(f, key, wrap, retried) {
    try {
      var d = f.contentDocument; if (!d) return;
      if (!d.getElementById('mbcoEmbedCss')) {
        var css = d.createElement('style'); css.id = 'mbcoEmbedCss';
        css.textContent = '.top{border-top:0!important}.top-in{display:none!important}main{padding-top:12px!important}';
        d.head.appendChild(css);
      }
      setTimeout(function () {
        var lg = d.getElementById('login');
        if (lg && lg.style.display !== 'none' && !retried && f.isConnected) { ls.set('mbco_cdc_sso', null); renderControl(key, wrap, true, true); }
      }, 1500);
    } catch (e) {}
  }

  /* صفحة نظام على نفس النطاق (مثل لوحة الفحص على github.io): نخفي شعارها فقط. الصفحات الأخرى لا يمكن الوصول لها وهذا طبيعي */
  function tuneSameOrigin(f) {
    try {
      var d = f.contentDocument; if (!d || !d.head) return;
      var css = d.createElement('style');
      css.textContent = '.top-in .brand,.top .brand{display:none!important}.top{border-top:0!important}';
      d.head.appendChild(css);
    } catch (e) {}
  }


  /* ================= الروستر داخل البوابة (v1.7) =================
     لوحة تحكم مبنية في البوابة نفسها: تتبع اللغة والوضع الداكن، والإجراءات
     تمر عبر الـ Hub لنفس دوال نظام الروستر (والبوت يرسل إشعاراته كالعادة). */
  var RST_NATIVE = { roster: 1, att: 1, leaves: 1, requests: 1 };
  var RT = {
    ar: {
      month: 'الشهر', day: 'اليوم', refresh: 'تحديث', all: 'الكل', stn: 'المحطات', enf: 'التذاكر', adm: 'الإدارة',
      overview: 'نظرة عامة', grid: 'الروستر', emps: 'أداء الموظفين', report: 'التقرير اليومي',
      opday: 'اليوم التشغيلي', updated: 'آخر تحديث', k_psup: 'إجازات بانتظار المشرف', k_padm: 'إجازات بانتظار الإدارة',
      k_mena: 'موافقة المشرف – بانتظار Mena-Me', k_rnew: 'طلبات إدارية جديدة', k_rwip: 'طلبات قيد التنفيذ', k_reg: 'مسجلون في البوت',
      present: 'حضور', late: 'تأخير', absent: 'غياب', leave: 'إجازة', off: 'أوف', exits: 'انسحاب/استئذان',
      commit: 'نسبة الالتزام', prep_ok: 'التحضير المعتمد', no_prep: 'لم يُعتمد تحضير الوردية', abs_l: 'الغياب', late_l: 'التأخير', leave_l: 'الإجازات',
      upcoming: 'الإجازات الحالية والقادمة', none: 'لا يوجد', emp: 'الموظف', type: 'النوع', from: 'من', to: 'إلى', status: 'الحالة',
      no_roster: 'لا يوجد روستر لهذا الشهر. استورد الروستر من القائمة في شيت الروستر.', abs_mark: 'غ',
      lg_abs: 'غ = غياب', lg_late: 'تأخير', lg_pres: 'حاضر', lg_pend: 'إجازة بانتظار Mena-Me',
      shift: 'وردية', dist_ok: 'التوزيع معتمد', dist_no: 'لا يوجد توزيع', att_ok: 'التحضير معتمد', att_no: 'التحضير غير معتمد', sup: 'المشرف',
      dist: 'التوزيع', att: 'التحضير', task: 'الموقع/المهمة', brk: 'البريك', scheduled: 'المجدولون حسب الروستر', update: 'تحديث',
      open: 'المفتوحة', search: 'بحث بالاسم أو الرقم', req_n: 'طلب', req_id: 'رقم الطلب', period: 'الفترة', days_n: 'الأيام', file: 'المرفق',
      approver: 'المعتمد', notes: 'ملاحظات', action: 'إجراء', open_file: 'فتح', escalated: 'مُصعّد',
      a_approve: 'موافقة', a_final: 'اعتماد Mena-Me', a_reject: 'رفض', a_wip: 'قيد التنفيذ', a_done: 'منفذ',
      m_approve: 'موافقة إدارية على الطلب', m_final: 'تأكيد الاعتماد في Mena-Me', m_reject: 'رفض الطلب', m_req: 'تحديث الطلب إلى',
      m_body: 'الطلب {id} · يوصل إشعار للموظف عبر البوت. المنفّذ: {by}', note_ph: 'ملاحظة (اختياري)', confirm: 'تأكيد', cancel: 'إلغاء', done: 'تم ✓',
      details: 'التفاصيل', admin_note: 'ملاحظة الإدارة', team: 'الفريق', work: 'أيام العمل', late_min: 'دقائق التأخير', perm: 'استئذان', wd: 'انسحاب',
      lv_days: 'أيام الإجازة', att_notes: 'ملاحظات الحضور', rate: 'الالتزام %', pending: 'طلبات معلقة', bot: 'البوت',
      emps_note: 'مؤشرات شهر {m} من التحضير المعتمد والإجازات المعتمدة. اضغط على العنوان للترتيب.',
      print: 'طباعة / حفظ PDF', rep_title: 'تقرير الحضور والغياب اليومي', by_team: 'نسبة الالتزام حسب الفريق', leaves_t: 'الإجازات', ex_t: 'الالتزام',
      mena_wait: 'إجازات بانتظار الاعتماد في Mena-Me', rep_foot: 'MBCO · نظام الروستر والتحضير', made: 'أُنشئ', note: 'الملاحظة',
      no_rights: 'ما عندك صلاحية لهذا الإجراء.'
    },
    en: {
      month: 'Month', day: 'Day', refresh: 'Refresh', all: 'All', stn: 'Stations', enf: 'Tickets', adm: 'Admin',
      overview: 'Overview', grid: 'Roster', emps: 'Staff performance', report: 'Daily report',
      opday: 'Operating day', updated: 'Updated', k_psup: 'Leaves awaiting supervisor', k_padm: 'Leaves awaiting admin',
      k_mena: 'Supervisor approved – awaiting Mena-Me', k_rnew: 'New admin requests', k_rwip: 'Requests in progress', k_reg: 'Registered on the bot',
      present: 'Present', late: 'Late', absent: 'Absent', leave: 'Leave', off: 'Off', exits: 'Withdrawal/permission',
      commit: 'Commitment rate', prep_ok: 'Approved attendance', no_prep: 'Attendance not approved for shift', abs_l: 'Absent', late_l: 'Late', leave_l: 'On leave',
      upcoming: 'Current and upcoming leaves', none: 'None', emp: 'Employee', type: 'Type', from: 'From', to: 'To', status: 'Status',
      no_roster: 'No roster for this month. Import it from the menu in the roster sheet.', abs_mark: 'A',
      lg_abs: 'A = absent', lg_late: 'late', lg_pres: 'present', lg_pend: 'Leave awaiting Mena-Me',
      shift: 'Shift', dist_ok: 'Distribution approved', dist_no: 'No distribution', att_ok: 'Attendance approved', att_no: 'Attendance not approved', sup: 'Supervisor',
      dist: 'Distribution', att: 'Attendance', task: 'Location/task', brk: 'Break', scheduled: 'Scheduled per roster', update: 'update',
      open: 'Open', search: 'Search name or ID', req_n: 'requests', req_id: 'Request', period: 'Period', days_n: 'Days', file: 'Attachment',
      approver: 'Approver', notes: 'Notes', action: 'Action', open_file: 'Open', escalated: 'escalated',
      a_approve: 'Approve', a_final: 'Confirm Mena-Me', a_reject: 'Reject', a_wip: 'In progress', a_done: 'Done',
      m_approve: 'Admin approval of the request', m_final: 'Confirm approval in Mena-Me', m_reject: 'Reject the request', m_req: 'Update request to',
      m_body: 'Request {id} · the employee is notified on the bot. By: {by}', note_ph: 'Note (optional)', confirm: 'Confirm', cancel: 'Cancel', done: 'Done ✓',
      details: 'Details', admin_note: 'Admin note', team: 'Team', work: 'Work days', late_min: 'Late minutes', perm: 'Permission', wd: 'Withdrawal',
      lv_days: 'Leave days', att_notes: 'Attendance notes', rate: 'Commitment %', pending: 'Pending requests', bot: 'Bot',
      emps_note: 'Month {m} indicators from approved attendance and leaves. Click a header to sort.',
      print: 'Print / save PDF', rep_title: 'Daily attendance report', by_team: 'Commitment by team', leaves_t: 'Leaves', ex_t: 'Commitment',
      mena_wait: 'Leaves awaiting Mena-Me approval', rep_foot: 'MBCO · Roster & attendance system', made: 'Generated', note: 'Note',
      no_rights: 'You do not have permission for this action.'
    }
  };
  function rt(k) { return (RT[st.lang] && RT[st.lang][k]) || RT.ar[k] || k; }
  var RTEAMS = { STN: ['فريق المحطات', 'Stations team'], ENF: ['فريق التذاكر', 'Tickets team'], ADM: ['الإدارة', 'Admin'] };
  var RDAYS = { ar: ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
  function rTeam(tm) { var x = RTEAMS[tm]; return x ? x[st.lang === 'en' ? 1 : 0] : (tm || ''); }
  function rDmy(s) { if (!s) return ''; var p = String(s).slice(0, 10).split('-'); return p.length < 3 ? esc(s) : '<span class="ltr">' + p[2] + '-' + p[1] + '-' + p[0] + '</span>'; }
  function rDow(s) { var p = s.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); }

  function rstState() {
    if (!st.rst) st.rst = { month: '', date: '', team: 'ALL', lvf: 'open', rqf: 'open', q: '', sub: ls.get('mbco_rst_sub') || 'overview', sort: { k: 'notes', d: -1 }, d: null, at: 0, key: '' };
    return st.rst;
  }
  function rEmp(id) {
    var D = st.rst.d; id = String(id);
    for (var i = 0; i < D.emps.length; i++) if (D.emps[i].id === id) return D.emps[i];
    return { id: id, ar: id, en: id };
  }
  function rName(id, fallback) {
    var e = id ? rEmp(id) : null;
    if (!e || e.ar === e.id) { // بدون رقم: نبحث بالاسم العربي في قائمة الموظفين
      var D = st.rst.d, f = String(fallback || '').trim();
      for (var i = 0; f && i < D.emps.length; i++) if (D.emps[i].ar === f) { e = D.emps[i]; break; }
      if (!e) e = { id: '', ar: f, en: '' };
    }
    if (st.lang === 'en') return e.en && e.en !== e.id ? e.en : tr(fallback || e.ar);
    return e.ar && e.ar !== e.id ? e.ar : (fallback || e.ar);
  }
  function rTeamOk(tm) { return st.rst.team === 'ALL' || st.rst.team === tm; }
  function rStBadge(s) {
    var c = /مرفوض|ملغى/.test(s) ? 'b-bad' : /نهائ|منفذ/.test(s) ? 'b-ok' : /موافقة المشرف|قيد التنفيذ/.test(s) ? 'b-acc' : 'b-warn';
    return '<span class="tag ' + c + '">' + esc(tr(s)) + '</span>';
  }

  function renderRst(key, wrap, force) {
    var R = rstState();
    if (!wrap.querySelector('#rstBody')) {
      var subs = key === 'roster' ? [['overview', 'overview'], ['grid', 'grid'], ['emps', 'emps'], ['report', 'report']] : null;
      if (subs && !subs.some(function (s) { return s[0] === R.sub; })) R.sub = 'overview';
      var needMonth = key === 'roster', needDay = key === 'att' || key === 'roster';
      wrap.innerHTML = '<div class="card rsttools noprint">' +
        (subs ? '<div class="seg sub">' + subs.map(function (s) { return '<button type="button" data-sub="' + s[0] + '" class="' + (R.sub === s[0] ? 'on' : '') + '">' + rt(s[1]) + '</button>'; }).join('') + '</div>' : '') +
        '<div class="rstctl">' +
        (needMonth ? '<label class="field">' + rt('month') + '<input class="input num" type="month" id="rMonth" value="' + esc(R.month) + '"></label>' : '') +
        (needDay ? '<label class="field">' + rt('day') + '<input class="input num" type="date" id="rDate" value="' + esc(R.date) + '"></label>' : '') +
        '<div class="seg teams">' + [['ALL', 'all'], ['STN', 'stn'], ['ENF', 'enf'], ['ADM', 'adm']].map(function (x) { return '<button type="button" data-team="' + x[0] + '" class="' + (R.team === x[0] ? 'on' : '') + '">' + rt(x[1]) + '</button>'; }).join('') + '</div>' +
        '<button type="button" class="btn sm" id="rRef">' + icon('refresh') + rt('refresh') + '</button></div></div>' +
        '<div id="rstBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div>';
      Array.prototype.forEach.call(wrap.querySelectorAll('[data-sub]'), function (b) { b.onclick = function () { R.sub = b.getAttribute('data-sub'); ls.set('mbco_rst_sub', R.sub); wrap.querySelectorAll('[data-sub]').forEach(function (x) { x.classList.toggle('on', x === b); }); rstDraw(key); }; });
      Array.prototype.forEach.call(wrap.querySelectorAll('[data-team]'), function (b) { b.onclick = function () { R.team = b.getAttribute('data-team'); wrap.querySelectorAll('[data-team]').forEach(function (x) { x.classList.toggle('on', x === b); }); rstDraw(key); }; });
      var m = document.getElementById('rMonth'), d = document.getElementById('rDate');
      if (m) m.onchange = function () { R.month = m.value; renderRst(key, wrap, true); };
      if (d) d.onchange = function () { R.date = d.value; if (d.value) R.month = d.value.slice(0, 7); var mm = document.getElementById('rMonth'); if (mm) mm.value = R.month; renderRst(key, wrap, true); };
      document.getElementById('rRef').onclick = function () { renderRst(key, wrap, true); };
    }
    var ck = R.month + '|' + R.date;
    if (R.d && R.key === ck && !force && Date.now() - R.at < 60000) return rstDraw(key);
    if (R.d && R.key === ck) rstDraw(key);
    setSync(true);
    return api('rstDash', { month: R.month, date: R.date, fresh: !!force }).then(function (j) {
      R.d = j.data; R.canLeave = j.canLeave; R.canReq = j.canReq; R.by = j.by; R.at = Date.now();
      if (!R.month) R.month = j.data.month; if (!R.date) R.date = j.data.date;
      R.key = R.month + '|' + R.date;
      var m = document.getElementById('rMonth'), d = document.getElementById('rDate');
      if (m && !m.value) m.value = R.month; if (d && !d.value) d.value = R.date;
      if (route() === key) rstDraw(key);
    }).catch(function (e) {
      var b = document.getElementById('rstBody');
      if (b && route() === key) failBox(b, e, function () { renderRst(key, wrap, true); });
    }).then(function () { setSync(false); });
  }

  function rstDraw(key) {
    var b = document.getElementById('rstBody'), R = st.rst;
    if (!b || !R.d) return;
    var v = key === 'att' ? 'day' : key === 'leaves' ? 'leaves' : key === 'requests' ? 'reqs' : R.sub;
    b.innerHTML = ({ overview: rstOverview, grid: rstGrid, day: rstDay, leaves: rstLeaves, reqs: rstReqs, emps: rstEmps, report: rstReport }[v] || rstOverview)();
    rstBind(key, b);
  }

  function rDayAgg(team) {
    var D = st.rst.d, a = { present: 0, late: 0, absent: 0, leave: 0, off: 0, perm: 0, wd: 0, done: 0, shifts: 0, absList: [], lateList: [], leaveList: [], missing: [] };
    (D.day[team] || []).forEach(function (s) {
      a.shifts++;
      if (s.att) {
        a.done++; a.present += +s.att.present; a.late += +s.att.late; a.absent += +s.att.absent; a.leave += +s.att.leave; a.off += +s.att.off; a.perm += +s.att.permission; a.wd += +s.att.withdrawal;
        (s.attItems || []).forEach(function (x) { if (x.att_status === 'غائب') a.absList.push(x); if (+x.late_min > 0) a.lateList.push(x); if (x.att_status === 'إجازة') a.leaveList.push({ id: x.emp_id }); });
      } else { a.leave += s.leave.length; a.off += s.off.length; s.leave.forEach(function (l) { a.leaveList.push(l); }); if (s.scheduled.length) a.missing.push(s.code); }
    });
    return a;
  }
  function rKpi(label, val, tone) { return '<div class="kpi ' + (tone || '') + '"><span class="l">' + esc(label) + '</span><span class="v num">' + val + '</span></div>'; }
  function rBar(label, val, max, color, txt) {
    var p = max ? Math.round(val / max * 100) : 0;
    return '<div class="rbar"><span class="lb">' + esc(label) + '</span><span class="tr"><i style="width:' + p + '%;background:' + color + '"></i></span><b class="num">' + (txt !== undefined ? txt : val) + '</b></div>';
  }
  function rTeamCard(tm) {
    var a = rDayAgg(tm), base = Math.max(a.present + a.absent, 1);
    var mini = function (k, v, tone) { return '<div class="rmini ' + (tone || '') + '"><b class="num">' + v + '</b><span>' + rt(k) + '</span></div>'; };
    return '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + esc(rTeam(tm)) + '</h2></div>' +
      '<div class="rminis">' + mini('present', a.present, 'ok') + mini('late', a.late, 'warn') + mini('absent', a.absent, 'bad') + mini('leave', a.leave) + mini('off', a.off) + mini('exits', a.wd + a.perm, 'warn') + '</div>' +
      rBar(rt('commit'), a.present, base, 'var(--ok)', Math.round(a.present / base * 100) + '%') +
      rBar(rt('prep_ok'), a.done, Math.max(a.shifts, 1), 'var(--accent)', a.done + '/' + a.shifts) +
      (a.missing.length ? '<p class="rnote warn">⚠️ ' + rt('no_prep') + ': ' + a.missing.map(esc).join('، ') + '</p>' : '') +
      (a.absList.length ? '<p class="rnote"><b>❌ ' + rt('abs_l') + ':</b> ' + a.absList.map(function (x) { return esc(rName(x.emp_id, x.emp_name)); }).join('، ') + '</p>' : '') +
      (a.lateList.length ? '<p class="rnote"><b>⏰ ' + rt('late_l') + ':</b> ' + a.lateList.map(function (x) { return esc(rName(x.emp_id, x.emp_name)) + ' (' + x.late_min + t('min') + ')'; }).join('، ') + '</p>' : '') +
      (a.leaveList.length ? '<p class="rnote"><b>🏖 ' + rt('leave_l') + ':</b> ' + a.leaveList.map(function (x) { return esc(rName(x.id)); }).join('، ') + '</p>' : '') +
      '</section>';
  }

  function rstOverview() {
    var D = st.rst.d, c = function (arr, s) { return arr.filter(function (r) { return r.request_status === s; }).length; };
    var up = D.leaves.filter(function (r) { return (r.request_status === D.LV.SUP_APPROVED || r.request_status === D.LV.FINAL) && r.to_date >= D.today && rTeamOk(r.team); }).slice(0, 12);
    return '<p class="muted rmeta"><b>' + rt('opday') + ': ' + rDmy(D.date) + '</b> · ' + rt('updated') + ' <span class="ltr">' + esc(D.now) + '</span></p>' +
      '<div class="kpis k6">' + rKpi(rt('k_psup'), c(D.leaves, D.LV.PENDING_SUP), 'warn') + rKpi(rt('k_padm'), c(D.leaves, D.LV.PENDING_ADMIN), 'warn') + rKpi(rt('k_mena'), c(D.leaves, D.LV.SUP_APPROVED)) +
      rKpi(rt('k_rnew'), c(D.reqs, D.REQ.NEW), 'bad') + rKpi(rt('k_rwip'), c(D.reqs, D.REQ.WIP)) + rKpi(rt('k_reg'), D.emps.filter(function (e) { return e.reg; }).length + ' / ' + D.emps.length, 'ok') + '</div>' +
      '<div class="row2 r2eq">' + ['STN', 'ENF'].filter(rTeamOk).map(rTeamCard).join('') + '</div>' +
      '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + rt('upcoming') + '</h2></div>' +
      (up.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>' + rt('emp') + '</th><th>' + rt('type') + '</th><th>' + rt('from') + '</th><th>' + rt('to') + '</th><th>' + rt('status') + '</th></tr></thead><tbody>' +
        up.map(function (r) { return '<tr><td>' + esc(rName(r.emp_id, r.emp_name)) + ' <span class="muted num">' + esc(r.emp_id) + '</span></td><td>' + esc(tr(r.leave_type)) + '</td><td>' + rDmy(r.from_date) + '</td><td>' + rDmy(r.to_date) + '</td><td>' + rStBadge(r.request_status) + '</td></tr>'; }).join('') + '</tbody></table></div>'
        : '<p class="muted">' + rt('none') + '</p>') + '</section>';
  }

  function rstGrid() {
    var D = st.rst.d, sh = D.shifts || {}, days = D.days || [], L = st.lang === 'en';
    var h = '<div class="rlegend">' + Object.keys(sh).map(function (k) { return '<span><i style="background:' + esc(sh[k].color || '#fff') + '"></i>' + esc(k) + ' ' + esc(tr(sh[k].name_ar)) + '</span>'; }).join('') +
      '<span><i style="background:#F8E1DF"></i>' + rt('lg_abs') + '</span><span><b style="color:#B26A00">●</b> ' + rt('lg_late') + '</span><span><b style="color:#2E7D5B">✓</b> ' + rt('lg_pres') + '</span><span><i class="pend" style="background:#F6D7B0"></i>' + rt('lg_pend') + '</span></div>';
    if (!D.rosterRange || !D.rosterRange.length || !days.length || days[days.length - 1] < D.rosterRange[0] || days[0] > D.rosterRange[1]) h += '<div class="card muted">' + rt('no_roster') + '</div>';
    h += '<div class="rwrap"><table class="rt"><thead><tr><th class="nm">' + rt('emp') + '</th>' + days.map(function (d) { var w = rDow(d); return '<th class="' + (w === 5 || w === 6 ? 'wk' : '') + '">' + RDAYS[L ? 'en' : 'ar'][w] + '<br><span class="num">' + d.slice(8) + '</span></th>'; }).join('') + '</tr></thead><tbody>';
    ['ADM', 'ENF', 'STN'].forEach(function (tm) {
      if (!rTeamOk(tm)) return;
      var rows = D.grid.filter(function (g) { return rEmp(g.id).team === tm; });
      if (!rows.length) return;
      h += '<tr class="tm"><td class="nm">' + esc(rTeam(tm)) + '</td><td colspan="' + days.length + '"></td></tr>';
      rows.forEach(function (g) {
        var e = rEmp(g.id);
        h += '<tr><td class="nm"><b>' + esc(rName(g.id)) + '</b> <span class="muted num">' + esc(e.id) + '</span>' + (e.lead ? ' <span class="tag b-acc">' + esc(tr(e.lead)) + '</span>' : '') + '</td>';
        g.cells.forEach(function (c, i) {
          var code = c.lv || c.c || '', s = sh[code] || {}, cls = 'cell', tip = [days[i]];
          if (c.c) tip.push(c.c + (sh[c.c] ? ' ' + tr(sh[c.c].name_ar) : ''));
          if (c.lv) { tip.push((sh[c.lv] ? tr(sh[c.lv].name_ar) : c.lv) + (c.lvf ? ' ✓' : ' …')); if (!c.lvf) cls += ' pend'; }
          var txt = esc(code), extra = '';
          if (c.a === 'غائب') { cls += ' abs'; txt = rt('abs_mark'); tip.push(tr('غائب')); }
          else if (c.a === 'حاضر') { extra += '<span class="ck">✓</span>'; tip.push(tr('حاضر')); }
          if (c.late) { extra += '<span class="dot"></span>'; tip.push(rt('late') + ' ' + c.late + t('min')); }
          if (c.x) { extra += '<span class="dot x"></span>'; tip.push(tr(c.x)); }
          if (c.n) tip.push(c.n);
          if (days[i] === D.today) cls += ' today';
          h += '<td><div class="' + cls + '" style="background:' + esc(s.color || 'transparent') + '" title="' + esc(tip.join(' · ')) + '">' + txt + extra + '</div></td>';
        });
        h += '</tr>';
      });
    });
    return h + '</tbody></table></div>';
  }

  function rstDay() {
    var D = st.rst.d, h = '<p class="muted rmeta"><b>' + rDmy(D.date) + '</b></p><div class="row2 r2eq">' + ['STN', 'ENF'].filter(rTeamOk).map(rTeamCard).join('') + '</div>';
    ['STN', 'ENF', 'ADM'].forEach(function (tm) {
      if (!rTeamOk(tm)) return;
      var list = D.day[tm] || []; if (!list.length) return;
      h += '<h3 class="rh3">' + esc(rTeam(tm)) + '</h3>';
      list.forEach(function (s) {
        h += '<section class="card rshift"><div class="rshd"><span class="tag b-acc">' + rt('shift') + ' (' + esc(s.code) + ') <span class="ltr">' + esc(s.hours) + '</span></span>' +
          (s.dist ? '<span class="tag b-ok">' + rt('dist_ok') + ' <span class="ltr">' + esc(s.dist.case_id) + '</span>' + (s.dist.version > 1 ? ' · ' + rt('update') + ' ' + (s.dist.version - 1) : '') + '</span>' : '<span class="tag b-mu">' + rt('dist_no') + '</span>') +
          (s.att ? '<span class="tag b-ok">' + rt('att_ok') + ' <span class="ltr">' + esc(s.att.case_id) + '</span></span><span class="muted">' + rt('sup') + ': ' + esc(rName(s.att.supervisor_id || '', s.att.supervisor_name)) + '</span>' : '<span class="tag b-warn">' + rt('att_no') + '</span>') + '</div><div class="row2 r2eq">';
        h += '<div><b class="rsub">📋 ' + rt('dist') + '</b>' + ((s.distItems || []).length
          ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>' + rt('emp') + '</th><th>' + rt('task') + '</th><th>' + rt('brk') + '</th></tr></thead><tbody>' + s.distItems.map(function (x) { return '<tr><td>' + esc(rName(x.emp_id, x.emp_name)) + ' <span class="muted num">' + esc(x.emp_id) + '</span></td><td>' + esc(tr(x.report_label)) + '</td><td class="ltr">' + (x.break_start ? esc(x.break_start + '-' + x.break_end) : '-') + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<div class="rnames">' + s.scheduled.map(function (id) { return '<span>' + esc(rName(id)) + '</span>'; }).join('') + '</div><p class="muted rnote">' + rt('scheduled') + '</p>') + '</div>';
        h += '<div><b class="rsub">🕘 ' + rt('att') + '</b>';
        if (s.att) {
          var g = {}; (s.attItems || []).forEach(function (x) { (g[x.att_status] = g[x.att_status] || []).push(x); });
          h += ['حاضر', 'غائب', 'إجازة', 'أوف', 'استئذان', 'انسحاب'].filter(function (k) { return g[k] || ['حاضر', 'غائب'].indexOf(k) >= 0; }).map(function (k) { var a = g[k] || []; return '<div class="rnote"><b>' + esc(tr(k)) + ' (' + a.length + ')</b><div class="rnames">' + a.map(function (x) { return '<span>' + esc(rName(x.emp_id, x.emp_name)) + (x.note ? ' – ' + esc(tr(x.note)) : '') + '</span>'; }).join('') + '</div></div>'; }).join('');
        } else {
          h += '<p class="rnote">🏖 ' + rt('leave') + ': ' + (s.leave.map(function (l) { return esc(rName(l.id)) + ' (' + esc(tr(l.label)) + ')'; }).join('، ') || '-') + '</p><p class="rnote">💤 ' + rt('off') + ': ' + (s.off.map(function (id) { return esc(rName(id)); }).join('، ') || '-') + '</p>';
        }
        h += '</div></div></section>';
      });
    });
    return h;
  }

  function rstLeaves() {
    var D = st.rst.d, R = st.rst, LV = D.LV, open = [LV.PENDING_SUP, LV.PENDING_ADMIN, LV.SUP_APPROVED], q = (R.q || '').toLowerCase();
    var rows = D.leaves.filter(function (r) { return rTeamOk(r.team) && (R.lvf === 'all' || (R.lvf === 'open' ? open.indexOf(r.request_status) >= 0 : r.request_status === R.lvf)) && (!q || (r.emp_name + ' ' + rName(r.emp_id) + ' ' + r.emp_id + ' ' + r.case_id).toLowerCase().indexOf(q) >= 0); });
    var opts = [['open', rt('open')], [LV.PENDING_SUP], [LV.PENDING_ADMIN], [LV.SUP_APPROVED], [LV.FINAL], [LV.SUP_REJECTED], [LV.ADMIN_REJECTED], ['all', rt('all')]];
    var h = '<div class="toolbar"><select class="input" id="rLvf">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (R.lvf === o[0] ? ' selected' : '') + '>' + esc(o[1] || tr(o[0])) + '</option>'; }).join('') + '</select>' +
      '<input class="input" type="search" id="rQ" placeholder="' + esc(rt('search')) + '" value="' + esc(R.q || '') + '"><span class="muted"><span class="num">' + rows.length + '</span> ' + rt('req_n') + '</span></div>';
    h += '<div class="tblwrap rtbl"><table class="tbl twrap"><thead><tr><th>' + rt('req_id') + '</th><th>' + rt('emp') + '</th><th>' + rt('type') + '</th><th>' + rt('period') + '</th><th>' + rt('days_n') + '</th><th>' + rt('file') + '</th><th>' + rt('approver') + '</th><th>' + rt('status') + '</th><th>' + rt('notes') + '</th><th>' + rt('action') + '</th></tr></thead><tbody>';
    h += rows.map(function (r) {
      var act = '';
      if (R.canLeave) {
        if (r.request_status === LV.SUP_APPROVED) act = rBtn('leave', r.case_id, 'final', 'a_final', 'ok') + rBtn('leave', r.case_id, 'reject', 'a_reject', 'bad');
        else if (r.request_status === LV.PENDING_SUP || r.request_status === LV.PENDING_ADMIN) act = rBtn('leave', r.case_id, 'approve', 'a_approve', 'pri') + rBtn('leave', r.case_id, 'reject', 'a_reject', 'bad');
      }
      var notes = [r.emp_note && ('📝 ' + esc(r.emp_note)), r.sup_note && ('👮 ' + esc(r.sup_note)), r.admin_note && ('🏢 ' + esc(r.admin_note)), r.admin_by && ('<span class="muted">' + esc(tr(r.admin_by)) + ' <span class="ltr">' + esc(r.admin_at) + '</span></span>')].filter(Boolean).join('<br>');
      return '<tr><td><b class="ltr">' + esc(r.case_id) + '</b><div class="muted ltr">' + esc(r.created_at) + '</div></td><td>' + esc(rName(r.emp_id, r.emp_name)) + '<div class="muted"><span class="num">' + esc(r.emp_id) + '</span> · ' + esc(rTeam(r.team)) + '</div></td>' +
        '<td>' + esc(tr(r.leave_type)) + (r.relation ? '<div class="muted">' + esc(tr(r.relation)) + '</div>' : '') + '</td><td>' + rDmy(r.from_date) + '<br>' + rDmy(r.to_date) + '</td><td class="num">' + esc(r.days) + '</td>' +
        '<td>' + (r.attachment_url ? '<a href="' + esc(r.attachment_url) + '" target="_blank" rel="noopener">📎 ' + rt('open_file') + '</a>' : '-') + '</td>' +
        '<td>' + esc(rName('', r.approver_name)) + '<div class="muted">' + esc(tr(r.approver_level || '')) + (r.escalated === 'Y' ? ' · ' + rt('escalated') : '') + '</div></td><td>' + rStBadge(r.request_status) + '</td><td class="rnotes">' + notes + '</td><td class="racts">' + act + '</td></tr>';
    }).join('') || '<tr><td colspan="10" class="empty">' + t('no_rows') + '</td></tr>';
    return h + '</tbody></table></div>';
  }

  function rstReqs() {
    var D = st.rst.d, R = st.rst, RQ = D.REQ, open = [RQ.NEW, RQ.WIP];
    var rows = D.reqs.filter(function (r) { return rTeamOk(r.team) && (R.rqf === 'all' || (R.rqf === 'open' ? open.indexOf(r.request_status) >= 0 : r.request_status === R.rqf)); });
    var opts = [['open', rt('open')], [RQ.NEW], [RQ.WIP], [RQ.DONE], [RQ.REJECTED], ['all', rt('all')]];
    var h = '<div class="toolbar"><select class="input" id="rRqf">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (R.rqf === o[0] ? ' selected' : '') + '>' + esc(o[1] || tr(o[0])) + '</option>'; }).join('') + '</select><span class="muted"><span class="num">' + rows.length + '</span> ' + rt('req_n') + '</span></div>';
    h += '<div class="tblwrap rtbl"><table class="tbl twrap"><thead><tr><th>' + rt('req_id') + '</th><th>' + rt('emp') + '</th><th>' + rt('type') + '</th><th>' + rt('details') + '</th><th>' + rt('file') + '</th><th>' + rt('status') + '</th><th>' + rt('admin_note') + '</th><th>' + rt('action') + '</th></tr></thead><tbody>';
    h += rows.map(function (r) {
      var act = '';
      if (R.canReq) {
        if (r.request_status === RQ.NEW) act += rBtn('req', r.case_id, RQ.WIP, 'a_wip', '');
        if (open.indexOf(r.request_status) >= 0) act += rBtn('req', r.case_id, RQ.DONE, 'a_done', 'ok') + rBtn('req', r.case_id, RQ.REJECTED, 'a_reject', 'bad');
      }
      return '<tr><td><b class="ltr">' + esc(r.case_id) + '</b><div class="muted ltr">' + esc(r.created_at) + '</div></td><td>' + esc(rName(r.emp_id, r.emp_name)) + '<div class="muted num">' + esc(r.emp_id) + '</div></td><td>' + esc(tr(r.req_type)) + '</td>' +
        '<td class="rdet">' + esc(r.details) + '</td><td>' + (r.attachment_url ? '<a href="' + esc(r.attachment_url) + '" target="_blank" rel="noopener">📎 ' + rt('open_file') + '</a>' : '-') + '</td><td>' + rStBadge(r.request_status) + '</td>' +
        '<td class="rnotes">' + esc(r.admin_note) + (r.admin_by ? '<div class="muted">' + esc(tr(r.admin_by)) + ' <span class="ltr">' + esc(r.admin_at) + '</span></div>' : '') + '</td><td class="racts">' + act + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">' + t('no_rows') + '</td></tr>';
    return h + '</tbody></table></div>';
  }
  function rBtn(kind, id, act, label, tone) {
    return '<button type="button" class="btn sm rb ' + tone + '" data-kind="' + kind + '" data-id="' + esc(id) + '" data-act="' + esc(act) + '" data-label="' + label + '">' + rt(label) + '</button>';
  }

  function rstEmps() {
    var D = st.rst.d, S = st.rst.sort;
    var cols = [['name', 'emp'], ['team', 'team'], ['work', 'work'], ['present', 'present'], ['absent', 'absent'], ['late', 'late'], ['lateMin', 'late_min'], ['permission', 'perm'], ['withdrawal', 'wd'], ['leaveDays', 'lv_days'], ['notes', 'att_notes'], ['rate', 'rate'], ['pending', 'pending'], ['reg', 'bot']];
    var rows = D.emps.filter(function (e) { return rTeamOk(e.team); }).map(function (e) {
      var k = (D.kpi || {})[e.id] || {}, r = {};
      for (var x in k) r[x] = k[x];
      r.name = rName(e.id); r.id = e.id; r.team = e.team; r.role = e.role; r.task = e.task; r.reg = e.reg ? 1 : 0;
      r.rate = (k.present + k.absent) ? Math.round(k.present / (k.present + k.absent) * 100) : '';
      return r;
    });
    rows.sort(function (a, b) { var x = a[S.k], y = b[S.k]; if (x === y) return 0; return (x > y ? 1 : -1) * S.d; });
    var n = function (v) { return v === undefined || v === '' ? '0' : esc(v); };
    return '<p class="muted rmeta">' + rt('emps_note').replace('{m}', '<span class="ltr">' + esc(D.month) + '</span>') + '</p>' +
      '<div class="tblwrap rtbl"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th class="sortable" data-sort="' + c[0] + '">' + rt(c[1]) + (S.k === c[0] ? (S.d > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><b>' + esc(r.name) + '</b> <span class="muted num">' + esc(r.id) + '</span><div class="muted">' + esc(tr(r.role || '')) + (r.task ? ' · ' + esc(tr(r.task)) : '') + '</div></td><td>' + esc(rTeam(r.team)) + '</td><td class="num">' + n(r.work) + '</td><td class="num">' + n(r.present) + '</td>' +
          '<td class="num' + (r.absent ? ' tbad' : '') + '">' + n(r.absent) + '</td><td class="num' + (r.late ? ' twarn' : '') + '">' + n(r.late) + '</td><td class="num">' + n(r.lateMin) + '</td><td class="num">' + n(r.permission) + '</td><td class="num">' + n(r.withdrawal) + '</td><td class="num">' + n(r.leaveDays) + '</td>' +
          '<td>' + (r.notes ? '<span class="tag b-warn num">' + esc(r.notes) + '</span>' : '0') + '</td><td class="num">' + (r.rate === '' ? '-' : r.rate + '%') + '</td><td>' + (r.pending ? '<span class="tag b-acc num">' + esc(r.pending) + '</span>' : '0') + '</td><td>' + (r.reg ? '✅' : '<span class="muted">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function rstReport() {
    var D = st.rst.d, tot = { present: 0, late: 0, absent: 0, leave: 0, off: 0 }, A = { STN: rDayAgg('STN'), ENF: rDayAgg('ENF') };
    ['STN', 'ENF'].forEach(function (tm) { var a = A[tm]; tot.present += a.present; tot.late += a.late; tot.absent += a.absent; tot.leave += a.leave; tot.off += a.off; });
    var base = Math.max(tot.present + tot.absent, 1);
    var h = '<div class="toolbar noprint"><button type="button" class="btn primary sm" id="rPrint">' + icon('print') + rt('print') + '</button></div><div class="card rrep">' +
      '<div class="rrh"><div><b class="rlogo">MBCO</b><div class="muted">Modern Bus Company Limited</div></div><span class="tag b-acc">Daily · ' + rDmy(D.date) + '</span></div>' +
      '<h2 class="rrt">' + rt('rep_title') + '</h2><div class="kpis k6">' + [['present', tot.present], ['late', tot.late], ['absent', tot.absent], ['leaves_t', tot.leave], ['off', tot.off], ['ex_t', Math.round(tot.present / base * 100) + '%']].map(function (x) { return rKpi(rt(x[0]), x[1]); }).join('') + '</div>' +
      '<h3 class="rh3">' + rt('by_team') + '</h3>' + ['STN', 'ENF'].map(function (tm, i) { var a = A[tm], b = Math.max(a.present + a.absent, 1); return rBar(rTeam(tm), a.present, b, ['var(--accent)', '#eb6834'][i], Math.round(a.present / b * 100) + '%'); }).join('');
    ['STN', 'ENF'].forEach(function (tm) {
      h += '<h3 class="rh3">' + esc(rTeam(tm)) + '</h3><div class="tblwrap"><table class="tbl"><thead><tr><th>' + rt('shift') + '</th><th>' + rt('present') + '</th><th>' + rt('late') + '</th><th>' + rt('absent') + '</th><th>' + rt('leave') + '</th><th>' + rt('off') + '</th><th>' + rt('wd') + '</th><th>' + rt('perm') + '</th><th>' + rt('sup') + '</th></tr></thead><tbody>';
      (D.day[tm] || []).forEach(function (s) {
        var a = s.att;
        h += '<tr><td>(' + esc(s.code) + ') <span class="ltr">' + esc(s.hours) + '</span></td>' + (a ? '<td class="num">' + a.present + '</td><td class="num">' + a.late + '</td><td class="num">' + a.absent + '</td><td class="num">' + a.leave + '</td><td class="num">' + a.off + '</td><td class="num">' + a.withdrawal + '</td><td class="num">' + a.permission + '</td><td>' + esc(rName(a.supervisor_id || '', a.supervisor_name)) + '</td>' : '<td colspan="8" class="twarn">' + rt('att_no') + '</td>') + '</tr>';
      });
      h += '</tbody></table></div>';
      var notes = []; (D.day[tm] || []).forEach(function (s) { (s.attItems || []).forEach(function (x) { if (x.att_status === 'غائب' || +x.late_min > 0 || x.exit_time) notes.push([s.code, x]); }); });
      if (notes.length) h += '<div class="tblwrap" style="margin-top:8px"><table class="tbl"><thead><tr><th>' + rt('shift') + '</th><th>' + rt('emp') + '</th><th>' + rt('status') + '</th><th>' + rt('note') + '</th></tr></thead><tbody>' + notes.map(function (x) { return '<tr><td>(' + esc(x[0]) + ')</td><td>' + esc(rName(x[1].emp_id, x[1].emp_name)) + ' <span class="muted num">' + esc(x[1].emp_id) + '</span></td><td>' + esc(tr(x[1].att_status)) + '</td><td>' + esc(tr(x[1].note || '')) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    });
    var pend = D.leaves.filter(function (r) { return r.request_status === D.LV.SUP_APPROVED; });
    h += '<h3 class="rh3">' + rt('mena_wait') + ' (<span class="num">' + pend.length + '</span>)</h3>' + (pend.length ? '<div class="tblwrap"><table class="tbl"><thead><tr><th>' + rt('emp') + '</th><th>' + rt('type') + '</th><th>' + rt('period') + '</th><th>' + rt('approver') + '</th></tr></thead><tbody>' + pend.map(function (r) { return '<tr><td>' + esc(rName(r.emp_id, r.emp_name)) + '</td><td>' + esc(tr(r.leave_type)) + '</td><td>' + rDmy(r.from_date) + ' ← ' + rDmy(r.to_date) + '</td><td>' + esc(rName('', r.approver_name)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">' + rt('none') + '</p>');
    return h + '<div class="rfoot muted"><span>' + rt('rep_foot') + '</span><span>' + rt('made') + ' <span class="ltr">' + esc(D.now) + '</span></span></div></div>';
  }

  function rstBind(key, b) {
    var R = st.rst;
    var lvf = b.querySelector('#rLvf'); if (lvf) lvf.onchange = function () { R.lvf = lvf.value; rstDraw(key); };
    var rqf = b.querySelector('#rRqf'); if (rqf) rqf.onchange = function () { R.rqf = rqf.value; rstDraw(key); };
    var q = b.querySelector('#rQ'); if (q) q.oninput = function () { R.q = q.value; var pos = q.selectionStart; rstDraw(key); var n = document.getElementById('rQ'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    var p = b.querySelector('#rPrint'); if (p) p.onclick = function () { window.print(); };
    Array.prototype.forEach.call(b.querySelectorAll('[data-sort]'), function (th) { th.onclick = function () { var k = th.getAttribute('data-sort'); R.sort = { k: k, d: R.sort.k === k ? -R.sort.d : -1 }; rstDraw(key); }; });
    Array.prototype.forEach.call(b.querySelectorAll('.rb'), function (btn) {
      btn.onclick = function () {
        var kind = btn.getAttribute('data-kind'), id = btn.getAttribute('data-id'), act = btn.getAttribute('data-act');
        var title = kind === 'leave' ? rt('m_' + act) : rt('m_req') + ': ' + tr(act);
        confirmBox(title, rt('m_body').replace('{id}', id).replace('{by}', R.by || ''), function (note, done) {
          api('rstAct', { kind: kind, id: id, act: act, note: note }).then(function () {
            done(); toast(rt('done'));
            var wrap = document.getElementById('ctlWrap'); if (wrap) renderRst(key, wrap, true);
          }).catch(function (e) { done(errText(e)); });
        });
      };
    });
  }

  /* نافذة تأكيد مع ملاحظة */
  function confirmBox(title, body, onOk) {
    var ov = document.createElement('div'); ov.className = 'mov';
    ov.innerHTML = '<div class="mbox" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p class="muted">' + esc(body) + '</p>' +
      '<textarea class="input" id="mNote" rows="3" placeholder="' + esc(rt('note_ph')) + '"></textarea><div class="err hide" id="mErr"></div>' +
      '<div class="mrow"><button type="button" class="btn" id="mNo">' + rt('cancel') + '</button><button type="button" class="btn primary" id="mOk">' + rt('confirm') + '</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#mNo').onclick = close;
    var ok = ov.querySelector('#mOk'); ov.querySelector('#mNote').focus();
    ok.onclick = function () {
      ok.disabled = true; ok.classList.add('spinning');
      onOk(ov.querySelector('#mNote').value.trim(), function (err) {
        if (!err) return close();
        ok.disabled = false; ok.classList.remove('spinning');
        var m = ov.querySelector('#mErr'); m.textContent = err; m.classList.remove('hide');
      });
    };
  }

  function loadSection(key) {
    var main = document.getElementById('main');
    var s = st.sec[key] || { from: '', to: '', q: '' };
    st.sec[key] = s;
    var sec = st.sections.filter(function (x) { return x.key === key; })[0] || {};
    var mode = secMode(key);
    var title = '<div class="pagehead"><div><h1>' + esc(st.lang === 'en' ? sec.en : sec.ar) + '</h1></div>' + modeSwitch(key, mode) +
      (mode === 'ctl' ? '<button type="button" class="btn sm hide noprint" id="ctlNew">' + icon('external') + t('ctl_newwin') + '</button>' : '') +
      (DEMO ? '<span class="notice">' + t('demo') + '</span>' : '') + '</div>';
    if (mode === 'ctl') {
      if (RST_NATIVE[key]) {
        main.innerHTML = title + '<div class="ctlnative" id="ctlWrap"></div>';
        bindModeSwitch(key);
        if (st.user.role === 'Officer') { document.getElementById('ctlWrap').innerHTML = '<div class="ctlmsg"><p>' + esc(t('ctl_role')) + '</p></div>'; return; }
        renderRst(key, document.getElementById('ctlWrap'), false);
        return;
      }
      main.innerHTML = title + (st.lang === 'en' ? '<p class="muted ctlnote">' + t('ctl_arabic') + '</p>' : '') + '<div class="ctlwrap" id="ctlWrap"></div>';
      bindModeSwitch(key);
      renderControl(key, document.getElementById('ctlWrap'), false);
      return;
    }
    var head = title +
      '<div class="card"><div class="toolbar noprint">' +
      '<label class="field">' + t('from') + '<input class="input num" type="date" id="sFrom" value="' + esc(s.from) + '"></label>' +
      '<label class="field">' + t('to') + '<input class="input num" type="date" id="sTo" value="' + esc(s.to) + '"></label>' +
      '<button type="button" class="btn primary" id="sGo">' + t('apply') + '</button>' +
      '<label class="field search">' + t('search') + '<input class="input" type="search" id="sQ" value="' + esc(s.q) + '"></label>' +
      '<button type="button" class="btn" id="sCsv">' + icon('download') + t('export') + '</button>' +
      '<button type="button" class="btn hide" id="sDash">' + icon('external') + t('open_dash') + '</button></div><div id="sBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div></div>';
    main.innerHTML = head;
    bindModeSwitch(key);
    var apply = function (d) {
      addDict(d.dict); s.data = d; s.from = d.from; s.to = d.to;
      document.getElementById('sFrom').value = s.from; document.getElementById('sTo').value = s.to;
      document.getElementById('sDash').classList.toggle('hide', !d.canOpenDashboard || !!EMBED_KEYS[key]);
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
