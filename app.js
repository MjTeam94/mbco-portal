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
    upload: 'M12 16V5M7 10l5-5 5 5M5 20h14',
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
    h += '<section class="card"><div class="chead"><span class="numtag">1</span><h2>' + t('cdc_title') + '</h2>' + openLink('cdc') + '</div>' +
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
    h += '<section class="card"><div class="chead"><span class="numtag">5</span><h2>' + t('car_title') + '</h2>' + openLink('car') + '</div>' +
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
  var EMBED_KEYS = { cdc: 1, ins: 1, car: 1, att: 1, leaves: 1, requests: 1 };
  var NATIVE_ONLY = { roster: 1, dist: 1 };   // صفحات مبنية بالكامل في البوابة بدون «السجلات»
  function secMode(key) {
    if (NATIVE_ONLY[key]) return 'ctl';
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
      var subs = key === 'roster' ? [['overview', 'overview'], ['grid', 'grid'], ['edit', 'manage'], ['emps', 'emps'], ['report', 'report']] : null;
      if (subs && !subs.some(function (s) { return s[0] === R.sub; })) R.sub = 'overview';
      var needMonth = key === 'roster', needDay = key === 'att' || key === 'roster';
      wrap.innerHTML = '<div class="card rsttools noprint">' +
        (subs ? '<div class="seg sub">' + subs.map(function (s) { return '<button type="button" data-sub="' + s[0] + '" class="' + (R.sub === s[0] ? 'on' : '') + '">' + (s[0] === 'edit' ? '✏️ ' + ro(s[1]) : rt(s[1])) + '</button>'; }).join('') + '</div>' : '') +
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
    var tools = document.querySelector('.rsttools'); if (tools) tools.classList.toggle('editing', v === 'edit');
    if (v === 'edit') { if (st.ros && st.ros.data && st.ros.month) return rosDraw(); return renderRos(); }
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


  /* ================= إدارة الروستر: إنشاء / تعديل / رفع / تنزيل (v1.8) ================= */
  var RO = {
    ar: {
      manage: 'إدارة الروستر', r_month: 'شهر الروستر', r_fill: 'تعبئة الشهر من النمط', r_upload: 'رفع ملف Excel', r_ops: 'تنزيل نسخة التشغيل', r_hr: 'تنزيل نسخة HR',
      r_undo: 'استرجاع آخر نسخة', r_save: 'حفظ ونشر', r_discard: 'تجاهل التعديلات', r_unsaved: 'تعديل غير محفوظ', r_none: 'لا توجد تعديلات',
      r_pen: 'اختر رمز ثم اضغط أو اسحب على الخانات', r_clear: 'مسح', r_sel: 'للموظفين المحددين:', r_replace: 'استبدل', r_with: 'بـ', r_apply: 'تطبيق',
      r_add: 'إضافة موظف للروستر', r_new: 'جديد', r_readonly: 'عرض فقط: تعديل الروستر للإدارة.', r_loading: 'جارِ تحميل الروستر…',
      r_filled: 'تمت التعبئة: {n} خانة. راجعها ثم اضغط «حفظ ونشر».', r_nopat: 'ما قدرت أستنتج نمط: {names}', r_loaded: 'تم قراءة الملف: {n} تعديل على {e} موظف ({d} يوم). راجع الخانات المظللة ثم اضغط «حفظ ونشر».',
      r_newemps: 'موظفين غير موجودين في تبويب الموظفين بنظام الروستر (أضفهم هناك عشان البوت والتحضير): {names}', r_badcodes: 'رموز غير معروفة باللون الأحمر: {codes}. صححها قبل الحفظ.',
      r_badfile: 'ما قدرت أقرأ الملف. تأكد إنه نفس شكل ملف الروستر الشهري (أعمدة ID و STAFF والتواريخ).', r_saved: 'تم الحفظ ✓ {n} خانة', r_undone: 'تم استرجاع النسخة السابقة ✓',
      m_save: 'حفظ ونشر الروستر', m_save_b: '{n} خانة تتغير في الروستر، ويشوفها الموظفين في البوت فوراً. تنحفظ نسخة احتياطية قبل الحفظ.',
      m_undo: 'استرجاع آخر نسخة', m_undo_b: 'يرجع الروستر مثل ما كان قبل آخر حفظ.', m_disc: 'تجاهل كل التعديلات غير المحفوظة؟',
      r_fill_b: 'يكمّل خانات الشهر الفاضية لكل موظف حسب نمط دوامه (أيام العمل والأوف) وآخر وردية له. الخانات المعبأة ما تتغير.',
      r_nosheet: 'أضف RST_SHEET_ID في Script Properties حق الـ Hub (دليل التحديث 1.8).', r_leave_warn: '',
      r_unsaved_leave: 'عندك تعديلات غير محفوظة. تبغى تتركها؟', r_choose: '— اختر موظف —', r_hrmap: 'أكواد HR'
    },
    en: {
      manage: 'Manage roster', r_month: 'Roster month', r_fill: 'Fill month from pattern', r_upload: 'Upload Excel', r_ops: 'Download ops version', r_hr: 'Download HR version',
      r_undo: 'Restore previous version', r_save: 'Save & publish', r_discard: 'Discard changes', r_unsaved: 'unsaved changes', r_none: 'No changes',
      r_pen: 'Pick a code, then click or drag over cells', r_clear: 'Clear', r_sel: 'For selected staff:', r_replace: 'replace', r_with: 'with', r_apply: 'Apply',
      r_add: 'Add employee to roster', r_new: 'new', r_readonly: 'View only: roster editing is for admins.', r_loading: 'Loading roster…',
      r_filled: 'Filled {n} cells. Review them, then press "Save & publish".', r_nopat: 'No pattern found for: {names}', r_loaded: 'File read: {n} changes for {e} staff ({d} days). Review the highlighted cells, then press "Save & publish".',
      r_newemps: 'Staff not in the roster system Employees tab (add them there for the bot and attendance): {names}', r_badcodes: 'Unknown codes in red: {codes}. Fix them before saving.',
      r_badfile: 'Could not read the file. Make sure it has the monthly roster layout (ID, STAFF and date columns).', r_saved: 'Saved ✓ {n} cells', r_undone: 'Previous version restored ✓',
      m_save: 'Save & publish roster', m_save_b: '{n} cells change in the roster and staff see them on the bot right away. A backup is kept before saving.',
      m_undo: 'Restore previous version', m_undo_b: 'Returns the roster to how it was before the last save.', m_disc: 'Discard all unsaved changes?',
      r_fill_b: 'Fills each employee\'s empty cells for the month from their work/off pattern and latest shift. Filled cells are kept.',
      r_nosheet: 'Add RST_SHEET_ID to the Hub Script Properties (update guide 1.8).', r_leave_warn: '',
      r_unsaved_leave: 'You have unsaved changes. Leave anyway?', r_choose: '— choose employee —', r_hrmap: 'HR codes'
    }
  };
  function ro(k) { return (RO[st.lang] && RO[st.lang][k]) || RO.ar[k] || k; }
  var MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var MONF = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  var DOW2 = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  var TEAM_ORDER = ['ADM', 'ENF', 'STN'];
  var TEAM_SHEET = { ADM: 'Office Team', ENF: 'Enforcement Team', STN: 'Station Team' };

  function dAdd(d, n) { var p = d.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)).toISOString().slice(0, 10); }
  function monthEnd(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7); return m + '-' + String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, '0'); }
  function prevMonth(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1; if (!mo) { mo = 12; y--; } return y + '-' + String(mo).padStart(2, '0'); }
  function nextMonth(m) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) + 1; if (mo > 12) { mo = 1; y++; } return y + '-' + String(mo).padStart(2, '0'); }
  function rosRange(m) { return { from: prevMonth(m) + '-27', to: monthEnd(m), hist: dAdd(prevMonth(m) + '-27', -28) }; }
  function rangeDates(a, b) { var out = []; for (var d = a; d <= b; d = dAdd(d, 1)) out.push(d); return out; }

  function rosState() {
    if (!st.ros) st.ros = { month: '', data: null, edits: {}, newEmps: {}, pen: '', sel: {}, msgs: [] };
    return st.ros;
  }
  function rosDirty() { return Object.keys(st.ros ? st.ros.edits : {}).length; }
  function rosVal(id, d) {
    var R = st.ros, k = id + '|' + d;
    if (k in R.edits) return R.edits[k];
    var row = R.rowMap[id]; return row && row.codes[d] || '';
  }
  function rosShift(code) { return st.ros.shiftMap[code]; }
  function rosEmp(id) { return st.ros.empMap[id] || {}; }
  function rosName(id) {
    var e = rosEmp(id), row = st.ros.rowMap[id], ne = st.ros.newEmps[id];
    if (st.lang !== 'en' && e.ar) return e.ar;
    return e.en || (row && row.name) || (ne && ne.name) || id;
  }
  function rosTeam(id) { var row = st.ros.rowMap[id], ne = st.ros.newEmps[id]; return (row && row.team) || (ne && ne.team) || rosEmp(id).team || ''; }
  function rosIds() {
    var R = st.ros, ids = R.data.rows.map(function (r) { return r.id; });
    Object.keys(R.newEmps).forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }

  function renderRos(wrap) {
    var R = rosState(), m = R.month || (st.rst && st.rst.month) || todayStr().slice(0, 7);
    if (!R.month) R.month = m;
    var b = document.getElementById('rstBody');
    b.innerHTML = '<div class="loading"><div class="spin"></div>' + ro('r_loading') + '</div>';
    var rg = rosRange(R.month);
    api('rosterGet', { from: rg.hist, to: rg.to }).then(function (j) {
      R.data = j; R.edits = {}; R.newEmps = {}; R.sel = {}; R.msgs = [];
      R.rowMap = {}; j.rows.forEach(function (r) { R.rowMap[r.id] = r; });
      R.empMap = {}; j.emps.forEach(function (e) { R.empMap[e.id] = e; });
      R.shiftMap = {}; j.shifts.forEach(function (s) { R.shiftMap[s.code] = s; });
      if (!R.pen || !R.shiftMap[R.pen]) R.pen = (j.shifts[0] || {}).code || '';
      if (route() === 'roster' && st.rst.sub === 'edit') rosDraw();
    }).catch(function (e) {
      var msg = String(e && e.message || e);
      if (msg === 'no_rst_sheet') { b.innerHTML = '<div class="ctlmsg"><p>' + esc(ro('r_nosheet')) + '</p></div>'; return; }
      failBox(b, e, function () { renderRos(wrap); });
    });
  }

  function rosDraw() {
    var R = st.ros, J = R.data, b = document.getElementById('rstBody'); if (!b || !J) return;
    var rg = rosRange(R.month), dates = rangeDates(rg.from, rg.to), L = st.lang === 'en', can = J.canEdit;
    var n = rosDirty(), bad = rosBadCodes();
    var h = '<div class="card rostools">' +
      '<label class="field">' + ro('r_month') + '<input class="input num" type="month" id="roMonth" value="' + esc(R.month) + '"></label>' +
      (can ? '<button type="button" class="btn sm" id="roFill">' + icon('roster') + ro('r_fill') + '</button>' +
        '<label class="btn sm" for="roFile">' + icon('upload') + ro('r_upload') + '<input type="file" id="roFile" accept=".xlsx" class="hide"></label>' : '') +
      '<button type="button" class="btn sm" id="roOps">' + icon('download') + ro('r_ops') + '</button>' +
      '<button type="button" class="btn sm" id="roHr">' + icon('download') + ro('r_hr') + '</button>' +
      (can && J.hasBackup ? '<button type="button" class="btn sm bad" id="roUndo">' + icon('refresh') + ro('r_undo') + '</button>' : '') + '</div>';
    if (!can) h += '<p class="muted rmeta">' + ro('r_readonly') + '</p>';
    R.msgs.forEach(function (m) { h += '<div class="romsg ' + (m[0] || '') + '">' + esc(m[1]) + '</div>'; });
    if (bad.length) h += '<div class="romsg bad">' + esc(ro('r_badcodes').replace('{codes}', bad.join('، '))) + '</div>';
    if (can) {
      h += '<div class="card rosbar' + (n ? ' dirty' : '') + '"><div class="ropal">' + J.shifts.map(function (s) {
        return '<button type="button" class="pal' + (R.pen === s.code ? ' on' : '') + '" data-pen="' + esc(s.code) + '" style="background:' + esc(s.color || '#fff') + '" title="' + esc(tr(s.name) + (s.start ? ' ' + s.start + '-' + s.end : '')) + '">' + esc(s.code) + '</button>';
      }).join('') + '<button type="button" class="pal clr' + (R.pen === '' ? ' on' : '') + '" data-pen="">' + ro('r_clear') + '</button><span class="muted ropalh">' + ro('r_pen') + '</span></div>' +
        '<div class="rosave"><b class="num">' + (n ? n + ' ' + ro('r_unsaved') : ro('r_none')) + '</b>' +
        '<button type="button" class="btn sm" id="roDisc"' + (n ? '' : ' disabled') + '>' + ro('r_discard') + '</button>' +
        '<button type="button" class="btn primary sm" id="roSave"' + (n && !bad.length ? '' : ' disabled') + '>' + ro('r_save') + '</button></div></div>';
      var opts = J.shifts.map(function (s) { return '<option value="' + esc(s.code) + '">' + esc(s.code) + '</option>'; }).join('');
      var notIn = J.emps.filter(function (e) { return e.active && !R.rowMap[e.id] && !R.newEmps[e.id]; });
      h += '<div class="rosbulk muted">' + ro('r_sel') + ' ' + ro('r_replace') + ' <select class="input sm" id="roFrom"><option value="*">*</option>' + opts + '</select> ' + ro('r_with') +
        ' <select class="input sm" id="roTo">' + opts + '<option value="">' + ro('r_clear') + '</option></select> <button type="button" class="btn sm" id="roBulk">' + ro('r_apply') + '</button>' +
        (notIn.length ? '<span class="sp"></span><select class="input sm" id="roAdd"><option value="">' + ro('r_choose') + '</option>' + notIn.map(function (e) { return '<option value="' + e.id + '">' + esc((L ? e.en : e.ar) || e.en) + ' · ' + e.id + '</option>'; }).join('') + '</select><button type="button" class="btn sm" id="roAddB">' + ro('r_add') + '</button>' : '') + '</div>';
    }
    h += '<div class="rwrap"><table class="rt ros' + (can ? ' can' : '') + '"><thead><tr><th class="nm">' + (can ? '<input type="checkbox" id="roAll"> ' : '') + rt('emp') + '</th>' + dates.map(function (d) {
      var w = rDow(d), out = d.slice(0, 7) !== R.month;
      return '<th class="' + (w === 5 || w === 6 ? 'wk' : '') + (out ? ' out' : '') + '">' + RDAYS[L ? 'en' : 'ar'][w] + '<br><span class="num">' + d.slice(8) + '</span></th>';
    }).join('') + '</tr></thead><tbody>';
    var ids = rosIds(), groups = {};
    ids.forEach(function (id) { var t = rosTeam(id); (groups[t] = groups[t] || []).push(id); });
    TEAM_ORDER.concat(Object.keys(groups).filter(function (t) { return TEAM_ORDER.indexOf(t) < 0; })).forEach(function (tm) {
      if (!groups[tm] || !rTeamOk(tm)) return;
      h += '<tr class="tm"><td class="nm">' + esc(rTeam(tm) || '—') + '</td><td colspan="' + dates.length + '"></td></tr>';
      groups[tm].forEach(function (id) {
        h += '<tr data-id="' + id + '"><td class="nm">' + (can ? '<input type="checkbox" class="rosel" data-id="' + id + '"' + (R.sel[id] ? ' checked' : '') + '> ' : '') + '<b>' + esc(rosName(id)) + '</b> <span class="muted num">' + id + '</span>' + (R.newEmps[id] || !R.rowMap[id] ? ' <span class="tag b-warn">' + ro('r_new') + '</span>' : '') + '</td>';
        dates.forEach(function (d) { h += '<td>' + rosCell(id, d) + '</td>'; });
        h += '</tr>';
      });
    });
    h += '</tbody></table></div>';
    b.innerHTML = h;
    rosBind(b);
  }
  function rosCell(id, d) {
    var R = st.ros, code = rosVal(id, d), s = rosShift(code), k = id + '|' + d, cls = 'cell';
    if (k in R.edits) cls += ' ed';
    if (code && !s) cls += ' badc';
    if (d.slice(0, 7) !== R.month) cls += ' out';
    if (d === todayStr()) cls += ' today';
    return '<div class="' + cls + '" data-c="' + k + '" style="background:' + esc(s && s.color || 'transparent') + '">' + esc(code) + '</div>';
  }
  function rosBadCodes() {
    var R = st.ros, bad = {};
    Object.keys(R.edits).forEach(function (k) { var c = R.edits[k]; if (c && !R.shiftMap[c]) bad[c] = 1; });
    return Object.keys(bad);
  }
  function rosSet(id, d, code) {
    var R = st.ros, k = id + '|' + d, row = R.rowMap[id], base = row && row.codes[d] || '';
    if (code === base && row) delete R.edits[k]; else R.edits[k] = code;
  }
  function rosRefreshBar() {
    var n = rosDirty(), bar = document.querySelector('.rosbar'); if (!bar) return;
    bar.classList.toggle('dirty', !!n);
    bar.querySelector('.rosave b').textContent = n ? n + ' ' + ro('r_unsaved') : ro('r_none');
    document.getElementById('roDisc').disabled = !n;
    document.getElementById('roSave').disabled = !n || rosBadCodes().length > 0;
  }

  function rosBind(b) {
    var R = st.ros, J = R.data;
    var mi = document.getElementById('roMonth');
    mi.onchange = function () {
      if (!mi.value) return;
      if (rosDirty() && !window.confirm(ro('r_unsaved_leave'))) { mi.value = R.month; return; }
      R.month = mi.value; renderRos();
    };
    var dl = function (id, fn) { var x = document.getElementById(id); if (x) x.onclick = fn; };
    dl('roOps', function () { rosExport('ops'); });
    dl('roHr', function () { rosExport('hr'); });
    if (!J.canEdit) return;
    Array.prototype.forEach.call(b.querySelectorAll('[data-pen]'), function (x) {
      x.onclick = function () { R.pen = x.getAttribute('data-pen'); b.querySelectorAll('[data-pen]').forEach(function (y) { y.classList.toggle('on', y === x); }); };
    });
    var painting = false;
    var paint = function (el) {
      var k = el.getAttribute('data-c'); if (!k) return;
      var p = k.split('|'); rosSet(p[0], p[1], R.pen);
      el.outerHTML = rosCell(p[0], p[1]);
      rosRefreshBar();
    };
    var tbl = b.querySelector('table.ros');
    tbl.addEventListener('mousedown', function (e) { var c = e.target.closest('.cell'); if (!c) return; e.preventDefault(); painting = true; paint(c); });
    tbl.addEventListener('mouseover', function (e) { if (!painting) return; var c = e.target.closest('.cell'); if (c) paint(c); });
    document.addEventListener('mouseup', function () { painting = false; }, { once: false });
    tbl.addEventListener('touchstart', function (e) { var c = e.target.closest('.cell'); if (c) { e.preventDefault(); paint(c); } }, { passive: false });
    Array.prototype.forEach.call(b.querySelectorAll('.rosel'), function (x) { x.onchange = function () { R.sel[x.getAttribute('data-id')] = x.checked; }; });
    var all = document.getElementById('roAll');
    if (all) all.onchange = function () { b.querySelectorAll('.rosel').forEach(function (x) { x.checked = all.checked; R.sel[x.getAttribute('data-id')] = all.checked; }); };
    dl('roBulk', function () {
      var from = document.getElementById('roFrom').value, to = document.getElementById('roTo').value;
      var dates = rangeDates(R.month + '-01', monthEnd(R.month)), n = 0;
      Object.keys(R.sel).forEach(function (id) { if (!R.sel[id]) return; dates.forEach(function (d) { var v = rosVal(id, d); if (from === '*' ? true : v === from) { if (v !== to) { rosSet(id, d, to); n++; } } }); });
      R.msgs = [['', ro('r_filled').replace('{n}', n)]]; rosDraw();
    });
    dl('roAddB', function () {
      var id = document.getElementById('roAdd').value; if (!id) return;
      var e = R.empMap[id]; R.newEmps[id] = { name: e.en || e.ar, team: e.team };
      rosSet(id, R.month + '-01', rosVal(id, R.month + '-01') || '');
      R.edits[id + '|' + R.month + '-01'] = R.edits[id + '|' + R.month + '-01'] || '';
      rosDraw();
    });
    dl('roDisc', function () { if (window.confirm(ro('m_disc'))) { R.edits = {}; R.newEmps = {}; R.msgs = []; rosDraw(); } });
    dl('roFill', function () { confirmBox(ro('r_fill'), ro('r_fill_b'), function (note, done) { done(); rosFill(); }, true); });
    dl('roSave', function () {
      confirmBox(ro('m_save'), ro('m_save_b').replace('{n}', rosDirty()), function (note, done) {
        var cells = Object.keys(R.edits).map(function (k) { var p = k.split('|'); return [p[0], p[1], R.edits[k]]; });
        var emps = Object.keys(R.newEmps).map(function (id) { return [id, R.newEmps[id].name, R.newEmps[id].team]; });
        api('rosterSave', { cells: cells, emps: emps, note: note }).then(function (j) {
          done(); toast(ro('r_saved').replace('{n}', j.changed || 0));
          if (st.rst) st.rst.at = 0;
          renderRos();
        }).catch(function (e) { done(errText(e)); });
      });
    });
    dl('roUndo', function () {
      confirmBox(ro('m_undo'), ro('m_undo_b'), function (note, done) {
        api('rosterUndo', {}).then(function () { done(); toast(ro('r_undone')); if (st.rst) st.rst.at = 0; renderRos(); }).catch(function (e) { done(errText(e)); });
      }, true);
    });
    var fi = document.getElementById('roFile');
    if (fi) fi.onchange = function () { var f = fi.files[0]; fi.value = ''; if (f) rosUpload(f); };
  }

  /* تعبئة الشهر من نمط كل موظف: يحدد طول الدورة (7–14 يوم) من آخر 4 أسابيع ويكمل */
  function rosFill() {
    var R = st.ros, J = R.data, rg = rosRange(R.month), mStart = R.month + '-01', end = monthEnd(R.month);
    var histDates = rangeDates(dAdd(mStart, -28), dAdd(mStart, -1)), mDates = rangeDates(mStart, end), filled = 0, miss = [];
    var kind = function (c) { if (!c) return null; var s = R.shiftMap[c]; if (!s) return null; var k = String(s.kind).toUpperCase(); return k === 'OFF' ? 'O' : k === 'LEAVE' ? null : 'W'; };
    rosIds().forEach(function (id) {
      var seq = histDates.map(function (d) { return kind(rosVal(id, d)); });
      var known = seq.filter(function (x) { return x; }).length;
      if (known < 10) { if (mDates.some(function (d) { return !rosVal(id, d); })) miss.push(rosName(id)); return; }
      var best = 0, bestErr = 1e9;
      for (var p = 7; p <= 14; p++) {
        var err = 0, cmp = 0;
        for (var i = p; i < seq.length; i++) if (seq[i] && seq[i - p]) { cmp++; if (seq[i] !== seq[i - p]) err++; }
        if (cmp >= 8 && err < bestErr) { bestErr = err; best = p; }
      }
      if (!best || bestErr > 2) { miss.push(rosName(id)); return; }
      var cnt = {}; histDates.slice(-14).forEach(function (d) { var c = rosVal(id, d), s = R.shiftMap[c]; if (s && String(s.kind).toUpperCase() === 'WORK') cnt[c] = (cnt[c] || 0) + 1; });
      var work = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || rosEmp(id).def || '';
      var offCode = (J.shifts.filter(function (s) { return String(s.kind).toUpperCase() === 'OFF'; })[0] || {}).code || 'X';
      var full = seq.slice();
      mDates.forEach(function (d) {
        var t = full.length, k = full[t - best];
        for (var back = 2; !k && t - back * best >= 0; back++) k = full[t - back * best];
        var cur = rosVal(id, d);
        full.push(kind(cur) || k || null);
        if (!cur && k && work) { rosSet(id, d, k === 'O' ? offCode : work); filled++; }
      });
    });
    R.msgs = [['ok', ro('r_filled').replace('{n}', filled)]];
    if (miss.length) R.msgs.push(['warn', ro('r_nopat').replace('{names}', miss.join('، '))]);
    rosDraw();
  }

  /* رفع ملف Excel: نفس شكل الروستر الشهري (أقسام Department: ، صف ID/STAFF/التواريخ) أو شكل تبويب Roster */
  function rosUpload(file) {
    var R = st.ros;
    if (rosDirty() && !window.confirm(ro('r_unsaved_leave'))) return;
    file.arrayBuffer().then(MBCO_XLSX.read).then(function (wb) {
      var parsed = rosParse(wb.sheets[0].rows);
      if (!parsed.rows.length || !parsed.dates.length) throw new Error('badfile');
      var months = {}; parsed.dates.forEach(function (d) { months[d.slice(0, 7)] = (months[d.slice(0, 7)] || 0) + 1; });
      var target = Object.keys(months).sort(function (a, b) { return months[b] - months[a]; })[0];
      var go = function () {
        var n = 0, emps = {}, newOnes = [];
        parsed.rows.forEach(function (r) {
          if (!R.rowMap[r.id]) { R.newEmps[r.id] = { name: r.name, team: r.team }; }
          if (!R.empMap[r.id]) newOnes.push(r.name + ' (' + r.id + ')');
          parsed.dates.forEach(function (d) {
            if (!(d in r.codes)) return;
            var v = r.codes[d];
            if (v !== rosVal(r.id, d) || !R.rowMap[r.id]) { rosSet(r.id, d, v); n++; emps[r.id] = 1; }
          });
        });
        R.msgs = [['ok', ro('r_loaded').replace('{n}', n).replace('{e}', Object.keys(emps).length).replace('{d}', parsed.dates.length) + ' · ' + file.name]];
        if (newOnes.length) R.msgs.push(['warn', ro('r_newemps').replace('{names}', newOnes.join('، '))]);
        rosDraw();
      };
      if (target !== R.month || parsed.dates[0] < rosRange(target).hist) {
        R.month = target;
        var rg = rosRange(target), from = parsed.dates[0] < rg.hist ? parsed.dates[0] : rg.hist;
        return api('rosterGet', { from: from, to: rg.to }).then(function (j) {
          R.data = j; R.edits = {}; R.newEmps = {};
          R.rowMap = {}; j.rows.forEach(function (r) { R.rowMap[r.id] = r; });
          R.empMap = {}; j.emps.forEach(function (e) { R.empMap[e.id] = e; });
          R.shiftMap = {}; j.shifts.forEach(function (s) { R.shiftMap[s.code] = s; });
          go();
        });
      }
      go();
    }).catch(function (e) {
      R.msgs = [['bad', String(e && e.message) === 'badfile' || /xlsx|zip/.test(String(e && e.message)) ? ro('r_badfile') : errText(e)]];
      rosDraw();
    });
  }
  function rosParse(rows) {
    var X = MBCO_XLSX, out = { dates: [], rows: [] }, dset = {}, team = '', cols = null;
    var code = function (v) { if (v === null || v === undefined) return ''; if (typeof v === 'number') return String(Math.round(v)); return String(v).trim().toUpperCase(); };
    var teamOf = function (s) { s = String(s || ''); return /office|admin|إدار/i.test(s) ? 'ADM' : /enforce|ticket|تذاكر|فحص/i.test(s) ? 'ENF' : /station|محط/i.test(s) ? 'STN' : (/^(ADM|ENF|STN)$/.test(s.trim()) ? s.trim() : ''); };
    var asDate = function (v) {
      if (typeof v === 'number' && v > 40000 && v < 80000) return X.fromSerial(v);
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
      return '';
    };
    rows.forEach(function (r) {
      if (!r) return;
      var b = String(r[1] === undefined || r[1] === null ? '' : r[1]).trim(), a = String(r[0] === undefined || r[0] === null ? '' : r[0]).trim();
      if (/^department/i.test(b)) { team = teamOf(r[3]) || team; return; }
      if (/^id$/i.test(b) || /^emp_id$/i.test(a)) {         // صف العناوين: التواريخ
        var start = /^emp_id$/i.test(a) ? 3 : 5; cols = [];
        for (var c = start; c < r.length; c++) { var d = asDate(r[c]); if (d) { cols.push([c, d]); if (!dset[d]) { dset[d] = 1; out.dates.push(d); } } }
        cols.idCol = /^emp_id$/i.test(a) ? 0 : 1; cols.nameCol = cols.idCol + 1; cols.teamCol = /^emp_id$/i.test(a) ? 2 : -1;
        return;
      }
      if (!cols) return;
      var idv = r[cols.idCol], id = String(idv === undefined || idv === null ? '' : idv).replace(/\.0+$/, '').replace(/\D/g, '');
      if (!id || id.length < 3 || !String(r[cols.nameCol] || '').trim()) return;
      var codes = {}; cols.forEach(function (p) { codes[p[1]] = code(r[p[0]]); });
      out.rows.push({ id: id, name: String(r[cols.nameCol]).trim(), team: cols.teamCol >= 0 ? teamOf(r[cols.teamCol]) : team, codes: codes });
    });
    out.dates.sort();
    return out;
  }


  /* نسخة HR بدون إجازات: يوم الإجازة يرجع لوردية الموظف أو الأوف حسب نمط دوامه (دورة 7–14 يوم) */
  function rosHrCode(id, d, cache) {
    var R = st.ros;
    if (!cache[id]) {
      var all = rangeDates(rosRange(R.month).hist, monthEnd(R.month));
      var kindOf = function (c) { var s = R.shiftMap[c]; if (!c || !s) return null; var k = String(s.kind).toUpperCase(); return k === 'OFF' ? 'O' : k === 'LEAVE' ? null : 'W'; };
      var seq = all.map(function (x) { return kindOf(rosVal(id, x)); });
      var best = 0, bestErr = 1e9;
      for (var p = 7; p <= 14; p++) {
        var err = 0, cmp = 0;
        for (var i = p; i < seq.length; i++) if (seq[i] && seq[i - p]) { cmp++; if (seq[i] !== seq[i - p]) err++; }
        if (cmp >= 5 && err / cmp <= 0.25 && err / cmp < bestErr) { bestErr = err / cmp; best = p; }
      }
      var cnt = {}; all.forEach(function (x) { var c = rosVal(id, x), sh = R.shiftMap[c]; if (sh && String(sh.kind).toUpperCase() === 'WORK') cnt[c] = (cnt[c] || 0) + (x.slice(0, 7) === R.month ? 3 : 1); });
      var work = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || rosEmp(id).def || '';
      var off = (R.data.shifts.filter(function (x) { return String(x.kind).toUpperCase() === 'OFF'; })[0] || {}).code || 'X';
      cache[id] = { all: all, seq: seq, p: best, work: work, off: off };
    }
    var C = cache[id], c = rosVal(id, d), sh = R.shiftMap[c];
    if (!c || !sh || String(sh.kind).toUpperCase() !== 'LEAVE') return c;
    var t = C.all.indexOf(d), k = null;
    if (C.p && t >= 0) for (var n = 1; !k && n <= 6; n++) k = C.seq[t - n * C.p] || C.seq[t + n * C.p] || null;
    // أقرب وردية عمل قبل الإجازة (لو تغيّرت الوردية خلال الشهر)
    var w = C.work;
    for (var b = t - 1; b >= 0; b--) { var cb = rosVal(id, C.all[b]), sb = R.shiftMap[cb]; if (sb && String(sb.kind).toUpperCase() === 'WORK') { w = cb; break; } }
    return k === 'O' ? C.off : (w || C.off);
  }

  /* تنزيل: نسخة التشغيل (نفس شكل ملف الروستر الشهري) أو نسخة HR (أكواد HR والتقويم الميلادي للشهر) */
  function rosExport(kind) {
    var R = st.ros, J = R.data, m = R.month, y = m.slice(0, 4), mi = +m.slice(5, 7) - 1, X = MBCO_XLSX;
    var ids = rosIds(), byTeam = {};
    ids.forEach(function (id) { var t = rosTeam(id) || 'STN'; (byTeam[t] = byTeam[t] || []).push(id); });
    var teams = TEAM_ORDER.filter(function (t) { return byTeam[t]; }).concat(Object.keys(byTeam).filter(function (t) { return TEAM_ORDER.indexOf(t) < 0; }));
    var nameEn = function (id) { var e = rosEmp(id), row = R.rowMap[id], ne = R.newEmps[id]; return (row && row.name) || e.en || (ne && ne.name) || id; };
    var P = '#7B1E8F', HEAD = { b: true, fill: P, color: '#FFFFFF', h: 'center', border: 1 }, CELL = { h: 'center', border: 1 };
    var colorOf = function (c) { var s = R.shiftMap[c]; return s && s.color ? s.color : null; };
    var blob, fname;
    if (kind === 'ops') {
      var dates = rangeDates(prevMonth(m) + '-27', monthEnd(m)), last = 4 + dates.length, L = X.colName(last);
      var rows = [], merges = [], heights = { 1: 40 };
      rows.push([{ v: 'ENFORCEMENT ' + MONF[mi] + ' ROSTER  ' + y, s: { b: true, sz: 24, fill: '#EDE3F3', color: P, h: 'center', border: 'medium' } }]);
      merges.push('A1:' + L + '1');
      teams.forEach(function (tm) {
        var r0 = rows.length + 1;
        var head = [{ v: 'SR', s: HEAD }, { v: 'Department:', s: HEAD }, { v: '', s: HEAD }, { v: TEAM_SHEET[tm] || tm, s: { b: true, sz: 14, fill: P, color: '#FFFFFF', h: 'center', border: 1 } }, { v: '', s: HEAD }, { v: MONF[mi], s: { b: true, sz: 14, fill: '#D9C6E8', color: P, h: 'center', border: 1 } }];
        for (var c = 6; c <= last; c++) head.push({ v: '', s: HEAD });
        rows.push(head); merges.push('B' + r0 + ':C' + r0, 'D' + r0 + ':E' + r0, 'F' + r0 + ':' + L + r0);
        var dow = ['', '', '', '', ''].map(function () { return { v: '', s: HEAD }; });
        dates.forEach(function (d) { var w = rDow(d); dow.push({ v: DOW2[w], s: { b: true, fill: w === 5 || w === 6 ? '#D9C6E8' : '#EDE3F3', color: P, h: 'center', border: 1 } }); });
        rows.push(dow);
        var hd = [{ v: '', s: HEAD }, { v: 'ID', s: HEAD }, { v: 'STAFF', s: HEAD }, { v: 'Position', s: HEAD }, { v: 'Note', s: HEAD }];
        dates.forEach(function (d) { hd.push({ v: X.toSerial(d), s: { b: true, fill: d.slice(0, 7) === m ? P : '#9E7BB0', color: '#FFFFFF', h: 'center', border: 1, fmt: 'd' } }); });
        rows.push(hd);
        byTeam[tm].forEach(function (id, i) {
          var e = rosEmp(id), line = [{ v: i + 1, s: CELL }, { v: Number(id), s: CELL }, { v: nameEn(id), s: { border: 1 } }, { v: e.position || '', s: { border: 1 } }, { v: e.task || '', s: { border: 1 } }];
          dates.forEach(function (d) { var c = rosVal(id, d), col = colorOf(c); line.push({ v: /^\d+$/.test(c) ? Number(c) : c, s: col ? { h: 'center', border: 1, fill: col, b: c === 'AL' } : CELL }); });
          rows.push(line);
        });
      });
      rows.push([]);
      var lg = rows.length + 1;
      rows.push(['', { v: 'Code', s: HEAD }, { v: 'Shift', s: HEAD }, { v: 'From', s: HEAD }, { v: 'To', s: HEAD }]);
      J.shifts.forEach(function (s) { rows.push(['', { v: /^\d+$/.test(s.code) ? Number(s.code) : s.code, s: { h: 'center', border: 1, fill: s.color || null, b: true } }, { v: s.name, s: { border: 1 } }, { v: s.start, s: CELL }, { v: s.end, s: CELL }]); });
      var cols = [5, 9, 28, 30, 30]; dates.forEach(function () { cols.push(4.6); });
      blob = X.write([{ name: MON3[mi] + ' Roster', cols: cols, rows: rows, merges: merges, heights: heights, freeze: 'F1' }]);
      fname = MON3[mi] + '_' + y + '_Roster.xlsx';
    } else {
      var hd2 = rangeDates(m + '-01', monthEnd(m)), hr = J.hr || {}, hrCache = {};
      var rows2 = [[{ v: 'SR', s: HEAD }, { v: 'ID', s: HEAD }, { v: 'STAFF', s: HEAD }].concat(hd2.map(function (d) { return { v: X.toSerial(d), s: { b: true, fill: P, color: '#FFFFFF', h: 'center', border: 1, fmt: 'dd/mm' } }; }))];
      var sr = 0;
      teams.forEach(function (tm) {
        byTeam[tm].forEach(function (id) {
          sr++;
          var line = [{ v: sr, s: CELL }, { v: Number(id), s: CELL }, { v: nameEn(id), s: { border: 1 } }];
          hd2.forEach(function (d) {
            var c = rosHrCode(id, d, hrCache), v = hr[c] !== undefined ? hr[c] : c;
            line.push({ v: /^\d+$/.test(String(v)) ? Number(v) : v, s: CELL });
          });
          rows2.push(line);
        });
      });
      var cols2 = [5, 9, 28]; hd2.forEach(function () { cols2.push(6); });
      blob = X.write([{ name: MON3[mi] + ' HR', cols: cols2, rows: rows2, freeze: 'D2' }]);
      fname = MON3[mi] + '_' + y + '_HR_Roster.xlsx';
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fname;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }


  /* ================= توزيع الموظفين (v1.9) =================
     هل الموظف ثابت في نفس الموقع ولا يتنقل؟ المطلوب إنهم يتنقلون. */
  var DT = {
    ar: { d7: 'آخر 7 أيام', d14: 'آخر 14 يوم', dm: 'هذا الشهر', custom: 'فترة مخصصة', fixed: 'ثابت', rotating: 'يتنقل', few: 'ورديات قليلة',
      all_states: 'كل الحالات', places: 'المواقع في الفترة', emp: 'الموظف', shifts: 'الورديات', locs: 'المواقع واستلاماته', top: 'أكثر موقع', last: 'آخر الاستلامات (الأقدم ← الأحدث)',
      state: 'الحالة', streak: 'متتالي', items: 'بنود التوزيع', show_items: 'عرض كل بنود التوزيع', hide_items: 'إخفاء بنود التوزيع',
      hint: '«ثابت» = أكثر من 70% من وردياته في نفس الموقع، أو آخر 3 ورديات متتالية بنفس الموقع. مسؤول الوردية (TL) ما يُحسب ثابت.', none: 'لا توجد توزيعات في هذه الفترة', times: 'مرة' },
    en: { d7: 'Last 7 days', d14: 'Last 14 days', dm: 'This month', custom: 'Custom', fixed: 'Fixed', rotating: 'Rotating', few: 'Few shifts',
      all_states: 'All states', places: 'Locations in period', emp: 'Employee', shifts: 'Shifts', locs: 'Locations & count', top: 'Top location', last: 'Recent assignments (oldest → newest)',
      state: 'State', streak: 'in a row', items: 'Distribution items', show_items: 'Show all distribution items', hide_items: 'Hide distribution items',
      hint: '"Fixed" = over 70% of shifts at one location, or the last 3 shifts in a row at the same location. Shift lead (TL) is not counted as fixed.', none: 'No distributions in this period', times: 'x' }
  };
  function dt(k) { return (DT[st.lang] && DT[st.lang][k]) || DT.ar[k] || k; }
  var PLACE_COLORS = ['#EDE3F3', '#FBE3D3', '#D7EDE3', '#DCE8F7', '#F6E7B8', '#F4D3DC', '#E3E7EC', '#D9C6E8', '#CDEBDD', '#FDE7C8'];

  function renderDist(wrap) {
    var D = st.dist || (st.dist = { per: 'd7', team: 'ALL', state: '', q: '', items: false, from: '', to: '' });
    var td = todayStr();
    if (D.per === 'd7') { D.from = dAdd(td, -6); D.to = td; }
    else if (D.per === 'd14') { D.from = dAdd(td, -13); D.to = td; }
    else if (D.per === 'dm') { D.from = td.slice(0, 8) + '01'; D.to = td; }
    wrap.innerHTML = '<div class="card rsttools noprint"><div class="seg sub">' + ['d7', 'd14', 'dm', 'custom'].map(function (p) { return '<button type="button" data-per="' + p + '" class="' + (D.per === p ? 'on' : '') + '">' + dt(p) + '</button>'; }).join('') + '</div>' +
      '<div class="rstctl">' + (D.per === 'custom' ? '<label class="field">' + t('from') + '<input class="input num" type="date" id="dFrom" value="' + D.from + '"></label><label class="field">' + t('to') + '<input class="input num" type="date" id="dTo" value="' + D.to + '"></label>' : '') +
      '<div class="seg teams">' + [['ALL', 'all'], ['STN', 'stn'], ['ENF', 'enf']].map(function (x) { return '<button type="button" data-dteam="' + x[0] + '" class="' + (D.team === x[0] ? 'on' : '') + '">' + rt(x[1]) + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="btn sm" id="dRef">' + icon('refresh') + rt('refresh') + '</button></div></div><div id="distBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div>';
    wrap.querySelectorAll('[data-per]').forEach(function (b) { b.onclick = function () { D.per = b.getAttribute('data-per'); renderDist(wrap); }; });
    wrap.querySelectorAll('[data-dteam]').forEach(function (b) { b.onclick = function () { D.team = b.getAttribute('data-dteam'); wrap.querySelectorAll('[data-dteam]').forEach(function (x) { x.classList.toggle('on', x === b); }); distDraw(); }; });
    var f = document.getElementById('dFrom'), tt = document.getElementById('dTo');
    if (f) f.onchange = tt.onchange = function () { if (f.value && tt.value) { D.from = f.value; D.to = tt.value; distLoad(true); } };
    document.getElementById('dRef').onclick = function () { distLoad(true); };
    distLoad(false);
  }
  function distLoad(force) {
    var D = st.dist, ck = D.from + '|' + D.to;
    if (D.data && D.key === ck && !force) return distDraw();
    setSync(true);
    api('section', { key: 'dist', from: D.from, to: D.to, fresh: !!force }).then(function (j) {
      D.data = j.data; D.key = ck; addDict(j.data.dict);
      if (route() === 'dist') distDraw();
    }).catch(function (e) { var b = document.getElementById('distBody'); if (b) failBox(b, e, function () { distLoad(true); }); }).then(function () { setSync(false); });
  }
  function distDraw() {
    var D = st.dist, b = document.getElementById('distBody'); if (!b || !D.data) return;
    var A = D.data.dist || { emps: [], places: [] }, L = st.lang === 'en', q = (D.q || '').toLowerCase();
    var colorMap = {}; A.places.forEach(function (p, i) { colorMap[p.p] = PLACE_COLORS[i % PLACE_COLORS.length]; });
    var chip = function (p, extra) { return '<span class="pchip" style="background:' + (colorMap[p] || '#eee') + '">' + esc(tr(p)) + (extra || '') + '</span>'; };
    var emps = A.emps.filter(function (e) {
      return (D.team === 'ALL' || e.team === D.team) && (!D.state || e.state === D.state) && (!q || (e.name + ' ' + e.name_en + ' ' + e.emp_id).toLowerCase().indexOf(q) >= 0);
    });
    var tm = function (e) { return D.team === 'ALL' || e.team === D.team; };
    var mx = A.places.length ? A.places[0].n : 1;
    var h = '<p class="muted rmeta">' + rDmy(D.data.from) + ' ← ' + rDmy(D.data.to) + ' · ' + esc(dt('hint')) + '</p>' +
      '<div class="kpis k4">' + D.data.kpis.map(function (k) { return '<div class="kpi ' + (k.tone || '') + '"><span class="l">' + esc(tr(k.label)) + '</span><span class="v num">' + fmtN(k.value) + '</span></div>'; }).join('') + '</div>';
    if (!A.emps.length) return (b.innerHTML = h + '<div class="card muted">' + dt('none') + '</div>');
    h += '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + dt('places') + '</h2></div><div class="pbars">' +
      A.places.map(function (p) { return '<div class="rbar"><span class="lb">' + chip(p.p) + '</span><span class="tr"><i style="width:' + Math.round(p.n / mx * 100) + '%;background:var(--accent)"></i></span><b class="num">' + p.n + '</b></div>'; }).join('') + '</div></section>';
    h += '<div class="toolbar"><select class="input" id="dState"><option value="">' + dt('all_states') + '</option><option value="fixed"' + (D.state === 'fixed' ? ' selected' : '') + '>⚠️ ' + dt('fixed') + '</option><option value="rotating"' + (D.state === 'rotating' ? ' selected' : '') + '>🔄 ' + dt('rotating') + '</option><option value="few"' + (D.state === 'few' ? ' selected' : '') + '>' + dt('few') + '</option></select>' +
      '<input class="input" type="search" id="dQ" placeholder="' + esc(rt('search')) + '" value="' + esc(D.q) + '"><span class="muted"><span class="num">' + emps.length + '</span> / ' + A.emps.filter(tm).length + '</span></div>';
    h += '<div class="tblwrap rtbl"><table class="tbl twrap"><thead><tr><th>' + dt('emp') + '</th><th>' + dt('shifts') + '</th><th>' + dt('locs') + '</th><th>' + dt('top') + '</th><th>' + dt('last') + '</th><th>' + dt('state') + '</th></tr></thead><tbody>' +
      (emps.map(function (e) {
        var badge = e.state === 'fixed' ? '<span class="tag b-warn">⚠️ ' + dt('fixed') + '</span>' : e.state === 'rotating' ? '<span class="tag b-ok">🔄 ' + dt('rotating') + '</span>' : '<span class="tag b-mu">' + dt('few') + '</span>';
        return '<tr' + (e.state === 'fixed' ? ' class="dfix"' : '') + '><td><b>' + esc(L && e.name_en ? e.name_en : e.name) + '</b> <span class="muted num">' + esc(e.emp_id) + '</span><div class="muted">' + esc(rTeam(e.team)) + '</div></td>' +
          '<td class="num b">' + e.shifts + '</td><td><div class="pchips">' + e.locs.map(function (l) { return chip(l.p, ' <b class="num">×' + l.n + '</b>'); }).join('') + '</div></td>' +
          '<td>' + esc(tr(e.top)) + '<div class="sharebar"><i style="width:' + e.share + '%"></i></div><span class="muted num">' + e.share + '%' + (e.streak >= 2 ? ' · ' + e.streak + ' ' + dt('streak') : '') + '</span></td>' +
          '<td><div class="tline">' + e.timeline.slice(-7).map(function (x) { return '<span class="tdot" style="background:' + (colorMap[x.p] || '#eee') + '" title="' + esc(x.d + ' · ' + rt('shift') + ' ' + x.s + ' · ' + tr(x.p)) + '"><small class="num">' + x.d.slice(8) + '</small>' + esc(tr(x.p)) + '</span>'; }).join('') + '</div></td><td>' + badge + '</td></tr>';
      }).join('') || '<tr><td colspan="6" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>';
    h += '<div><button type="button" class="btn sm" id="dItems">' + (D.items ? dt('hide_items') : dt('show_items')) + '</button> <button type="button" class="btn sm" id="dCsv">' + icon('download') + t('export') + '</button></div>';
    if (D.items) {
      var rows = D.data.rows.filter(function (r) { return D.team === 'ALL' || r.team_code === D.team; });
      h += '<div class="tblwrap rtbl"><table class="tbl"><thead><tr>' + D.data.columns.map(function (c) { return '<th>' + esc(L ? c.en : c.ar) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rows.slice(0, 600).map(function (r) { return '<tr>' + D.data.columns.map(function (c) { var v = r[c.key]; return '<td>' + (v === '' || v === undefined ? '<span class="muted">—</span>' : /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? '<span class="ltr">' + esc(v) + '</span>' : esc(tr(v))) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    }
    b.innerHTML = h;
    var s = document.getElementById('dState'); s.onchange = function () { D.state = s.value; distDraw(); };
    var qq = document.getElementById('dQ'); qq.oninput = function () { D.q = qq.value; var pos = qq.selectionStart; distDraw(); var n = document.getElementById('dQ'); n.focus(); n.setSelectionRange(pos, pos); };
    document.getElementById('dItems').onclick = function () { D.items = !D.items; distDraw(); };
    document.getElementById('dCsv').onclick = function () {
      var qv = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var out = [[dt('emp'), 'ID', rt('team'), dt('shifts'), dt('top'), '%', dt('state'), dt('locs')].map(qv).join(',')].concat(emps.map(function (e) {
        return [L && e.name_en ? e.name_en : e.name, e.emp_id, rTeam(e.team), e.shifts, tr(e.top), e.share, dt(e.state), e.locs.map(function (l) { return tr(l.p) + ' ×' + l.n; }).join(' | ')].map(qv).join(',');
      })).join('\r\n');
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + out], { type: 'text/csv;charset=utf-8' }));
      a.download = 'MBCO_distribution_' + D.data.from + '_' + D.data.to + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 500);
    };
  }


  /* ================= إدارة الأسطول (Carlog) داخل البوابة (v2.0) ================= */
  var CT = {
    ar: {
      overview: 'نظرة عامة', log: 'السجل', faults: 'الأعطال', maint: 'الصيانة', emps: 'أداء الموظفين', daily: 'التقرير اليومي',
      from: 'من', to: 'إلى', rec: 'استلام', hnd: 'تسليم', km: 'كيلومتر', usage: 'ساعات الاستخدام', peer: 'استلام من زميل بدون تسليم', fnew: 'بلاغات أعطال جديدة', fopen: 'بلاغات مفتوحة الآن',
      now: 'حالة المركبات الآن', with: 'مع', since: 'منذ', lastodo: 'آخر عداد', kmp: 'كم في الفترة', usep: 'الاستخدام في الفترة', uses: 'عدد العهدات', openf: 'بلاغات مفتوحة',
      dues: 'الصيانات القادمة', nodues: 'لا توجد مواعيد مسجلة', over_by: 'تجاوزت الموعد بـ {n} كم', left: 'باقي {n} كم', at: 'عند {n}',
      inmaint: '🔧 في الصيانة', down: '🔴 متوقفة', warnf: '🟡 بلاغ قائم', okc: '🟢 سليمة', inuse: 'مستخدمة', office: 'في المكتب',
      km_by_v: 'الكيلومترات حسب المركبة', use_by_t: 'ساعات الاستخدام حسب الفريق',
      id: 'الرقم', veh: 'المركبة', emp: 'الموظف', team: 'الفريق', shift: 'الوردية', recv: 'الاستلام', handv: 'التسليم', dur: 'المدة', odo: 'العداد', kmc: 'كم', cond: 'الحالة', method: 'طريقة الإغلاق', act: 'إجراء',
      open: 'مفتوحة', manual: 'سجل يدوي', to_peer: 'إلى {n}', all_v: 'كل المركبات', all_t: 'كل الفرق', search: 'بحث بالاسم أو الرقم',
      cancel: 'إلغاء استلام خاطئ', close_adm: 'إغلاق إداري', close_f: 'إغلاق البلاغ',
      m_cancel: 'إلغاء استلام خاطئ', m_cancel_b: 'العهدة {id} ({plate} – {emp}، عداد {odo}) تنحذف، وتنحفظ نسخة منها في تبويب CancelledHandovers. لو انقفلت عهدة قبلها بسبب هذا الاستلام، ترجع مفتوحة عند صاحبها مثل ما كانت. العداد ومواعيد الزيت ترجع تنحسب صح.',
      m_close: 'إغلاق العهدة إدارياً', m_close_b: '{plate} مع {emp} من {since}. اكتب عداد التسليم إذا تعرفه (اختياري).', odo_ph: 'عداد التسليم (اختياري)',
      m_fault: 'إغلاق بلاغ العطل', m_fault_b: '{id} · {plate} · {type}. اكتب الإجراء المتخذ.', note_req: 'الإجراء المتخذ',
      reason_ph: 'السبب (مثلاً: اختار 6755 بدل 6768)', done_cancel: 'تم الإلغاء ✓', restored: 'ورجعت العهدة {id} مفتوحة عند {emp}',
      fault: 'العطل', sev: 'الخطورة', reporter: 'المبلّغ', time: 'الوقت', fdur: 'مدة البلاغ', fact: 'الإجراء', run: '🟡 تعمل', stop: '🔴 متوقفة', fo: 'مفتوح', fc: 'مغلق',
      f_new: 'بلاغات جديدة في الفترة', f_closed: 'أُغلقت في الفترة', f_by_v: 'البلاغات حسب المركبة', f_down: 'مدة التوقف (بلاغات متوقفة)',
      mtype: 'نوع الصيانة', mstate: 'الحالة', min: 'الدخول', mout: 'الخروج', mdown: 'مدة التوقف', mnext: 'الصيانة القادمة', mnote: 'الورشة / ما تم', mby: 'بواسطة',
      m_in: '🔧 في الصيانة', m_past: 'مسجلة سابقاً', m_done: 'انتهت', nodown: 'بدون توقف', after: 'بعد {n} كم',
      m_range: 'صيانات في الفترة', m_downr: 'توقف بسبب الصيانة في الفترة', m_now: 'في الصيانة الآن', m_over: 'صيانات متجاوزة', m_warn: 'باقي أقل من {n} كم',
      m_sum: 'ملخص كل مركبة (كل السجل)', m_cur: 'العداد الحالي', m_cnt: 'عدد الصيانات', m_tot: 'إجمالي التوقف للصيانة', m_last: 'آخر صيانة', m_log: 'سجل الصيانات (كل الفترات)', dl_log: 'تحميل الكارلوق',
      rq_t: 'طلب صيانة رسمي (نموذج NRV + كارلوق)', rq_v: 'المركبة', rq_m: 'العداد', rq_e: 'الطالب', rq_p: 'الجوال', rq_items: 'اختر حتى 9 بنود:', rq_btn: 'تجهيز النموذج والكارلوق', rq_wait: 'جارٍ التجهيز… (ممكن ياخذ نص دقيقة)',
      rq_max: 'الحد الأقصى 9 بنود', rq_none: 'اختر بند واحد على الأقل', rq_last: 'آخر الطلبات:', rq_wait_s: 'بانتظار الموعد', rq_in: 'دخلت الصيانة', rq_tpl: 'لتفعيل طلب الصيانة الرسمي: اربط ملف القوالب (TEMPLATE_ID) في نظام Carlog.',
      e_name: 'الموظف', e_id: 'الرقم', e_uses: 'العهدات', e_avg: 'متوسط العهدة', e_notes: 'ملاحظات عند الاستلام', e_faults: 'بلاغات أعطال', e_peer: 'لم يسلّم بنفسه',
      e_hint: '«لم يسلّم بنفسه» = عهدات انقفلت لأن زميل استلم المركبة منه مباشرة بدون ما يسجل هو التسليم.',
      d_title: 'التقرير اليومي – تسليم واستلام السيارات', d_sub: 'اليوم التشغيلي {d} من 07:00 حتى 07:00 اليوم التالي', d_day: 'التاريخ', d_show: 'عرض', print: 'طباعة / PDF',
      d_sum: 'ملخص المركبات', d_rate: 'نسبة الاستخدام', d_kmt: 'الكيلومترات حسب الفريق', d_use: 'نسبة استخدام المركبات', d_log: 'سجل العهدات', d_notes: 'الملاحظات', d_foot: 'MBCO – نظام تسليم واستلام السيارات', none: 'لا توجد بيانات',
      a_maint: '🔧 {p} في الصيانة الآن ({t}) منذ {s}', a_due: '{p} – {n}: {txt} (الموعد {d} كم)', h: 'س', m: 'د', ok: 'سليمة', note_k: 'استلام', note_h: 'تسليم'
    },
    en: {
      overview: 'Overview', log: 'Log', faults: 'Faults', maint: 'Maintenance', emps: 'Staff performance', daily: 'Daily report',
      from: 'From', to: 'To', rec: 'Pick-ups', hnd: 'Returns', km: 'Kilometres', usage: 'Usage hours', peer: 'Taken from colleague without return', fnew: 'New fault reports', fopen: 'Open faults now',
      now: 'Vehicles now', with: 'With', since: 'Since', lastodo: 'Last odometer', kmp: 'km in period', usep: 'Usage in period', uses: 'Custodies', openf: 'Open faults',
      dues: 'Upcoming maintenance', nodues: 'No schedules recorded', over_by: 'Overdue by {n} km', left: '{n} km left', at: 'at {n}',
      inmaint: '🔧 In maintenance', down: '🔴 Stopped', warnf: '🟡 Open report', okc: '🟢 OK', inuse: 'In use', office: 'At office',
      km_by_v: 'Kilometres by vehicle', use_by_t: 'Usage hours by team',
      id: 'No.', veh: 'Vehicle', emp: 'Employee', team: 'Team', shift: 'Shift', recv: 'Pick-up', handv: 'Return', dur: 'Duration', odo: 'Odometer', kmc: 'km', cond: 'Condition', method: 'Close method', act: 'Action',
      open: 'Open', manual: 'Manual record', to_peer: 'to {n}', all_v: 'All vehicles', all_t: 'All teams', search: 'Search name or ID',
      cancel: 'Cancel wrong pick-up', close_adm: 'Admin close', close_f: 'Close report',
      m_cancel: 'Cancel wrong pick-up', m_cancel_b: 'Custody {id} ({plate} – {emp}, odometer {odo}) is removed and a copy is kept in the CancelledHandovers tab. If an earlier custody was closed because of it, it is reopened with its holder as it was. Odometer and oil schedules are recalculated.',
      m_close: 'Close custody (admin)', m_close_b: '{plate} with {emp} since {since}. Enter the return odometer if known (optional).', odo_ph: 'Return odometer (optional)',
      m_fault: 'Close fault report', m_fault_b: '{id} · {plate} · {type}. Write the action taken.', note_req: 'Action taken',
      reason_ph: 'Reason (e.g. picked 6755 instead of 6768)', done_cancel: 'Cancelled ✓', restored: 'and custody {id} is open again with {emp}',
      fault: 'Fault', sev: 'Severity', reporter: 'Reported by', time: 'Time', fdur: 'Open for', fact: 'Action', run: '🟡 Running', stop: '🔴 Stopped', fo: 'Open', fc: 'Closed',
      f_new: 'New reports in period', f_closed: 'Closed in period', f_by_v: 'Reports by vehicle', f_down: 'Downtime (stopped reports)',
      mtype: 'Maintenance type', mstate: 'State', min: 'In', mout: 'Out', mdown: 'Downtime', mnext: 'Next maintenance', mnote: 'Workshop / work done', mby: 'By',
      m_in: '🔧 In maintenance', m_past: 'Recorded earlier', m_done: 'Done', nodown: 'No downtime', after: 'after {n} km',
      m_range: 'Maintenance in period', m_downr: 'Maintenance downtime in period', m_now: 'In maintenance now', m_over: 'Overdue', m_warn: 'Less than {n} km left',
      m_sum: 'Per-vehicle summary (all records)', m_cur: 'Current odometer', m_cnt: 'Maintenance count', m_tot: 'Total maintenance downtime', m_last: 'Last maintenance', m_log: 'Maintenance log (all periods)', dl_log: 'Download carlog',
      rq_t: 'Official maintenance request (NRV form + carlog)', rq_v: 'Vehicle', rq_m: 'Odometer', rq_e: 'Requested by', rq_p: 'Mobile', rq_items: 'Choose up to 9 items:', rq_btn: 'Prepare form & carlog', rq_wait: 'Preparing… (may take half a minute)',
      rq_max: 'Maximum 9 items', rq_none: 'Choose at least one item', rq_last: 'Recent requests:', rq_wait_s: 'Awaiting appointment', rq_in: 'Entered maintenance', rq_tpl: 'To enable the official request: link the templates file (TEMPLATE_ID) in the Carlog system.',
      e_name: 'Employee', e_id: 'ID', e_uses: 'Custodies', e_avg: 'Avg. custody', e_notes: 'Notes at pick-up', e_faults: 'Fault reports', e_peer: 'Did not return himself',
      e_hint: '"Did not return himself" = custodies closed because a colleague took the vehicle directly without the holder recording the return.',
      d_title: 'Daily report – vehicle handover', d_sub: 'Operating day {d} from 07:00 to 07:00 next day', d_day: 'Date', d_show: 'Show', print: 'Print / PDF',
      d_sum: 'Vehicle summary', d_rate: 'Usage rate', d_kmt: 'Kilometres by team', d_use: 'Vehicle usage rate', d_log: 'Custody log', d_notes: 'Notes', d_foot: 'MBCO – Vehicle handover system', none: 'No data',
      a_maint: '🔧 {p} in maintenance now ({t}) since {s}', a_due: '{p} – {n}: {txt} (due {d} km)', h: 'h', m: 'm', ok: 'OK', note_k: 'Pick-up', note_h: 'Return'
    }
  };
  function ct(k) { return (CT[st.lang] && CT[st.lang][k]) || CT.ar[k] || k; }
  var CAR_COL = ['#7B1E8F', '#eb6834', '#1baf7a'];
  var fCT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false });
  var fCD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' });
  function cTm(ms) { return ms ? fCT.format(new Date(ms)) : '—'; }
  function cDt(ms) { return ms ? '<span class="ltr">' + fCD.format(new Date(ms)).slice(5) + ' ' + cTm(ms) + '</span>' : '—'; }
  function cNum(n) { return Math.round(+n || 0).toLocaleString('en-US'); }
  function cDur(min) { min = Math.max(0, Math.round(min || 0)); var hh = Math.floor(min / 60), mm = min % 60; return hh ? hh + ct('h') + ' ' + mm + ct('m') : mm + ct('m'); }
  function cTeam(c) { return rTeam(c) || (st.car.d.teams || {})[c] || c || '—'; }
  function cPhoto(u) { return u ? '<a class="ph" href="' + esc(u) + '" target="_blank" rel="noopener">📷</a>' : ''; }
  function cName(n) { return st.lang === 'en' ? n : tr(n); }

  function renderCar(wrap, force) {
    var C = st.car || (st.car = { tab: ls.get('mbco_car_tab') || 'overview', from: '', to: '', fv: '', ft: '', q: '', mv: '', day: '' });
    if (!wrap.querySelector('#carBody')) {
      wrap.innerHTML = '<div class="card rsttools noprint"><div class="seg sub">' + ['overview', 'log', 'faults', 'maint', 'emps', 'daily'].map(function (k) { return '<button type="button" data-ctab="' + k + '" class="' + (C.tab === k ? 'on' : '') + '">' + ct(k) + '</button>'; }).join('') + '</div>' +
        '<div class="rstctl"><label class="field">' + ct('from') + '<input class="input num" type="date" id="cFrom" value="' + esc(C.from) + '"></label><label class="field">' + ct('to') + '<input class="input num" type="date" id="cTo" value="' + esc(C.to) + '"></label>' +
        '<button type="button" class="btn sm" id="cRef">' + icon('refresh') + rt('refresh') + '</button></div></div><div id="carBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div>';
      wrap.querySelectorAll('[data-ctab]').forEach(function (b) { b.onclick = function () { C.tab = b.getAttribute('data-ctab'); ls.set('mbco_car_tab', C.tab); wrap.querySelectorAll('[data-ctab]').forEach(function (x) { x.classList.toggle('on', x === b); }); carDraw(); }; });
      var f = document.getElementById('cFrom'), tt = document.getElementById('cTo');
      f.onchange = tt.onchange = function () { C.from = f.value; C.to = tt.value; renderCar(wrap, true); };
      document.getElementById('cRef').onclick = function () { renderCar(wrap, true); };
    }
    var ck = C.from + '|' + C.to;
    if (C.d && C.key === ck && !force && Date.now() - C.at < 60000) return carDraw();
    setSync(true);
    return api('carDash', { from: C.from, to: C.to, fresh: !!force }).then(function (j) {
      C.d = j.data; C.canAct = j.canAct; C.me = j.me; C.at = Date.now();
      C.from = C.d.from; C.to = C.d.to; C.key = C.from + '|' + C.to;
      var f = document.getElementById('cFrom'), tt = document.getElementById('cTo'); if (f) { f.value = C.from; tt.value = C.to; }
      if (route() === 'car') carDraw();
    }).catch(function (e) { var b = document.getElementById('carBody'); if (b && route() === 'car') failBox(b, e, function () { renderCar(wrap, true); }); })
      .then(function () { setSync(false); });
  }
  function carDraw() {
    var C = st.car, b = document.getElementById('carBody'); if (!b || !C.d) return;
    b.innerHTML = ({ overview: carOverview, log: carLog, faults: carFaults, maint: carMaint, emps: carEmps, daily: carDaily }[C.tab] || carOverview)();
    carBind(b);
  }

  /* التجميع (نفس حسابات لوحة Carlog) */
  function carAgg(d) {
    var ws = d.ws, we = d.we, now = d.now, L = d.labels, V = {}, T = {}, E = {}, notes = [], rec = 0, hnd = 0, km = 0, min = 0, peer = 0;
    var inW = function (x) { return x && x >= ws && x < we; };
    var clip = function (r) { return Math.max(0, (Math.min(r.end_time || now, we) - Math.max(r.start_time, ws)) / 60000); };
    d.vehicles.forEach(function (v) { V[v.vehicle_id] = { v: v, uses: 0, km: 0, min: 0 }; });
    d.handovers.forEach(function (r) {
      var vid = String(r.vehicle_id), x = V[vid] || (V[vid] = { v: { vehicle_id: vid, plate: r.plate || vid, state: 'in', cond: 'ok', faults: [], dues: [] }, uses: 0, km: 0, min: 0 });
      var k = inW(r.end_time) ? (+r.distance_km || 0) : 0, m = clip(r);
      x.uses++; x.km += k; x.min += m; km += k; min += m;
      if (inW(r.start_time)) rec++;
      if (inW(r.end_time)) { hnd++; if (r.close_method === L.peer) peer++; }
      var tm = r.team || '—'; T[tm] = T[tm] || { km: 0, min: 0, uses: 0 }; T[tm].km += k; T[tm].min += m; T[tm].uses++;
      var id = String(r.emp_id || r.emp_name), e = E[id] || (E[id] = { id: r.emp_id || '—', name: r.emp_name, team: r.team, uses: 0, km: 0, min: 0, notes: 0, peer: 0, faults: 0 });
      e.uses++; e.km += k; e.min += m;
      if (r.start_condition === L.note && inW(r.start_time)) { e.notes++; notes.push({ t: r.start_time, plate: r.plate, who: r.emp_name, kind: ct('note_k'), note: r.start_note }); }
      if (r.end_condition === L.note && inW(r.end_time)) notes.push({ t: r.end_time, plate: r.plate, who: r.end_emp_name, kind: ct('note_h'), note: r.end_note });
      if (r.close_method === L.peer && inW(r.end_time)) e.peer++;
    });
    var fNew = d.faults.filter(function (f) { return inW(f.start_time); });
    fNew.forEach(function (f) { var id = String(f.emp_id); (E[id] || (E[id] = { id: id, name: f.emp_name, team: f.team, uses: 0, km: 0, min: 0, notes: 0, peer: 0, faults: 0 })).faults++; });
    return { V: Object.keys(V).map(function (k) { return V[k]; }), T: T, E: Object.keys(E).map(function (k) { return E[k]; }), notes: notes.sort(function (a, b) { return a.t - b.t; }), rec: rec, hnd: hnd, km: km, min: min, peer: peer,
      fNew: fNew, fOpen: d.faults.filter(function (f) { return f.status === L.open; }), fClosed: d.faults.filter(function (f) { return inW(f.end_time); }), winMin: Math.max(1, (Math.min(we, now) - ws) / 60000) };
  }
  function cBars(items, fmt) {
    var mx = Math.max.apply(null, [1].concat(items.map(function (i) { return i.v; })));
    return items.map(function (i, n) { return '<div class="rbar"><span class="lb">' + esc(i.l) + '</span><span class="tr"><i style="width:' + (i.v / mx * 100).toFixed(1) + '%;background:' + CAR_COL[n % 3] + '"></i></span><b class="num">' + fmt(i.v) + '</b></div>'; }).join('') || '<p class="muted">' + ct('none') + '</p>';
  }
  function cKpis(A) {
    return '<div class="kpis k6">' + [[A.rec, 'rec'], [A.hnd, 'hnd'], [cNum(A.km), 'km'], [cDur(A.min), 'usage'], [A.peer, 'peer'], [A.fNew.length, 'fnew'], [A.fOpen.length, 'fopen', A.fOpen.length ? 'bad' : '']]
      .map(function (k) { return rKpi(ct(k[1]), k[0], k[2]); }).join('') + '</div>';
  }
  function cCond(v) {
    if (v.maint) return '<span class="tag b-bad">' + ct('inmaint') + '</span>';
    return (v.cond === 'down' ? '<span class="tag b-bad">' + ct('down') + '</span>' : v.cond === 'warn' ? '<span class="tag b-warn">' + ct('warnf') + '</span>' : '<span class="tag b-ok">' + ct('okc') + '</span>') +
      ' <span class="tag ' + (v.state === 'out' ? 'b-acc' : 'b-mu') + '">' + ct(v.state === 'out' ? 'inuse' : 'office') + '</span>';
  }
  function cDueTxt(x) { return x.rem <= 0 ? '⛔ ' + ct('over_by').replace('{n}', cNum(-x.rem)) : (x.level === 'warn' ? '⚠️ ' : '') + ct('left').replace('{n}', cNum(x.rem)); }
  function cDues(v) {
    if (!v.dues || !v.dues.length) return '<div class="cdues"><b>' + ct('dues') + '</b><p class="muted">' + ct('nodues') + '</p></div>';
    return '<div class="cdues"><b>' + ct('dues') + '</b>' + v.dues.map(function (x) { return '<div class="cdue ' + x.level + '"><span>' + esc(cName(x.name)) + '</span><span>' + cDueTxt(x) + ' · ' + ct('at').replace('{n}', cNum(x.due)) + '</span></div>'; }).join('') + '</div>';
  }
  function cAlerts(d) {
    var a = '';
    d.vehicles.forEach(function (v) {
      if (v.maint) a += '<div class="romsg">' + esc(ct('a_maint').replace('{p}', v.plate).replace('{t}', cName(v.maint.maint_type)).replace('{s}', fCD.format(new Date(v.maint.start_time)).slice(5) + ' ' + cTm(v.maint.start_time))) + ' – ' + cDur((d.now - v.maint.start_time) / 60000) + '</div>';
      (v.dues || []).filter(function (x) { return x.level !== 'ok'; }).forEach(function (x) {
        a += '<div class="romsg ' + (x.level === 'over' ? 'bad' : 'warn') + '">' + (x.level === 'over' ? '⛔ ' : '⚠️ ') + esc(ct('a_due').replace('{p}', v.plate).replace('{n}', cName(x.name)).replace('{txt}', x.rem <= 0 ? ct('over_by').replace('{n}', cNum(-x.rem)) : ct('left').replace('{n}', cNum(x.rem))).replace('{d}', cNum(x.due))) + '</div>';
      });
    });
    return a;
  }

  function carOverview() {
    var C = st.car, D = C.d, A = carAgg(D), h = cAlerts(D) + cKpis(A) + '<h3 class="rh3">' + ct('now') + '</h3><div class="cgrid">';
    D.vehicles.forEach(function (v) {
      var x = A.V.filter(function (a) { return a.v.vehicle_id === v.vehicle_id; })[0] || { uses: 0, km: 0, min: 0 };
      var row = function (l, val, cls) { return '<div class="crow"><span>' + l + '</span><b class="' + (cls || '') + '">' + val + '</b></div>'; };
      h += '<section class="card ccard' + (v.maintAlert === 'over' ? ' over' : '') + '"><div class="cvh"><h3>🚗 ' + esc(v.plate) + '</h3><div>' + cCond(v) + '</div></div>' +
        (v.holder ? row(ct('with'), esc(cName(v.holder.emp_name)) + ' (' + esc(cTeam(v.holder.team)) + ')') + row(ct('since'), cDt(v.holder.start_time) + ' · ' + cDur((D.now - v.holder.start_time) / 60000)) : '') +
        row(ct('lastodo'), v.lastOdo ? cNum(v.lastOdo) + ' ' + t('km') : '—') + row(ct('kmp'), cNum(x.km)) + row(ct('usep'), cDur(x.min) + ' (' + Math.round(x.min / A.winMin * 100) + '%)') + row(ct('uses'), x.uses) +
        (v.faults && v.faults.length ? row(ct('openf'), v.faults.map(function (f) { return esc(cName(f.fault_type)); }).join('، '), 'tbad') : '') + cDues(v) +
        (C.canAct && v.holder && v.holder.case_id ? '<div class="cacts"><button type="button" class="btn sm bad" data-cact="cancel" data-id="' + esc(v.holder.case_id) + '">' + ct('cancel') + '</button><button type="button" class="btn sm" data-cact="close" data-id="' + esc(v.holder.case_id) + '">' + ct('close_adm') + '</button></div>' : '') + '</section>';
    });
    h += '</div><div class="row2 r2eq"><section class="card"><div class="chead"><span class="bar4"></span><h2>' + ct('km_by_v') + '</h2></div>' + cBars(A.V.map(function (x) { return { l: x.v.plate, v: x.km }; }), function (v) { return cNum(v) + ' ' + t('km'); }) + '</section>' +
      '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + ct('use_by_t') + '</h2></div>' + cBars(Object.keys(A.T).map(function (k) { return { l: cTeam(k), v: A.T[k].min }; }).sort(function (a, b) { return b.v - a.v; }), cDur) + '</section></div>';
    return h;
  }

  /* آخر عهدة لكل مركبة (هذي بس اللي ينفع تنلغي) */
  function carLatest() {
    var last = {};
    st.car.d.handovers.forEach(function (r) { if (r.source === 'manual') return; var v = String(r.vehicle_id); if (!last[v] || r.start_time > last[v].start_time) last[v] = r; });
    var ids = {}; Object.keys(last).forEach(function (k) { ids[last[k].case_id] = 1; }); return ids;
  }
  function carLogRows(rows, withAct) {
    var D = st.car.d, L = D.labels, latest = withAct ? carLatest() : {};
    return rows.map(function (r) {
      var cond = r.source === 'manual' ? '<span class="muted">' + ct('manual') + '</span>' : r.start_condition === L.note ? '<span class="twarn">⚠️ ' + esc(r.start_note) + '</span>' : '<span class="tok">' + ct('ok') + '</span>';
      if (r.end_time && r.source !== 'manual') cond += ' / ' + (r.end_condition === L.note ? '<span class="twarn">⚠️ ' + esc(r.end_note) + '</span>' : '<span class="tok">' + ct('ok') + '</span>');
      var acts = '';
      if (withAct && st.car.canAct && r.source !== 'manual') {
        if (latest[r.case_id]) acts += '<button type="button" class="btn sm bad" data-cact="cancel" data-id="' + esc(r.case_id) + '">' + ct('cancel') + '</button>';
        if (!r.end_time) acts += '<button type="button" class="btn sm" data-cact="close" data-id="' + esc(r.case_id) + '">' + ct('close_adm') + '</button>';
      }
      return '<tr><td><span class="ltr">' + esc(r.case_id || '') + '</span></td><td><b>' + esc(r.plate || r.vehicle_id) + '</b></td><td>' + esc(cName(r.emp_name)) + '<div class="muted num">' + esc(r.emp_id || '') + '</div></td><td>' + esc(cTeam(r.team)) + '</td><td>' + esc(tr(r.shift || '')) + '</td>' +
        '<td>' + cDt(r.start_time) + ' ' + cPhoto(r.start_photo_url) + '</td><td>' + (r.end_time ? cDt(r.end_time) + ' ' + cPhoto(r.end_photo_url) : '<span class="twarn">' + ct('open') + '</span>') + '</td>' +
        '<td>' + (r.end_time ? cDur(r.duration_min) : cDur((D.now - r.start_time) / 60000) + '…') + '</td><td class="num">' + cNum(r.start_odometer) + (r.end_odometer ? ' ← ' + cNum(r.end_odometer) : '') + '</td><td class="num"><b>' + (r.end_time ? cNum(r.distance_km) : '—') + '</b></td>' +
        '<td>' + cond + '</td><td>' + esc(tr(r.close_method || '')) + (r.close_method === L.peer ? '<div class="muted">' + esc(ct('to_peer').replace('{n}', cName(r.end_emp_name))) + '</div>' : '') + '</td>' + (withAct ? '<td class="racts">' + acts + '</td>' : '') + '</tr>';
    }).join('');
  }
  function carLogHead(withAct) { return '<tr>' + ['id', 'veh', 'emp', 'team', 'shift', 'recv', 'handv', 'dur', 'odo', 'kmc', 'cond', 'method'].concat(withAct ? ['act'] : []).map(function (k) { return '<th>' + ct(k) + '</th>'; }).join('') + '</tr>'; }
  function carLog() {
    var C = st.car, D = C.d, q = (C.q || '').trim();
    var vs = D.vehicles.map(function (v) { return v.plate; }), ts = [];
    D.handovers.forEach(function (r) { if (ts.indexOf(r.team) < 0) ts.push(r.team); });
    var rows = D.handovers.filter(function (r) { return (!C.fv || (r.plate || r.vehicle_id) === C.fv) && (!C.ft || r.team === C.ft) && (!q || (String(r.emp_name) + r.emp_id + r.case_id + r.end_emp_name).indexOf(q) >= 0); })
      .sort(function (a, b) { return b.start_time - a.start_time; });
    return '<div class="toolbar"><select class="input" id="cFv"><option value="">' + ct('all_v') + '</option>' + vs.map(function (v) { return '<option' + (C.fv === v ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select>' +
      '<select class="input" id="cFt"><option value="">' + ct('all_t') + '</option>' + ts.map(function (x) { return '<option value="' + esc(x) + '"' + (C.ft === x ? ' selected' : '') + '>' + esc(cTeam(x)) + '</option>'; }).join('') + '</select>' +
      '<input class="input" type="search" id="cQ" placeholder="' + esc(ct('search')) + '" value="' + esc(C.q) + '"><span class="muted"><span class="num">' + rows.length + '</span></span></div>' +
      '<div class="tblwrap rtbl"><table class="tbl twrap"><thead>' + carLogHead(true) + '</thead><tbody>' + (carLogRows(rows, true) || '<tr><td colspan="13" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>';
  }
  function carFaultRows(rows, withAct) {
    var D = st.car.d, L = D.labels;
    return rows.map(function (f) {
      var open = f.status === L.open;
      return '<tr><td><span class="ltr">' + esc(f.case_id) + '</span></td><td><b>' + esc(f.plate || f.vehicle_id) + '</b></td><td>' + esc(cName(f.fault_type)) + (f.description ? '<div class="muted">' + esc(f.description) + '</div>' : '') + '</td>' +
        '<td>' + (f.severity === L.stop ? ct('stop') : ct('run')) + '</td><td>' + esc(cName(f.emp_name)) + '</td><td>' + cDt(f.start_time) + ' ' + cPhoto(f.photo_url) + '</td>' +
        '<td>' + (open ? '<span class="tbad">' + ct('fo') + '</span>' : '<span class="tok">' + ct('fc') + '</span>') + '</td><td>' + (f.end_time ? cDur(f.duration_min) : cDur((D.now - f.start_time) / 60000) + '…') + '</td>' +
        '<td>' + esc(f.resolution_note || '') + (f.resolved_by_name ? '<div class="muted">' + esc(cName(f.resolved_by_name)) + '</div>' : '') + '</td>' +
        (withAct ? '<td class="racts">' + (open && st.car.canAct ? '<button type="button" class="btn sm ok" data-cact="fault" data-id="' + esc(f.case_id) + '">' + ct('close_f') + '</button>' : '') + '</td>' : '') + '</tr>';
    }).join('');
  }
  function carFaultHead(withAct) { return '<tr>' + ['id', 'veh', 'fault', 'sev', 'reporter', 'time', 'cond', 'fdur', 'fact'].concat(withAct ? ['act'] : []).map(function (k) { return '<th>' + ct(k) + '</th>'; }).join('') + '</tr>'; }
  function carFaults() {
    var D = st.car.d, L = D.labels, A = carAgg(D), byV = {}, downMin = {};
    var rows = D.faults.slice().sort(function (a, b) { return (a.status === L.open ? 0 : 1) - (b.status === L.open ? 0 : 1) || b.start_time - a.start_time; });
    D.faults.forEach(function (f) { var k = f.plate || f.vehicle_id; byV[k] = (byV[k] || 0) + 1; });
    D.faults.filter(function (f) { return f.severity === L.stop; }).forEach(function (f) { var k = f.plate || f.vehicle_id; downMin[k] = (downMin[k] || 0) + Math.max(0, (Math.min(f.end_time || D.now, D.we) - Math.max(f.start_time, D.ws)) / 60000); });
    return '<div class="kpis k4">' + rKpi(ct('f_new'), A.fNew.length) + rKpi(ct('f_closed'), A.fClosed.length, 'ok') + rKpi(ct('fopen'), A.fOpen.length, A.fOpen.length ? 'bad' : '') + '</div>' +
      '<div class="row2 r2eq"><section class="card"><div class="chead"><span class="bar4"></span><h2>' + ct('f_by_v') + '</h2></div>' + cBars(Object.keys(byV).map(function (k) { return { l: k, v: byV[k] }; }), function (v) { return v; }) + '</section>' +
      '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + ct('f_down') + '</h2></div>' + cBars(Object.keys(downMin).map(function (k) { return { l: k, v: downMin[k] }; }), cDur) + '</section></div>' +
      '<div class="tblwrap rtbl"><table class="tbl twrap"><thead>' + carFaultHead(true) + '</thead><tbody>' + (carFaultRows(rows, true) || '<tr><td colspan="10" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>';
  }

  function cMntDown(r, ws, we) { var D = st.car.d, e = r.status === D.labels.open ? D.now : r.end_time; return Math.max(0, (Math.min(e, we) - Math.max(r.start_time, ws)) / 60000); }
  function carMntRows(rows) {
    var D = st.car.d;
    return rows.map(function (r) {
      var open = r.status === D.labels.open, past = r.entry_mode === 'تسجيل صيانة سابقة';
      return '<tr><td><span class="ltr">' + esc(r.case_id) + '</span></td><td><b>' + esc(r.plate || r.vehicle_id) + '</b></td><td>' + esc(cName(r.maint_type)) + '</td><td>' + (open ? '<span class="tbad">' + ct('m_in') + '</span>' : past ? '<span class="muted">' + ct('m_past') + '</span>' : '<span class="tok">' + ct('m_done') + '</span>') + '</td>' +
        '<td>' + (past ? '—' : cDt(r.start_time)) + '</td><td>' + (open ? '—' : cDt(r.end_time)) + '</td><td><b>' + (open ? cDur((D.now - r.start_time) / 60000) + '…' : (+r.duration_min ? cDur(r.duration_min) : ct('nodown'))) + '</b></td>' +
        '<td class="num">' + cNum(r.start_odometer) + (r.end_odometer && +r.end_odometer !== +r.start_odometer ? ' ← ' + cNum(r.end_odometer) : '') + '</td><td>' + (+r.next_due_km ? cNum(r.next_due_km) + '<div class="muted">' + ct('after').replace('{n}', cNum(r.interval_km)) + '</div>' : '—') + '</td>' +
        '<td>' + esc(r.start_note || '') + (r.end_note ? '<div>' + esc(r.end_note) + '</div>' : '') + '</td><td>' + esc(cName(r.closed_by_name || r.emp_name)) + '</td></tr>';
    }).join('');
  }
  function carMaint() {
    var C = st.car, D = C.d, L = D.labels;
    var all = (D.maint || []).slice().sort(function (a, b) { return (b.end_time || b.start_time || 0) - (a.end_time || a.start_time || 0); });
    var inRange = all.filter(function (r) { return cMntDown(r, D.ws, D.we) > 0 || (r.end_time >= D.ws && r.end_time < D.we); });
    var downRange = inRange.reduce(function (a, r) { return a + cMntDown(r, D.ws, D.we); }, 0), inNow = D.vehicles.filter(function (v) { return v.maint; }).length;
    var over = 0, warn = 0; D.vehicles.forEach(function (v) { (v.dues || []).forEach(function (x) { if (x.level === 'over') over++; if (x.level === 'warn') warn++; }); });
    var h = '<div class="kpis k6">' + rKpi(ct('m_range'), inRange.length) + rKpi(ct('m_downr'), cDur(downRange)) + rKpi(ct('m_now'), inNow, inNow ? 'bad' : '') + rKpi(ct('m_over'), over, over ? 'bad' : '') + rKpi(ct('m_warn').replace('{n}', cNum(D.warnKm)), warn, warn ? 'warn' : '') + '</div>' + cAlerts(D);
    // نموذج طلب الصيانة الرسمي
    if (!D.templateReady) h += '<div class="romsg warn">' + ct('rq_tpl') + '</div>';
    else {
      h += '<section class="card noprint"><div class="chead"><span class="bar4"></span><h2>📄 ' + ct('rq_t') + '</h2></div><div class="toolbar">' +
        '<label class="field">' + ct('rq_v') + '<select class="input" id="rqV">' + D.vehicles.map(function (v) { return '<option value="' + esc(v.vehicle_id) + '">' + esc(v.plate) + ' · ' + esc(v.vehicle_code || '') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field">' + ct('rq_m') + '<input class="input num" id="rqM" type="number"></label>' +
        '<label class="field">' + ct('rq_e') + '<select class="input" id="rqE">' + (D.admins || []).map(function (a) { return '<option value="' + esc(a.id) + '"' + (C.me && a.id === C.me.id ? ' selected' : '') + '>' + esc(cName(a.name)) + ' – ' + esc(a.id) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field">' + ct('rq_p') + '<input class="input num" id="rqP" placeholder="05XXXXXXXX"></label></div>' +
        '<p class="muted">' + ct('rq_items') + '</p><div class="ctypes" id="rqT">' + (D.maintTypes || []).map(function (x) { return '<label><input type="checkbox" value="' + esc(x.code) + '"> ' + esc(x.name) + '</label>'; }).join('') + '</div>' +
        '<div class="toolbar"><button type="button" class="btn primary" id="rqBtn">📄 ' + ct('rq_btn') + '</button><span id="rqOut" class="muted"></span></div>' +
        (D.requests && D.requests.length ? '<p class="muted">' + ct('rq_last') + '</p>' + D.requests.slice().reverse().slice(0, 5).map(function (r) {
          return '<div class="crow"><span>' + esc(r.case_id) + ' · ' + esc(r.plate) + ' · ' + cDt(r.start_time) + ' · ' + ct(r.status === L.open ? 'rq_wait_s' : 'rq_in') + '</span><b>' + (r.pdf_url ? '<a class="dl" target="_blank" rel="noopener" href="' + esc(r.pdf_url) + '">PDF</a> ' : '') + (r.xlsx_url ? '<a class="dl" target="_blank" rel="noopener" href="' + esc(r.xlsx_url) + '">Excel</a>' : '') + '</b></div>';
        }).join('') : '') + '</section>';
    }
    h += '<div class="toolbar"><select class="input" id="cMv"><option value="">' + ct('all_v') + '</option>' + D.vehicles.map(function (v) { return '<option' + (C.mv === v.plate ? ' selected' : '') + '>' + esc(v.plate) + '</option>'; }).join('') + '</select></div>';
    h += '<h3 class="rh3">' + ct('m_sum') + '</h3><div class="cgrid">';
    D.vehicles.filter(function (v) { return !C.mv || v.plate === C.mv; }).forEach(function (v) {
      var mine = all.filter(function (r) { return String(r.vehicle_id) === v.vehicle_id; });
      var tot = mine.reduce(function (a, r) { return a + (r.status === L.open ? (D.now - r.start_time) / 60000 : (+r.duration_min || 0)); }, 0);
      var last = mine.filter(function (r) { return r.status !== L.open; })[0];
      var row = function (l, val) { return '<div class="crow"><span>' + l + '</span><b>' + val + '</b></div>'; };
      h += '<section class="card ccard' + (v.maintAlert === 'over' ? ' over' : '') + '"><div class="cvh"><h3>🚗 ' + esc(v.plate) + '</h3><div>' + cCond(v) + '</div></div>' +
        row(ct('m_cur'), v.lastOdo ? cNum(v.lastOdo) + ' ' + t('km') : '—') + row(ct('m_cnt'), mine.length) + row(ct('m_tot'), cDur(tot)) +
        row(ct('m_last'), last ? esc(cName(last.maint_type)) + ' · ' + cDt(last.end_time) : '—') + cDues(v) +
        '<div class="cacts"><button type="button" class="btn sm" data-clog="' + esc(v.vehicle_id) + '">' + icon('download') + ct('dl_log') + '</button></div></section>';
    });
    var mrows = all.filter(function (r) { return !C.mv || (r.plate || r.vehicle_id) === C.mv; });
    h += '</div><h3 class="rh3">' + ct('m_log') + '</h3><div class="tblwrap rtbl"><table class="tbl twrap"><thead><tr>' + ['id', 'veh', 'mtype', 'mstate', 'min', 'mout', 'mdown', 'odo', 'mnext', 'mnote', 'mby'].map(function (k) { return '<th>' + ct(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (carMntRows(mrows) || '<tr><td colspan="11" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>';
    return h;
  }

  function carEmps() {
    var A = carAgg(st.car.d), rows = A.E.sort(function (a, b) { return b.uses - a.uses || b.km - a.km; });
    return '<div class="tblwrap rtbl"><table class="tbl"><thead><tr>' + ['e_name', 'e_id', 'team', 'e_uses', 'kmc', 'usage', 'e_avg', 'e_notes', 'e_faults', 'e_peer'].map(function (k) { return '<th>' + ct(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.map(function (e) { return '<tr><td><b>' + esc(cName(e.name)) + '</b></td><td class="num">' + esc(e.id) + '</td><td>' + esc(cTeam(e.team)) + '</td><td class="num">' + e.uses + '</td><td class="num">' + cNum(e.km) + '</td><td>' + cDur(e.min) + '</td><td>' + (e.uses ? cDur(e.min / e.uses) : '—') + '</td><td class="num">' + e.notes + '</td><td class="num">' + e.faults + '</td><td class="num' + (e.peer ? ' twarn' : '') + '">' + e.peer + '</td></tr>'; }).join('') ||
        '<tr><td colspan="10" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div><p class="muted rmeta">' + ct('e_hint') + '</p>';
  }

  function carDaily() {
    var C = st.car;
    if (!C.day) C.day = dAdd(C.d.today, -1);
    var h = '<div class="toolbar noprint"><label class="field">' + ct('d_day') + '<input class="input num" type="date" id="cDay" value="' + esc(C.day) + '"></label><button type="button" class="btn sm" id="cDayGo">' + ct('d_show') + '</button><button type="button" class="btn primary sm" id="cPrint">' + icon('print') + ct('print') + '</button></div>';
    if (!C.dd || C.ddKey !== C.day) { setTimeout(carLoadDay, 0); return h + '<div class="loading"><div class="spin"></div>' + t('loading') + '</div>'; }
    var keep = C.d; C.d = C.dd; var d = C.dd, A = carAgg(d);
    var html = h + '<div class="card rrep"><div class="rrh"><div><b class="rlogo">MBCO</b><div class="muted">Modern Bus Company Limited</div></div><span class="tag b-acc">Daily · ' + rDmy(d.from) + '</span></div>' +
      '<h2 class="rrt">' + ct('d_title') + '</h2><p class="muted rmeta">' + ct('d_sub').replace('{d}', d.from) + '</p>' + cKpis(A) +
      '<h3 class="rh3">' + ct('d_sum') + '</h3><div class="tblwrap"><table class="tbl"><thead><tr>' + ['veh', 'uses', 'kmc', 'usage', 'd_rate', 'lastodo', 'cond'].map(function (k) { return '<th>' + ct(k) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      A.V.map(function (x) { return '<tr><td><b>' + esc(x.v.plate) + '</b></td><td class="num">' + x.uses + '</td><td class="num">' + cNum(x.km) + '</td><td>' + cDur(x.min) + '</td><td class="num">' + Math.round(x.min / A.winMin * 100) + '%</td><td class="num">' + cNum(x.v.lastOdo) + '</td><td>' + cCond(x.v) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="row2 r2eq"><section class="card"><div class="chead"><span class="bar4"></span><h2>' + ct('d_kmt') + '</h2></div>' + cBars(Object.keys(A.T).map(function (k) { return { l: cTeam(k), v: A.T[k].km }; }).sort(function (a, b) { return b.v - a.v; }), function (v) { return cNum(v) + ' ' + t('km'); }) + '</section>' +
      '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + ct('d_use') + '</h2></div>' + cBars(A.V.map(function (x) { return { l: x.v.plate, v: Math.round(x.min / A.winMin * 100) }; }), function (v) { return v + '%'; }) + '</section></div>' +
      '<h3 class="rh3">' + ct('d_log') + '</h3><div class="tblwrap"><table class="tbl twrap"><thead>' + carLogHead(false) + '</thead><tbody>' + (carLogRows(d.handovers.slice().sort(function (a, b) { return a.start_time - b.start_time; }), false) || '<tr><td colspan="12" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>' +
      '<h3 class="rh3">' + ct('faults') + '</h3><div class="tblwrap"><table class="tbl twrap"><thead>' + carFaultHead(false) + '</thead><tbody>' + (carFaultRows(d.faults, false) || '<tr><td colspan="9" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>' +
      (A.notes.length ? '<h3 class="rh3">' + ct('d_notes') + '</h3><section class="card">' + A.notes.map(function (n) { return '<div class="crow"><span>' + cTm(n.t) + ' · ' + esc(n.plate) + ' · ' + n.kind + ' – ' + esc(cName(n.who)) + '</span><b>' + esc(n.note) + '</b></div>'; }).join('') + '</section>' : '') +
      '<div class="rfoot muted"><span>' + ct('d_foot') + '</span><span>' + t('prepared') + ' ' + cDt(d.now) + '</span></div></div>';
    C.d = keep;
    return html;
  }
  function carLoadDay() {
    var C = st.car;
    api('carDash', { from: C.day, to: C.day }).then(function (j) { C.dd = j.data; C.ddKey = C.day; if (route() === 'car' && C.tab === 'daily') carDraw(); })
      .catch(function (e) { var b = document.getElementById('carBody'); if (b) failBox(b, e, carLoadDay); });
  }

  function carBind(b) {
    var C = st.car, D = C.d, re = function () { carDraw(); };
    var sel = function (id, k) { var x = b.querySelector('#' + id); if (x) x.onchange = function () { C[k] = x.value; re(); }; };
    sel('cFv', 'fv'); sel('cFt', 'ft'); sel('cMv', 'mv');
    var q = b.querySelector('#cQ'); if (q) q.oninput = function () { C.q = q.value; var pos = q.selectionStart; re(); var n = document.getElementById('cQ'); n.focus(); n.setSelectionRange(pos, pos); };
    var day = b.querySelector('#cDay'); if (day) { b.querySelector('#cDayGo').onclick = function () { C.day = day.value; C.dd = null; re(); }; }
    var pr = b.querySelector('#cPrint'); if (pr) pr.onclick = function () { window.print(); };
    // نموذج الطلب الرسمي
    var vSel = b.querySelector('#rqV');
    if (vSel) {
      var m = b.querySelector('#rqM'), e = b.querySelector('#rqE'), p = b.querySelector('#rqP');
      var setOdo = function () { var v = D.vehicles.filter(function (x) { return x.vehicle_id === vSel.value; })[0]; m.value = v ? v.lastOdo : ''; };
      var setPh = function () { var a = (D.admins || []).filter(function (x) { return x.id === e.value; })[0]; p.value = a ? (a.phone || '') : ''; };
      vSel.onchange = setOdo; e.onchange = setPh; setOdo(); setPh();
      b.querySelectorAll('#rqT input').forEach(function (cb) { cb.onchange = function () { if (b.querySelectorAll('#rqT input:checked').length > 9) { cb.checked = false; toast(ct('rq_max')); } cb.parentNode.classList.toggle('on', cb.checked); }; });
      b.querySelector('#rqBtn').onclick = function () {
        var codes = Array.prototype.map.call(b.querySelectorAll('#rqT input:checked'), function (x) { return x.value; });
        if (!codes.length) return toast(ct('rq_none'));
        var btn = this, out = b.querySelector('#rqOut'); btn.disabled = true; out.textContent = '⏳ ' + ct('rq_wait');
        api('carAct', { kind: 'req', vid: vSel.value, codes: codes, mileage: m.value, emp: e.value, phone: p.value }).then(function (j) {
          var r = j.result || {}; btn.disabled = false;
          out.innerHTML = '✅ ' + esc(r.id || '') + ' ' + [r.pdf, r.xlsx].filter(Boolean).map(function (f) { return '<a class="dl" target="_blank" rel="noopener" href="' + esc(f.url) + '">' + esc(f.name) + '</a>'; }).join(' ');
          if (r.pdf) carDownload(r.pdf); if (r.xlsx) setTimeout(function () { carDownload(r.xlsx); }, 800);
          C.at = 0;
        }).catch(function (er) { btn.disabled = false; out.textContent = '⚠️ ' + errText(er); });
      };
    }
    b.querySelectorAll('[data-clog]').forEach(function (btn) {
      btn.onclick = function () {
        var txt = btn.innerHTML; btn.disabled = true; btn.textContent = '⏳';
        api('carAct', { kind: 'carlog', vid: btn.getAttribute('data-clog') }).then(function (j) { btn.disabled = false; btn.innerHTML = txt; if (j.result && j.result.xlsx) carDownload(j.result.xlsx); })
          .catch(function (er) { btn.disabled = false; btn.innerHTML = txt; toast(errText(er)); });
      };
    });
    // الإجراءات
    b.querySelectorAll('[data-cact]').forEach(function (btn) {
      btn.onclick = function () {
        var kind = btn.getAttribute('data-cact'), id = btn.getAttribute('data-id');
        var hr = D.handovers.filter(function (r) { return r.case_id === id; })[0] || {}, fl = D.faults.filter(function (f) { return f.case_id === id; })[0] || {};
        var title, body, ph, opts = {};
        if (kind === 'cancel' && !hr.case_id) { var vh = D.vehicles.filter(function (x) { return x.holder && x.holder.case_id === id; })[0]; if (vh) hr = Object.assign({ plate: vh.plate, start_odometer: vh.holder.start_odometer || vh.lastOdo }, vh.holder); }
        if (kind === 'cancel') { title = ct('m_cancel'); body = ct('m_cancel_b').replace('{id}', id).replace('{plate}', hr.plate || '').replace('{emp}', cName(hr.emp_name || '')).replace('{odo}', cNum(hr.start_odometer)); ph = ct('reason_ph'); }
        else if (kind === 'close') { var v = D.vehicles.filter(function (x) { return x.holder && x.holder.case_id === id; })[0]; var src = hr.case_id ? hr : (v ? Object.assign({ plate: v.plate }, v.holder) : {}); title = ct('m_close'); body = ct('m_close_b').replace('{plate}', src.plate || '').replace('{emp}', cName(src.emp_name || '')).replace('{since}', src.start_time ? fCD.format(new Date(src.start_time)).slice(5) + ' ' + cTm(src.start_time) : ''); ph = rt('note_ph'); opts.odo = true; }
        else { title = ct('m_fault'); body = ct('m_fault_b').replace('{id}', id).replace('{plate}', fl.plate || '').replace('{type}', cName(fl.fault_type || '')); ph = ct('note_req'); opts.req = true; }
        carConfirm(title, body, ph, opts, function (note, odo, done) {
          api('carAct', { kind: kind, id: id, note: note, odo: odo }).then(function (j) {
            done();
            var r = j.result || {};
            toast(kind === 'cancel' ? ct('done_cancel') + (r.restored ? ' ' + ct('restored').replace('{id}', r.restored).replace('{emp}', cName(r.restored_to || '')) : '') : rt('done'));
            var w = document.getElementById('ctlWrap'); if (w) renderCar(w, true);
          }).catch(function (er) { done(errText(er)); });
        });
      };
    });
  }
  function carConfirm(title, body, ph, opts, onOk) {
    var ov = document.createElement('div'); ov.className = 'mov';
    ov.innerHTML = '<div class="mbox" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p class="muted">' + esc(body) + '</p>' +
      (opts.odo ? '<input class="input num" id="mOdo" type="number" placeholder="' + esc(ct('odo_ph')) + '">' : '') +
      '<textarea class="input" id="mNote" rows="3" placeholder="' + esc(ph) + '"></textarea><div class="err hide" id="mErr"></div>' +
      '<div class="mrow"><button type="button" class="btn" id="mNo">' + rt('cancel') + '</button><button type="button" class="btn primary" id="mOk">' + rt('confirm') + '</button></div></div>';
    document.body.appendChild(ov);
    var close = function () { ov.remove(); };
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('#mNo').onclick = close;
    var ok = ov.querySelector('#mOk'), err = ov.querySelector('#mErr');
    ok.onclick = function () {
      var note = ov.querySelector('#mNote').value.trim(), odoEl = ov.querySelector('#mOdo');
      if (opts.req && !note) { err.textContent = ct('note_req'); err.classList.remove('hide'); return; }
      ok.disabled = true;
      onOk(note, odoEl ? odoEl.value : '', function (e) { if (!e) return close(); ok.disabled = false; err.textContent = e; err.classList.remove('hide'); });
    };
  }
  function carDownload(f) {
    try {
      var bin = atob(f.b64), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([arr], { type: f.mime })); a.download = f.name;
      document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 800);
    } catch (e) { if (f.url) window.open(f.url, '_blank'); }
  }

  /* نافذة تأكيد مع ملاحظة */
  function confirmBox(title, body, onOk, noNote) {
    var ov = document.createElement('div'); ov.className = 'mov';
    ov.innerHTML = '<div class="mbox" role="dialog" aria-modal="true"><h3>' + esc(title) + '</h3><p class="muted">' + esc(body) + '</p>' +
      '<textarea class="input' + (noNote ? ' hide' : '') + '" id="mNote" rows="3" placeholder="' + esc(rt('note_ph')) + '"></textarea><div class="err hide" id="mErr"></div>' +
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
      if (key === 'car') {
        main.innerHTML = title + '<div class="ctlnative" id="ctlWrap"></div>';
        bindModeSwitch(key);
        if (st.user.role === 'Officer') { document.getElementById('ctlWrap').innerHTML = '<div class="ctlmsg"><p>' + esc(t('ctl_role')) + '</p></div>'; return; }
        renderCar(document.getElementById('ctlWrap'), false);
        return;
      }
      if (key === 'dist') {
        main.innerHTML = title + '<div class="ctlnative" id="ctlWrap"></div>';
        renderDist(document.getElementById('ctlWrap'));
        return;
      }
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
      (key === 'att' ? '<label class="field">' + t('att_filter') + '<select class="input" id="sF">' + [['', 'att_all'], ['حاضر'], ['غائب'], ['late', 'att_late'], ['انسحاب'], ['استئذان'], ['إجازة'], ['أوف']].map(function (o) { return '<option value="' + o[0] + '"' + ((s.f || '') === o[0] ? ' selected' : '') + '>' + esc(o[1] ? t(o[1]) : tr(o[0])) + '</option>'; }).join('') + '</select></label>' : '') +
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
    var sF = document.getElementById('sF'); if (sF) sF.onchange = function () { s.f = sF.value; if (s.data) drawTable(key); };
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
    var s = st.sec[key], d = s.data, q = (s.q || '').trim().toLowerCase(), f = key === 'att' ? s.f || '' : '';
    var rows = !f ? d.rows : d.rows.filter(function (r) {
      if (f === 'late') return Number(r.late_min) > 0;
      if (f === 'انسحاب' || f === 'استئذان') return r.att_status === f || (r.exit_time && String(r.exit_type || r.att_note || '').indexOf(f) >= 0);
      return r.att_status === f;
    });
    return q ? rows.filter(function (r) { return d.columns.some(function (c) { return String(r[c.key]).toLowerCase().indexOf(q) >= 0 || String(tr(r[c.key])).toLowerCase().indexOf(q) >= 0; }); }) : rows;
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
  /* عند فتح البوابة: تحديث القائمة الجانبية والصلاحيات من الـ Hub بصمت
     (أسماء الأقسام الجديدة تظهر بدون تسجيل خروج) */
  function refreshMe() {
    if (!st.token || st.mustChange) return;
    var before = JSON.stringify(st.sections) + JSON.stringify(st.user);
    api('me', {}).then(function (j) {
      saveSession({ user: j.user, sections: j.sections });
      if (JSON.stringify(st.sections) + JSON.stringify(st.user) !== before) render();
    }).catch(function () {});
  }
  if (DEMO && !window.MBCO_DEMO) {
    var s = document.createElement('script'); s.src = 'demo.js'; s.onload = function () { render(); refreshMe(); }; document.head.appendChild(s);
  } else { render(); refreshMe(); }
})();
