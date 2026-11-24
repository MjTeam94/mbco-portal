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
    plus: 'M12 5v14M5 12h14',
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

  /* ================= الفحص والمخالفات داخل البوابة (v2.1 – المرحلة 2) =================
     ثلاث صفحات منفصلة: فحص المحطات (STN-RDY) · فحص التذاكر (ENF-INS + التغطية) · المخالفات (ENF-VIO)
     + نظرة عامة + أداء الموظفين (مؤشرات insKpi_ من الـ Hub بمفاتيح ثابتة لصفحة KPI لاحقاً) + التقرير. */
  var IT = {
    ar: {
      overview: 'نظرة عامة', stn: 'فحص المحطات', enf: 'فحص التذاكر', vio: 'المخالفات', emps: 'أداء الموظفين', daily: 'التقرير',
      from: 'من', to: 'إلى', today: 'اليوم', yday: 'أمس', d7: 'آخر 7 أيام', d30: 'آخر 30 يوم', shift: 'الوردية', emp: 'الموظف', all: 'الكل',
      sh1: 'الأولى', sh2: 'الثانية', sh3: 'الثالثة', updated: 'آخر تحديث', none: 'لا توجد بيانات', search: 'بحث: رقم حافلة، موظف، محطة…', rows: 'سجل', csv: 'تصدير CSV',
      // مؤشرات
      k_rdy: 'فحوصات المحطات', k_ok: 'مطابقة بالكامل', k_fail: 'عليها ملاحظات', k_buses: 'حافلات مختلفة', k_stations: 'مواقع مختلفة', k_okr: 'نسبة المطابقة',
      k_ins: 'فحوصات التذاكر', k_cdc: 'منها بلاغات عمليات', k_pax: 'الركاب المفحوصون', k_not: 'بدون تذاكر', k_rate: 'نسبة بدون تذاكر', k_dur: 'متوسط مدة الفحص', k_invio: 'مخالفات داخل الفحص',
      k_cov: 'تغطية المحطات', k_vio: 'المخالفات المحررة', k_fines: 'قيمة المخالفات', k_911: 'إبلاغ 911', k_inbus: 'داخل الحافلات', k_atstn: 'في المحطات', k_pol: 'متوسط وصول الدوريات',
      sar: 'ريال', min: 'د', h: 'س', times: 'مرة',
      // رسوم
      c_trend: 'العمليات اليومية', c_hour: 'العمليات حسب ساعة اليوم', c_items: 'البنود غير المطابقة', c_buses: 'أكثر الحافلات ملاحظات', c_byst: 'الفحوصات حسب الموقع',
      c_bysh: 'حسب الوردية', c_byemp: 'حسب الموظف', c_route: 'نسبة الركاب بدون تذاكر حسب المسار', c_src: 'مصدر الفحوصات', c_busnot: 'أكثر الحافلات ركاباً بدون تذاكر',
      c_type: 'المخالفات حسب النوع', c_loc: 'المخالفات حسب الموقع', c_vroute: 'المخالفات حسب المسار', c_covst: 'التغطية حسب المحطة',
      s_rdy: 'فحص الجاهزية', s_ins: 'فحص الحافلات', s_vio: 'المخالفات', inbus: 'داخل الحافلات', station: 'محطة', bus_l: 'حافلة',
      // جداول
      t_time: 'الوقت', t_id: 'رقم الحالة', t_loc: 'الموقع', t_bus: 'الحافلة', t_route: 'المسار', t_emp: 'الموظف', t_items: 'البنود غير المطابقة', t_res: 'النتيجة',
      t_notes: 'ملاحظات', t_att: 'المرفقات', t_src: 'المصدر', t_valid: 'بتذاكر', t_not: 'بدون تذاكر', t_pax: 'الركاب', t_vc: 'مخالفات', t_dur: 'المدة',
      t_type: 'نوع المخالفة', t_amt: 'القيمة', t_vno: 'رقم المحضر', t_911: '911', t_parent: 'ضمن فحص', t_reason: 'السبب', t_start: 'البدء', t_end: 'الانتهاء', t_status: 'الحالة',
      t_driver: 'السائق', t_entry: 'الإدخال', paper: '📄 ورقي', bot: '📱 البوت', okall: '✔ مطابق', rec_rdy: 'سجل فحص المحطات', rec_ins: 'سجل فحص التذاكر', rec_vio: 'سجل المخالفات', rec_cov: 'سجل تغطية المحطات',
      call: 'تبليغ', arrive: 'وصول',
      // الموظفون
      e_id: 'الرقم الوظيفي', e_team: 'الفريق', e_days: 'أيام العمل', e_total: 'إجمالي العمليات', e_pd: 'عمليات/يوم', g_stn: 'فحص المحطات', g_enf: 'فحص التذاكر', g_vio: 'المخالفات', g_cov: 'التغطية',
      e_n: 'العدد', e_okr: 'مطابقة %', e_fail: 'بملاحظات', e_pax: 'ركاب', e_rate: 'بدون تذاكر %', e_avg: 'متوسط المدة', e_cdc: 'من CDC', e_amt: 'القيمة', e_hrs: 'الساعات',
      e_note: 'أيام العمل = الأيام التشغيلية اللي سجّل فيها الموظف عملية واحدة على الأقل. اضغط على العنوان للترتيب. هذي المؤشرات نفسها راح تنربط بصفحة KPI.',
      e_shift: 'فلتر الوردية ما ينطبق على جدول الموظفين (المؤشرات للفترة كاملة).', t_all: 'كل الفرق', t_enf: 'فريق التذاكر', t_stn: 'فريق المحطات',
      // التقرير
      r_daily: 'التقرير اليومي: الفحص والمخالفات', r_period: 'تقرير الفترة: الفحص والمخالفات', r_made: 'أُنشئ', r_foot: 'MBCO · فريق التذاكر · فريق المحطات', print: 'طباعة / حفظ PDF',
      r_rdyn: 'ملاحظات فحص الجاهزية', r_byshemp: 'حسب الوردية', r_emps: 'حسب الموظف', r_nonotes: 'لا توجد ملاحظات', r_novio: 'لا توجد مخالفات'
    },
    en: {
      overview: 'Overview', stn: 'Station inspections', enf: 'Ticket inspections', vio: 'Violations', emps: 'Staff performance', daily: 'Report',
      from: 'From', to: 'To', today: 'Today', yday: 'Yesterday', d7: 'Last 7 days', d30: 'Last 30 days', shift: 'Shift', emp: 'Employee', all: 'All',
      sh1: 'First', sh2: 'Second', sh3: 'Third', updated: 'Updated', none: 'No data', search: 'Search: bus, employee, station…', rows: 'records', csv: 'Export CSV',
      k_rdy: 'Station inspections', k_ok: 'Fully compliant', k_fail: 'With findings', k_buses: 'Distinct buses', k_stations: 'Distinct locations', k_okr: 'Compliance rate',
      k_ins: 'Ticket inspections', k_cdc: 'From operations cases', k_pax: 'Passengers checked', k_not: 'Without tickets', k_rate: 'No-ticket rate', k_dur: 'Avg. inspection time', k_invio: 'Violations within inspections',
      k_cov: 'Station coverage', k_vio: 'Violations issued', k_fines: 'Fines value', k_911: '911 calls', k_inbus: 'On buses', k_atstn: 'At stations', k_pol: 'Avg. patrol arrival',
      sar: 'SAR', min: 'm', h: 'h', times: 'times',
      c_trend: 'Daily operations', c_hour: 'Operations by hour', c_items: 'Non-compliant items', c_buses: 'Buses with most findings', c_byst: 'Inspections by location',
      c_bysh: 'By shift', c_byemp: 'By employee', c_route: 'No-ticket rate by route', c_src: 'Inspection source', c_busnot: 'Buses with most passengers without tickets',
      c_type: 'Violations by type', c_loc: 'Violations by location', c_vroute: 'Violations by route', c_covst: 'Coverage by station',
      s_rdy: 'Readiness check', s_ins: 'Bus inspection', s_vio: 'Violations', inbus: 'On buses', station: 'Station', bus_l: 'Bus',
      t_time: 'Time', t_id: 'Case', t_loc: 'Location', t_bus: 'Bus', t_route: 'Route', t_emp: 'Employee', t_items: 'Non-compliant items', t_res: 'Result',
      t_notes: 'Notes', t_att: 'Attachments', t_src: 'Source', t_valid: 'Valid', t_not: 'No ticket', t_pax: 'Passengers', t_vc: 'Violations', t_dur: 'Duration',
      t_type: 'Violation type', t_amt: 'Amount', t_vno: 'Ticket no.', t_911: '911', t_parent: 'Within inspection', t_reason: 'Reason', t_start: 'Start', t_end: 'End', t_status: 'Status',
      t_driver: 'Driver', t_entry: 'Entry', paper: '📄 Paper', bot: '📱 Bot', okall: '✔ Compliant', rec_rdy: 'Station inspections log', rec_ins: 'Ticket inspections log', rec_vio: 'Violations log', rec_cov: 'Station coverage log',
      call: 'call', arrive: 'arrival',
      e_id: 'Employee ID', e_team: 'Team', e_days: 'Work days', e_total: 'Total ops', e_pd: 'Ops/day', g_stn: 'Station inspections', g_enf: 'Ticket inspections', g_vio: 'Violations', g_cov: 'Coverage',
      e_n: 'Count', e_okr: 'Compliant %', e_fail: 'With findings', e_pax: 'Pax', e_rate: 'No-ticket %', e_avg: 'Avg. time', e_cdc: 'From CDC', e_amt: 'Amount', e_hrs: 'Hours',
      e_note: 'Work days = operating days with at least one recorded operation. Click a header to sort. These same indicators will feed the KPI page.',
      e_shift: 'The shift filter does not apply to the staff table (whole period).', t_all: 'All teams', t_enf: 'Tickets team', t_stn: 'Stations team',
      r_daily: 'Daily report: inspections & violations', r_period: 'Period report: inspections & violations', r_made: 'Generated', r_foot: 'MBCO · Tickets team · Stations team', print: 'Print / save PDF',
      r_rdyn: 'Readiness findings', r_byshemp: 'By shift', r_emps: 'By employee', r_nonotes: 'No findings', r_novio: 'No violations'
    }
  };
  function it(k) { return (IT[st.lang] && IT[st.lang][k]) || IT.ar[k] || k; }
  var I_COL = ['#7B1E8F', '#eb6834', '#1baf7a'];

  function insState() {
    if (!st.ins) st.ins = { tab: ls.get('mbco_ins_tab') || 'overview', from: '', to: '', sh: '', emp: '', team: '', q: { rdy: '', ins: '', vio: '', cov: '' }, sort: { k: 'total', d: -1 }, d: null, at: 0, key: '' };
    return st.ins;
  }
  function renderIns(wrap, force) {
    var I = insState();
    if (!wrap.querySelector('#insBody')) {
      wrap.innerHTML = '<div class="card rsttools noprint"><div class="seg sub">' + ['overview', 'stn', 'enf', 'vio', 'emps', 'daily'].map(function (k) {
        return '<button type="button" data-itab="' + k + '" class="' + (I.tab === k ? 'on' : '') + '">' + it(k) + '</button>'; }).join('') + '</div>' +
        '<div class="rstctl"><label class="field">' + it('from') + '<input class="input num" type="date" id="iFrom" value="' + esc(I.from) + '"></label>' +
        '<label class="field">' + it('to') + '<input class="input num" type="date" id="iTo" value="' + esc(I.to) + '"></label>' +
        '<div class="ichips">' + [['0', 'today'], ['1', 'yday'], ['7', 'd7'], ['30', 'd30']].map(function (q) { return '<button type="button" class="ichip" data-iq="' + q[0] + '">' + it(q[1]) + '</button>'; }).join('') + '</div>' +
        '<label class="field">' + it('shift') + '<select class="input" id="iSh"></select></label>' +
        '<label class="field">' + it('emp') + '<select class="input" id="iEmp"></select></label>' +
        '<button type="button" class="btn sm" id="iRef">' + icon('refresh') + rt('refresh') + '</button></div></div>' +
        '<div id="insBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div>';
      wrap.querySelectorAll('[data-itab]').forEach(function (b) {
        b.onclick = function () { I.tab = b.getAttribute('data-itab'); ls.set('mbco_ins_tab', I.tab); wrap.querySelectorAll('[data-itab]').forEach(function (x) { x.classList.toggle('on', x === b); }); insDraw(); };
      });
      var f = document.getElementById('iFrom'), tt = document.getElementById('iTo');
      f.onchange = tt.onchange = function () { I.from = f.value; I.to = tt.value; renderIns(wrap, true); };
      wrap.querySelectorAll('[data-iq]').forEach(function (b) {
        b.onclick = function () {
          var n = +b.getAttribute('data-iq'), td = (I.d && I.d.today) || todayStr();
          if (n === 0) { I.from = I.to = td; } else if (n === 1) { I.from = I.to = dAdd(td, -1); } else { I.from = dAdd(td, -(n - 1)); I.to = td; }
          renderIns(wrap, false);
        };
      });
      document.getElementById('iSh').onchange = function () { I.sh = this.value; insDraw(); };
      document.getElementById('iEmp').onchange = function () { I.emp = this.value; insDraw(); };
      document.getElementById('iRef').onclick = function () { renderIns(wrap, true); };
    }
    var ck = I.from + '|' + I.to;
    if (I.d && I.key === ck && !force && Date.now() - I.at < 60000) return insDraw();
    setSync(true);
    return api('insDash', { from: I.from, to: I.to, fresh: !!force }).then(function (j) {
      I.d = j.data; I.at = Date.now(); addDict(I.d.dict);
      I.from = I.d.from; I.to = I.d.to; I.key = I.from + '|' + I.to;
      var f = document.getElementById('iFrom'), tt = document.getElementById('iTo'); if (f) { f.value = I.from; tt.value = I.to; }
      if (route() === 'ins') insDraw();
    }).catch(function (e) { var b = document.getElementById('insBody'); if (b && route() === 'ins') failBox(b, e, function () { renderIns(wrap, true); }); })
      .then(function () { setSync(false); });
  }

  /* القوائم بعد فلتر الوردية والموظف */
  function insF() {
    var I = st.ins, D = I.d;
    var ok = function (r) { return (!I.sh || String(r.shift) === I.sh) && (!I.emp || String(r.emp_id) === I.emp); };
    return { rdy: D.rdy.filter(ok), ins: D.ins.filter(ok), vio: D.vio.filter(ok), cov: D.cov.filter(ok) };
  }
  function insFilters() {
    var I = st.ins, D = I.d, sh = document.getElementById('iSh'), em = document.getElementById('iEmp'); if (!sh) return;
    sh.innerHTML = '<option value="">' + it('all') + '</option>' + ['1', '2', '3'].map(function (c) { return '<option value="' + c + '"' + (I.sh === c ? ' selected' : '') + '>' + c + ' · ' + it('sh' + c) + '</option>'; }).join('');
    var seen = {}, list = [];
    D.rdy.concat(D.ins, D.vio, D.cov).forEach(function (r) { var id = String(r.emp_id || ''); if (id && !seen[id]) { seen[id] = 1; list.push({ id: id, n: iName(r) }); } });
    list.sort(function (a, b) { return String(a.n).localeCompare(String(b.n), 'ar'); });
    em.innerHTML = '<option value="">' + it('all') + '</option>' + list.map(function (e) { return '<option value="' + esc(e.id) + '"' + (I.emp === e.id ? ' selected' : '') + '>' + esc(e.n) + ' (' + esc(e.id) + ')</option>'; }).join('');
  }
  function insDraw() {
    var I = st.ins, b = document.getElementById('insBody'); if (!b || !I.d) return;
    insFilters();
    b.innerHTML = ({ overview: insOverview, stn: insStn, enf: insEnf, vio: insVio, emps: insEmps, daily: insDaily }[I.tab] || insOverview)() +
      '<p class="muted rmeta noprint">' + it('updated') + ' <span class="ltr">' + esc(String(I.d.generated).slice(11)) + '</span></p>';
    insBind(b);
  }

  /* ---------- أدوات ---------- */
  function iName(r) { var n = r.emp_name || r.name || r.emp_id || ''; return st.lang === 'en' ? tr(n) : n; }
  function iSum(a, k) { return a.reduce(function (x, r) { return x + (+r[k] || 0); }, 0); }
  function iPct(a, b) { return b ? Math.round(a / b * 1000) / 10 + '%' : '—'; }
  function iDur(min) { min = Math.max(0, Math.round(+min || 0)); var h = Math.floor(min / 60), s = h ? h + ' ' + it('h') + ' ' + (min % 60) + ' ' + it('min') : min + ' ' + it('min'); return '<bdi dir="' + (st.lang === 'en' ? 'ltr' : 'rtl') + '">' + s + '</bdi>'; }
  function iMoney(n) { return Math.round(+n || 0).toLocaleString('en-US'); }
  function iCount(rows, fn) { var m = {}; rows.forEach(function (r) { var k = fn(r); if (k === '' || k === null || k === undefined) return; m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map(function (k) { return { l: k, v: m[k] }; }).sort(function (a, b) { return b.v - a.v; }); }
  function iBars(items, fmt, max) {
    items = items.slice(0, max || 10);
    var mx = Math.max.apply(null, [1].concat(items.map(function (i) { return i.v; })));
    return items.length ? '<div class="ibw">' + items.map(function (i, n) { return '<div class="rbar"><span class="lb" title="' + esc(i.l) + '">' + esc(tr(i.l)) + '</span><span class="tr"><i style="width:' + (i.v / mx * 100).toFixed(1) + '%;background:' + (i.c || I_COL[n % 3]) + '"></i></span><b class="num">' + (fmt ? fmt(i.v, i) : i.v) + '</b></div>'; }).join('') + '</div>' : '<p class="muted">' + it('none') + '</p>';
  }
  function iCard(title, body) { return '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + esc(title) + '</h2></div>' + body + '</section>'; }
  function iTime(ts) { if (!ts) return '—'; var I = st.ins, one = I.from === I.to; return '<span class="ltr">' + esc(one ? String(ts).slice(11, 16) : String(ts).slice(5, 16)) + '</span>'; }
  function iLoc(r) { return r.location_type === 'محطة' || (!r.bus_no && r.station) ? it('station') + ' ' + tr(r.station || '') : (r.station ? tr(r.station) : it('bus_l')); }
  function iShName(c) { return c ? c + (it('sh' + c) !== 'sh' + c ? ' · ' + it('sh' + c) : '') : '—'; }
  function iLinks(r) {
    var a = '';
    if (r.photo_url) a += '<a class="ph" href="' + esc(r.photo_url) + '" target="_blank" rel="noopener" title="photo">📷</a> ';
    if (r.form_photo_url) a += '<a class="ph" href="' + esc(r.form_photo_url) + '" target="_blank" rel="noopener" title="form">📄</a> ';
    if (r.map_link) a += '<a class="ph" href="' + esc(r.map_link) + '" target="_blank" rel="noopener" title="map">📍</a>';
    return a || '<span class="muted">—</span>';
  }
  function iEntry(v) { return v ? (/ورق/.test(v) ? it('paper') : it('bot')) : ''; }
  function iDays() { var I = st.ins, out = []; for (var x = I.from; x && x <= I.to && out.length < 120; x = dAdd(x, 1)) out.push(x); return out; }
  /* أعمدة يومية (3 سلاسل بنفس ألوان الهوية) */
  function iTrend(F) {
    var days = iDays(), ser = [['s_rdy', F.rdy], ['s_ins', F.ins], ['s_vio', F.vio]].map(function (s) { var m = {}; s[1].forEach(function (r) { m[r.shift_date] = (m[r.shift_date] || 0) + 1; }); return { l: it(s[0]), m: m }; });
    var mx = 1; days.forEach(function (d) { ser.forEach(function (s) { mx = Math.max(mx, s.m[d] || 0); }); });
    var step = Math.ceil(days.length / 15);
    return '<div class="ilegend">' + ser.map(function (s, i) { return '<span><i style="background:' + I_COL[i] + '"></i>' + esc(s.l) + '</span>'; }).join('') + '</div>' +
      '<div class="icols">' + days.map(function (d, k) {
        return '<div class="icol" title="' + d + ' · ' + ser.map(function (s) { return s.l + ': ' + (s.m[d] || 0); }).join(' · ') + '"><div class="ibars">' +
          ser.map(function (s, i) { var v = s.m[d] || 0; return '<i style="height:' + (v / mx * 100).toFixed(1) + '%;background:' + I_COL[i] + '">' + (days.length <= 10 && v ? '<em>' + v + '</em>' : '') + '</i>'; }).join('') +
          '</div><span class="ilb">' + (k % step === 0 ? d.slice(5) : '') + '</span></div>';
      }).join('') + '</div>';
  }
  /* حسب الساعة: يبدأ من 07 (اليوم التشغيلي) */
  function iHours(F) {
    var m = {}, all = F.rdy.concat(F.ins, F.vio);
    all.forEach(function (r) { var h = Number(String(r.start_time).slice(11, 13)); if (!isNaN(h) && String(r.start_time).length > 12) m[h] = (m[h] || 0) + 1; });
    var hrs = []; for (var i = 0; i < 24; i++) hrs.push((i + 7) % 24);
    var mx = Math.max.apply(null, [1].concat(hrs.map(function (h) { return m[h] || 0; })));
    return '<div class="icols hrs">' + hrs.map(function (h) { var v = m[h] || 0; return '<div class="icol" title="' + ('0' + h).slice(-2) + ':00 · ' + v + '"><div class="ibars"><i style="height:' + (v / mx * 100).toFixed(1) + '%;background:' + I_COL[0] + '">' + (v ? '<em>' + v + '</em>' : '') + '</i></div><span class="ilb">' + ('0' + h).slice(-2) + '</span></div>'; }).join('') + '</div>';
  }
  function iByShift(rows) { return iCount(rows, function (r) { return r.shift ? String(r.shift) : ''; }).map(function (x) { return { l: iShName(x.l), v: x.v }; }); }
  function iByEmp(rows) { var m = {}; rows.forEach(function (r) { var k = iName(r); if (k) m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map(function (k) { return { l: k, v: m[k] }; }).sort(function (a, b) { return b.v - a.v; }); }
  function iRouteRate(rows) {
    var m = {}; rows.forEach(function (r) { var k = r.route || '—'; m[k] = m[k] || [0, 0]; m[k][0] += +r.no_tickets || 0; m[k][1] += +r.total_pax || 0; });
    return Object.keys(m).filter(function (k) { return m[k][1] > 0; }).map(function (k) { return { l: (st.lang === 'en' ? 'Route ' : 'مسار ') + k, v: Math.round(m[k][0] / m[k][1] * 1000) / 10, n: m[k][0], p: m[k][1] }; }).sort(function (a, b) { return b.v - a.v; });
  }
  function iSearch(rows, q) { q = String(q || '').trim().toLowerCase(); if (!q) return rows; return rows.filter(function (r) { return Object.keys(r).some(function (k) { var v = r[k]; return v !== '' && v !== null && (String(v).toLowerCase().indexOf(q) >= 0 || String(tr(String(v))).toLowerCase().indexOf(q) >= 0); }); }); }
  function iTable(kind, cols, rows, title) {
    var I = st.ins, list = iSearch(rows, I.q[kind]), show = list.slice(0, 400);
    return '<h3 class="rh3">' + esc(title) + '</h3><div class="toolbar noprint"><input class="input" type="search" data-iq-s="' + kind + '" placeholder="' + esc(it('search')) + '" value="' + esc(I.q[kind]) + '">' +
      '<button type="button" class="btn sm" data-icsv="' + kind + '">' + icon('download') + it('csv') + '</button><span class="muted"><span class="num">' + list.length + '</span> ' + it('rows') + (list.length > 400 ? ' · 400 ↓ CSV' : '') + '</span></div>' +
      '<div class="tblwrap rtbl"><table class="tbl twrap"><thead><tr>' + cols.map(function (c) { return '<th>' + esc(it(c[0])) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (show.length ? show.map(function (r) { return '<tr>' + cols.map(function (c) { return '<td' + (c[2] ? ' class="' + c[2] + '"' : '') + '>' + c[1](r) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + cols.length + '" class="empty">' + t('no_rows') + '</td></tr>') +
      '</tbody></table></div>';
  }

  /* أعمدة السجلات + نسخة CSV (نص بدون HTML) */
  var I_COLS = {
    rdy: function () { var items = st.ins.d.items; return [
      ['t_time', function (r) { return iTime(r.end_time || r.start_time); }], ['t_id', function (r) { return '<span class="ltr">' + esc(r.case_id) + '</span>'; }],
      ['t_loc', function (r) { return esc(r.location_type === 'محطة' || r.station ? tr(r.station || '') : it('bus_l')); }], ['t_bus', function (r) { return '<b class="ltr">' + esc(r.bus_no) + '</b>'; }],
      ['t_emp', function (r) { return esc(iName(r)) + '<div class="muted num">' + esc(r.emp_id) + '</div>'; }],
      ['t_res', function (r) { return +r.failed_count > 0 ? '<span class="tbad">✖ ' + esc(tr(r.failed_items) || r.failed_count) + '</span>' : '<span class="tok">' + it('okall') + '</span>'; }],
      ['t_items', function (r) { return '<span class="ichk">' + items.map(function (x) { var v = r[x[0]]; return '<i class="' + (v === 'غير مطابق' ? 'no' : v ? 'ok' : '') + '" title="' + esc(tr(x[1])) + '">' + esc(tr(x[1])) + '</i>'; }).join('') + '</span>'; }],
      ['t_notes', function (r) { return esc(r.notes); }], ['t_att', iLinks], ['t_entry', function (r) { return esc(iEntry(r.entry_method)); }]
    ]; },
    ins: function () { return [
      ['t_time', function (r) { return iTime(r.start_time); }], ['t_id', function (r) { return '<span class="ltr">' + esc(r.case_id) + '</span>'; }],
      ['t_bus', function (r) { return '<b class="ltr">' + esc(r.bus_no) + '</b>'; }], ['t_route', function (r) { return esc(r.route); }],
      ['t_emp', function (r) { return esc(iName(r)) + '<div class="muted num">' + esc(r.emp_id) + '</div>'; }],
      ['t_src', function (r) { return esc(tr(r.source || '')) + (r.cdc_ref ? '<div class="muted ltr">' + esc(r.cdc_ref) + '</div>' : ''); }],
      ['t_valid', function (r) { return r.valid_tickets; }, 'num'], ['t_not', function (r) { return r.no_tickets ? '<b class="twarn">' + r.no_tickets + '</b>' : '0'; }, 'num'], ['t_pax', function (r) { return r.total_pax; }, 'num'],
      ['t_vc', function (r) { return r.violations_count || ''; }, 'num'], ['t_dur', function (r) { return r.duration_min ? iDur(r.duration_min) : '—'; }],
      ['t_driver', function (r) { return '<span class="num">' + esc(r.driver_id) + '</span>'; }], ['t_notes', function (r) { return esc(r.notes); }], ['t_att', iLinks], ['t_entry', function (r) { return esc(iEntry(r.entry_method)); }]
    ]; },
    vio: function () { return [
      ['t_time', function (r) { return iTime(r.start_time); }], ['t_id', function (r) { return '<span class="ltr">' + esc(r.case_id) + '</span>'; }],
      ['t_type', function (r) { return esc(tr(r.violation_type)) + (r.violation_code ? '<div class="muted num">' + esc(r.violation_code) + '</div>' : ''); }],
      ['t_amt', function (r) { return '<b>' + iMoney(r.fine_amount) + '</b>'; }, 'num'], ['t_vno', function (r) { return '<span class="num">' + esc(r.violation_no) + '</span>'; }],
      ['t_loc', function (r) { return r.at_station ? esc(it('station') + ' ' + tr(r.station)) : '<span class="ltr">' + esc(r.bus_no) + '</span>' + (r.route ? ' / ' + esc(r.route) : ''); }],
      ['t_emp', function (r) { return esc(iName(r)) + '<div class="muted num">' + esc(r.emp_id) + '</div>'; }],
      ['t_911', function (r) { return r.police ? '🚨 <span class="ltr">' + esc(String(r.police_call_time).slice(11, 16)) + (r.police_arrival_time ? ' → ' + esc(String(r.police_arrival_time).slice(11, 16)) : '') + '</span>' : '—'; }],
      ['t_parent', function (r) { return r.parent_case_id ? '<span class="ltr muted">' + esc(r.parent_case_id) + '</span>' : ''; }],
      ['t_notes', function (r) { return esc(r.notes); }], ['t_att', iLinks], ['t_entry', function (r) { return esc(iEntry(r.entry_method)); }]
    ]; },
    cov: function () { return [
      ['t_emp', function (r) { return esc(iName(r)) + '<div class="muted num">' + esc(r.emp_id) + '</div>'; }], ['t_loc', function (r) { return esc(tr(r.station)); }],
      ['t_reason', function (r) { return esc(tr(r.reason || '')); }], ['t_start', function (r) { return iTime(r.start_time); }], ['t_end', function (r) { return iTime(r.end_time); }],
      ['t_dur', function (r) { return iDur(r.duration_min); }], ['t_status', function (r) { return esc(tr(r.status || '')); }]
    ]; }
  };
  var I_CSV = {
    rdy: [['t_time', 'end_time'], ['t_id', 'case_id'], ['t_loc', 'station'], ['t_bus', 'bus_no'], ['t_emp', 'emp_name'], ['emp', 'emp_id'], ['shift', 'shift'], ['t_res', 'failed_count'], ['t_items', 'failed_items'], ['t_notes', 'notes'], ['t_entry', 'entry_method']],
    ins: [['t_time', 'start_time'], ['t_id', 'case_id'], ['t_bus', 'bus_no'], ['t_route', 'route'], ['t_emp', 'emp_name'], ['emp', 'emp_id'], ['shift', 'shift'], ['t_src', 'source'], ['cdc_ref', 'cdc_ref'], ['t_valid', 'valid_tickets'], ['t_not', 'no_tickets'], ['t_pax', 'total_pax'], ['t_vc', 'violations_count'], ['t_dur', 'duration_min'], ['t_driver', 'driver_id'], ['t_notes', 'notes'], ['t_entry', 'entry_method']],
    vio: [['t_time', 'start_time'], ['t_id', 'case_id'], ['code', 'violation_code'], ['t_type', 'violation_type'], ['t_amt', 'fine_amount'], ['t_vno', 'violation_no'], ['t_loc', 'station'], ['t_bus', 'bus_no'], ['t_route', 'route'], ['t_emp', 'emp_name'], ['emp', 'emp_id'], ['shift', 'shift'], ['t_911', 'police'], ['call', 'police_call_time'], ['arrive', 'police_arrival_time'], ['t_parent', 'parent_case_id'], ['t_notes', 'notes']],
    cov: [['t_emp', 'emp_name'], ['emp', 'emp_id'], ['shift', 'shift'], ['t_loc', 'station'], ['t_reason', 'reason'], ['t_start', 'start_time'], ['t_end', 'end_time'], ['t_dur', 'duration_min'], ['t_status', 'status']]
  };
  function iCsvDl(name, head, rows) {
    var q = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var out = [head.map(q).join(',')].concat(rows.map(function (r) { return r.map(q).join(','); })).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + out], { type: 'text/csv;charset=utf-8' }));
    a.download = 'MBCO_' + name + '_' + st.ins.from + '_' + st.ins.to + '.csv'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- نظرة عامة ---------- */
  function insKpis(F) {
    var pax = iSum(F.ins, 'total_pax'), noT = iSum(F.ins, 'no_tickets'), ok = F.rdy.filter(function (r) { return !(+r.failed_count > 0); }).length;
    return { pax: pax, noT: noT, ok: ok, fines: iSum(F.vio, 'fine_amount'), police: F.vio.filter(function (r) { return r.police; }).length, covMin: iSum(F.cov, 'duration_min') };
  }
  function insOverview() {
    var F = insF(), K = insKpis(F);
    var h = '<div class="kpis k6">' +
      rKpi(it('k_rdy'), F.rdy.length) + rKpi(it('k_okr'), iPct(K.ok, F.rdy.length), 'ok') +
      rKpi(it('k_ins'), F.ins.length) + rKpi(it('k_pax'), K.pax) + rKpi(it('k_rate'), iPct(K.noT, K.pax), K.noT ? 'warn' : '') +
      rKpi(it('k_vio'), F.vio.length, F.vio.length ? 'bad' : '') + rKpi(it('k_fines') + ' (' + it('sar') + ')', iMoney(K.fines)) + rKpi(it('k_911'), K.police) +
      rKpi(it('k_cov') + ' (' + F.cov.length + ' ' + it('times') + ')', iDur(K.covMin)) + '</div>';
    h += '<div class="row2 r2eq">' + iCard(it('c_trend'), iTrend(F)) + iCard(it('c_hour'), iHours(F)) + '</div>';
    var items = st.ins.d.items.map(function (x) { return { l: x[1], v: F.rdy.filter(function (r) { return r[x[0]] === 'غير مطابق'; }).length }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    h += '<div class="igrid3">' +
      '<section class="card ipane" data-go="stn"><div class="chead"><span class="bar4"></span><h2>🚏 ' + it('stn') + '</h2><span class="muted num">' + F.rdy.length + '</span></div>' + iBars(items, null, 5) + '</section>' +
      '<section class="card ipane" data-go="enf"><div class="chead"><span class="bar4"></span><h2>🎫 ' + it('enf') + '</h2><span class="muted num">' + F.ins.length + '</span></div>' + iBars(iRouteRate(F.ins), function (v) { return v + '%'; }, 5) + '</section>' +
      '<section class="card ipane" data-go="vio"><div class="chead"><span class="bar4"></span><h2>📝 ' + it('vio') + '</h2><span class="muted num">' + F.vio.length + '</span></div>' + iBars(iCount(F.vio, function (r) { return r.violation_type || '—'; }), null, 5) + '</section>' +
      '</div>';
    return h;
  }

  /* ---------- فحص المحطات ---------- */
  function insStn() {
    var F = insF(), R = F.rdy, ok = R.filter(function (r) { return !(+r.failed_count > 0); }).length;
    var items = st.ins.d.items.map(function (x) { return { l: x[1], v: R.filter(function (r) { return r[x[0]] === 'غير مطابق'; }).length }; }).sort(function (a, b) { return b.v - a.v; });
    var stations = iCount(R, function (r) { return r.station || it('bus_l'); });
    return '<div class="kpis k6">' + rKpi(it('k_rdy'), R.length) + rKpi(it('k_ok'), ok + ' <small>' + iPct(ok, R.length) + '</small>', 'ok') + rKpi(it('k_fail'), R.length - ok, R.length - ok ? 'warn' : '') +
      rKpi(it('k_buses'), Object.keys(R.reduce(function (m, r) { if (r.bus_no) m[r.bus_no] = 1; return m; }, {})).length) + rKpi(it('k_stations'), stations.length) + '</div>' +
      '<div class="row2 r2eq">' + iCard(it('c_items'), iBars(items, function (v) { return v + ' <span class="muted">' + iPct(v, R.length) + '</span>'; })) +
      iCard(it('c_buses'), iBars(iCount(R.filter(function (r) { return +r.failed_count > 0; }), function (r) { return r.bus_no; }))) + '</div>' +
      '<div class="row2 r2eq">' + iCard(it('c_byst'), iBars(stations.map(function (s) { var f = R.filter(function (r) { return (r.station || it('bus_l')) === s.l && +r.failed_count > 0; }).length; return { l: s.l, v: s.v, f: f }; }), function (v, x) { return v + (x.f ? ' <span class="twarn">✖' + x.f + '</span>' : ''); })) +
      iCard(it('c_bysh') + ' · ' + it('c_byemp'), iBars(iByShift(R), null) + '<hr class="isep">' + iBars(iByEmp(R), null, 8)) + '</div>' +
      iTable('rdy', I_COLS.rdy(), R, it('rec_rdy'));
  }

  /* ---------- فحص التذاكر (+ التغطية) ---------- */
  function insEnf() {
    var F = insF(), R = F.ins, pax = iSum(R, 'total_pax'), noT = iSum(R, 'no_tickets'), cdc = R.filter(function (r) { return r.from_cdc; }).length;
    var dur = R.filter(function (r) { return +r.duration_min > 0; });
    var buses = {}; R.forEach(function (r) { if (r.bus_no && +r.no_tickets) buses[r.bus_no] = (buses[r.bus_no] || 0) + (+r.no_tickets); });
    return '<div class="kpis k6">' + rKpi(it('k_ins'), R.length) + rKpi(it('k_cdc'), cdc) + rKpi(it('k_pax'), pax) + rKpi(it('k_not'), noT + ' <small>' + iPct(noT, pax) + '</small>', noT ? 'warn' : '') +
      rKpi(it('k_dur'), dur.length ? iDur(iSum(dur, 'duration_min') / dur.length) : '—') + rKpi(it('k_invio'), iSum(R, 'violations_count')) +
      rKpi(it('k_cov') + ' (' + F.cov.length + ' ' + it('times') + ')', iDur(iSum(F.cov, 'duration_min'))) + '</div>' +
      '<div class="row2 r2eq">' + iCard(it('c_route'), iBars(iRouteRate(R), function (v, x) { return v + '% <span class="muted">(' + x.n + '/' + x.p + ')</span>'; }, 13)) +
      iCard(it('c_src'), iBars(iCount(R, function (r) { return r.source || '—'; }))) + '</div>' +
      '<div class="row2 r2eq">' + iCard(it('c_busnot'), iBars(Object.keys(buses).map(function (k) { return { l: k, v: buses[k] }; }).sort(function (a, b) { return b.v - a.v; }))) +
      iCard(it('c_bysh') + ' · ' + it('c_byemp'), iBars(iByShift(R), null) + '<hr class="isep">' + iBars(iByEmp(R), null, 8)) + '</div>' +
      iTable('ins', I_COLS.ins(), R, it('rec_ins')) +
      (F.cov.length ? '<div class="row2 r2eq" style="margin-top:14px">' + iCard(it('c_covst'), iBars(F.cov.reduce(function (a, r) { var k = r.station || '—', x = a.filter(function (y) { return y.l === k; })[0]; if (!x) a.push(x = { l: k, v: 0 }); x.v += +r.duration_min || 0; return a; }, []).sort(function (a, b) { return b.v - a.v; }), iDur)) + '</div>' : '') +
      iTable('cov', I_COLS.cov(), F.cov, it('rec_cov'));
  }

  /* ---------- المخالفات ---------- */
  function insVio() {
    var F = insF(), R = F.vio, fines = iSum(R, 'fine_amount'), pol = R.filter(function (r) { return r.police; });
    var arr = pol.map(function (r) { if (!r.police_call_time || !r.police_arrival_time) return null; var a = Date.parse(r.police_call_time.replace(' ', 'T')), b = Date.parse(r.police_arrival_time.replace(' ', 'T')); return b >= a ? (b - a) / 60000 : null; }).filter(function (x) { return x !== null && x < 600; });
    var amt = {}; R.forEach(function (r) { var k = r.violation_type || '—'; amt[k] = (amt[k] || 0) + (+r.fine_amount || 0); });
    var st_ = R.filter(function (r) { return r.at_station; }).length;
    return '<div class="kpis k6">' + rKpi(it('k_vio'), R.length, R.length ? 'bad' : '') + rKpi(it('k_fines') + ' (' + it('sar') + ')', iMoney(fines)) + rKpi(it('k_911'), pol.length) +
      rKpi(it('k_inbus'), R.length - st_) + rKpi(it('k_atstn'), st_) + rKpi(it('k_pol'), arr.length ? iDur(arr.reduce(function (a, b) { return a + b; }, 0) / arr.length) : '—') + '</div>' +
      '<div class="row2 r2eq">' + iCard(it('c_type'), iBars(iCount(R, function (r) { return r.violation_type || '—'; }), function (v, x) { return v + ' <span class="muted">· ' + iMoney(amt[x.l]) + '</span>'; }, 19)) +
      iCard(it('c_loc'), iBars(iCount(R, function (r) { return r.at_station ? it('station') + ' ' + (r.station || '') : it('inbus'); }))) + '</div>' +
      '<div class="row2 r2eq">' + iCard(it('c_vroute'), iBars(iCount(R.filter(function (r) { return r.route; }), function (r) { return (st.lang === 'en' ? 'Route ' : 'مسار ') + r.route; }), null, 13)) +
      iCard(it('c_bysh') + ' · ' + it('c_byemp'), iBars(iByShift(R), null) + '<hr class="isep">' + iBars(iByEmp(R), null, 8)) + '</div>' +
      iTable('vio', I_COLS.vio(), R, it('rec_vio'));
  }

  /* ---------- أداء الموظفين (من insKpi_ في الـ Hub) ---------- */
  var I_ECOLS = [
    ['name', 'emp', ''], ['id', 'e_id', ''], ['team', 'e_team', ''], ['days', 'e_days', ''], ['total', 'e_total', ''], ['perDay', 'e_pd', ''],
    ['stn.n', 'e_n', 'g_stn'], ['stn.okRate', 'e_okr', 'g_stn'], ['stn.failed', 'e_fail', 'g_stn'],
    ['enf.n', 'e_n', 'g_enf'], ['enf.pax', 'e_pax', 'g_enf'], ['enf.rate', 'e_rate', 'g_enf'], ['enf.avgDur', 'e_avg', 'g_enf'], ['enf.cdc', 'e_cdc', 'g_enf'],
    ['vio.n', 'e_n', 'g_vio'], ['vio.fines', 'e_amt', 'g_vio'], ['vio.police', 't_911', 'g_vio'],
    ['cov.n', 'times', 'g_cov'], ['cov.min', 'e_hrs', 'g_cov']
  ];
  function iGet(o, path) { return path.split('.').reduce(function (x, k) { return x === null || x === undefined ? x : x[k]; }, o); }
  function iEmpRows() {
    var I = st.ins;
    return I.d.kpi.filter(function (p) { return (!I.team || p.team === I.team) && (!I.emp || p.id === I.emp); }).slice().sort(function (a, b) {
      var x = iGet(a, I.sort.k), y = iGet(b, I.sort.k); x = x === null || x === undefined ? -1 : x; y = y === null || y === undefined ? -1 : y;
      if (I.sort.k === 'name') { x = iName(a); y = iName(b); return String(x).localeCompare(String(y), 'ar') * I.sort.d; }
      return (x > y ? 1 : x < y ? -1 : 0) * I.sort.d;
    });
  }
  function iEmpCell(p, k) {
    var v = iGet(p, k);
    if (k === 'name') return '<b>' + esc(iName(p)) + '</b>';
    if (k === 'team') return esc(rTeam(v));
    if (v === null || v === undefined) return '<span class="muted">—</span>';
    if (k === 'stn.okRate' || k === 'enf.rate') return v + '%';
    if (k === 'enf.avgDur') return iDur(v);
    if (k === 'cov.min') return (Math.round(v / 6) / 10).toString();
    if (k === 'vio.fines') return iMoney(v);
    return v === 0 ? '<span class="muted">0</span>' : esc(v);
  }
  function iECols() {
    var tm = st.ins.team, hide = tm === 'STN' ? { g_enf: 1, g_vio: 1, g_cov: 1 } : tm === 'ENF' ? { g_stn: 1 } : {};
    return I_ECOLS.filter(function (c) { return !hide[c[2]]; });
  }
  function insEmps() {
    var I = st.ins, rows = iEmpRows(), groups = [], I_ECOLS = iECols();
    I_ECOLS.forEach(function (c) { var g = c[2] || ''; if (!groups.length || groups[groups.length - 1].g !== g) groups.push({ g: g, n: 1 }); else groups[groups.length - 1].n++; });
    return '<div class="toolbar noprint"><div class="seg teams">' + [['', 't_all'], ['ENF', 't_enf'], ['STN', 't_stn']].map(function (x) { return '<button type="button" data-iteam="' + x[0] + '" class="' + (I.team === x[0] ? 'on' : '') + '">' + it(x[1]) + '</button>'; }).join('') + '</div>' +
      '<button type="button" class="btn sm" id="iEmpCsv">' + icon('download') + it('csv') + '</button><span class="muted"><span class="num">' + rows.length + '</span></span></div>' +
      (I.sh ? '<div class="romsg warn">' + it('e_shift') + '</div>' : '') +
      '<div class="tblwrap rtbl"><table class="tbl iemp"><thead><tr>' + groups.map(function (g) { return '<th colspan="' + g.n + '" class="' + (g.g ? 'grp' : 'grp0') + '">' + (g.g ? esc(it(g.g)) : '') + '</th>'; }).join('') + '</tr><tr>' +
      I_ECOLS.map(function (c) { return '<th data-isort="' + c[0] + '" class="srt' + (c[2] ? ' g' : '') + '">' + esc(it(c[1])) + (I.sort.k === c[0] ? (I.sort.d > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (p) { return '<tr>' + I_ECOLS.map(function (c) { return '<td class="' + (c[0] === 'name' || c[0] === 'team' ? '' : 'num') + (c[2] ? ' g' : '') + '">' + iEmpCell(p, c[0]) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + I_ECOLS.length + '" class="empty">' + t('no_rows') + '</td></tr>') +
      '</tbody></table></div><p class="muted rmeta">' + it('e_note') + '</p>';
  }

  /* ---------- التقرير (يومي أو للفترة) – بنفس نمط التقرير اليومي ---------- */
  function insDaily() {
    var I = st.ins, F = insF(), K = insKpis(F), one = I.from === I.to;
    var period = one ? I.from : I.from + ' → ' + I.to;
    var shifts = []; F.rdy.concat(F.ins, F.vio).forEach(function (r) { if (r.shift && shifts.indexOf(String(r.shift)) < 0) shifts.push(String(r.shift)); }); shifts.sort();
    var byShift = shifts.map(function (sh) { var f = function (r) { return String(r.shift) === sh; }, A = F.rdy.filter(f), B = F.ins.filter(f), C = F.vio.filter(f);
      return '<tr><td>' + esc(iShName(sh)) + '</td><td class="num">' + A.length + '</td><td class="num">' + A.filter(function (r) { return +r.failed_count > 0; }).length + '</td><td class="num">' + B.length + '</td><td class="num">' + iSum(B, 'total_pax') + '</td><td class="num">' + iSum(B, 'no_tickets') + '</td><td class="num">' + C.length + '</td><td class="num">' + iMoney(iSum(C, 'fine_amount')) + '</td></tr>'; }).join('');
    var E = {}; var g = function (r) { var k = String(r.emp_id || r.emp_name); return E[k] || (E[k] = { n: iName(r), id: r.emp_id, rdy: 0, ins: 0, vio: 0, f: 0 }); };
    F.rdy.forEach(function (r) { g(r).rdy++; }); F.ins.forEach(function (r) { g(r).ins++; }); F.vio.forEach(function (r) { var x = g(r); x.vio++; x.f += +r.fine_amount || 0; });
    var emps = Object.keys(E).map(function (k) { return E[k]; }).sort(function (a, b) { return (b.rdy + b.ins + b.vio) - (a.rdy + a.ins + a.vio); });
    var items = I.d.items.map(function (x) { return { l: x[1], v: F.rdy.filter(function (r) { return r[x[0]] === 'غير مطابق'; }).length }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    var amt = {}; F.vio.forEach(function (r) { var k = r.violation_type || '—'; amt[k] = (amt[k] || 0) + (+r.fine_amount || 0); });
    var th = function (a) { return '<tr>' + a.map(function (k) { return '<th>' + esc(it(k)) + '</th>'; }).join('') + '</tr>'; };
    var vioRows = F.vio.slice().sort(function (a, b) { return String(a.start_time).localeCompare(String(b.start_time)); }).map(function (r) {
      return '<tr><td>' + iTime(r.start_time) + '</td><td><b class="ltr" style="color:var(--accent-text)">' + esc(r.case_id) + '</b></td><td>' + esc(tr(r.violation_type)) + '</td><td class="num">' + iMoney(r.fine_amount) + '</td><td class="num">' + esc(r.violation_no) + '</td><td>' + (r.at_station ? esc(it('station') + ' ' + tr(r.station)) : '<span class="ltr">' + esc(r.bus_no) + (r.route ? ' / ' + esc(r.route) : '') + '</span>') + '</td><td>' + esc(iName(r)) + '</td><td>' + (r.police ? '🚨 <span class="ltr">' + esc(String(r.police_call_time).slice(11, 16)) + '</span>' : '—') + '</td></tr>'; }).join('');
    var rdyRows = F.rdy.filter(function (r) { return +r.failed_count > 0; }).map(function (r) {
      return '<tr><td>' + iTime(r.end_time || r.start_time) + '</td><td class="ltr">' + esc(r.bus_no) + '</td><td>' + esc(r.station ? tr(r.station) : it('bus_l')) + '</td><td class="tbad">' + esc(tr(r.failed_items)) + '</td><td>' + esc(iName(r)) + '</td><td>' + esc(r.notes) + '</td></tr>'; }).join('');
    var filt = [I.sh && it('shift') + ' ' + iShName(I.sh), I.emp && (document.getElementById('iEmp') || {}).selectedOptions && document.getElementById('iEmp').selectedOptions[0].text].filter(Boolean).join(' · ');
    return '<div class="toolbar noprint"><button type="button" class="btn primary sm" id="iPrint">' + icon('print') + it('print') + '</button></div>' +
      '<div class="card rrep"><div class="rrh"><div><b class="rlogo">MBCO</b><div class="muted">Modern Bus Company Limited</div></div><span class="tag b-acc">' + (one ? 'Daily' : 'Period') + ' · <span class="ltr">' + esc(period) + '</span></span></div>' +
      '<h2 class="rrt">' + it(one ? 'r_daily' : 'r_period') + '</h2><p class="muted rmeta">' + it('r_made') + ' <span class="ltr">' + esc(I.d.generated) + '</span>' + (filt ? ' · ' + esc(filt) : '') + '</p>' +
      '<div class="kpis k6">' + rKpi(it('k_rdy'), F.rdy.length) + rKpi(it('k_ok'), K.ok + ' <small>' + iPct(K.ok, F.rdy.length) + '</small>', 'ok') + rKpi(it('k_ins'), F.ins.length) + rKpi(it('k_pax'), K.pax) +
      rKpi(it('k_not'), K.noT + ' <small>' + iPct(K.noT, K.pax) + '</small>', K.noT ? 'warn' : '') + rKpi(it('k_vio'), F.vio.length, F.vio.length ? 'bad' : '') + rKpi(it('k_fines') + ' (' + it('sar') + ')', iMoney(K.fines)) + rKpi('🚨 ' + it('k_911'), K.police) + '</div>' +
      '<div class="row2 r2eq">' + iCard('🚏 ' + it('c_items'), iBars(items)) + iCard('📝 ' + it('c_type'), iBars(iCount(F.vio, function (r) { return r.violation_type || '—'; }), function (v, x) { return v + ' <span class="muted">· ' + iMoney(amt[x.l]) + '</span>'; }, 19)) + '</div>' +
      '<div class="row2 r2eq">' + iCard('🎫 ' + it('c_route'), iBars(iRouteRate(F.ins), function (v) { return v + '%'; }, 13)) + iCard(it('k_cov'), iBars(F.cov.reduce(function (a, r) { var k = r.station || '—', x = a.filter(function (y) { return y.l === k; })[0]; if (!x) a.push(x = { l: k, v: 0 }); x.v += +r.duration_min || 0; return a; }, []), iDur)) + '</div>' +
      '<h3 class="rh3">' + it('r_byshemp') + '</h3><div class="tblwrap"><table class="tbl"><thead>' + th(['shift', 'k_rdy', 'k_fail', 'k_ins', 'e_pax', 't_not', 'vio', 'e_amt']) + '</thead><tbody>' + (byShift || '<tr><td colspan="8" class="empty">—</td></tr>') + '</tbody></table></div>' +
      '<h3 class="rh3">' + it('r_emps') + '</h3><div class="tblwrap"><table class="tbl"><thead>' + th(['emp', 't_id', 'stn', 'enf', 'vio', 'e_amt']) + '</thead><tbody>' + (emps.map(function (x) { return '<tr><td>' + esc(x.n) + '</td><td class="num">' + esc(x.id) + '</td><td class="num">' + x.rdy + '</td><td class="num">' + x.ins + '</td><td class="num">' + x.vio + '</td><td class="num">' + iMoney(x.f) + '</td></tr>'; }).join('') || '<tr><td colspan="6" class="empty">—</td></tr>') + '</tbody></table></div>' +
      '<h3 class="rh3">' + it('rec_vio') + '</h3><div class="tblwrap"><table class="tbl twrap"><thead>' + th(['t_time', 't_id', 't_type', 't_amt', 't_vno', 't_loc', 't_emp', 't_911']) + '</thead><tbody>' + (vioRows || '<tr><td colspan="8" class="empty">' + it('r_novio') + '</td></tr>') + '</tbody></table></div>' +
      '<h3 class="rh3">' + it('r_rdyn') + '</h3><div class="tblwrap"><table class="tbl twrap"><thead>' + th(['t_time', 't_bus', 't_loc', 't_items', 't_emp', 't_notes']) + '</thead><tbody>' + (rdyRows || '<tr><td colspan="6" class="empty">' + it('r_nonotes') + '</td></tr>') + '</tbody></table></div>' +
      '<div class="rfoot muted"><span>' + it('r_foot') + '</span><span class="ltr">' + esc(period) + '</span></div></div>';
  }

  function insBind(b) {
    var I = st.ins;
    b.querySelectorAll('[data-go]').forEach(function (c) { c.onclick = function () { var btn = document.querySelector('[data-itab="' + c.getAttribute('data-go') + '"]'); if (btn) btn.click(); }; });
    b.querySelectorAll('[data-iq-s]').forEach(function (q) {
      q.oninput = function () { var k = q.getAttribute('data-iq-s'), pos = q.selectionStart; I.q[k] = q.value; insDraw(); var n = document.querySelector('[data-iq-s="' + k + '"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };
    });
    b.querySelectorAll('[data-icsv]').forEach(function (btn) {
      btn.onclick = function () {
        var k = btn.getAttribute('data-icsv'), F = insF(), rows = iSearch(F[k], I.q[k]), cols = I_CSV[k];
        iCsvDl({ rdy: 'station_inspections', ins: 'ticket_inspections', vio: 'violations', cov: 'station_coverage' }[k], cols.map(function (c) { return it(c[0]); }),
          rows.map(function (r) { return cols.map(function (c) { var v = r[c[1]]; return c[1] === 'police' ? (v ? 'نعم' : '') : typeof v === 'string' ? tr(v) : v; }); }));
      };
    });
    b.querySelectorAll('[data-iteam]').forEach(function (x) { x.onclick = function () { I.team = x.getAttribute('data-iteam'); insDraw(); }; });
    b.querySelectorAll('[data-isort]').forEach(function (th) { th.onclick = function () { var k = th.getAttribute('data-isort'); I.sort = { k: k, d: I.sort.k === k ? -I.sort.d : -1 }; insDraw(); }; });
    var ec = b.querySelector('#iEmpCsv');
    if (ec) ec.onclick = function () {
      var I_ECOLS = iECols();
      iCsvDl('staff_performance', I_ECOLS.map(function (c) { return (c[2] ? it(c[2]) + ' – ' : '') + it(c[1]); }), iEmpRows().map(function (p) {
        return I_ECOLS.map(function (c) { var v = iGet(p, c[0]); if (c[0] === 'name') return iName(p); if (c[0] === 'team') return rTeam(v); if (c[0] === 'cov.min') return Math.round((v || 0) / 6) / 10; return v === null || v === undefined ? '' : v; });
      }));
    };
    var pr = b.querySelector('#iPrint'); if (pr) pr.onclick = function () { window.print(); };
  }

  /* ================= بلاغات العمليات داخل البوابة (v2.2 – المرحلة 4) =================
     ⚠️ كل إجراء (استلام، تواصل، وصول، إغلاق، إلغاء، تحويل، بلاغ جديد، المستخدمين) يُرسل لواجهة نظام CDC نفسها
     (doPost في Code.gs) بجلسة الدخول الموحد، بنفس الطلبات اللي ترسلها صفحة البلاغات المستقلة حرفياً.
     فتبقى بطاقات تلقرام وWebhook تطبيق عمليات CDC (أديب) والسجل كما هي بدون أي تعديل.
     اللوحة والتحليل والسجل = قراءة فقط من الـ Hub (cdcDash). */
  var CD = {
    ar: {
      board: 'لوحة البلاغات', dash: 'نظرة عامة', insp: 'أداء المفتشين', nw: 'بلاغ جديد', daily: 'التقرير اليومي', log: 'السجل', users: 'المستخدمين',
      st_new: 'جديد', st_accepted: 'مستلم', st_contacted: 'تم التواصل', st_enroute: 'في الطريق', st_arrived: 'تم الوصول', st_patrol_called: 'بانتظار الدوريات', st_patrol_arrived: 'وصلت الدوريات', st_closed: 'مغلق', st_cancelled: 'ملغى',
      o_valid: 'تذكرة فعّالة (خلل في جهاز القارئ)', o_offload: 'إنزال الراكب', o_fine: 'تحرير مخالفة', o_bought: 'شراء تذكرة / حل ودي', o_left: 'نزل الراكب قبل وصول المفتش', o_false: 'بلاغ غير صحيح',
      o_left_patrol: 'نزل الراكب قبل وصول الدوريات الأمنية', o_nocoop: 'عدم تعاون الدوريات الأمنية', o_unreachable: 'تعذر التواصل مع السائق', o_not_taken: 'أُغلق دون استلام',
      os_valid: 'تذكرة فعّالة', os_offload: 'إنزال الراكب', os_fine: 'مخالفة', os_bought: 'شراء تذكرة', os_left: 'نزل قبل الوصول', os_false: 'بلاغ غير صحيح', os_left_patrol: 'نزل قبل الدوريات', os_nocoop: 'عدم تعاون الدوريات', os_unreachable: 'تعذر التواصل', os_not_taken: 'دون استلام',
      k_new: 'جديدة بانتظار الاستلام', k_prog: 'قيد المعالجة', k_closedT: 'أُغلقت اليوم', k_totalT: 'إجمالي بلاغات اليوم',
      f_open: 'المفتوحة', f_mine: 'حالاتي', f_closed: 'المغلقة', f_all: 'الكل', bsearch: 'بحث: رقم البلاغ، الحافلة، المسار، المحطة…',
      auto: 'يتحدّث تلقائياً كل 20 ثانية', none: 'لا توجد بلاغات في هذا العرض', elapsed: 'منذ', took: 'استغرقت', notyet: 'لم يُستلم بعد',
      busroute: 'الحافلة / المسار', dest: 'متجه إلى', driver: 'السائق', dphone: 'جوال السائق', rtime: 'وقت البلاغ', inspector: 'المفتش', stloc: 'موقع المحطة', creason: 'سبب الإلغاء', police: 'رقم بلاغ الشرطة', trlog: 'سجل التحويل',
      a_accept: 'استلام البلاغ', a_nx: '🗃 إغلاق دون استلام', a_tacc: '✅ قبول التحويل', a_tdec: 'رفض', a_tnear: '✋ أنا أقرب: استلام', a_tcan: 'إلغاء التحويل', a_contacted: 'تم التواصل مع السائق', a_uc: '📵 تعذر التواصل',
      a_enroute: 'التوجه للموقع', a_remote: 'إغلاق بدون توجه', a_arrived: 'تم الوصول + صورة', a_parr: '🚓 وصلت الدوريات', a_leftp: '🏃 نزل الراكب قبل وصول الدوريات', a_close: 'إغلاق الحالة', a_pcall: '🚨 استدعاء الدوريات الأمنية',
      a_nocoop: '⚠️ عدم تعاون الدوريات', a_police: '🚔 رقم بلاغ الشرطة', a_transfer: '🔁 تحويل', a_report: 'التقرير', a_cancel: 'إلغاء',
      tpend_to: 'تحويل معلّق إلى {n}، بانتظار قبوله', tpend_any: 'مطلوب مفتش أقرب، أول من يستلم تصير الحالة له', tpend_by: 'طلب {n}',
      remote: 'عن بُعد', test: '🧪 تجريبي', fromapp: '📲 CDC',
      // نوافذ
      back: 'رجوع', save: 'حفظ', cancel: 'إلغاء', done: 'تم', confirm_close: 'إغلاق الحالة',
      nx_t: '🗃 إغلاق بلاغ لم يُستلم', nx_s: 'البلاغ بيتقفل ويتسجل «أُغلق دون استلام» باسمك.', nx_time: 'تجاوز الوقت دون استلام', nx_shift: 'تبديل الشفت', nx_other: 'سبب آخر', note_opt: 'ملاحظة (اختياري)',
      uc_t: '📵 تعذر التواصل مع السائق', uc_s: 'بعد 3 محاولات تواصل فاشلة. الحالة بتتقفل بهذي النتيجة.', uc_off: 'الجوال مغلق', uc_noans: 'لا يجيب', uc_wrong: 'رقم خطأ',
      pol_t: 'رقم بلاغ الشرطة', pol_s: 'الصق رسالة الشرطة زي ما هي، والنظام ياخذ الرقم اللي بين القوسين.', pol_ok: '✓ رقم البلاغ: ', pol_no: 'لم يتم العثور على رقم بين قوسين', pol_saved: '🚔 تم حفظ رقم بلاغ الشرطة: ',
      tr_t: 'تحويل الحالة', tr_s: 'الحالة الحين مع {n}. اختر المفتش الأقرب للموقع.', tr_any: '📢 أي مفتش أقرب (أول من يستلم)', tr_direct: 'تعيين مباشر بدون انتظار قبول المفتش (للإدارة)', tr_hint: 'المفتش المختار يوصله إشعار، والحالة ما تنتقل له إلا بعد ما يضغط «قبول التحويل».', tr_send: 'إرسال طلب التحويل', tr_pick: 'للتعيين المباشر اختر مفتش محدد', tr_sent: '🔁 تم إرسال طلب التحويل', tr_set: '✅ تم تعيين الحالة',
      ar_t: 'تأكيد الوصول', ar_s: 'صوّر الحافلة عند الوصول (تظهر في تقرير الحالة)', ar_pick: '📷 التقاط / إضافة صورة الحافلة', ar_ok: 'تأكيد الوصول', ar_nophoto: 'المتابعة بدون صورة', ar_pref: 'يُفضَّل إرفاق صورة الحافلة',
      cl_t: 'إغلاق الحالة', cl_rt: 'إغلاق بدون توجه للموقع', cl_s: 'كيف تم التعامل مع الحالة؟ (يمكن اختيار أكثر من نتيجة)', cl_rs: 'انحلت الحالة بالتواصل مع السائق (يمكن اختيار أكثر من نتيجة)', cl_vno: 'رقم المخالفة', cl_pax: 'عدد الركاب', cl_notes: 'ملاحظات المفتش', cl_notes_ph: 'وصف مختصر لما حدث', cl_more: '📎 صور إضافية (المخالفة، التذكرة…)', cl_need_vno: 'أدخل رقم المخالفة', maxph: 'الحد الأقصى 6 صور',
      ca_t: 'إلغاء البلاغ', ca_s: 'مثلاً: بلاغ مكرر، أو أُرسل بالخطأ', ca_r: 'سبب الإلغاء', ca_ok: 'تأكيد الإلغاء', ca_need: 'اكتب سبب الإلغاء',
      wa_t: 'رسالة جاهزة للقروب', wa_s: '{t}: انسخها وأرسلها في قروب «مسارات»', wa_copy: 'نسخ الرسالة', wa_open: 'فتح واتساب', copied: 'تم النسخ ✓', tg_done: '✓ {t} — تحدّثت بطاقة البلاغ في تلقرام',
      newcase: '🔴 بلاغ جديد: ', t_acc: '✅ الحالة صارت معك', t_dec: 'تم رفض التحويل', t_can: 'تم إلغاء التحويل', nx_done: 'تم إغلاق البلاغ دون استلام', uc_done: 'تم إغلاق الحالة: تعذر التواصل',
      // بلاغ جديد
      n_t: 'تسجيل بلاغ جديد', n_1: '١) الصق رسالة البلاغ كما هي', n_1h: 'نفس صيغة رسالة الواتساب الحالية، والنظام يعبّي الحقول تلقائياً.', n_parse: 'قراءة الرسالة', n_2: '٢) راجع البيانات وأرسل البلاغ',
      n_send: 'إرسال البلاغ للمفتشين', n_auto: 'يسجَّل وقت البلاغ تلقائياً', n_read: '✓ تمت قراءة {n} حقول', n_noread: 'لم يتم التعرف على الحقول',
      fl_bus: 'رقم الحافلة *', fl_route: 'رقم المسار *', fl_dest: 'متجه إلى', fl_stationName: 'اسم المحطة', fl_stationUrl: 'رابط موقع المحطة', fl_type: 'نوع الحالة', fl_driverId: 'الرقم الوظيفي للسائق', fl_driverPhone: 'جوال السائق *', fl_driverName: 'اسم السائق', fl_opsName: 'مرحّل العمليات',
      // اللوحة
      from: 'من', to: 'إلى', today: 'اليوم', yday: 'أمس', d7: 'آخر 7 أيام', d30: 'آخر 30 يوم', shift: 'الوردية', sh1: 'الأولى', sh2: 'الثانية', sh0: 'خارج الورديات', all: 'الكل', updated: 'آخر تحديث',
      d_total: 'إجمالي البلاغات', d_closed: 'مغلقة', d_open: 'مفتوحة', d_remote: 'أُغلقت عن بُعد', d_fines: 'مخالفات محررة', d_take: 'متوسط زمن الاستلام', d_arrive: 'متوسط زمن الوصول', d_close: 'متوسط مدة الحالة',
      d_takeR: 'الاستلام خلال {m} د', d_arrR: 'الوصول خلال {m} د', d_patrol: 'استدعاء الدوريات', d_pavg: 'متوسط وصول الدوريات', d_nt: 'أُغلقت دون استلام', d_pax: 'عدد الركاب', d_canc: 'ملغاة (غير محتسبة)', target: 'الهدف',
      c_trend: 'البلاغات اليومية', c_hour: 'البلاغات حسب ساعة اليوم', c_out: 'النتائج', c_station: 'حسب المحطة', c_route: 'حسب المسار', c_emp: 'حسب المفتش', c_src: 'مصدر البلاغ', c_shift: 'حسب الوردية', c_bus: 'الحافلات المتكررة', c_tresp: 'متوسط زمن الاستلام حسب الساعة',
      s_closed: 'مغلقة', s_open: 'مفتوحة', src_app: '📲 تطبيق عمليات CDC', src_tg: '✈️ تلقرام', src_web: '🖥 الموقع', route_l: 'مسار ',
      // المفتشين
      e_name: 'المفتش', e_id: 'الرقم الوظيفي', e_n: 'البلاغات', e_closed: 'مغلقة', e_open: 'مفتوحة', e_remote: 'عن بُعد', e_fines: 'مخالفات', e_take: 'م. الاستلام', e_takeR: 'استلام بالهدف %', e_arr: 'م. الوصول', e_arrR: 'وصول بالهدف %', e_close: 'م. المدة', e_patrol: 'دوريات', e_nt: 'دون استلام', e_pax: 'ركاب',
      e_note: 'الأزمنة من وقت البلاغ. «بالهدف» = نسبة البلاغات اللي انستلمت أو وصلها المفتش خلال المدة المحددة في الإعدادات. هذي المؤشرات نفسها راح تنربط بصفحة KPI.',
      // السجل والتقرير
      l_no: 'رقم البلاغ', l_date: 'اليوم', l_time: 'الوقت', l_bus: 'الحافلة', l_route: 'المسار', l_station: 'المحطة', l_insp: 'المفتش', l_take: 'الاستلام', l_arr: 'الوصول', l_close: 'المدة', l_out: 'النتيجة', l_fine: 'المخالفة', l_status: 'الحالة', l_src: 'المصدر', l_ops: 'مرحّل العمليات', l_shift: 'الوردية',
      xlsx: 'تصدير Excel', rows: 'بلاغ', search: 'بحث: رقم البلاغ، الحافلة، المسار، المفتش…', clickcase: 'اضغط على أي بلاغ لفتح تقريره.',
      r_title: 'التقرير اليومي: الركاب بدون تذاكر', r_case: 'تقرير حالة راكب بدون تذكرة', r_gen: 'أُنشئ', print: 'طباعة / حفظ PDF', r_out: 'النتائج', r_byri: 'حسب المسار والمفتش', r_log: 'سجل الحالات', r_by: 'أعدّه',
      r_cases: 'البلاغات', r_trans: 'حالات محوّلة لمفتش أقرب', r_sum: 'ملخص الحالة', r_res: 'النتيجة والإفادة', r_how: 'طريقة التعامل', r_notes: 'ملاحظات المفتش', r_patrol: 'الدوريات الأمنية', r_dur: 'مدة الحالة', r_tl: 'الخط الزمني', r_photos: 'الصور',
      r_call: 'الاستدعاء', r_parr: 'الوصول', r_notarr: 'لم تصل', r_after: 'بعد', r_toacc: 'من البلاغ للاستلام', r_toarr: 'من البلاغ للوصول', r_total: 'الإجمالي', notreq: 'لم يتطلب', inprog: 'قيد المعالجة', loadph: 'جارِ تحميل الصورة…', phfail: 'تعذر تحميل الصورة',
      tl_requested: 'البلاغ', tl_accepted: 'الاستلام', tl_contacted: 'التواصل مع السائق', tl_enroute: 'التوجه للموقع', tl_arrived: 'الوصول', tl_patrol_called: 'استدعاء الدوريات', tl_patrol_arrived: 'وصول الدوريات', tl_closed: 'الإغلاق',
      // الجلسة
      ses_load: 'جارِ ربط حسابك في نظام البلاغات…', ses_nouser: 'رقمك الوظيفي ({emp}) غير مسجّل في مستخدمي نظام البلاغات. اللوحة والتحليل والسجل تشتغل، أما التحكم بالبلاغات فيحتاج حساب في CDC بنفس رقمك الوظيفي (تبويب المستخدمين).',
      ses_old: 'نظام CDC يحتاج تحديث Api.gs/PortalSso.gs (الدخول الموحد).', ses_err: 'تعذر الربط مع نظام البلاغات', ses_key: 'مشروع CDC اللي على رابط CDC_API ما فيه HUB_KEY (أو مفتاحه يختلف عن KEY_CDC في الـ Hub)، أو ما فيه Api.gs. أضفها في نفس المشروع اللي يستخدمه موقع البلاغات المستقل.', ses_html: 'رابط واجهة CDC (CDC_API في الـ Hub) يرجع صفحة بدل بيانات: الرابط غلط أو لنشر قديم. استخدم نفس API_URL الموجود في config.js حق موقع البلاغات المستقل', ses_noapi: 'رابط واجهة CDC غير معروف للـ Hub (URL_CDC).', role_ops: 'عمليات', role_insp: 'مفتش', role_admin: 'إدارة', as: 'حسابك في CDC:',
      // المستخدمين
      u_add: '+ مستخدم جديد', u_name: 'الاسم', u_user: 'اسم المستخدم', u_emp: 'الرقم الوظيفي', u_role: 'الدور', u_tg: 'تلقرام', u_state: 'الحالة', u_last: 'آخر دخول', u_edit: 'تعديل', u_approve: 'موافقة', u_link: 'ربط تلقرام',
      u_pend: 'طلب انضمام', u_active: 'نشط', u_must: 'بانتظار تغيير الرمز', u_off: 'موقوف', u_new: 'مستخدم جديد', u_ed: 'تعديل: ', u_pin_new: 'رمز مؤقت (4–8 أرقام)', u_pin: 'رمز دخول الموقع (اختياري)', u_isact: 'الحساب نشط',
      u_npend: '🆕 عندك {n} طلب انضمام من تلقرام. اضغط «موافقة»، واختر الدور، وفعّل «الحساب نشط».', u_saved: 'تم الحفظ ✓', u_hint: 'الأدوار: عمليات تسجّل البلاغات وتلغيها · مفتش يستلم ويعالج ويغلق · إدارة كل الصلاحيات وإدارة المستخدمين.',
      u_tl_t: 'ربط تلقرام: ', u_tl_s: 'أرسل الرابط للموظف. يفتح البوت ويضغط Start، والربط يتم تلقائياً. الرابط صالح {h} ساعات ولمرة وحدة.', u_copy: 'نسخ الرابط'
    },
    en: {
      board: 'Live board', dash: 'Overview', insp: 'Inspector performance', nw: 'New case', daily: 'Daily report', log: 'Log', users: 'Users',
      st_new: 'New', st_accepted: 'Accepted', st_contacted: 'Contacted', st_enroute: 'En route', st_arrived: 'Arrived', st_patrol_called: 'Waiting for patrol', st_patrol_arrived: 'Patrol arrived', st_closed: 'Closed', st_cancelled: 'Cancelled',
      o_valid: 'Valid ticket (reader fault)', o_offload: 'Passenger offloaded', o_fine: 'Fine issued', o_bought: 'Bought ticket / settled', o_left: 'Left before inspector arrived', o_false: 'False report',
      o_left_patrol: 'Left before patrol arrived', o_nocoop: 'Patrol did not cooperate', o_unreachable: 'Driver unreachable', o_not_taken: 'Closed without pickup',
      os_valid: 'Valid ticket', os_offload: 'Offloaded', os_fine: 'Fine', os_bought: 'Bought ticket', os_left: 'Left early', os_false: 'False report', os_left_patrol: 'Left before patrol', os_nocoop: 'No patrol coop.', os_unreachable: 'Unreachable', os_not_taken: 'Not taken',
      k_new: 'New, awaiting pickup', k_prog: 'In progress', k_closedT: 'Closed today', k_totalT: 'Total today',
      f_open: 'Open', f_mine: 'Mine', f_closed: 'Closed', f_all: 'All', bsearch: 'Search: case, bus, route, station…',
      auto: 'Auto-refreshes every 20 seconds', none: 'No cases in this view', elapsed: '', took: 'Took', notyet: 'Not picked up yet',
      busroute: 'Bus / route', dest: 'Heading to', driver: 'Driver', dphone: 'Driver phone', rtime: 'Reported', inspector: 'Inspector', stloc: 'Station location', creason: 'Cancel reason', police: 'Police report no.', trlog: 'Transfer log',
      a_accept: 'Pick up case', a_nx: '🗃 Close without pickup', a_tacc: '✅ Accept transfer', a_tdec: 'Decline', a_tnear: "✋ I'm closer: take it", a_tcan: 'Cancel transfer', a_contacted: 'Driver contacted', a_uc: '📵 Driver unreachable',
      a_enroute: 'Heading to site', a_remote: 'Close remotely', a_arrived: 'Arrived + photo', a_parr: '🚓 Patrol arrived', a_leftp: '🏃 Left before patrol', a_close: 'Close case', a_pcall: '🚨 Call security patrol',
      a_nocoop: '⚠️ Patrol did not cooperate', a_police: '🚔 Police report no.', a_transfer: '🔁 Transfer', a_report: 'Report', a_cancel: 'Cancel',
      tpend_to: 'Transfer pending to {n}, awaiting acceptance', tpend_any: 'Closer inspector needed — first to accept takes it', tpend_by: 'requested by {n}',
      remote: 'remote', test: '🧪 Test', fromapp: '📲 CDC',
      back: 'Back', save: 'Save', cancel: 'Cancel', done: 'Done', confirm_close: 'Close case',
      nx_t: '🗃 Close an untaken case', nx_s: 'The case closes as “Closed without pickup” under your name.', nx_time: 'Time exceeded without pickup', nx_shift: 'Shift change', nx_other: 'Other reason', note_opt: 'Note (optional)',
      uc_t: '📵 Driver unreachable', uc_s: 'After 3 failed attempts. The case closes with this outcome.', uc_off: 'Phone off', uc_noans: 'No answer', uc_wrong: 'Wrong number',
      pol_t: 'Police report no.', pol_s: 'Paste the police message as is; the number in brackets is extracted.', pol_ok: '✓ Report no.: ', pol_no: 'No number in brackets found', pol_saved: '🚔 Police report no. saved: ',
      tr_t: 'Transfer case', tr_s: 'The case is with {n}. Pick the inspector closest to the site.', tr_any: '📢 Any closer inspector (first to accept)', tr_direct: 'Assign directly without acceptance (admin)', tr_hint: 'The selected inspector is notified; the case moves only after they accept.', tr_send: 'Send transfer request', tr_pick: 'Pick a specific inspector for direct assignment', tr_sent: '🔁 Transfer request sent', tr_set: '✅ Case assigned',
      ar_t: 'Confirm arrival', ar_s: 'Photograph the bus on arrival (shown in the case report)', ar_pick: '📷 Take / add bus photo', ar_ok: 'Confirm arrival', ar_nophoto: 'Continue without photo', ar_pref: 'A bus photo is recommended',
      cl_t: 'Close case', cl_rt: 'Close without going to site', cl_s: 'How was the case handled? (multiple allowed)', cl_rs: 'Resolved by contacting the driver (multiple allowed)', cl_vno: 'Fine number', cl_pax: 'Passengers', cl_notes: 'Inspector notes', cl_notes_ph: 'Short description', cl_more: '📎 Extra photos (fine, ticket…)', cl_need_vno: 'Enter the fine number', maxph: 'Maximum 6 photos',
      ca_t: 'Cancel case', ca_s: 'e.g. duplicate or sent by mistake', ca_r: 'Cancel reason', ca_ok: 'Confirm cancel', ca_need: 'Enter a reason',
      wa_t: 'Message ready for the group', wa_s: '{t}: copy it to the “Masarat” group', wa_copy: 'Copy message', wa_open: 'Open WhatsApp', copied: 'Copied ✓', tg_done: '✓ {t} — Telegram card updated',
      newcase: '🔴 New case: ', t_acc: '✅ The case is now yours', t_dec: 'Transfer declined', t_can: 'Transfer cancelled', nx_done: 'Closed without pickup', uc_done: 'Closed: driver unreachable',
      n_t: 'Register a new case', n_1: '1) Paste the case message as is', n_1h: 'Same format as the WhatsApp message; fields fill automatically.', n_parse: 'Read message', n_2: '2) Review and send',
      n_send: 'Send to inspectors', n_auto: 'Report time is recorded automatically', n_read: '✓ {n} fields read', n_noread: 'No fields recognised',
      fl_bus: 'Bus no. *', fl_route: 'Route *', fl_dest: 'Heading to', fl_stationName: 'Station name', fl_stationUrl: 'Station location link', fl_type: 'Case type', fl_driverId: 'Driver ID', fl_driverPhone: 'Driver phone *', fl_driverName: 'Driver name', fl_opsName: 'Operations dispatcher',
      from: 'From', to: 'To', today: 'Today', yday: 'Yesterday', d7: 'Last 7 days', d30: 'Last 30 days', shift: 'Shift', sh1: 'First', sh2: 'Second', sh0: 'Off-shift', all: 'All', updated: 'Updated',
      d_total: 'Total cases', d_closed: 'Closed', d_open: 'Open', d_remote: 'Closed remotely', d_fines: 'Fines issued', d_take: 'Avg. pickup time', d_arrive: 'Avg. arrival time', d_close: 'Avg. case duration',
      d_takeR: 'Picked up within {m} m', d_arrR: 'Arrived within {m} m', d_patrol: 'Patrol calls', d_pavg: 'Avg. patrol arrival', d_nt: 'Closed without pickup', d_pax: 'Passengers', d_canc: 'Cancelled (excluded)', target: 'Target',
      c_trend: 'Daily cases', c_hour: 'Cases by hour', c_out: 'Outcomes', c_station: 'By station', c_route: 'By route', c_emp: 'By inspector', c_src: 'Case source', c_shift: 'By shift', c_bus: 'Repeat buses', c_tresp: 'Avg. pickup time by hour',
      s_closed: 'Closed', s_open: 'Open', src_app: '📲 CDC operations app', src_tg: '✈️ Telegram', src_web: '🖥 Website', route_l: 'Route ',
      e_name: 'Inspector', e_id: 'Employee ID', e_n: 'Cases', e_closed: 'Closed', e_open: 'Open', e_remote: 'Remote', e_fines: 'Fines', e_take: 'Avg. pickup', e_takeR: 'Pickup on target %', e_arr: 'Avg. arrival', e_arrR: 'Arrival on target %', e_close: 'Avg. duration', e_patrol: 'Patrol', e_nt: 'Not taken', e_pax: 'Pax',
      e_note: 'Times are from the report time. “On target” = share of cases picked up or reached within the limits in Settings. These same indicators will feed the KPI page.',
      l_no: 'Case', l_date: 'Day', l_time: 'Time', l_bus: 'Bus', l_route: 'Route', l_station: 'Station', l_insp: 'Inspector', l_take: 'Pickup', l_arr: 'Arrival', l_close: 'Duration', l_out: 'Outcome', l_fine: 'Fine', l_status: 'Status', l_src: 'Source', l_ops: 'Dispatcher', l_shift: 'Shift',
      xlsx: 'Export Excel', rows: 'cases', search: 'Search: case, bus, route, inspector…', clickcase: 'Click a case to open its report.',
      r_title: 'Daily report: passengers without tickets', r_case: 'Passenger without ticket – case report', r_gen: 'Generated', print: 'Print / save PDF', r_out: 'Outcomes', r_byri: 'By route and inspector', r_log: 'Case log', r_by: 'Prepared by',
      r_cases: 'Cases', r_trans: 'Cases transferred to a closer inspector', r_sum: 'Case summary', r_res: 'Outcome and statement', r_how: 'Handling', r_notes: 'Inspector notes', r_patrol: 'Security patrol', r_dur: 'Case duration', r_tl: 'Timeline', r_photos: 'Photos',
      r_call: 'Called', r_parr: 'Arrived', r_notarr: 'did not arrive', r_after: 'after', r_toacc: 'Report → pickup', r_toarr: 'Report → arrival', r_total: 'Total', notreq: 'Not required', inprog: 'In progress', loadph: 'Loading photo…', phfail: 'Photo failed to load',
      tl_requested: 'Report', tl_accepted: 'Pickup', tl_contacted: 'Driver contacted', tl_enroute: 'En route', tl_arrived: 'Arrival', tl_patrol_called: 'Patrol called', tl_patrol_arrived: 'Patrol arrived', tl_closed: 'Closed',
      ses_load: 'Connecting your cases-system account…', ses_nouser: 'Your employee ID ({emp}) is not registered in the cases system users. The overview, analysis and log work; controlling cases needs a CDC account with the same employee ID (Users tab).',
      ses_old: 'The CDC system needs the updated Api.gs/PortalSso.gs (single sign-on).', ses_err: 'Could not connect to the cases system', ses_key: 'The CDC project behind CDC_API has no HUB_KEY (or it differs from KEY_CDC in the Hub), or lacks Api.gs. Add them to the same project the standalone cases site uses.', ses_html: 'The CDC API link (CDC_API in the Hub) returns a page instead of data: wrong or old deployment link. Use the same API_URL as the standalone cases site config.js', ses_noapi: 'The Hub does not know the CDC API link (URL_CDC).', role_ops: 'Operations', role_insp: 'Inspector', role_admin: 'Admin', as: 'Your CDC account:',
      u_add: '+ New user', u_name: 'Name', u_user: 'Username', u_emp: 'Employee ID', u_role: 'Role', u_tg: 'Telegram', u_state: 'Status', u_last: 'Last login', u_edit: 'Edit', u_approve: 'Approve', u_link: 'Link Telegram',
      u_pend: 'Join request', u_active: 'Active', u_must: 'Must change PIN', u_off: 'Disabled', u_new: 'New user', u_ed: 'Edit: ', u_pin_new: 'Temporary PIN (4–8 digits)', u_pin: 'Website PIN (optional)', u_isact: 'Account active',
      u_npend: '🆕 {n} Telegram join request(s). Click “Approve”, pick a role and keep “Account active”.', u_saved: 'Saved ✓', u_hint: 'Roles: Operations registers and cancels cases · Inspector picks up, handles and closes · Admin has full rights incl. users.',
      u_tl_t: 'Link Telegram: ', u_tl_s: 'Send the link to the employee. They open the bot and press Start. Valid {h} hours, one use.', u_copy: 'Copy link'
    }
  };
  function cd(k, rep) { var L = CD[st.lang] || CD.ar, s = k in L ? L[k] : (k in CD.ar ? CD.ar[k] : k); if (rep) Object.keys(rep).forEach(function (x) { s = s.replace('{' + x + '}', rep[x]); }); return s; }
  var CD_OUT = [['valid', '#2E7D5B'], ['offload', '#B26A00'], ['fine', '#B3261E'], ['bought', '#1F5FA8'], ['left', '#6B7280'], ['false', '#9CA3AF'], ['left_patrol', '#7C5C2E'], ['nocoop', '#4A1D5E'], ['unreachable', '#9A3412'], ['not_taken', '#374151']];
  var CD_OC = {}; CD_OUT.forEach(function (o) { CD_OC[o[0]] = o[1]; });
  var CD_TAG = { 'new': 'b-bad', accepted: 'b-warn', contacted: 'b-acc', enroute: 'b-acc', arrived: 'b-ok', patrol_called: 'b-bad', patrol_arrived: 'b-acc', closed: 'b-muted', cancelled: 'b-muted' };
  var CD_ORDER = { 'new': 0, accepted: 1, contacted: 2, enroute: 3, arrived: 4, patrol_called: 5, patrol_arrived: 6, closed: 7, cancelled: 8 };
  var CD_ONSITE = ['arrived', 'patrol_called', 'patrol_arrived'], CD_BASE = ['offload', 'fine', 'valid', 'bought', 'left', 'false'], CD_REMOTE = ['valid', 'left', 'false', 'bought'];

  function cdState() {
    if (!st.cdc) st.cdc = { tab: ls.get('mbco_cdc_tab') || 'board', from: '', to: '', sh: '', emp: '', q: '', sort: { k: 'n', d: -1 }, d: null, at: 0, key: '',
      ses: null, sesErr: null, live: null, seen: {}, filter: 'open', bq: '', day: '', dayData: null, users: null, insp: null, photos: {}, view: null };
    return st.cdc;
  }
  function cdOpen(c) { return c.status !== 'closed' && c.status !== 'cancelled'; }
  var cdPad = function (n) { return ('0' + n).slice(-2); };
  function cdT(t) { if (!t) return '—'; var d = new Date(t); return cdPad(d.getHours()) + ':' + cdPad(d.getMinutes()); }
  function cdD(t) { var d = new Date(t); return d.getFullYear() + '-' + cdPad(d.getMonth() + 1) + '-' + cdPad(d.getDate()); }
  function cdDT(t) { return t ? cdD(t) + ' ' + cdT(t) : '—'; }
  function cdMins(a, b) { return a && b ? Math.max(0, Math.round((b - a) / 60000)) : null; }
  function cdDur(m) { if (m === null || m === undefined || isNaN(m)) return '—'; m = Math.round(m); var s = m < 60 ? m + ' ' + it('min') : Math.floor(m / 60) + ' ' + it('h') + ' ' + cdPad(m % 60) + ' ' + it('min'); return '<bdi dir="' + (st.lang === 'en' ? 'ltr' : 'rtl') + '">' + s + '</bdi>'; }
  function cdDurTxt(m) { if (m === null || m === undefined || isNaN(m)) return ''; m = Math.round(m); return m < 60 ? m + ' ' + it('min') : Math.floor(m / 60) + ' ' + it('h') + ' ' + cdPad(m % 60) + ' ' + it('min'); }
  function cdAvg(a) { var v = a.filter(function (x) { return x !== null && x !== undefined; }); return v.length ? Math.round(v.reduce(function (s, x) { return s + x; }, 0) / v.length) : null; }
  function cdDigits(s) { return String(s).replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); }).replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); }); }
  function cdChip(s) { return '<span class="tag ' + (CD_TAG[s] || 'b-muted') + '">' + esc(cd('st_' + s)) + '</span>'; }
  function cdOutB(keys) { return keys && keys.length ? '<div class="couts">' + keys.map(function (k) { return '<span class="cob" style="background:' + (CD_OC[k] || '#6B7280') + '">' + esc(cd('os_' + k)) + '</span>'; }).join('') + '</div>' : ''; }

  /* ---------- جلسة CDC (الدخول الموحد) + الاستدعاء المباشر لواجهة Code.gs ---------- */
  function cdSes(renew) {
    var C = cdState();
    if (DEMO) { C.ses = { token: 'demo', user: { username: 'majed', name: 'ماجد', role: 'admin' }, api: 'demo' }; return Promise.resolve(C.ses); }
    var memo = ls.json('mbco_cdc_sso'), cur = ls.json(CDC_SESSION);
    if (!renew && C.ses) return Promise.resolve(C.ses);
    if (!renew && memo && memo.api && cur && cur.token === memo.token && memo.emp === st.user.emp_id && Date.now() - memo.at < (memo.hours - 1) * 3600e3) {
      C.ses = { token: cur.token, user: cur.user, api: memo.api }; return Promise.resolve(C.ses);
    }
    return api('embed', { key: 'cdc', renew: !!renew }).then(function (j) {
      if (!j.session) { C.sesErr = j.reason || 'cdc_error'; C.ses = null; throw new Error('ses:' + C.sesErr); }
      if (!j.api) { C.sesErr = 'noapi'; throw new Error('ses:noapi'); }
      ls.set(CDC_SESSION, JSON.stringify(j.session));
      ls.set('mbco_cdc_sso', JSON.stringify({ token: j.session.token, emp: st.user.emp_id, at: Date.now(), hours: j.hours || 12, url: j.url, api: j.api }));
      C.sesErr = null; C.ses = { token: j.session.token, user: j.session.user, api: j.api };
      return C.ses;
    });
  }
  function capi(action, data, retried) {
    return cdSes(false).then(function (s) {
      var body = Object.assign({ action: action, token: s.token }, data || {});
      if (DEMO) return window.MBCO_DEMO.cdc(body, s);
      return fetch(s.api, { method: 'POST', redirect: 'follow', body: JSON.stringify(body) })
        .then(function (r) { return r.text(); }, function () { throw new Error('net'); })
        .then(function (txt) {
          try { return JSON.parse(txt); } catch (e) {
            // الرابط يرجع صفحة HTML (غالباً رابط نشر قديم أو غير صحيح في CDC_API)
            var u = String(s.api), short = u.replace(/^https:\/\/script\.google\.com\/macros\/s\//, '').replace(/\/exec.*$/, '');
            throw new Error(cd('ses_html') + ' [' + short.slice(0, 8) + '…' + short.slice(-6) + ']');
          }
        })
        .then(function (j) {
          if (!j.ok) {
            if (j.code === 'AUTH' && !retried && action !== 'login') { st.cdc.ses = null; ls.set('mbco_cdc_sso', null); return cdSes(true).then(function () { return capi(action, data, true); }); }
            throw new Error(j.error || 'generic');
          }
          return j.data;
        });
    });
  }
  function cdErr(e) { var m = String(e && e.message || e); return m === 'net' ? t('e_net') : m; }
  function cdSesMsg() {
    var r = st.cdc.sesErr;
    return r === 'cdc_no_user' ? cd('ses_nouser', { emp: st.user ? st.user.emp_id : '' }) : r === 'cdc_old_api' ? cd('ses_old') : r === 'noapi' ? cd('ses_noapi') : r === 'cdc_key' ? cd('ses_key') : r === 'cdc_badurl' ? cd('ses_html') : cd('ses_err');
  }
  function cdUser() { return st.cdc.ses ? st.cdc.ses.user : null; }
  function cdRole() { var u = cdUser(); return u ? u.role : ''; }

  /* ---------- الصفحة ---------- */
  function cdTabs() {
    var r = cdRole(), T = ['board', 'dash', 'insp'];
    if (r === 'ops' || r === 'admin') T.push('nw');
    T.push('daily', 'log');
    if (r === 'admin') T.push('users');
    return T;
  }
  function renderCdc(wrap, force) {
    var C = cdState();
    var shell = function () {
      var T = cdTabs(); if (T.indexOf(C.tab) < 0) C.tab = 'board';
      var nNew = C.live ? C.live.cases.filter(function (c) { return c.status === 'new'; }).length : 0;
      wrap.innerHTML = '<div class="card rsttools noprint"><div class="seg sub" id="cdTabs">' + T.map(function (k) {
        return '<button type="button" data-ctab="' + k + '" class="' + (C.tab === k ? 'on' : '') + '">' + cd(k) + (k === 'board' && nNew ? ' <span class="cnew">' + nNew + '</span>' : '') + '</button>'; }).join('') + '</div>' +
        '<div class="rstctl" id="cdRange"><label class="field">' + cd('from') + '<input class="input num" type="date" id="cFrom"></label><label class="field">' + cd('to') + '<input class="input num" type="date" id="cTo"></label>' +
        '<div class="ichips">' + [['0', 'today'], ['1', 'yday'], ['7', 'd7'], ['30', 'd30']].map(function (q) { return '<button type="button" class="ichip" data-cq="' + q[0] + '">' + cd(q[1]) + '</button>'; }).join('') + '</div>' +
        '<label class="field">' + cd('shift') + '<select class="input" id="cSh"></select></label><label class="field">' + cd('inspector') + '<select class="input" id="cEmp"></select></label>' +
        '<button type="button" class="btn sm" id="cRef">' + icon('refresh') + rt('refresh') + '</button></div><div class="cdwho muted" id="cdWho"></div></div><div id="cdBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div>';
      wrap.querySelectorAll('[data-ctab]').forEach(function (b) { b.onclick = function () { C.tab = b.getAttribute('data-ctab'); C.view = null; ls.set('mbco_cdc_tab', C.tab); cdTabBar(); cdGo(false); }; });
      var f = document.getElementById('cFrom'), tt = document.getElementById('cTo');
      f.onchange = tt.onchange = function () { C.from = f.value; C.to = tt.value; cdLoad(true); };
      wrap.querySelectorAll('[data-cq]').forEach(function (b) {
        b.onclick = function () { var n = +b.getAttribute('data-cq'), td = (C.d && C.d.today) || todayStr();
          if (n === 0) C.from = C.to = td; else if (n === 1) C.from = C.to = dAdd(td, -1); else { C.from = dAdd(td, -(n - 1)); C.to = td; }
          cdLoad(false); };
      });
      document.getElementById('cSh').onchange = function () { C.sh = this.value; cdDraw(); };
      document.getElementById('cEmp').onchange = function () { C.emp = this.value; cdDraw(); };
      document.getElementById('cRef').onclick = function () { if (C.tab === 'board') cdBoardLoad(false); else if (C.tab === 'daily') { C.dayData = null; cdDraw(); } else if (C.tab === 'users') { C.users = null; cdDraw(); } else cdLoad(true); };
    };
    if (!wrap.querySelector('#cdBody')) shell();
    cdSes(false).then(function () { if (!wrap.querySelector('#cdTabs') || wrap.querySelectorAll('[data-ctab]').length !== cdTabs().length) shell(); cdWho(); }, function () { cdWho(); })
      .then(function () { cdGo(force); });
  }
  function cdWho() {
    var w = document.getElementById('cdWho'); if (!w) return; var u = cdUser();
    w.innerHTML = u ? cd('as') + ' <b>' + esc(u.name) + '</b> · ' + esc(cd('role_' + u.role)) : (st.cdc.sesErr ? '⚠️ ' + esc(cdSesMsg()) : '');
  }
  function cdTabBar() {
    var C = st.cdc, nNew = C.live ? C.live.cases.filter(function (c) { return c.status === 'new'; }).length : 0;
    document.querySelectorAll('[data-ctab]').forEach(function (b) { var k = b.getAttribute('data-ctab'); b.classList.toggle('on', k === C.tab); b.innerHTML = cd(k) + (k === 'board' && nNew ? ' <span class="cnew">' + nNew + '</span>' : ''); });
    var rg = document.getElementById('cdRange'); if (rg) rg.classList.toggle('hide', ['board', 'nw', 'daily', 'users'].indexOf(C.tab) >= 0);
  }
  /* يحدد وش يحتاج التبويب: لوحة البلاغات/بلاغ جديد/التقرير/المستخدمين = واجهة CDC · الباقي = الـ Hub */
  function cdGo(force) {
    var C = st.cdc; cdTabBar();
    if (C.view) return cdCase(C.view);
    if (C.tab === 'board') return cdBoardLoad(!force && C.live && Date.now() - C.live.at < 15000);
    if (['nw', 'daily', 'users'].indexOf(C.tab) >= 0) return cdDraw();
    cdLoad(force);
  }
  function cdLoad(force) {
    var C = st.cdc, ck = C.from + '|' + C.to;
    if (C.d && C.key === ck && !force && Date.now() - C.at < 60000) return cdDraw();
    setSync(true);
    return api('cdcDash', { from: C.from, to: C.to, fresh: !!force }).then(function (j) {
      C.d = j.data; C.at = Date.now(); addDict(C.d.dict); C.from = C.d.from; C.to = C.d.to; C.key = C.from + '|' + C.to;
      var f = document.getElementById('cFrom'), tt = document.getElementById('cTo'); if (f) { f.value = C.from; tt.value = C.to; }
      if (route() === 'cdc') cdDraw();
    }).catch(function (e) { var b = document.getElementById('cdBody'); if (b && route() === 'cdc') failBox(b, e, function () { cdLoad(true); }); })
      .then(function () { setSync(false); });
  }
  function cdDraw() {
    var C = st.cdc, b = document.getElementById('cdBody'); if (!b) return;
    var needSes = ['board', 'nw', 'daily', 'users'].indexOf(C.tab) >= 0;
    if (needSes && !C.ses) { b.innerHTML = '<div class="ctlmsg"><div>' + icon('alert') + '</div><p>' + esc(cdSesMsg()) + '</p><button type="button" class="btn" id="cdRetry">' + rt('refresh') + '</button></div>'; document.getElementById('cdRetry').onclick = function () { cdSes(true).then(function () { cdGo(true); }, function () { cdWho(); cdDraw(); }); }; return; }
    if (!needSes && !C.d) return cdLoad(false);
    if (!needSes) cdFilters();
    b.innerHTML = ({ board: cdBoard, dash: cdDash, insp: cdInsp, nw: cdNew, daily: cdDaily, log: cdLog, users: cdUsers }[C.tab] || cdDash)();
    cdBind(b);
  }
  function cdFilters() {
    var C = st.cdc, D = C.d, sh = document.getElementById('cSh'), em = document.getElementById('cEmp'); if (!sh || !D) return;
    sh.innerHTML = '<option value="">' + cd('all') + '</option>' + ['1', '2', '0'].map(function (c) { return '<option value="' + c + '"' + (C.sh === c ? ' selected' : '') + '>' + cd('sh' + c) + '</option>'; }).join('');
    var seen = {}, list = []; D.rows.forEach(function (r) { var id = r.emp || r.empName; if (id && !seen[id]) { seen[id] = 1; list.push({ id: id, n: st.lang === 'en' ? tr(r.empName || id) : (r.empName || id) }); } });
    list.sort(function (a, b) { return String(a.n).localeCompare(String(b.n), 'ar'); });
    em.innerHTML = '<option value="">' + cd('all') + '</option>' + list.map(function (e) { return '<option value="' + esc(e.id) + '"' + (C.emp === e.id ? ' selected' : '') + '>' + esc(e.n) + '</option>'; }).join('');
  }
  function cdRows(withCancelled) {
    var C = st.cdc;
    return C.d.rows.filter(function (r) { return (withCancelled || !r.cancelled) && (!C.sh || r.shift === C.sh) && (!C.emp || (r.emp || r.empName) === C.emp); });
  }
  function cdName(r) { var n = r.empName || r.emp || ''; return st.lang === 'en' ? tr(n) : n; }

  /* ================= لوحة البلاغات (مباشرة من CDC) ================= */
  function cdBoardLoad(useCache) {
    var C = st.cdc;
    if (useCache) return cdDraw();
    setSync(true);
    return capi('board').then(function (d) {
      var fresh = d.cases.filter(function (c) { return c.status === 'new' && !C.seen[c.id]; });
      var first = !C.live;
      C.live = { cases: d.cases, tg: !!d.tg, at: Date.now() };
      d.cases.forEach(function (c) { C.seen[c.id] = 1; });
      if (!first && fresh.length && cdRole() !== 'ops') { cdBeep(); toast(cd('newcase') + fresh.map(function (c) { return c.caseNo + ' · ' + c.bus; }).join('، ')); }
      cdTabBar();
      if (route() === 'cdc' && C.tab === 'board' && !C.view && !document.querySelector('.mov')) cdDraw();
    }).catch(function (e) {
      var b = document.getElementById('cdBody');
      if (/^ses:/.test(e.message)) { cdWho(); return cdDraw(); }
      if (b && route() === 'cdc' && C.tab === 'board' && !C.live) failBox(b, e, function () { cdBoardLoad(false); });
      else toast('⚠️ ' + cdErr(e));
    }).then(function () { setSync(false); });
  }
  var cdAudio = null;
  function cdBeep() {
    try {
      cdAudio = cdAudio || new (window.AudioContext || window.webkitAudioContext)(); if (cdAudio.state === 'suspended') cdAudio.resume();
      [0, 0.22].forEach(function (d) { var o = cdAudio.createOscillator(), g = cdAudio.createGain(); o.frequency.value = 880; o.connect(g); g.connect(cdAudio.destination);
        g.gain.setValueAtTime(0.0001, cdAudio.currentTime + d); g.gain.exponentialRampToValueAtTime(0.25, cdAudio.currentTime + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, cdAudio.currentTime + d + 0.18);
        o.start(cdAudio.currentTime + d); o.stop(cdAudio.currentTime + d + 0.2); });
    } catch (e) {}
  }
  /* تحديث تلقائي كل 20 ثانية (فقط وصفحة البلاغات مفتوحة وظاهرة وبدون نافذة مفتوحة) */
  setInterval(function () {
    var C = st.cdc;
    if (!C || !st.user || route() !== 'cdc' || C.tab !== 'board' || C.view || document.visibilityState !== 'visible' || document.querySelector('.mov') || !C.ses) return;
    if (document.activeElement && document.activeElement.id === 'cdQ') return;
    cdBoardLoad(false);
  }, 20000);

  function cdBoard() {
    var C = st.cdc, L = C.live; if (!L) return '<div class="loading"><div class="spin"></div>' + t('loading') + '</div>';
    var today = cdD(Date.now()), u = cdUser();
    var todays = L.cases.filter(function (c) { return cdD(c.times.requested) === today && c.status !== 'cancelled'; });
    var nNew = L.cases.filter(function (c) { return c.status === 'new'; }).length;
    var prog = L.cases.filter(function (c) { return cdOpen(c) && c.status !== 'new'; }).length;
    var list = L.cases.slice();
    if (C.filter === 'open') list = list.filter(cdOpen);
    if (C.filter === 'closed') list = list.filter(function (c) { return !cdOpen(c); });
    if (C.filter === 'mine') list = list.filter(function (c) { return (c.inspector && c.inspector.username === u.username) || c.opsUser === u.username; });
    var q = String(C.bq || '').trim().toLowerCase();
    if (q) list = list.filter(function (c) { return [c.caseNo, c.bus, c.route, c.dest, c.driverId, c.inspector && c.inspector.name].join(' ').toLowerCase().indexOf(q) >= 0; });
    list.sort(function (a, b) { return (!cdOpen(a)) - (!cdOpen(b)) || (!cdOpen(a) ? (b.times.closed || 0) - (a.times.closed || 0) : CD_ORDER[a.status] - CD_ORDER[b.status] || a.times.requested - b.times.requested); });
    return '<div class="kpis k4">' + rKpi(cd('k_new'), nNew, nNew ? 'bad' : '') + rKpi(cd('k_prog'), prog) + rKpi(cd('k_closedT'), todays.filter(function (c) { return c.status === 'closed'; }).length, 'ok') + rKpi(cd('k_totalT'), todays.length) + '</div>' +
      '<div class="toolbar cdbar">' + ['open', 'mine', 'closed', 'all'].map(function (k) { return '<button type="button" class="ichip' + (C.filter === k ? ' on' : '') + '" data-cf="' + k + '">' + cd('f_' + k) + '</button>'; }).join('') +
      '<input class="input" type="search" id="cdQ" placeholder="' + esc(cd('bsearch')) + '" value="' + esc(C.bq) + '">' +
      (cdRole() === 'ops' || cdRole() === 'admin' ? '<button type="button" class="btn primary sm" data-cgo="nw">+ ' + cd('nw') + '</button>' : '') + '</div>' +
      (list.length ? '<div class="ccards">' + list.map(cdCard).join('') + '</div>' : '<div class="empty card">' + cd('none') + '</div>') +
      '<p class="muted rmeta">' + it('updated') + ' <span class="ltr">' + cdT(L.at) + '</span> · ' + cd('auto') + '</p>';
  }
  function cdCard(c) {
    var u = cdUser(), adm = u.role === 'admin', mine = adm || (c.inspector && c.inspector.username === u.username), tp = c.transferPending, A = [];
    var B = function (act, label, cls) { A.push('<button type="button" class="btn sm ' + (cls || '') + '" data-cact="' + act + '" data-cid="' + esc(c.id) + '">' + esc(label) + '</button>'); };
    var el = !cdOpen(c) ? (c.status === 'cancelled' ? cd('st_cancelled') : cd('took') + ' ' + cdDur(cdMins(c.times.requested, c.times.closed))) : (cd('elapsed') ? cd('elapsed') + ' ' : '') + cdDur(cdMins(c.times.requested, Date.now()));
    if (c.status === 'new' && (u.role === 'insp' || adm)) B('accept', cd('a_accept'), 'primary');
    if (c.status === 'new' && adm) B('nx', cd('a_nx'));
    if (tp && cdOpen(c)) {
      if (tp.to === u.username) { B('tAccept', cd('a_tacc'), 'primary'); B('tDecline', cd('a_tdec')); }
      else if (!tp.to && (u.role === 'insp' || adm) && !(c.inspector && c.inspector.username === u.username)) B('tAccept', cd('a_tnear'), 'primary');
      if (mine) B('tCancel', cd('a_tcan'));
    } else if (mine) {
      if (c.status === 'accepted') { B('contacted', cd('a_contacted'), 'primary'); B('uc', cd('a_uc')); }
      if (c.status === 'contacted') B('enroute', cd('a_enroute'), 'primary');
      if (c.status === 'accepted' || c.status === 'contacted') B('closeRemote', cd('a_remote'));
      if (c.status === 'enroute') B('arrived', cd('a_arrived'), 'primary');
      if (c.status === 'patrol_called') { B('pArr', cd('a_parr'), 'primary'); B('closeLeftP', cd('a_leftp')); }
      if (CD_ONSITE.indexOf(c.status) >= 0 || (adm && c.status === 'enroute')) B('close', cd('a_close'), c.status === 'patrol_called' ? '' : 'primary');
      if (c.status === 'arrived') B('pCall', cd('a_pcall'));
      if (c.status === 'patrol_arrived') B('closeNoCoop', cd('a_nocoop'), 'danger');
      if (c.times.patrol_called) B('police', cd('a_police'));
      if (['accepted', 'contacted', 'enroute'].concat(CD_ONSITE).indexOf(c.status) >= 0) B('transfer', cd('a_transfer'));
    }
    A.push('<button type="button" class="btn sm ghost" data-ccase="' + esc(c.id) + '">' + cd('a_report') + '</button>');
    if (cdOpen(c) && (u.role === 'ops' || adm)) A.push('<button type="button" class="btn sm danger cdend" data-cact="cancel" data-cid="' + esc(c.id) + '">' + cd('a_cancel') + '</button>');
    var phone = c.driverPhone ? '0' + c.driverPhone : '';
    var kv = function (k, v, full) { return '<div' + (full ? ' class="full"' : '') + '><span class="k">' + esc(cd(k)) + '</span>' + v + '</div>'; };
    return '<div class="card ccard ' + (c.status === 'new' ? 'isnew' : '') + '"><div class="cch"><b class="ltr cno">' + esc(c.caseNo) + '</b>' + cdChip(c.status) +
      (c.isTest ? '<span class="tag b-warn">' + cd('test') + '</span>' : '') + (String(c.source || '').indexOf('CDC') === 0 ? '<span class="tag b-mu">' + cd('fromapp') + '</span>' : '') +
      (c.remote && c.status === 'closed' ? '<span class="tag b-mu">' + cd('remote') + '</span>' : '') + '<span class="muted cel">' + el + '</span></div>' +
      '<div class="ckv">' + kv('busroute', '<b class="ltr">' + esc(c.bus) + '</b> / <span class="ltr">' + esc(c.route) + '</span>') + kv('dest', esc(tr(c.dest || ''))) +
      kv('driver', (c.driverName ? esc(c.driverName) + ' · ' : '') + '<span class="num">' + esc(c.driverId || '') + '</span>') +
      kv('dphone', phone ? '<a class="ltr" href="tel:+966' + esc(c.driverPhone) + '">📞 ' + esc(phone) + '</a>' : '—') +
      kv('rtime', '<span class="ltr">' + cdT(c.times.requested) + '</span> · ' + esc(c.opsName || '')) +
      kv('inspector', c.inspector ? esc(st.lang === 'en' ? tr(c.inspector.name) : c.inspector.name) : (c.status === 'cancelled' ? '—' : '<span class="tbad">' + cd('notyet') + '</span>')) +
      (c.stationUrl ? kv('stloc', '<a href="' + esc(c.stationUrl) + '" target="_blank" rel="noopener">' + esc(tr(c.stationName || c.dest || '')) + ' ↗</a>', 1) : '') +
      (c.status === 'cancelled' && c.cancelReason ? kv('creason', esc(c.cancelReason), 1) : '') +
      (c.policeNo ? kv('police', '<b class="num">' + esc(c.policeNo) + '</b>', 1) : '') +
      ((c.transfers || []).length ? kv('trlog', c.transfers.map(esc).join('<br>'), 1) : '') +
      (tp && cdOpen(c) ? '<div class="full ctp"><b>🔁 ' + esc(tp.to ? cd('tpend_to', { n: tp.toName }) : cd('tpend_any')) + '</b> <span class="muted">(' + esc(cd('tpend_by', { n: tp.fromName })) + ')</span></div>' : '') +
      '</div>' + cdOutB(c.outcomes) + '<div class="cacts">' + A.join('') + '</div></div>';
  }

  /* ---------- الإجراءات: نفس طلبات صفحة البلاغات حرفياً ---------- */
  function cdUpsert(c) {
    var C = st.cdc; if (!C.live) return;
    var i = -1; C.live.cases.forEach(function (x, k) { if (x.id === c.id) i = k; });
    if (i >= 0) C.live.cases[i] = c; else C.live.cases.push(c); C.seen[c.id] = 1;
    if (C.dayData) C.dayData.cases.forEach(function (x, k) { if (x.id === c.id) C.dayData.cases[k] = c; });
    C.at = 0; // اللوحة والسجل تُحدَّث في المرة الجاية
  }
  function cdRun(btn, fn) {
    if (btn) { if (btn.classList.contains('spinning')) return; btn.classList.add('spinning'); btn.disabled = true; }
    return Promise.resolve().then(fn).catch(function (e) { toast('⚠️ ' + cdErr(e)); }).then(function () { if (btn && btn.isConnected) { btn.classList.remove('spinning'); btn.disabled = false; } });
  }
  function cdAfter(n, step, title) { cdUpsert(n); cdModalClose(); cdDraw(); cdNotify(cdWaUpdate(n, step), n.caseNo + ' · ' + title); }
  function cdAct(id, a, btn) {
    var C = st.cdc, c = null; (C.live ? C.live.cases : []).forEach(function (x) { if (String(x.id) === String(id)) c = x; }); if (!c) return;
    var step = function (s) { return cdRun(btn, function () { return capi('step', { id: c.id, step: s }).then(function (n) { cdAfter(n, s, cd('st_' + s)); }); }); };
    if (a === 'accept') return step('accepted');
    if (a === 'contacted' || a === 'enroute') return step(a);
    if (a === 'pCall') return step('patrol_called');
    if (a === 'pArr') return step('patrol_arrived');
    if (a === 'closeLeftP') return cdCloseBox(c, false, ['left_patrol']);
    if (a === 'closeNoCoop') return cdCloseBox(c, false, ['nocoop']);
    if (a === 'arrived') return cdArrivedBox(c);
    if (a === 'close') return cdCloseBox(c, false, []);
    if (a === 'closeRemote') return cdCloseBox(c, true, []);
    if (a === 'cancel') return cdCancelBox(c);
    if (a === 'transfer') return cdTransferBox(c);
    if (a === 'police') return cdPoliceBox(c);
    if (a === 'nx') return cdReasonBox(c, cd('nx_t'), cd('nx_s'), { time: cd('nx_time'), shift: cd('nx_shift'), other: cd('nx_other') }, true, 'closeUnattended', cd('nx_done'));
    if (a === 'uc') return cdReasonBox(c, cd('uc_t'), cd('uc_s'), { off: cd('uc_off'), noans: cd('uc_noans'), wrong: cd('uc_wrong') }, false, 'closeUnreachable', cd('uc_done'));
    var tAct = { tAccept: ['transferAccept', cd('t_acc')], tDecline: ['transferDecline', cd('t_dec')], tCancel: ['transferCancel', cd('t_can')] }[a];
    if (tAct) return cdRun(btn, function () { return capi(tAct[0], { id: c.id }).then(function (n) { cdUpsert(n); cdDraw(); toast(tAct[1]); }); });
  }
  function cdModal(html, onMount, locked) {
    cdModalClose();
    var ov = document.createElement('div'); ov.className = 'mov'; ov.id = 'cdMov';
    ov.innerHTML = '<div class="mbox cdmbox" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(ov);
    if (!locked) ov.addEventListener('click', function (e) { if (e.target === ov) cdModalClose(); });
    ov.querySelectorAll('[data-x]').forEach(function (b) { b.onclick = cdModalClose; });
    if (onMount) onMount(ov);
  }
  function cdModalClose() { var o = document.getElementById('cdMov'); if (o) o.remove(); }
  function cdOptToggle(ov, sel) { ov.querySelectorAll(sel + ' input').forEach(function (i) { i.onchange = function () { ov.querySelectorAll(sel + ' .copt').forEach(function (l) { l.classList.toggle('on', l.querySelector('input').checked); }); }; }); }
  function cdReasonBox(c, title, sub, reasons, withNote, action, done) {
    var keys = Object.keys(reasons);
    cdModal('<h3>' + esc(c.caseNo) + ' · ' + esc(title) + '</h3><p class="muted">' + esc(sub) + '</p><div id="cdRl">' +
      keys.map(function (k, i) { return '<label class="copt' + (i ? '' : ' on') + '"><input type="radio" name="r" value="' + k + '"' + (i ? '' : ' checked') + '> ' + esc(reasons[k]) + '</label>'; }).join('') + '</div>' +
      (withNote ? '<label class="field">' + cd('note_opt') + '<input class="input" id="cdRn"></label>' : '') +
      '<div class="mrow"><button type="button" class="btn" data-x>' + cd('back') + '</button><button type="button" class="btn primary" id="cdOk">' + cd('confirm_close') + '</button></div>',
    function (ov) {
      cdOptToggle(ov, '#cdRl'); var ok = ov.querySelector('#cdOk');
      ok.onclick = function () { cdRun(ok, function () { return capi(action, { id: c.id, reason: ov.querySelector('#cdRl input:checked').value, note: (ov.querySelector('#cdRn') || {}).value || '' }).then(function (n) { cdAfter(n, 'closed', done); }); }); };
    });
  }
  function cdPoliceParse(v) {
    var tx = cdDigits(v).replace(/[‎‏‪-‮⁦-⁩]/g, ''), m = tx.match(/[(\[﴿（]\s*([^)\]﴾）]+?)\s*[)\]﴾）]/);
    if (m) return m[1].replace(/\s+/g, '');
    var s = tx.trim().replace(/\s+/g, ''); return /^[؀-ۿA-Za-z]{0,3}\d{4,15}$/.test(s) ? s : '';
  }
  function cdPoliceBox(c) {
    cdModal('<h3>' + esc(c.caseNo) + ' · ' + cd('pol_t') + '</h3><p class="muted">' + cd('pol_s') + '</p><textarea class="input" id="cdPm" rows="3" placeholder="بلاغكم (د8481343) محل اهتمامنا وجاري معالجته من الجهة المختصة ."></textarea><div class="muted" id="cdPv"></div>' +
      '<div class="mrow"><button type="button" class="btn" data-x>' + cd('cancel') + '</button><button type="button" class="btn primary" id="cdOk">' + cd('save') + '</button></div>',
    function (ov) {
      var ta = ov.querySelector('#cdPm'), pv = ov.querySelector('#cdPv'), ok = ov.querySelector('#cdOk'); ta.focus();
      ta.oninput = function () { var n = cdPoliceParse(ta.value); pv.textContent = n ? cd('pol_ok') + n : (ta.value.trim() ? cd('pol_no') : ''); pv.className = n ? 'tok' : 'tbad'; };
      ok.onclick = function () { if (!cdPoliceParse(ta.value)) return toast(cd('pol_no'));
        cdRun(ok, function () { return capi('policeNo', { id: c.id, text: ta.value }).then(function (n) { cdUpsert(n); cdModalClose(); cdDraw(); toast(cd('pol_saved') + n.policeNo); }); }); };
    });
  }
  function cdTransferBox(c) {
    var C = st.cdc;
    (C.insp ? Promise.resolve(C.insp) : capi('inspectors').then(function (l) { C.insp = l; return l; })).then(function (list) {
      list = list.filter(function (x) { return !(c.inspector && x.username === c.inspector.username); });
      var adm = cdRole() === 'admin';
      cdModal('<h3>' + esc(c.caseNo) + ' · ' + cd('tr_t') + '</h3><p class="muted">' + esc(cd('tr_s', { n: c.inspector ? c.inspector.name : '—' })) + '</p><div id="cdTl" class="cdscroll">' +
        '<label class="copt on"><input type="radio" name="to" value="" checked> ' + cd('tr_any') + '</label>' +
        list.map(function (x) { return '<label class="copt"><input type="radio" name="to" value="' + esc(x.username) + '"> 👮 ' + esc(x.name) + (x.employeeId ? ' <span class="muted num">' + esc(x.employeeId) + '</span>' : '') + '</label>'; }).join('') + '</div>' +
        (adm ? '<label class="copt"><input type="checkbox" id="cdDirect"> ' + cd('tr_direct') + '</label>' : '') + '<p class="muted">' + cd('tr_hint') + '</p>' +
        '<div class="mrow"><button type="button" class="btn" data-x>' + cd('cancel') + '</button><button type="button" class="btn primary" id="cdOk">' + cd('tr_send') + '</button></div>',
      function (ov) {
        cdOptToggle(ov, '#cdTl'); var ok = ov.querySelector('#cdOk');
        ok.onclick = function () {
          var to = ov.querySelector('#cdTl input:checked').value, d = ov.querySelector('#cdDirect'), direct = !!(d && d.checked);
          if (direct && !to) return toast(cd('tr_pick'));
          cdRun(ok, function () { return capi('transfer', { id: c.id, to: to, direct: direct }).then(function (n) { cdUpsert(n); cdModalClose(); cdDraw(); toast(direct ? cd('tr_set') : cd('tr_sent')); }); });
        };
      });
    }).catch(function (e) { toast('⚠️ ' + cdErr(e)); });
  }
  function cdFileUrl(file, max) {
    max = max || 1280;
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { var img = new Image(); img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', 0.75)); }; img.onerror = rej; img.src = r.result; };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function cdPhotos(ov, bucket) {
    var inp = ov.querySelector('#cdPh'), th = ov.querySelector('#cdTh'); if (!inp) return;
    inp.onchange = function () {
      var files = Array.prototype.slice.call(inp.files);
      files.reduce(function (p, f) { return p.then(function () { if (bucket.length >= 6) { toast(cd('maxph')); return; } return cdFileUrl(f).then(function (d) { bucket.push({ data: d }); }, function () {}); }); }, Promise.resolve())
        .then(function () { th.innerHTML = bucket.map(function (p) { return '<img src="' + p.data + '" alt="">'; }).join(''); inp.value = ''; });
    };
  }
  function cdArrivedBox(c) {
    var bucket = [];
    cdModal('<h3>' + esc(c.caseNo) + ' · ' + cd('ar_t') + '</h3><p class="muted">' + cd('ar_s') + '</p><label class="cdrop">' + cd('ar_pick') + '<input type="file" id="cdPh" accept="image/*" capture="environment" multiple hidden></label><div class="cthumbs" id="cdTh"></div>' +
      '<div class="mrow"><button type="button" class="btn" data-x>' + cd('cancel') + '</button><button type="button" class="btn primary" id="cdOk">' + cd('ar_ok') + '</button></div>',
    function (ov) {
      cdPhotos(ov, bucket); var ok = ov.querySelector('#cdOk');
      ok.onclick = function () {
        if (!bucket.length && !ok.getAttribute('data-w')) { ok.setAttribute('data-w', '1'); ok.textContent = cd('ar_nophoto'); toast(cd('ar_pref')); return; }
        cdRun(ok, function () { return capi('arrive', { id: c.id, photos: bucket }).then(function (n) { cdAfter(n, 'arrived', cd('st_arrived')); }); });
      };
    }, true);
  }
  function cdCloseBox(c, remote, pre) {
    var bucket = [], sel = {}; pre.forEach(function (k) { sel[k] = 1; });
    var allow = remote ? CD_REMOTE.slice() : CD_BASE.slice(); if (!remote && c.status === 'patrol_called') allow.push('left_patrol'); if (!remote && c.status === 'patrol_arrived') allow.push('nocoop');
    pre.forEach(function (k) { if (allow.indexOf(k) < 0) allow.push(k); });
    var opts = CD_OUT.filter(function (o) { return allow.indexOf(o[0]) >= 0; });
    var n = function () { return Object.keys(sel).length; };
    cdModal('<h3>' + esc(c.caseNo) + ' · ' + (remote ? cd('cl_rt') : cd('cl_t')) + '</h3><p class="muted">' + (remote ? cd('cl_rs') : cd('cl_s')) + '</p><div id="cdOpts">' +
      opts.map(function (o) { return '<label class="copt' + (sel[o[0]] ? ' on' : '') + '"><input type="checkbox" value="' + o[0] + '"' + (sel[o[0]] ? ' checked' : '') + '> <i class="csw" style="background:' + o[1] + '"></i>' + esc(cd('o_' + o[0])) + '</label>'; }).join('') + '</div>' +
      '<div class="cgrid2"><label class="field hide" id="cdVbox">' + cd('cl_vno') + '<input class="input ltr" id="cdVno"></label><label class="field">' + cd('cl_pax') + '<input class="input num" id="cdPax" type="number" min="1" value="' + (c.passengers || 1) + '"></label></div>' +
      '<label class="field">' + cd('cl_notes') + '<textarea class="input" id="cdNt" rows="3" placeholder="' + esc(cd('cl_notes_ph')) + '"></textarea></label>' +
      (remote ? '' : '<label class="cdrop">' + cd('cl_more') + '<input type="file" id="cdPh" accept="image/*" multiple hidden></label><div class="cthumbs" id="cdTh"></div>') +
      '<div class="mrow"><button type="button" class="btn" data-x>' + cd('cancel') + '</button><button type="button" class="btn primary" id="cdOk"' + (n() ? '' : ' disabled') + '>' + cd('confirm_close') + '</button></div>',
    function (ov) {
      if (!remote) cdPhotos(ov, bucket);
      var ok = ov.querySelector('#cdOk');
      ov.querySelectorAll('#cdOpts input').forEach(function (i) {
        i.onchange = function () { if (i.checked) sel[i.value] = 1; else delete sel[i.value]; i.closest('.copt').classList.toggle('on', i.checked); ov.querySelector('#cdVbox').classList.toggle('hide', !sel.fine); ok.disabled = !n(); };
      });
      ok.onclick = function () {
        var vno = ov.querySelector('#cdVno').value.trim();
        if (sel.fine && !vno) { toast(cd('cl_need_vno')); ov.querySelector('#cdVno').focus(); return; }
        cdRun(ok, function () {
          return capi('close', { id: c.id, remote: remote, outcomes: Object.keys(sel), violationNo: vno, passengers: +ov.querySelector('#cdPax').value || 1, notes: ov.querySelector('#cdNt').value.trim(), photos: bucket })
            .then(function (x) { cdAfter(x, 'closed', cd('st_closed')); });
        });
      };
    }, true);
  }
  function cdCancelBox(c) {
    cdModal('<h3>' + cd('ca_t') + ' ' + esc(c.caseNo) + '</h3><p class="muted">' + cd('ca_s') + '</p><label class="field">' + cd('ca_r') + '<input class="input" id="cdRs"></label>' +
      '<div class="mrow"><button type="button" class="btn" data-x>' + cd('back') + '</button><button type="button" class="btn primary" id="cdOk">' + cd('ca_ok') + '</button></div>',
    function (ov) {
      var ok = ov.querySelector('#cdOk'); ov.querySelector('#cdRs').focus();
      ok.onclick = function () { var r = ov.querySelector('#cdRs').value.trim(); if (!r) return toast(cd('ca_need'));
        cdRun(ok, function () { return capi('cancel', { id: c.id, reason: r }).then(function (n) { cdAfter(n, 'cancelled', cd('st_cancelled')); }); }); };
    });
  }
  /* رسائل القروب: نفس نص صفحة البلاغات (تظهر فقط لو تلقرام غير مفعّل في CDC) */
  function cdWaNew(c) {
    return '🔴 بلاغ جديد ' + c.caseNo + '\nرقم الحافلة: ' + c.bus + '\nالحالة: ' + c.type + '\nرقم المسار: ' + c.route + '\nمتجه إلى: ' + c.dest + '\nموقع المحطة - ' + c.stationName + ': ' + c.stationUrl +
      '\nالرقم الوظيفي: ' + c.driverId + '\nرقم الجوال: ' + c.driverPhone + '\nمرحل العمليات: ' + c.opsName + '\nوقت البلاغ: ' + cdT(c.times.requested);
  }
  function cdWaUpdate(c, step) {
    var ic = { accepted: '🟡', contacted: '🔵', enroute: '🟣', arrived: '🟢', patrol_called: '🚨', patrol_arrived: '🚓', closed: '✅', cancelled: '⚪' }[step] || '•';
    var lb = { accepted: 'تم الاستلام', contacted: 'تم التواصل مع السائق', enroute: 'المفتش في الطريق', arrived: 'تم الوصول', patrol_called: 'تم استدعاء الدوريات الأمنية', patrol_arrived: 'وصلت الدوريات الأمنية', closed: c.remote ? 'تم الإغلاق (عن بُعد)' : 'تم الإغلاق', cancelled: 'تم إلغاء البلاغ' }[step];
    var m = ic + ' ' + c.caseNo + ' | ' + lb + '\nالحافلة: ' + c.bus + ' | المسار: ' + c.route;
    if (step === 'cancelled') return m + '\nالسبب: ' + c.cancelReason;
    m += '\nالمفتش: ' + (c.inspector ? c.inspector.name + (c.inspector.id ? ' (' + c.inspector.id + ')' : '') : '—') + '\nالوقت: ' + cdT(c.times[step]);
    if (step === 'closed') {
      m += '\nالنتيجة: ' + c.outcomes.map(function (k) { return CD.ar['o_' + k] || k; }).join(' + ');
      if (c.violationNo) m += '\nرقم المخالفة: ' + c.violationNo;
      if (c.notes) m += '\nملاحظات: ' + c.notes;
      m += '\nمدة الحالة: ' + cdDurTxt(cdMins(c.times.requested, c.times.closed));
    }
    return m;
  }
  function cdNotify(text, title) {
    if (st.cdc.live && st.cdc.live.tg) { toast(cd('tg_done', { t: title })); return; }
    cdModal('<h3>' + cd('wa_t') + '</h3><p class="muted">' + esc(cd('wa_s', { t: title })) + '</p><textarea class="input cwa" id="cdWa" readonly rows="8">' + esc(text) + '</textarea>' +
      '<div class="mrow"><button type="button" class="btn" data-x>' + cd('done') + '</button><a class="btn" href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener">' + cd('wa_open') + '</a><button type="button" class="btn primary" id="cdCp">' + cd('wa_copy') + '</button></div>',
    function (ov) { ov.querySelector('#cdCp').onclick = function () { cdCopy(ov.querySelector('#cdWa')); }; });
  }
  function cdCopy(ta) {
    var done = function () { toast(cd('copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(ta.value).then(done, function () { ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} });
    else { ta.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
  }

  /* ================= بلاغ جديد (نفس قراءة الرسالة في صفحة البلاغات) ================= */
  var CD_FIELDS = [['bus', 'MA1019'], ['route', '10'], ['dest', 'شارع الحج (130)'], ['stationName', 'شارع الحج (130)'], ['stationUrl', 'https://cdc-ops.github.io/cdc-ops/#s=…'], ['type', 'ركاب بدون تذاكر'],
    ['driverId', '11483'], ['driverPhone', '582601767'], ['driverName', 'Amir Khan'], ['opsName', '']];
  function cdParse(txt) {
    var out = {}, clean = cdDigits(txt).replace(/[‎‏‪-‮⁦-⁩*_~`]/g, '').replace(/[   ]/g, ' ').replace(/[：﹕]/g, ':');
    if (/ركاب بدون تذاكر/.test(clean)) out.type = 'ركاب بدون تذاكر';
    clean.split(/\r?\n/).forEach(function (raw) {
      raw.split('|').forEach(function (seg) {
        var line = seg.trim(); if (!line) return;
        if (/^https?:\/\//.test(line)) { if (!out.stationUrl) out.stationUrl = line.split(/\s/)[0]; return; }
        var i = line.indexOf(':'); if (i < 0) return;
        var k = line.slice(0, i).replace(/^[^؀-ۿA-Za-z0-9]+/, '').replace(/\s+/g, ' ').trim(), v = line.slice(i + 1).trim(), url = (v.match(/https?:\/\/\S+/) || [])[0];
        if (/^رقم الحافلة|^الحافلة/.test(k)) out.bus = v.split(/\s/)[0].toUpperCase();
        else if (/^رقم المسار|^المسار/.test(k)) out.route = v.split(/\s/)[0];
        else if (/^نوع الحالة|^الحالة/.test(k)) out.type = v;
        else if (/^متجه/.test(k)) out.dest = v;
        else if (/^رقم الجوال|^الجوال|^جوال السائق/.test(k)) out.driverPhone = v;
        else if (/^الرقم الوظيفي/.test(k)) out.driverId = (v.match(/\d+/) || [v])[0];
        else if (/^اسم السائق|^السائق/.test(k)) {
          var m = v.match(/^(.*?)\s*[(\[]\s*(\d+)\s*[)\]]\s*$/);
          if (m) { if (m[1].trim()) out.driverName = m[1].trim(); if (!out.driverId) out.driverId = m[2]; }
          else if (/^\d+$/.test(v)) { if (!out.driverId) out.driverId = v; } else out.driverName = v;
        }
        else if (/^مر[حّ]+ل العمليات|^المرحل/.test(k)) out.opsName = v.replace(/\s*[(\[]\s*CDC\s*[)\]]\s*$/i, '').trim();
        else if (url) { out.stationUrl = url; var n = k.replace(/^موقع المحطة\s*[-–—]?\s*/, '').trim(); if (n && n !== 'موقع المحطة') out.stationName = n; }
      });
    });
    if (!out.stationName && out.dest) out.stationName = out.dest;
    return out;
  }
  function cdNew() {
    var u = cdUser();
    return '<div class="row2 r2eq"><section class="card"><div class="chead"><span class="bar4"></span><h2>' + cd('n_1') + '</h2></div><p class="muted">' + cd('n_1h') + '</p>' +
      '<textarea class="input cpaste" id="cdPaste" placeholder="رقم الحافلة: MA1019&#10;الحالة: ركاب بدون تذاكر&#10;رقم المسار: 10&#10;…"></textarea>' +
      '<div class="toolbar"><button type="button" class="btn primary sm" id="cdParse">' + cd('n_parse') + '</button><span id="cdPmsg" class="tok"></span></div></section>' +
      '<form class="card" id="cdFrm"><div class="chead"><span class="bar4"></span><h2>' + cd('n_2') + '</h2></div><div class="cgrid2">' +
      CD_FIELDS.map(function (f) { var k = f[0];
        return '<label class="field">' + cd('fl_' + k) + '<input class="input' + (['stationUrl', 'driverPhone', 'driverId', 'bus'].indexOf(k) >= 0 ? ' ltr' : '') + '" name="' + k + '" placeholder="' + esc(f[1]) + '"' + (['bus', 'route', 'driverPhone'].indexOf(k) >= 0 ? ' required' : '') +
          ' value="' + (k === 'type' ? 'ركاب بدون تذاكر' : k === 'opsName' ? esc(u ? u.name : '') : '') + '"></label>'; }).join('') +
      '</div><div class="toolbar"><button type="submit" class="btn primary">' + cd('n_send') + '</button><span class="muted">' + cd('n_auto') + '</span></div></form></div>';
  }

  /* ================= نظرة عامة (من الـ Hub) ================= */
  function cdKpis(R, all) {
    var D = st.cdc.d, T = D.targets, closed = R.filter(function (r) { return r.status === 'closed'; });
    var take = R.filter(function (r) { return r.mTake !== null; }), arr = R.filter(function (r) { return r.mArrive !== null; });
    return {
      total: R.length, closed: closed.length, open: R.length - closed.length, remote: closed.filter(function (r) { return r.remote; }).length,
      fines: R.filter(function (r) { return r.keys.indexOf('fine') >= 0; }).length, nt: R.filter(function (r) { return r.keys.indexOf('not_taken') >= 0; }).length,
      take: cdAvg(take.map(function (r) { return r.mTake; })), arrive: cdAvg(arr.map(function (r) { return r.mArrive; })),
      close: cdAvg(closed.filter(function (r) { return r.keys.indexOf('not_taken') < 0; }).map(function (r) { return r.mClose; })),
      takeR: take.length ? Math.round(take.filter(function (r) { return r.mTake <= T.takeMin; }).length / take.length * 100) : null,
      arrR: arr.length ? Math.round(arr.filter(function (r) { return r.mArrive <= T.arriveMin; }).length / arr.length * 100) : null,
      patrol: R.filter(function (r) { return r.pCalled; }).length, pavg: cdAvg(R.map(function (r) { return r.mPatrol; })),
      pax: closed.reduce(function (s, r) { return s + (r.pax || 1); }, 0), canc: all.filter(function (r) { return r.cancelled; }).length
    };
  }
  function cdTone(v, target) { return v === null ? '' : v >= target ? 'ok' : v >= target - 15 ? 'warn' : 'bad'; }
  function cdCols(labels, series, opts) {
    opts = opts || {};
    var mx = 1; labels.forEach(function (l, i) { series.forEach(function (s) { mx = Math.max(mx, s.v[i] || 0); }); });
    var step = Math.ceil(labels.length / (opts.max || 15));
    return (series.length > 1 ? '<div class="ilegend">' + series.map(function (s) { return '<span><i style="background:' + s.c + '"></i>' + esc(s.l) + '</span>'; }).join('') + '</div>' : '') +
      '<div class="icols' + (opts.cls ? ' ' + opts.cls : '') + '">' + labels.map(function (l, i) {
        return '<div class="icol" title="' + esc(l + ' · ' + series.map(function (s) { return s.l + ': ' + (opts.fmt ? opts.fmt(s.v[i]) : (s.v[i] || 0)); }).join(' · ')) + '"><div class="ibars">' + series.map(function (s) { var v = s.v[i] || 0;
          return '<i style="height:' + (v / mx * 100).toFixed(1) + '%;background:' + s.c + '">' + (labels.length <= (opts.lbl || 12) && v ? '<em>' + (opts.short ? opts.short(v) : v) + '</em>' : '') + '</i>'; }).join('') + '</div><span class="ilb">' + (i % step === 0 ? esc(opts.tick ? opts.tick(l) : l) : '') + '</span></div>';
      }).join('') + '</div>';
  }
  function cdDays() { var C = st.cdc, out = []; for (var x = C.from; x && x <= C.to && out.length < 120; x = dAdd(x, 1)) out.push(x); return out; }
  function cdHrs() { var h = []; for (var i = 0; i < 24; i++) h.push((i + 7) % 24); return h; }
  function cdGroup(R, fn) { var m = {}; R.forEach(function (r) { var k = fn(r); if (k === '' || k === null || k === undefined) return; (m[k] = m[k] || []).push(r); }); return Object.keys(m).map(function (k) { return { l: k, rows: m[k], v: m[k].length }; }).sort(function (a, b) { return b.v - a.v; }); }
  function cdDash() {
    var C = st.cdc, all = cdRows(true), R = all.filter(function (r) { return !r.cancelled; }), K = cdKpis(R, all), T = C.d.targets, has = function (f) { return C.d.fields.indexOf(f) >= 0; };
    var days = cdDays(), hrs = cdHrs();
    var h = '<div class="kpis k6">' + rKpi(cd('d_total'), K.total) + rKpi(cd('d_closed') + ' / ' + cd('d_open'), K.closed + ' <small>/ ' + K.open + '</small>') +
      rKpi(cd('d_take'), cdDur(K.take)) + rKpi(cd('d_takeR', { m: T.takeMin }), K.takeR === null ? '—' : K.takeR + '% <small>' + cd('target') + ' ' + T.take + '%</small>', cdTone(K.takeR, T.take)) +
      rKpi(cd('d_arrive'), cdDur(K.arrive)) + rKpi(cd('d_arrR', { m: T.arriveMin }), K.arrR === null ? '—' : K.arrR + '% <small>' + cd('target') + ' ' + T.arrive + '%</small>', cdTone(K.arrR, T.arrive)) +
      rKpi(cd('d_close'), cdDur(K.close)) + (has('remote') ? rKpi(cd('d_remote'), K.remote) : '') + rKpi(cd('d_fines'), K.fines, K.fines ? 'bad' : '') +
      (has('pCalled') ? rKpi('🚨 ' + cd('d_patrol'), K.patrol) + (has('pArrived') ? rKpi(cd('d_pavg'), cdDur(K.pavg)) : '') : '') +
      rKpi(cd('d_nt'), K.nt, K.nt ? 'warn' : '') + (has('pax') ? rKpi(cd('d_pax'), K.pax) : '') + (K.canc ? rKpi(cd('d_canc'), K.canc) : '') + '</div>';
    var byDay = function (fn) { return days.map(function (d) { return R.filter(function (r) { return r.date === d && fn(r); }).length; }); };
    h += '<div class="row2 r2eq">' + iCard(cd('c_trend'), cdCols(days, [{ l: cd('s_closed'), c: I_COL[0], v: byDay(function (r) { return r.status === 'closed'; }) }, { l: cd('s_open'), c: I_COL[1], v: byDay(function (r) { return r.status !== 'closed'; }) }], { tick: function (d) { return d.slice(5); } })) +
      iCard(cd('c_hour'), cdCols(hrs.map(function (x) { return cdPad(x); }), [{ l: cd('r_cases'), c: I_COL[0], v: hrs.map(function (x) { return R.filter(function (r) { return Number(String(r.time).slice(11, 13)) === x; }).length; }) }], { cls: 'hrs', lbl: 24, max: 24 })) + '</div>';
    var outs = CD_OUT.map(function (o) { return { l: cd('os_' + o[0]), v: R.filter(function (r) { return r.keys.indexOf(o[0]) >= 0; }).length, c: o[1] }; }).filter(function (x) { return x.v; }).sort(function (a, b) { return b.v - a.v; });
    var avgTake = function (rows) { return cdAvg(rows.map(function (r) { return r.mTake; })); };
    h += '<div class="row2 r2eq">' + iCard(cd('c_out'), iBars(outs, function (v) { return v + ' <span class="muted">' + iPct(v, K.closed) + '</span>'; }, 10)) +
      iCard(cd('c_tresp'), cdCols(hrs.map(function (x) { return cdPad(x); }), [{ l: cd('d_take'), c: I_COL[2], v: hrs.map(function (x) { return avgTake(R.filter(function (r) { return Number(String(r.time).slice(11, 13)) === x; })) || 0; }) }], { cls: 'hrs', lbl: 24, max: 24, fmt: function (v) { return v ? cdDurTxt(v) : '—'; } })) + '</div>';
    var grp = function (fn, lab) { return cdGroup(R, fn).map(function (g) { return { l: lab ? lab(g.l) : g.l, v: g.v, t: avgTake(g.rows), a: cdAvg(g.rows.map(function (r) { return r.mArrive; })) }; }); };
    var fmtGA = function (v, x) { return v + (x.t !== null ? ' <span class="muted">· ⏱' + cdDur(x.t) + '</span>' : ''); };
    h += '<div class="row2 r2eq">' + iCard(cd('c_station'), iBars(grp(function (r) { return r.station || r.dest; }), fmtGA, 12)) + iCard(cd('c_route'), iBars(grp(function (r) { return r.route; }, function (l) { return cd('route_l') + l; }), fmtGA, 13)) + '</div>';
    h += '<div class="row2 r2eq">' + iCard(cd('c_emp'), iBars(grp(function (r) { return cdName(r); }), function (v, x) { return v + (x.t !== null ? ' <span class="muted">· ⏱' + cdDur(x.t) + (x.a !== null ? ' · 📍' + cdDur(x.a) : '') + '</span>' : ''); }, 12)) +
      iCard(cd('c_shift') + ' · ' + cd('c_src'), iBars(cdGroup(R, function (r) { return r.shift; }).map(function (g) { return { l: cd('sh' + g.l), v: g.v }; })) + '<hr class="isep">' +
        iBars(cdGroup(R, function (r) { return r.src; }).map(function (g) { return { l: cd('src_' + g.l), v: g.v }; })) + '<hr class="isep">' +
        iBars(cdGroup(R, function (r) { return r.bus; }).filter(function (g) { return g.v > 1; }).map(function (g) { return { l: g.l, v: g.v }; }), null, 6)) + '</div>';
    return h + '<p class="muted rmeta">' + it('updated') + ' <span class="ltr">' + esc(String(C.d.generated).slice(11)) + '</span> · ⏱ = ' + cd('d_take') + ' · 📍 = ' + cd('d_arrive') + '</p>';
  }

  /* ================= أداء المفتشين (cdcKpi_ من الـ Hub) ================= */
  var CD_ECOLS = [['name', 'e_name'], ['id', 'e_id'], ['n', 'e_n'], ['closed', 'e_closed'], ['open', 'e_open'], ['remote', 'e_remote'], ['fines', 'e_fines'], ['take.avg', 'e_take'], ['take.rate', 'e_takeR'],
    ['arrive.avg', 'e_arr'], ['arrive.rate', 'e_arrR'], ['close.avg', 'e_close'], ['patrol.n', 'e_patrol'], ['notTaken', 'e_nt'], ['pax', 'e_pax']];
  function cdEmpRows() {
    var C = st.cdc;
    return C.d.kpi.filter(function (p) { return !C.emp || (p.id || p.name) === C.emp; }).slice().sort(function (a, b) {
      if (C.sort.k === 'name') return String(a.name).localeCompare(String(b.name), 'ar') * C.sort.d;
      var x = iGet(a, C.sort.k), y = iGet(b, C.sort.k); x = x === null || x === undefined ? -1 : x; y = y === null || y === undefined ? -1 : y; return (x > y ? 1 : x < y ? -1 : 0) * C.sort.d;
    });
  }
  function cdEmpCell(p, k) {
    var v = iGet(p, k), T = st.cdc.d.targets;
    if (k === 'name') return '<b>' + esc(st.lang === 'en' ? tr(p.name) : p.name) + '</b>';
    if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
    if (/\.avg$/.test(k)) return cdDur(v);
    if (/\.rate$/.test(k)) return '<span class="' + ({ ok: 'tok', warn: 'twarn', bad: 'tbad' }[cdTone(v, k === 'take.rate' ? T.take : T.arrive)] || '') + '">' + v + '%</span>';
    return v === 0 ? '<span class="muted">0</span>' : esc(v);
  }
  function cdInsp() {
    var C = st.cdc, rows = cdEmpRows();
    return (C.sh ? '<div class="romsg warn">' + it('e_shift') + '</div>' : '') + '<div class="toolbar"><button type="button" class="btn sm" id="cdEmpX">' + icon('download') + cd('xlsx') + '</button><span class="muted num">' + rows.length + '</span></div>' +
      '<div class="tblwrap rtbl"><table class="tbl iemp"><thead><tr>' + CD_ECOLS.map(function (c) { return '<th data-csort="' + c[0] + '" class="srt">' + esc(cd(c[1])) + (C.sort.k === c[0] ? (C.sort.d > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rows.length ? rows.map(function (p) { return '<tr>' + CD_ECOLS.map(function (c) { return '<td class="' + (c[0] === 'name' ? '' : 'num') + '">' + cdEmpCell(p, c[0]) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + CD_ECOLS.length + '" class="empty">' + t('no_rows') + '</td></tr>') +
      '</tbody></table></div><p class="muted rmeta">' + cd('e_note') + '</p>';
  }

  /* ================= السجل + Excel ================= */
  var CD_LCOLS = [
    ['l_no', function (r) { return '<b class="ltr cno">' + esc(r.no) + '</b>'; }, function (r) { return r.no; }],
    ['l_date', function (r) { return '<span class="ltr">' + esc(r.date.slice(5)) + '</span>'; }, function (r) { return r.date; }],
    ['l_time', function (r) { return '<span class="ltr">' + esc(String(r.time).slice(11, 16)) + '</span>'; }, function (r) { return String(r.time).slice(11, 16); }],
    ['l_shift', function (r) { return esc(cd('sh' + r.shift)); }, function (r) { return cd('sh' + r.shift); }],
    ['l_bus', function (r) { return '<b class="ltr">' + esc(r.bus) + '</b>'; }, function (r) { return r.bus; }],
    ['l_route', function (r) { return esc(r.route); }, function (r) { return r.route; }],
    ['l_station', function (r) { return esc(tr(r.station || r.dest)); }, function (r) { return r.station || r.dest; }],
    ['l_insp', function (r) { return esc(cdName(r)) + (r.emp && /^\d+$/.test(r.emp) ? '<div class="muted num">' + esc(r.emp) + '</div>' : ''); }, function (r) { return r.empName || r.emp; }],
    ['l_take', function (r) { return cdDur(r.mTake); }, function (r) { return r.mTake === null ? '' : r.mTake; }],
    ['l_arr', function (r) { return r.remote && r.status === 'closed' ? cd('remote') : cdDur(r.mArrive); }, function (r) { return r.remote && r.status === 'closed' ? cd('remote') : (r.mArrive === null ? '' : r.mArrive); }],
    ['l_close', function (r) { return cdDur(r.mClose); }, function (r) { return r.mClose === null ? '' : r.mClose; }],
    ['l_out', function (r) { return cdOutB(r.keys) || '—'; }, function (r) { return r.keys.map(function (k) { return cd('os_' + k); }).join(' + '); }],
    ['l_fine', function (r) { return '<span class="num">' + esc(r.fine || '—') + '</span>'; }, function (r) { return r.fine; }],
    ['l_status', function (r) { return cdChip(r.status); }, function (r) { return cd('st_' + r.status); }],
    ['l_src', function (r) { return '<span title="' + esc(cd('src_' + r.src)) + '">' + esc(cd('src_' + r.src).split(' ')[0]) + '</span>'; }, function (r) { return cd('src_' + r.src).replace(/^\S+\s/, ''); }],
    ['l_ops', function (r) { return esc(r.ops); }, function (r) { return r.ops; }]
  ];
  function cdLogRows() {
    var C = st.cdc, q = String(C.q || '').trim().toLowerCase(), R = cdRows(true);
    if (q) R = R.filter(function (r) { return [r.no, r.bus, r.route, r.station, r.dest, r.empName, r.emp, r.fine, r.ops, tr(r.empName || '')].join(' ').toLowerCase().indexOf(q) >= 0; });
    return R;
  }
  function cdLog() {
    var C = st.cdc, R = cdLogRows(), show = R.slice(0, 500);
    return '<div class="toolbar"><input class="input" type="search" id="cdLq" placeholder="' + esc(cd('search')) + '" value="' + esc(C.q) + '"><button type="button" class="btn sm primary" id="cdLx">' + icon('download') + cd('xlsx') + '</button>' +
      '<span class="muted"><span class="num">' + R.length + '</span> ' + cd('rows') + (R.length > 500 ? ' · 500 ↓ Excel' : '') + '</span></div>' +
      '<div class="tblwrap rtbl"><table class="tbl clog"><thead><tr>' + CD_LCOLS.map(function (c) { return '<th>' + esc(cd(c[0])) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (show.length ? show.map(function (r) { return '<tr class="clk" data-cno="' + esc(r.no) + '" data-cdate="' + esc(r.date) + '">' + CD_LCOLS.map(function (c) { return '<td>' + c[1](r) + '</td>'; }).join('') + '</tr>'; }).join('') : '<tr><td colspan="' + CD_LCOLS.length + '" class="empty">' + t('no_rows') + '</td></tr>') +
      '</tbody></table></div><p class="muted rmeta">' + cd('clickcase') + '</p>';
  }
  /* Excel منسّق: ورقة السجل + ورقة أداء المفتشين */
  function cdXlsx(which) {
    var C = st.cdc, X = window.MBCO_XLSX; if (!X) return toast('xlsx');
    var head = { b: true, color: '#FFFFFF', fill: '#7B1E8F', h: 'center', border: 1, wrap: true }, cell = { border: 1 }, title = { b: true, sz: 14, color: '#7B1E8F' };
    var rtl = st.lang !== 'en', period = C.from === C.to ? C.from : C.from + ' → ' + C.to;
    var sheets = [];
    if (which !== 'insp') {
      var R = cdLogRows();
      sheets.push({ name: st.lang === 'en' ? 'Cases' : 'البلاغات', rtl: rtl, freeze: 'A4', cols: [14, 11, 7, 11, 10, 7, 22, 20, 9, 9, 9, 26, 12, 12, 16, 16],
        merges: ['A1:P1'], rows: [[{ v: 'MBCO · ' + cd('r_title') + ' · ' + period, s: title }], [cd('r_gen') + ' ' + nowLocal()], CD_LCOLS.map(function (c) { return { v: cd(c[0]), s: head }; })]
          .concat(R.map(function (r) { return CD_LCOLS.map(function (c) { var v = c[2](r); return { v: v === null || v === undefined ? '' : (typeof v === 'string' ? tr(v) : v), s: cell }; }); })) });
    }
    var E = cdEmpRows();
    sheets.push({ name: st.lang === 'en' ? 'Inspectors' : 'أداء المفتشين', rtl: rtl, freeze: 'A4', cols: CD_ECOLS.map(function (c, i) { return i === 0 ? 24 : 12; }), merges: ['A1:' + X.colName(CD_ECOLS.length - 1) + '1'],
      rows: [[{ v: 'MBCO · ' + cd('insp') + ' · ' + period, s: title }], [cd('r_gen') + ' ' + nowLocal()], CD_ECOLS.map(function (c) { return { v: cd(c[1]), s: head }; })]
        .concat(E.map(function (p) { return CD_ECOLS.map(function (c) { var v = iGet(p, c[0]); if (c[0] === 'name') v = st.lang === 'en' ? tr(p.name) : p.name; return { v: v === null || v === undefined ? '' : v, s: cell }; }); })) });
    var a = document.createElement('a'); a.href = URL.createObjectURL(X.write(sheets));
    a.download = 'MBCO_CDC_' + (which === 'insp' ? 'inspectors' : 'cases') + '_' + C.from + '_' + C.to + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function nowLocal() { var d = new Date(); return cdD(d) + ' ' + cdT(d); }

  /* ================= التقرير اليومي (واجهة CDC: action=day) ================= */
  function cdDaily() {
    var C = st.cdc; if (!C.day) C.day = (C.d && C.d.today) || todayStr();
    if (!C.dayData || C.dayData.date !== C.day) {
      capi('day', { date: C.day }).then(function (d) { C.dayData = d; if (route() === 'cdc' && C.tab === 'daily' && !C.view) cdDraw(); })
        .catch(function (e) { var b = document.getElementById('cdBody'); if (b) failBox(b, e, function () { C.dayData = null; cdDraw(); }); });
      return '<div class="toolbar noprint"><label class="field">' + cd('l_date') + '<input class="input num" type="date" id="cdDay" value="' + esc(C.day) + '"></label></div><div class="loading"><div class="spin"></div>' + t('loading') + '</div>';
    }
    var L = C.dayData.cases.filter(function (c) { return c.status !== 'cancelled' && !c.isTest; }).sort(function (a, b) { return a.times.requested - b.times.requested; });
    var canc = C.dayData.cases.filter(function (c) { return c.status === 'cancelled' && !c.isTest; }).length;
    var closed = L.filter(function (c) { return c.status === 'closed'; }), remote = closed.filter(function (c) { return c.remote; });
    var fines = L.filter(function (c) { return c.outcomes.indexOf('fine') >= 0; }).length, trans = L.filter(function (c) { return (c.transfers || []).length; }).length;
    var aAcc = cdAvg(L.map(function (c) { return cdMins(c.times.requested, c.times.accepted); })), aArr = cdAvg(L.map(function (c) { return cdMins(c.times.requested, c.times.arrived); }));
    var aCls = cdAvg(closed.filter(function (c) { return c.outcomes.indexOf('not_taken') < 0; }).map(function (c) { return cdMins(c.times.requested, c.times.closed); }));
    var pc = L.filter(function (c) { return c.times.patrol_called; });
    var group = function (fn) { var m = {}; L.forEach(function (c) { var k = fn(c); if (k === null || k === undefined || k === '') return; (m[k] = m[k] || []).push(c); }); return Object.keys(m).map(function (k) { return [k, m[k]]; }).sort(function (a, b) { return b[1].length - a[1].length; }); };
    var outs = CD_OUT.map(function (o) { return { l: cd('os_' + o[0]), v: L.filter(function (c) { return c.outcomes.indexOf(o[0]) >= 0; }).length, c: o[1] }; });
    var th = function (a) { return '<tr>' + a.map(function (k) { return '<th>' + esc(cd(k)) + '</th>'; }).join('') + '</tr>'; };
    return '<div class="toolbar noprint"><label class="field">' + cd('l_date') + '<input class="input num" type="date" id="cdDay" value="' + esc(C.day) + '"></label><span class="sp"></span><button type="button" class="btn primary sm" id="cdPrint">' + icon('print') + cd('print') + '</button></div>' +
      '<div class="card rrep"><div class="rrh"><div><b class="rlogo">MBCO</b><div class="muted">Modern Bus Company Limited</div></div><span class="tag b-acc">Daily · <span class="ltr">' + esc(C.day) + '</span></span></div>' +
      '<h2 class="rrt">' + cd('r_title') + '</h2><p class="muted rmeta">' + cd('r_gen') + ' <span class="ltr">' + nowLocal() + '</span></p>' +
      '<div class="kpis k4">' + rKpi(cd('d_total'), L.length) + rKpi(cd('d_closed') + ' / ' + cd('d_open'), closed.length + ' <small>/ ' + (L.length - closed.length) + '</small>') + rKpi(cd('d_remote'), remote.length) + rKpi(cd('d_fines'), fines, fines ? 'bad' : '') +
      rKpi(cd('d_take'), cdDur(aAcc)) + rKpi(cd('d_arrive'), cdDur(aArr)) + rKpi(cd('d_close'), cdDur(aCls)) + rKpi(cd('d_pax'), closed.reduce(function (s, c) { return s + (c.passengers || 1); }, 0)) + '</div>' +
      (trans || canc ? '<p class="muted rmeta">' + (trans ? cd('r_trans') + ': <b>' + trans + '</b>' : '') + (canc ? (trans ? ' · ' : '') + cd('d_canc') + ': ' + canc : '') + '</p>' : '') +
      (pc.length ? '<div class="kpis k4">' + rKpi('🚨 ' + cd('d_patrol'), pc.length) + rKpi(cd('d_pavg'), cdDur(cdAvg(L.map(function (c) { return cdMins(c.times.patrol_called, c.times.patrol_arrived); })))) + rKpi(cd('os_nocoop'), L.filter(function (c) { return c.outcomes.indexOf('nocoop') >= 0; }).length, 'bad') + '</div>' : '') +
      '<h3 class="rh3">' + cd('r_out') + '</h3>' + iBars(outs, null, 10) +
      '<h3 class="rh3">' + cd('r_byri') + '</h3><div class="row2 r2eq"><div class="tblwrap"><table class="tbl"><thead>' + th(['l_route', 'r_cases', 'd_fines', 'e_remote']) + '</thead><tbody>' +
      (group(function (c) { return c.route; }).map(function (g) { return '<tr><td class="ltr">' + esc(g[0]) + '</td><td class="num">' + g[1].length + '</td><td class="num">' + g[1].filter(function (c) { return c.outcomes.indexOf('fine') >= 0; }).length + '</td><td class="num">' + g[1].filter(function (c) { return c.remote && c.status === 'closed'; }).length + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="empty">—</td></tr>') +
      '</tbody></table></div><div class="tblwrap"><table class="tbl"><thead>' + th(['e_name', 'r_cases', 'e_take', 'e_arr']) + '</thead><tbody>' +
      (group(function (c) { return c.inspector ? c.inspector.name : null; }).map(function (g) { return '<tr><td>' + esc(st.lang === 'en' ? tr(g[0]) : g[0]) + '</td><td class="num">' + g[1].length + '</td><td>' + cdDur(cdAvg(g[1].map(function (c) { return cdMins(c.times.requested, c.times.accepted); }))) + '</td><td>' + cdDur(cdAvg(g[1].map(function (c) { return cdMins(c.times.requested, c.times.arrived); }))) + '</td></tr>'; }).join('') || '<tr><td colspan="4" class="empty">—</td></tr>') +
      '</tbody></table></div></div>' +
      '<h3 class="rh3">' + cd('r_log') + '</h3><div class="tblwrap"><table class="tbl twrap"><thead>' + th(['l_no', 'l_time', 'l_bus', 'l_route', 'l_station', 'l_insp', 'l_take', 'l_arr', 'l_out', 'l_fine', 'l_status']) + '</thead><tbody>' +
      (L.map(function (c) { return '<tr class="clk" data-ccase="' + esc(c.id) + '"><td><b class="ltr cno">' + esc(c.caseNo) + '</b></td><td class="ltr">' + cdT(c.times.requested) + '</td><td class="ltr">' + esc(c.bus) + '</td><td class="ltr">' + esc(c.route) + '</td><td>' + esc(tr(c.dest || '')) + '</td><td>' + (c.inspector ? esc(st.lang === 'en' ? tr(c.inspector.name) : c.inspector.name) : '—') + '</td>' +
        '<td>' + cdDur(cdMins(c.times.requested, c.times.accepted)) + '</td><td>' + (c.remote && c.status === 'closed' ? cd('remote') : cdDur(cdMins(c.times.requested, c.times.arrived))) + '</td><td>' + (cdOutB(c.outcomes) || '—') + '</td><td class="num">' + esc(c.violationNo || '—') + '</td><td>' + cdChip(c.status) + '</td></tr>'; }).join('') || '<tr><td colspan="11" class="empty">—</td></tr>') +
      '</tbody></table></div><p class="muted noprint">' + cd('clickcase') + '</p><div class="rfoot muted"><span>MBCO · CDC</span><span>' + cd('r_by') + ': ' + esc(st.user.name || '') + '</span></div></div>';
  }

  /* ================= تقرير حالة (واجهة CDC: getCase + photo) ================= */
  function cdOpenCase(id) { st.cdc.view = String(id); cdCase(st.cdc.view); window.scrollTo(0, 0); }
  function cdCaseByNo(no, date) {
    var C = st.cdc;
    if (!C.ses) return toast(cdSesMsg());
    setSync(true);
    capi('day', { date: date }).then(function (d) {
      var c = null; d.cases.forEach(function (x) { if (String(x.caseNo) === String(no)) c = x; });
      if (!c) { var n = new Date(date + 'T12:00:00'); n.setDate(n.getDate() + 1); return capi('day', { date: cdD(n) }).then(function (d2) { d2.cases.forEach(function (x) { if (String(x.caseNo) === String(no)) c = x; }); return c; }); }
      return c;
    }).then(function (c) { if (!c) return toast(t('no_rows')); C.cache = C.cache || {}; C.cache[c.id] = c; cdOpenCase(c.id); })
      .catch(function (e) { toast('⚠️ ' + cdErr(e)); }).then(function () { setSync(false); });
  }
  function cdCase(id) {
    var C = st.cdc, b = document.getElementById('cdBody'); if (!b) return;
    var c = null; [(C.live || {}).cases || [], (C.dayData || {}).cases || []].forEach(function (l) { l.forEach(function (x) { if (String(x.id) === String(id)) c = x; }); });
    if (!c && C.cache) c = C.cache[id];
    if (!c) {
      b.innerHTML = '<div class="loading"><div class="spin"></div>' + t('loading') + '</div>';
      capi('getCase', { id: id }).then(function (x) { C.cache = C.cache || {}; C.cache[id] = x; if (C.view === String(id)) cdCase(id); }).catch(function (e) { failBox(b, e, function () { cdCase(id); }); });
      return;
    }
    var T = c.times, RS = [['requested'], ['accepted'], ['contacted'], ['enroute'], ['arrived']];
    if (T.patrol_called) RS.push(['patrol_called']); if (T.patrol_arrived || T.patrol_called) RS.push(['patrol_arrived']); RS.push(['closed']);
    var tl = RS.map(function (s, i) {
      var k = s[0], skip = (c.remote && (k === 'enroute' || k === 'arrived')) || (k === 'patrol_arrived' && !T.patrol_arrived && !cdOpen(c));
      var prev = RS.slice(0, i).map(function (x) { return T[x[0]]; }).filter(Boolean).pop();
      return '<div class="ctls' + ((i === 0 || k === 'closed') && T[k] ? ' end' : '') + (skip ? ' skip' : '') + '"><span class="dot"></span><div class="lb">' + cd('tl_' + k) + '</div><div class="tm ltr">' + (skip ? cd('notreq') : T[k] ? cdDT(T[k]) : '—') + '</div><div class="du">' + (T[k] && prev ? cd('r_after') + ' ' + cdDur(cdMins(prev, T[k])) : '') + '</div></div>';
    }).join('');
    var outTxt = c.status === 'cancelled' ? cd('st_cancelled') + ' — ' + (c.cancelReason || '') : c.outcomes.length ? c.outcomes.map(function (k) { return cd('o_' + k); }).join(' + ') : (cdOpen(c) ? cd('inprog') : '—');
    var kv = function (k, v) { return '<div><div class="muted k">' + esc(cd(k)) + '</div><div>' + v + '</div></div>'; };
    b.innerHTML = '<div class="toolbar noprint"><button type="button" class="btn sm" id="cdBack">→ ' + cd('back') + '</button><span class="sp"></span><button type="button" class="btn primary sm" id="cdPrint">' + icon('print') + cd('print') + '</button></div>' +
      '<div class="card rrep"><div class="rrh"><div><b class="rlogo">MBCO</b><div class="muted">Modern Bus Company Limited</div></div><span class="tag b-acc">Case · <span class="ltr">' + esc(c.caseNo) + '</span></span></div>' +
      '<h2 class="rrt">' + cd('r_case') + '</h2><p class="muted rmeta">' + cd('r_gen') + ' <span class="ltr">' + nowLocal() + '</span></p>' +
      '<div class="kpis k4">' + rKpi(cd('busroute'), '<span class="ltr">' + esc(c.bus) + ' / ' + esc(c.route) + '</span>') + rKpi(cd('l_status'), esc(cd('st_' + c.status)) + (c.remote && c.status === 'closed' ? ' <small>(' + cd('remote') + ')</small>' : '')) +
      rKpi(cd('inspector'), c.inspector ? esc(c.inspector.name) : '—') + rKpi(cd('l_out'), '<small>' + esc(c.outcomes.map(function (k) { return cd('os_' + k); }).join(' + ') || '—') + '</small>') + '</div>' +
      '<h3 class="rh3">' + cd('r_sum') + '</h3><div class="csnap">' + kv('l_bus', '<span class="ltr">' + esc(c.bus) + '</span>') + kv('inspector', c.inspector ? esc(c.inspector.name) + (c.inspector.id ? ' · <span class="num">' + esc(c.inspector.id) + '</span>' : '') : '—') +
      kv('l_route', '<span class="ltr">' + esc(c.route) + '</span>') + kv('fl_opsName', esc(c.opsName || '')) + kv('dest', esc(c.dest || '')) + kv('driver', (c.driverName ? esc(c.driverName) + ' · ' : '') + '<span class="num">' + esc(c.driverId || '—') + '</span>') +
      kv('stloc', c.stationUrl ? '<a href="' + esc(c.stationUrl) + '" target="_blank" rel="noopener">' + esc(c.stationName || c.dest || '') + '</a>' : '—') + kv('dphone', '<span class="ltr">' + (c.driverPhone ? '0' + esc(c.driverPhone) : '—') + '</span>') +
      kv('cl_pax', '<span class="num">' + (c.passengers || 1) + '</span>') + kv('cl_vno', '<span class="num">' + esc(c.violationNo || '—') + '</span>') + '</div>' +
      '<h3 class="rh3">' + cd('r_res') + '</h3><div class="cnarr"><div class="k">' + cd('r_how') + '</div><div>' + esc(outTxt) + '</div><div class="k">' + cd('r_notes') + '</div><div>' + esc(c.notes || '-') + '</div>' +
      ((c.transfers || []).length ? '<div class="k">' + cd('trlog') + '</div><div>' + c.transfers.map(esc).join('<br>') + '</div>' : '') +
      (T.patrol_called ? '<div class="k">' + cd('r_patrol') + '</div><div>' + (c.policeNo ? cd('police') + ': <b class="num">' + esc(c.policeNo) + '</b> · ' : '') + cd('r_call') + ': <b class="ltr">' + cdT(T.patrol_called) + '</b> · ' + cd('r_parr') + ': <b>' + (T.patrol_arrived ? '<span class="ltr">' + cdT(T.patrol_arrived) + '</span> (' + cd('r_after') + ' ' + cdDur(cdMins(T.patrol_called, T.patrol_arrived)) + ')' : cd('r_notarr')) + '</b>' + (c.outcomes.indexOf('nocoop') >= 0 ? ' · <b class="tbad">' + cd('os_nocoop') + '</b>' : '') + '</div>' : '') +
      '<div class="k">' + cd('r_dur') + '</div><div>' + cd('r_toacc') + ': <b>' + cdDur(cdMins(T.requested, T.accepted)) + '</b> · ' + cd('r_toarr') + ': <b>' + (c.remote ? cd('notreq') : cdDur(cdMins(T.requested, T.arrived))) + '</b> · ' + cd('r_total') + ': <b>' + cdDur(cdMins(T.requested, T.closed)) + '</b></div></div>' +
      '<h3 class="rh3">' + cd('r_tl') + '</h3><div class="ctl" style="grid-template-columns:repeat(' + RS.length + ',1fr)">' + tl + '</div>' +
      ((c.photos || []).length ? '<h3 class="rh3">' + cd('r_photos') + '</h3><div class="cphotos">' + c.photos.map(function (p) { return '<figure>' + (C.photos[p.id] ? '<img src="' + C.photos[p.id] + '" alt="">' : '<div class="cphph" data-pid="' + esc(p.id) + '">' + cd('loadph') + '</div>') + '<figcaption class="ltr">' + esc(p.name || '') + '</figcaption></figure>'; }).join('') + '</div>' : '') +
      '<div class="rfoot muted"><span>MBCO · CDC</span><span class="ltr">' + esc(c.caseNo) + ' · ' + cdD(T.requested) + '</span></div></div>';
    document.getElementById('cdBack').onclick = function () { C.view = null; cdGo(false); };
    document.getElementById('cdPrint').onclick = function () { window.print(); };
    b.querySelectorAll('[data-pid]').forEach(function (el) {
      var pid = el.getAttribute('data-pid');
      capi('photo', { fileId: pid }).then(function (r) { C.photos[pid] = r.data; if (el.isConnected) { var img = document.createElement('img'); img.src = r.data; img.alt = ''; el.replaceWith(img); } }, function () { if (el.isConnected) el.textContent = cd('phfail'); });
    });
  }

  /* ================= المستخدمين (إدارة CDC فقط) ================= */
  function cdUsers() {
    var C = st.cdc;
    if (!C.users) {
      capi('users').then(function (u) { C.users = u; if (route() === 'cdc' && C.tab === 'users') cdDraw(); }).catch(function (e) { var b = document.getElementById('cdBody'); if (b) failBox(b, e, function () { cdDraw(); }); });
      return '<div class="loading"><div class="spin"></div>' + t('loading') + '</div>';
    }
    var ord = { pending: -1, admin: 0, ops: 1, insp: 2, rejected: 3 };
    var L = C.users.slice().sort(function (a, b) { return ((ord[a.role] === undefined ? 4 : ord[a.role]) - (ord[b.role] === undefined ? 4 : ord[b.role])) || (b.active - a.active) || String(a.name).localeCompare(String(b.name), 'ar'); });
    var nP = L.filter(function (u) { return u.role === 'pending'; }).length;
    var rl = function (r) { return r === 'pending' ? cd('u_pend') : r === 'rejected' ? '—' : cd('role_' + r); };
    return (nP ? '<div class="romsg warn">' + esc(cd('u_npend', { n: nP })) + '</div>' : '') + '<div class="toolbar"><button type="button" class="btn primary sm" id="cdUAdd">' + cd('u_add') + '</button></div>' +
      '<div class="tblwrap rtbl"><table class="tbl"><thead><tr>' + ['u_name', 'u_user', 'u_emp', 'u_role', 'u_tg', 'u_state', 'u_last', ''].map(function (k) { return '<th>' + (k ? esc(cd(k)) : '') + '</th>'; }).join('') + '</tr></thead><tbody>' +
      L.map(function (u) {
        return '<tr><td><b>' + esc(u.name) + '</b></td><td class="ltr">' + esc(u.username) + '</td><td class="num">' + esc(u.employeeId || '—') + '</td><td>' + esc(rl(u.role)) + '</td><td>' + (u.telegram ? '<span class="tag b-acc">✓ ' + esc(u.telegram) + '</span>' : '<span class="muted">—</span>') + '</td>' +
          '<td>' + (u.role === 'pending' ? '<span class="tag b-bad">' + cd('u_pend') + '</span>' : u.active ? (u.mustChange ? '<span class="tag b-warn">' + cd('u_must') + '</span>' : '<span class="tag b-ok">' + cd('u_active') + '</span>') : '<span class="tag b-muted">' + cd('u_off') + '</span>') + '</td>' +
          '<td class="ltr">' + (u.lastLogin ? cdDT(u.lastLogin) : '—') + '</td><td class="nowrap"><button type="button" class="btn sm" data-ued="' + esc(u.username) + '">' + (u.role === 'pending' ? cd('u_approve') : cd('u_edit')) + '</button> <button type="button" class="btn sm ghost" data-utl="' + esc(u.username) + '">' + cd('u_link') + '</button></td></tr>';
      }).join('') + '</tbody></table></div><p class="muted rmeta">' + cd('u_hint') + '</p>';
  }
  function cdUserBox(u) {
    var isNew = !u; u = u ? Object.assign({}, u) : { username: '', name: '', employeeId: '', role: 'insp', active: true };
    if (u.role === 'pending' || u.role === 'rejected') { u.role = 'insp'; u.active = true; }
    cdModal('<h3>' + (isNew ? cd('u_new') : cd('u_ed') + esc(u.name)) + '</h3><form id="cdUf"><div class="cgrid2">' +
      '<label class="field">' + cd('u_name') + '<input class="input" name="name" value="' + esc(u.name) + '" required></label><label class="field">' + cd('u_emp') + '<input class="input ltr" name="employee_id" value="' + esc(u.employeeId || '') + '"></label>' +
      '<label class="field">' + cd('u_user') + '<input class="input ltr" name="username" value="' + esc(u.username) + '"' + (isNew ? '' : ' readonly') + ' autocapitalize="none" placeholder="f.alotaibi" required></label>' +
      '<label class="field">' + cd('u_role') + '<select class="input" name="role">' + ['ops', 'insp', 'admin'].map(function (r) { return '<option value="' + r + '"' + (u.role === r ? ' selected' : '') + '>' + cd('role_' + r) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field">' + (isNew ? cd('u_pin_new') : cd('u_pin')) + '<input class="input ltr" name="pin" inputmode="numeric"' + (isNew ? ' required' : '') + '></label><label class="copt"><input type="checkbox" name="active"' + (u.active ? ' checked' : '') + '> ' + cd('u_isact') + '</label></div>' +
      '<div class="mrow"><button type="button" class="btn" data-x>' + cd('cancel') + '</button><button type="submit" class="btn primary">' + cd('save') + '</button></div></form>',
    function (ov) {
      var f = ov.querySelector('#cdUf');
      f.onsubmit = function (e) {
        e.preventDefault();
        var d = { isNew: isNew, username: f.username.value.trim().toLowerCase(), name: f.name.value.trim(), employee_id: cdDigits(f.employee_id.value.trim()), role: f.role.value, pin: cdDigits(f.pin.value.trim()), active: f.active.checked };
        cdRun(f.querySelector('[type=submit]'), function () { return capi('saveUser', { user: d }).then(function (list) { st.cdc.users = list; cdModalClose(); cdDraw(); toast(cd('u_saved') + (d.pin ? ' — ' + d.username + ' · ' + d.pin : '')); }); });
      };
    });
  }
  function cdTgLink(u, btn) {
    cdRun(btn, function () { return capi('tgLink', { username: u.username }).then(function (d) {
      cdModal('<h3>' + cd('u_tl_t') + esc(u.name) + '</h3><p class="muted">' + esc(cd('u_tl_s', { h: d.hours })) + '</p><textarea class="input ltr" id="cdWa" readonly rows="2">' + esc(d.url) + '</textarea>' +
        '<div class="mrow"><button type="button" class="btn" data-x>' + cd('done') + '</button><a class="btn" href="' + esc(d.url) + '" target="_blank" rel="noopener">Telegram</a><button type="button" class="btn primary" id="cdCp">' + cd('u_copy') + '</button></div>',
      function (ov) { ov.querySelector('#cdCp').onclick = function () { cdCopy(ov.querySelector('#cdWa')); }; });
    }); });
  }

  /* ================= الربط ================= */
  function cdBind(b) {
    var C = st.cdc;
    b.querySelectorAll('[data-cf]').forEach(function (x) { x.onclick = function () { C.filter = x.getAttribute('data-cf'); cdDraw(); }; });
    var q = b.querySelector('#cdQ'); if (q) q.oninput = function () { var p = q.selectionStart; C.bq = q.value; cdDraw(); var n = document.getElementById('cdQ'); if (n) { n.focus(); n.setSelectionRange(p, p); } };
    b.querySelectorAll('[data-cact]').forEach(function (x) { x.onclick = function () { cdAct(x.getAttribute('data-cid'), x.getAttribute('data-cact'), x); }; });
    b.querySelectorAll('[data-ccase]').forEach(function (x) { x.onclick = function () { cdOpenCase(x.getAttribute('data-ccase')); }; });
    b.querySelectorAll('[data-cno]').forEach(function (x) { x.onclick = function () { cdCaseByNo(x.getAttribute('data-cno'), x.getAttribute('data-cdate')); }; });
    b.querySelectorAll('[data-cgo]').forEach(function (x) { x.onclick = function () { var btn = document.querySelector('[data-ctab="' + x.getAttribute('data-cgo') + '"]'); if (btn) btn.click(); }; });
    b.querySelectorAll('[data-csort]').forEach(function (th) { th.onclick = function () { var k = th.getAttribute('data-csort'); C.sort = { k: k, d: C.sort.k === k ? -C.sort.d : -1 }; cdDraw(); }; });
    var lq = b.querySelector('#cdLq'); if (lq) lq.oninput = function () { var p = lq.selectionStart; C.q = lq.value; cdDraw(); var n = document.getElementById('cdLq'); if (n) { n.focus(); n.setSelectionRange(p, p); } };
    var lx = b.querySelector('#cdLx'); if (lx) lx.onclick = function () { cdXlsx('log'); };
    var ex = b.querySelector('#cdEmpX'); if (ex) ex.onclick = function () { cdXlsx('insp'); };
    var dy = b.querySelector('#cdDay'); if (dy) dy.onchange = function () { if (dy.value) { C.day = dy.value; C.dayData = null; cdDraw(); } };
    var pr = b.querySelector('#cdPrint'); if (pr) pr.onclick = function () { window.print(); };
    var ua = b.querySelector('#cdUAdd'); if (ua) ua.onclick = function () { cdUserBox(null); };
    b.querySelectorAll('[data-ued]').forEach(function (x) { x.onclick = function () { cdUserBox(C.users.filter(function (u) { return u.username === x.getAttribute('data-ued'); })[0]); }; });
    b.querySelectorAll('[data-utl]').forEach(function (x) { x.onclick = function () { cdTgLink(C.users.filter(function (u) { return u.username === x.getAttribute('data-utl'); })[0], x); }; });
    var pa = b.querySelector('#cdPaste'), frm = b.querySelector('#cdFrm');
    if (pa && frm) {
      var fill = function (d) { var n = 0; CD_FIELDS.forEach(function (f) { if (d[f[0]]) { frm.elements[f[0]].value = d[f[0]]; n++; } }); var m = document.getElementById('cdPmsg'); m.textContent = n ? cd('n_read', { n: n }) : cd('n_noread'); m.className = n ? 'tok' : 'tbad'; };
      b.querySelector('#cdParse').onclick = function () { fill(cdParse(pa.value)); };
      pa.addEventListener('paste', function () { setTimeout(function () { fill(cdParse(pa.value)); }, 30); });
      frm.onsubmit = function (e) {
        e.preventDefault(); var d = {}; CD_FIELDS.forEach(function (f) { d[f[0]] = frm.elements[f[0]].value.trim(); });
        d.driverPhone = cdDigits(d.driverPhone).replace(/\D/g, '').replace(/^(966|0)/, '');
        cdRun(frm.querySelector('[type=submit]'), function () { return capi('create', { 'case': d }).then(function (c) { cdUpsert(c); C.filter = 'open'; C.tab = 'board'; ls.set('mbco_cdc_tab', 'board'); cdTabBar(); cdDraw(); cdNotify(cdWaNew(c), c.caseNo + ' · ' + cd('nw')); }); });
      };
    }
  }

  /* ================= معايير الأداء والتقييم KPI (v2.3) =================
     الترتيب لكل الموظفين + تقرير موظف بنفس التصميم المعتمد (A4 بالعرض → PDF).
     الدرجات من الـ Hub (kpi_ في Kpi.gs) بمعايير كل فريق، والصورة من مجلد Drive (kpiPhoto). */
  var KP = {
    ar: {
      rank: 'الترتيب', profile: 'تقرير الموظف', week: 'هذا الأسبوع', month: 'هذا الشهر', pmonth: 'الشهر السابق', year: 'هذه السنة', custom: 'فترة مخصصة',
      from: 'من', to: 'إلى', all: 'كل الفرق', ENF: 'فريق التذاكر', STN: 'فريق المحطات', search: 'بحث بالاسم أو الرقم…', emp: 'الموظف', pdf: 'طباعة / حفظ PDF', xlsx: 'تصدير Excel', back: 'رجوع للترتيب',
      title: 'تقييم أداء الموظف', sub: 'ملخص معايير الأداء', overall: 'الأداء الكلي', att: 'الحضور', punc: 'الانضباط', prod: 'الإنتاجية', cdc: 'بلاغات CDC', notes: 'الملاحظات',
      id: 'الرقم الوظيفي', jtitle: 'المسمى الوظيفي', team: 'القسم', hire: 'تاريخ التعيين', rankOf: 'الترتيب في الفريق', of: 'من', teamAvg: 'متوسط الفريق',
      byMonth: 'الأداء الكلي حسب الشهر', byDay: 'الأداء الكلي حسب اليوم', breakdown: 'توزيع الدرجة على المعايير', facts: 'الأرقام', notesT: 'ملاحظات المشرفين المعتمدة', notesSoon: 'تتفعّل مع رفع الملاحظات من البوت واعتمادها من الإدارة.', notesNone: 'لا توجد ملاحظات معتمدة في الفترة.', notesLater: 'تتفعّل لاحقاً عبر البوت.',
      workDays: 'أيام العمل', insp: 'فحوصات', stnI: 'فحوصات المحطات', enfI: 'فحوصات التذاكر', vio: 'مخالفات', fines: 'قيمة المخالفات', ops: 'نقاط الإنتاجية', perDay: 'في اليوم', target: 'الهدف',
      cdcN: 'بلاغات CDC', arrOk: 'وصول بالهدف', arrAvg: 'متوسط الوصول', present: 'حضور', absent: 'غياب', late: 'تأخير/استئذان', exTitle: 'خارج التقييم: أرقام تحتاج مراجعة', exUnk: 'أرقام مو موجودة في قائمة الموظفين', exUnkH: 'غالباً رقم مكتوب غلط، أو يوزر تجريبي، أو حساب بدون رقم وظيفي في نظام البلاغات. صحّح الرقم في سجل النظام أو في KpiHistory وتنضاف للموظف الصحيح.', exAdm: 'الفريق الإداري', exAdmH: 'مسجّلين ADM لكن ما ينطبق عليهم التقييم.', leave: 'أيام الإجازة', lvEx: 'مستبعدة من التقييم', sar: 'ريال', min: 'د', day: 'يوم',
      bandA: 'ممتاز', bandB: 'جيد جداً', bandC: 'جيد', bandD: 'يحتاج تحسين', noData: 'لا توجد بيانات', w: 'الوزن',
      formula: 'الإنتاجية = (الفحوصات {vio}+ المخالفات × {eq}) ÷ (أيام العمل × {t}) · CDC = الوصول خلال {m} د · أيام الإجازة المعتمدة مستبعدة · المعيار بدون بيانات يُستبعد ويتوزع وزنه.', formulaS: 'الإنتاجية = فحوصات المحطات ÷ (أيام العمل × {t}) · الحضور = حاضر ÷ (حاضر + غائب) · أيام الإجازة المعتمدة مستبعدة · المعيار بدون بيانات يُستبعد ويتوزع وزنه.', vioPart: '',
      gen: 'أُنشئ', by: 'أعدّه', period: 'الفترة', hist: 'يشمل السجل التاريخي', choose: 'اختر موظفاً من الترتيب', n: 'موظف', open: 'التقرير',
      SUP: 'المشرفين', SUP1: 'مشرف', ADM: 'الفريق الإداري', rate: 'تقييم المسؤول', tabRank: 'الترتيب', tabNotes: 'الملاحظات', tabRate: 'التقييم الشهري',
      formulaA: 'الدرجة = الحضور ÷ (حاضر + غائب) + الانضباط + تقييم المسؤول المباشر (متوسط البنود ÷ 5) · أيام الإجازة المعتمدة مستبعدة · المعيار بدون بيانات يُستبعد ويتوزع وزنه.',
      addNote: 'ملاحظة جديدة', minor: 'بسيطة', medium: 'متوسطة', major: 'جسيمة', praise: 'إشادة', kind: 'النوع', cat: 'التصنيف', text: 'الوصف', ndate: 'تاريخ الواقعة', nby: 'رفعها', nst: 'الحالة', save: 'حفظ', cancel: 'إلغاء',
      approve: 'اعتماد', reject: 'رفض', withdraw: 'سحب', reopen: 'إرجاع للانتظار', rejReason: 'سبب الرفض (اختياري)', stP: 'بانتظار الاعتماد', stA: 'معتمدة', stR: 'مرفوضة', stAll: 'الكل', noNotes: 'لا توجد ملاحظات في الفترة.',
      notesHow: 'ملاحظات المشرفين تنتظر اعتماد الإدارة، والمعتمدة بس تأثر على معيار «الملاحظات». الإشادة تعوّض الخصم.', notesOff: 'معيار الملاحظات مطفأ حالياً: الملاحظات تنحفظ لكن ما تأثر على الدرجة إلا بعد ضبط KPI_NOTES بتاريخ البداية في الإعدادات.', noteSaved: 'تم رفع الملاحظة', noteSavedA: 'تم حفظ الملاحظة واعتمادها',
      pts: 'نقطة', rmonth: 'الشهر', rateHow: 'قيّم كل بند من 1 إلى 5. الدرجة = متوسط البنود ÷ 5 (مثلاً 4 = 80%).', rateNone: 'ما عندك أحد تقيّمه.', rateSaved: 'تم حفظ التقييم', rateMiss: 'اختر درجة لكل البنود', comment: 'تعليق (اختياري)',
      rateAll: 'متابعة التقييمات للشهر', rater: 'المقيّم', notRated: 'لم يُقيّم بعد', r1: 'ضعيف', r2: 'مقبول', r3: 'جيد', r4: 'جيد جداً', r5: 'ممتاز', lastRate: 'آخر تقييم', notesN: 'الملاحظات المعتمدة'
    },
    en: {
      rank: 'Ranking', profile: 'Employee report', week: 'This week', month: 'This month', pmonth: 'Last month', year: 'This year', custom: 'Custom',
      from: 'From', to: 'To', all: 'All teams', ENF: 'Tickets team', STN: 'Stations team', search: 'Search by name or ID…', emp: 'Employee', pdf: 'Print / save PDF', xlsx: 'Export Excel', back: 'Back to ranking',
      title: 'Employee Performance', sub: 'KPI summary', overall: 'Overall KPI', att: 'Attendance', punc: 'Punctuality', prod: 'Productivity', cdc: 'CDC response', notes: 'Notes',
      id: 'Employee ID', jtitle: 'Job title', team: 'Division', hire: 'Hiring date', rankOf: 'Team rank', of: 'of', teamAvg: 'Team average',
      byMonth: 'Overall KPI by month', byDay: 'Overall KPI by day', breakdown: 'KPI breakdown', facts: 'Key figures', notesT: 'Approved supervisor notes', notesSoon: 'Enabled once notes are raised via the bot and approved by management.', notesNone: 'No approved notes in this period.', notesLater: 'coming soon via the bot.',
      workDays: 'Work days', insp: 'Inspections', stnI: 'Station inspections', enfI: 'Ticket inspections', vio: 'Violations', fines: 'Fines value', ops: 'Productivity points', perDay: 'per day', target: 'Target',
      cdcN: 'CDC cases', arrOk: 'Arrived on target', arrAvg: 'Avg. arrival', present: 'Present', absent: 'Absent', late: 'Late/exit', exTitle: 'Not scored: IDs to review', exUnk: 'IDs not in the employee list', exUnkH: 'Usually a mistyped ID, a test user, or a CDC account without an employee ID. Fix the ID in the source system or KpiHistory and it moves to the right employee.', exAdm: 'Admin team', exAdmH: 'Registered as ADM but not scored.', leave: 'Leave days', lvEx: 'excluded from the score', sar: 'SAR', min: 'min', day: 'days',
      bandA: 'Excellent', bandB: 'Very good', bandC: 'Good', bandD: 'Needs improvement', noData: 'No data', w: 'Weight',
      formula: 'Productivity = (inspections {vio}+ violations × {eq}) ÷ (work days × {t}) · CDC = arrival within {m} min · approved leave days are excluded · criteria without data are excluded and their weight redistributed.', formulaS: 'Productivity = station inspections ÷ (work days × {t}) · Attendance = present ÷ (present + absent) · approved leave days are excluded · criteria without data are excluded and their weight redistributed.', vioPart: '',
      gen: 'Generated', by: 'Prepared by', period: 'Period', hist: 'includes historical records', choose: 'Pick an employee from the ranking', n: 'employees', open: 'Report',
      SUP: 'Supervisors', SUP1: 'Supervisor', ADM: 'Admin team', rate: 'Manager rating', tabRank: 'Ranking', tabNotes: 'Notes', tabRate: 'Monthly rating',
      formulaA: 'Score = attendance + punctuality + direct manager rating (average of items ÷ 5) · approved leave days are excluded · criteria without data are excluded and their weight redistributed.',
      addNote: 'New note', minor: 'Minor', medium: 'Medium', major: 'Major', praise: 'Praise', kind: 'Type', cat: 'Category', text: 'Description', ndate: 'Incident date', nby: 'Raised by', nst: 'Status', save: 'Save', cancel: 'Cancel',
      approve: 'Approve', reject: 'Reject', withdraw: 'Withdraw', reopen: 'Back to pending', rejReason: 'Reason (optional)', stP: 'Pending', stA: 'Approved', stR: 'Rejected', stAll: 'All', noNotes: 'No notes in this period.',
      notesHow: 'Supervisor notes wait for management approval; only approved notes affect the Notes criterion. Praise offsets deductions.', notesOff: 'The Notes criterion is off: notes are saved but do not affect scores until KPI_NOTES is set to a start date in Settings.', noteSaved: 'Note submitted', noteSavedA: 'Note saved and approved',
      pts: 'pts', rmonth: 'Month', rateHow: 'Rate each item from 1 to 5. Score = average ÷ 5 (e.g. 4 = 80%).', rateNone: 'Nobody to rate.', rateSaved: 'Rating saved', rateMiss: 'Pick a score for every item', comment: 'Comment (optional)',
      rateAll: 'Ratings status this month', rater: 'Rater', notRated: 'Not rated yet', r1: 'Poor', r2: 'Fair', r3: 'Good', r4: 'Very good', r5: 'Excellent', lastRate: 'Latest rating', notesN: 'Approved notes'
    }
  };
  function kp(k, rep) { var L = KP[st.lang] || KP.ar, s = k in L ? L[k] : (KP.ar[k] || k); if (rep) Object.keys(rep).forEach(function (x) { s = s.split('{' + x + '}').join(rep[x]); }); return s; }
  var KP_COL = { A: '#22c55e', B: '#b45bff', C: '#f59e0b', D: '#ef4444' };
  var KP_ICON = { overall: 'M12 2a10 10 0 1 0 10 10M12 6a6 6 0 1 0 6 6M12 10a2 2 0 1 0 2 2M14 10l6-6M17 4h3v3', att: 'M16 11a3 3 0 1 0-3-3M8 11a3 3 0 1 0-3-3M2 20c0-3 3-5 6-5s6 2 6 5M12 20c0-3 3-5 6-5s4 2 4 4',
    punc: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2 2M10 2h4M19 5l2 2', prod: 'M4 20V14M9 20V10M14 20V6M19 20V3', cdc: 'M5 4h4l2 5-3 2a11 11 0 0 0 5 5l2-3 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2',
    notes: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h8M9 17h6', rate: 'M12 2l3 7h7l-5.5 4.5 2 7.5-6.5-4-6.5 4 2-7.5L2 9h7z' };
  function kpTeamL(p) { return p.team === 'SUP' ? kp('SUP1') + ' · ' + kp(p.base) : kp(p.team); }
  function kpBand(v) { var b = (st.kpi.d && st.kpi.d.settings.bands) || [90, 80, 70]; return v === null || v === undefined ? '' : v >= b[0] ? 'A' : v >= b[1] ? 'B' : v >= b[2] ? 'C' : 'D'; }
  function kpName(p) { return st.lang === 'en' ? (p.name_en || tr(p.name)) : p.name; }
  function kpState() {
    if (!st.kpi) st.kpi = { tab: 'rank', nst: 'P', rm: '', view: 'rank', preset: ls.get('mbco_kpi_preset') || 'month', from: '', to: '', team: '', q: '', sort: { k: 'overall', d: -1 }, emp: '', d: null, key: '', photos: {} };
    return st.kpi;
  }
  function kpRange(preset, today) {
    var d = new Date(today + 'T12:00:00'), iso = function (x) { return x.toISOString().slice(0, 10); };
    if (preset === 'week') { var s = new Date(d); s.setDate(d.getDate() - d.getDay()); return [iso(s), today]; }
    if (preset === 'pmonth') { var a = new Date(d.getFullYear(), d.getMonth() - 1, 1, 12), z = new Date(d.getFullYear(), d.getMonth(), 0, 12); return [iso(a), iso(z)]; }
    if (preset === 'year') return [today.slice(0, 4) + '-01-01', today];
    return [today.slice(0, 8) + '01', today];
  }
  function renderKpi(wrap, force) {
    var K = kpState();
    if (!K.from) { var r = kpRange(K.preset, todayStr()); K.from = r[0]; K.to = r[1]; }
    wrap.innerHTML = '<div class="card rsttools noprint"><div class="rstctl">' +
      '<div class="ichips">' + ['week', 'month', 'pmonth', 'year', 'custom'].map(function (p) { return '<button type="button" class="ichip' + (K.preset === p ? ' on' : '') + '" data-kp="' + p + '">' + kp(p) + '</button>'; }).join('') + '</div>' +
      '<label class="field">' + kp('from') + '<input class="input num" type="date" id="kFrom" value="' + esc(K.from) + '"></label><label class="field">' + kp('to') + '<input class="input num" type="date" id="kTo" value="' + esc(K.to) + '"></label>' +
      '<button type="button" class="btn sm" id="kRef">' + icon('refresh') + rt('refresh') + '</button></div></div><div class="seg kptabs noprint" id="kTabs"></div><div id="kpiBody"><div class="loading"><div class="spin"></div>' + t('loading') + '</div></div>';
    wrap.querySelectorAll('[data-kp]').forEach(function (b) {
      b.onclick = function () { var p = b.getAttribute('data-kp'); K.preset = p; ls.set('mbco_kpi_preset', p); if (p !== 'custom') { var r = kpRange(p, (K.d && K.d.today) || todayStr()); K.from = r[0]; K.to = r[1]; } renderKpi(wrap, false); };
    });
    var f = document.getElementById('kFrom'), tt = document.getElementById('kTo');
    f.onchange = tt.onchange = function () { K.preset = 'custom'; K.from = f.value; K.to = tt.value; renderKpi(wrap, false); };
    document.getElementById('kRef').onclick = function () { st.kpi.nkey = ''; st.kpi.rkey = ''; kpLoad(true); };
    kpLoad(force);
  }
  function kpLoad(force) {
    var K = st.kpi, ck = K.from + '|' + K.to + '|' + (K.view === 'emp' ? K.emp : '');
    if (K.d && K.key === ck && !force) return kpDraw();
    setSync(true);
    return api('kpi', { from: K.from, to: K.to, emp: K.view === 'emp' ? K.emp : '', fresh: !!force }).then(function (j) {
      K.d = j.data; K.key = ck; addDict(K.d.dict); K.from = K.d.from; K.to = K.d.to;
      if (route() === 'people') kpDraw();
    }).catch(function (e) { var b = document.getElementById('kpiBody'); if (b && route() === 'people') failBox(b, e, function () { kpLoad(true); }); })
      .then(function () { setSync(false); });
  }
  function kpDraw() {
    var K = st.kpi, b = document.getElementById('kpiBody'); if (!b || !K.d) return;
    kpTabs();
    if (K.tab === 'notes') return kpNotesLoad(false);
    if (K.tab === 'rate') return kpRateLoad(false);
    b.innerHTML = K.view === 'emp' ? kpEmpView() : kpRankView();
    kpBind(b); kpFit();
    if (K.view === 'emp' && K.d.emp) kpPhoto(K.d.emp.profile.id);
  }

  /* ---------- الترتيب ---------- */
  function kpRows() {
    var K = st.kpi, q = String(K.q || '').trim().toLowerCase();
    return K.d.rank.filter(function (r) { return (!K.team || r.team === K.team) && (!q || (r.id + ' ' + r.name + ' ' + (r.name_en || '')).toLowerCase().indexOf(q) >= 0); }).slice().sort(function (a, b) {
      var x = K.sort.k === 'name' ? kpName(a) : iGet(a, K.sort.k), y = K.sort.k === 'name' ? kpName(b) : iGet(b, K.sort.k);
      if (K.sort.k === 'name') return String(x).localeCompare(String(y), 'ar') * K.sort.d;
      x = x === null || x === undefined ? -1 : x; y = y === null || y === undefined ? -1 : y; return (x > y ? 1 : x < y ? -1 : 0) * K.sort.d;
    });
  }
  function kpSc(S) { return ['att', 'punc', 'prod', 'cdc', 'rate'].concat(S.notesOn ? ['notes'] : []); }
  function kpCols(S) { return [['pos', '#'], ['name', 'emp'], ['team', 'team'], ['overall', 'overall']].concat(kpSc(S).map(function (k) { return ['scores.' + k, k]; })).concat([['raw.workDays', 'workDays'], ['raw.perDay', 'perDay'], ['raw.vio', 'vio'], ['raw.arrAvg', 'arrAvg']]); }
  function kpScoreCell(v) { if (v === null || v === undefined) return '<span class="muted">—</span>'; return '<span class="kpsc" style="--c:' + KP_COL[kpBand(v)] + '">' + v + '</span>'; }
  function kpRankView() {
    var K = st.kpi, D = K.d, rows = kpRows(), S = D.settings, KP_RCOLS = kpCols(S);
    var avg = function (t) { return D.teamAvg[t] === null || D.teamAvg[t] === undefined ? '—' : D.teamAvg[t]; };
    return '<div class="kpis k6">' + ['ENF', 'STN', 'SUP', 'ADM'].map(function (t) { return rKpi(kp('teamAvg') + ' · ' + kp(t), avg(t)); }).join('') +
      rKpi(kp('bandA'), D.rank.filter(function (r) { return r.band === 'A'; }).length, 'ok') + rKpi(kp('bandD'), D.rank.filter(function (r) { return r.band === 'D'; }).length, 'bad') + '</div>' +
      '<div class="toolbar noprint"><div class="seg teams">' + [['', 'all'], ['ENF', 'ENF'], ['STN', 'STN'], ['SUP', 'SUP'], ['ADM', 'ADM']].map(function (x) { return '<button type="button" data-kteam="' + x[0] + '" class="' + (K.team === x[0] ? 'on' : '') + '">' + kp(x[1]) + '</button>'; }).join('') + '</div>' +
      '<input class="input" type="search" id="kQ" placeholder="' + esc(kp('search')) + '" value="' + esc(K.q) + '"><button type="button" class="btn sm" id="kX">' + icon('download') + kp('xlsx') + '</button><span class="muted"><span class="num">' + rows.length + '</span> ' + kp('n') + '</span></div>' +
      '<div class="tblwrap rtbl"><table class="tbl kprank"><thead><tr>' + KP_RCOLS.map(function (c) { return '<th' + (c[0] === 'pos' ? '' : ' data-ksort="' + c[0] + '"') + ' class="srt">' + esc(c[0] === 'pos' ? '#' : kp(c[1])) + (K.sort.k === c[0] ? (K.sort.d > 0 ? ' ▲' : ' ▼') : '') + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r, i) {
        return '<tr class="clk" data-kemp="' + esc(r.id) + '"><td class="num">' + (i + 1) + '</td><td><b>' + esc(kpName(r)) + '</b><div class="muted num">' + esc(r.id) + '</div></td><td>' + esc(kpTeamL(r)) + '</td>' +
          '<td><div class="kpbar"><i style="width:' + (r.overall || 0) + '%;background:' + (KP_COL[r.band] || '#888') + '"></i></div><b class="num">' + (r.overall === null ? '—' : r.overall) + '</b> <span class="kpband" style="--c:' + (KP_COL[r.band] || '#888') + '">' + (r.band ? kp('band' + r.band) : '') + '</span></td>' +
          kpSc(S).map(function (k) { return '<td class="num">' + kpScoreCell(r.scores[k]) + '</td>'; }).join('') +
          '<td class="num">' + r.raw.workDays + '</td><td class="num">' + (r.raw.perDay === null ? '—' : r.raw.perDay) + '</td><td class="num">' + (r.team === 'ENF' ? r.raw.vio : '—') + '</td><td class="num">' + (r.raw.arrAvg === null ? '—' : r.raw.arrAvg + ' ' + kp('min')) + '</td>' +
          '<td><button type="button" class="btn sm ghost">' + kp('open') + '</button></td></tr>';
      }).join('') : '<tr><td colspan="' + (KP_RCOLS.length + 1) + '" class="empty">' + t('no_rows') + '</td></tr>') +
      '</tbody></table></div><p class="muted rmeta">' + esc(kp('formula', { eq: S.vioEq, t: S.target, m: S.cdcMin, vio: '' })) + (D.sources && D.sources.historyRows ? ' · ' + kp('hist') : '') + '</p>' + kpExcluded(D.excluded);
  }
  function kpExcluded(X) {
    if (!X || (!X.adm.length && !X.unknown.length)) return '';
    var act = function (r) { return [['stn', r.stn], ['enf', r.enf], ['vio', r.vio], ['cdcN', r.cdc]].filter(function (x) { return x[1]; }).map(function (x) { return kp(x[0] === 'stn' ? 'stnI' : x[0] === 'enf' ? 'enfI' : x[0]) + ' ' + x[1]; }).join(' · '); };
    var row = function (r) { return '<tr><td class="num">' + esc(r.id) + '</td><td>' + esc((st.lang === 'en' ? r.name_en || r.name : r.name || r.name_en) || '—') + '</td><td class="muted">' + esc(act(r)) + '</td></tr>'; };
    var block = function (title, hint, list) { return list.length ? '<div class="kpex"><h4>' + esc(title) + ' <span class="num">(' + list.length + ')</span></h4><p class="muted">' + esc(hint) + '</p><div class="tblwrap"><table class="tbl"><tbody>' + list.map(row).join('') + '</tbody></table></div></div>' : ''; };
    return '<details class="kpexw noprint"><summary>' + esc(kp('exTitle')) + ' <span class="num">(' + (X.adm.length + X.unknown.length) + ')</span></summary>' +
      block(kp('exUnk'), kp('exUnkH'), X.unknown) + block(kp('exAdm'), kp('exAdmH'), X.adm) + '</details>';
  }

  /* ---------- تقرير الموظف (بطاقة A4 بالعرض) ---------- */
  function kpRing(v, color, size, label) {
    var r = size / 2 - 7, C = 2 * Math.PI * r, p = v === null || v === undefined ? 0 : Math.max(0, Math.min(100, v));
    return '<svg viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '" class="kpring"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="9"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="' + (C * p / 100).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" style="filter:drop-shadow(0 0 6px ' + color + ')"/>' + (label || '') + '</svg>';
  }
  function kpIco(k, color) { return '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + (KP_ICON[k] || KP_ICON.overall) + '"/></svg>'; }
  function kpLine(series, unit) {
    var W = 1040, H = 150, pl = 58, pr = 22, pt = 24, pb = 22, pts = series.filter(function (s) { return s.overall !== null; });
    var x = function (i) { return pl + (series.length > 1 ? i * (W - pl - pr) / (series.length - 1) : (W - pl - pr) / 2); };
    var lo = Math.max(0, Math.min.apply(null, [50].concat(pts.map(function (s) { return Math.floor(s.overall / 10) * 10; }))));
    var y = function (v) { return pt + (100 - v) / (100 - lo) * (H - pt - pb); };
    var grid = ''; for (var g = lo; g <= 100; g += 10) grid += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="rgba(255,255,255,.09)" stroke-dasharray="4 4"/><text x="' + (pl - 6) + '" y="' + (y(g) + 4) + '" fill="#b9aec8" font-size="11" text-anchor="end">' + g + '%</text>';
    var path = '', area = '', last = null, labels = '', ticks = '', step = Math.ceil(series.length / 16);
    series.forEach(function (s, i) {
      var lab = unit === 'month' ? (st.lang === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'])[+s.k.slice(5, 7) - 1] : s.k.slice(8);
      if (i % step === 0 || i === series.length - 1) ticks += '<text x="' + x(i) + '" y="' + (H - 6) + '" fill="#d9cfe6" font-size="11.5" text-anchor="middle" font-weight="600">' + lab + '</text>';
      if (s.overall === null) return;
      var X = x(i), Y = y(s.overall); path += (last ? ' L' : 'M') + X.toFixed(1) + ' ' + Y.toFixed(1); last = [X, Y];
      if (series.length <= 16) labels += '<text x="' + X + '" y="' + (Y - 10) + '" fill="#fff" font-size="12" font-weight="700" text-anchor="middle">' + s.overall + '%</text>';
      labels += '<circle cx="' + X + '" cy="' + Y + '" r="4.5" fill="#fff" stroke="#c45cff" stroke-width="2.5"/>';
    });
    if (pts.length > 1) { var first = series.indexOf(pts[0]), lastI = series.lastIndexOf(pts[pts.length - 1]); area = '<path d="' + path + ' L' + x(lastI) + ' ' + (H - pb) + ' L' + x(first) + ' ' + (H - pb) + ' Z" fill="url(#kpArea)"/>'; }
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="kpline" preserveAspectRatio="none"><defs><linearGradient id="kpArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b44fd6" stop-opacity=".55"/><stop offset="1" stop-color="#7B1E8F" stop-opacity=".05"/></linearGradient></defs>' +
      grid + area + '<path d="' + path + '" fill="none" stroke="#c45cff" stroke-width="3" style="filter:drop-shadow(0 0 5px #c45cff)"/>' + labels + ticks + '</svg>';
  }
  function kpDonut(contrib, overall) {
    var cols = { att: '#22c55e', punc: '#3b82f6', prod: '#a855f7', cdc: '#f59e0b', notes: '#ef4444', rate: '#ec4899' }, ks = Object.keys(contrib), tot = ks.reduce(function (a, k) { return a + contrib[k]; }, 0) || 1;
    var R = 70, r = 38, cx = 85, cy = 85, a0 = -Math.PI / 2, seg = '';
    ks.forEach(function (k) {
      var a1 = a0 + contrib[k] / tot * Math.PI * 2, la = a1 - a0 > Math.PI ? 1 : 0, p = function (rr, a) { return (cx + rr * Math.cos(a)).toFixed(1) + ' ' + (cy + rr * Math.sin(a)).toFixed(1); };
      if (ks.length === 1) seg += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R + r) / 2 + '" fill="none" stroke="' + cols[k] + '" stroke-width="' + (R - r) + '"/>';
      else seg += '<path d="M' + p(R, a0) + ' A' + R + ' ' + R + ' 0 ' + la + ' 1 ' + p(R, a1) + ' L' + p(r, a1) + ' A' + r + ' ' + r + ' 0 ' + la + ' 0 ' + p(r, a0) + ' Z" fill="' + cols[k] + '" stroke="#1a1022" stroke-width="2"/>';
      var am = (a0 + a1) / 2; if (contrib[k] / tot > .06) seg += '<text x="' + (cx + (R + r) / 2 * Math.cos(am)) + '" y="' + (cy + (R + r) / 2 * Math.sin(am) + 4) + '" fill="#fff" font-size="11" font-weight="800" text-anchor="middle">' + Math.round(contrib[k] / tot * 100) + '%</text>';
      a0 = a1;
    });
    return '<div class="kpdon"><svg viewBox="0 0 170 170" width="170" height="170">' + seg + '<text x="85" y="91" fill="#fff" font-size="20" font-weight="800" text-anchor="middle">' + (overall === null ? '—' : overall) + '</text></svg>' +
      '<div class="kplegend">' + ks.map(function (k) { return '<div><i style="background:' + cols[k] + '"></i><span>' + kp(k) + '</span><b class="num">' + contrib[k] + '</b></div>'; }).join('') + '</div></div>';
  }
  function kpEmpView() {
    var K = st.kpi, D = K.d, E = D.emp;
    var pick = '<div class="toolbar noprint"><button type="button" class="btn sm" id="kBack">→ ' + kp('back') + '</button><label class="field">' + kp('emp') + '<select class="input" id="kEmp">' +
      D.rank.slice().sort(function (a, b) { return kpName(a).localeCompare(kpName(b), 'ar'); }).map(function (r) { return '<option value="' + esc(r.id) + '"' + (r.id === K.emp ? ' selected' : '') + '>' + esc(kpName(r)) + ' (' + esc(r.id) + ')</option>'; }).join('') +
      '</select></label><span class="sp"></span><button type="button" class="btn primary sm" id="kPdf">' + icon('print') + kp('pdf') + '</button></div>';
    if (!E) return pick + '<div class="empty card">' + kp('choose') + '</div>';
    var p = E.profile, S = D.settings, W = S.weights[p.team] || {}, R = E.raw, band = E.band, col = KP_COL[band] || '#888';
    var period = D.from === D.to ? D.from : D.from + ' → ' + D.to;
    var MN = st.lang === 'en' ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] : ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    var sameM = D.from.slice(0, 7) === D.to.slice(0, 7) && D.from.slice(8) === '01';
    var ys = K.preset === 'year' && D.from.slice(0, 4) === D.to.slice(0, 4) ? D.from.slice(0, 4) : sameM ? MN[+D.from.slice(5, 7) - 1] + ' ' + D.from.slice(0, 4) : period;
    var ysCls = ys === period ? ' sm' : '';
    var circles = [['overall', E.overall, null]].concat(Object.keys(W).filter(function (k) { return W[k] > 0 && (k !== 'notes' || S.notesOn); }).map(function (k) { return [k, E.scores[k], W[k]]; }));
    var fact = function (l, v, s) { return '<div class="kpf"><span>' + esc(l) + '</span><b class="num">' + v + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</div>'; };
    var isA = p.team === 'SUP' || p.team === 'ADM', X = E.extra || { notes: [], rates: [] }, lr = X.rates.length ? X.rates[X.rates.length - 1] : null;
    var facts = fact(kp('workDays'), R.workDays) + (isA ?
      (lr ? fact(kp('lastRate'), lr.score + '%', esc(lr.m + ' · ' + lr.by)) : fact(kp('rate'), '—', kp('notRated'))) +
      (R.present || R.absent ? fact(kp('present') + ' / ' + kp('absent'), R.present + ' / ' + R.absent, R.late ? kp('late') + ' ' + R.late : '') : '') +
      (R.leave ? fact(kp('leave'), R.leave, kp('lvEx')) : '') : '') + (isA ? '' :
      (p.team === 'STN' ? fact(kp('stnI'), R.stn) : fact(kp('enfI'), R.enf) + fact(kp('vio'), R.vio, R.fines ? R.fines.toLocaleString('en-US') + ' ' + kp('sar') : '')) +
      fact(kp('ops') + ' / ' + kp('perDay'), R.perDay === null ? '—' : R.perDay, kp('target') + ' ' + S.target) +
      (p.team === 'ENF' ? fact(kp('cdcN'), R.cdc, R.arrN ? kp('arrOk') + ' ' + R.arrOk + '/' + R.arrN + ' · ' + kp('arrAvg') + ' ' + R.arrAvg + ' ' + kp('min') : '') : '') +
      (R.present || R.absent ? fact(kp('present') + ' / ' + kp('absent'), R.present + ' / ' + R.absent, R.late ? kp('late') + ' ' + R.late : '') : '') +
      (R.leave ? fact(kp('leave'), R.leave, kp('lvEx')) : ''));
    var nl = X.notes.slice(0, 2).map(function (n) { return '<span class="kpnk ' + esc(n.kind) + '">' + esc(kp(n.kind)) + '</span> <span class="num">' + esc(n.d.slice(5)) + '</span> ' + esc(n.cat); }).join(' · ');
    return pick + '<div class="kpwrap"><div class="kpsheet" id="kpSheet">' +
      '<div class="kphead"><div class="kplogo"><b>MBCO</b><span>Modern Bus Company Limited</span></div><div class="kpht"><h1>' + kp('title') + '</h1><p>' + kp('sub') + ' — ' + esc(kpTeamL(p)) + ' · ' + esc(kp('period')) + ' <span class="ltr">' + esc(period) + '</span></p></div><div class="kpyear' + ysCls + '">' + esc(ys) + '</div></div>' +
      '<div class="kprow1"><div class="kpcard kpprof"><div class="kpphoto" id="kpPhoto">' + (K.photos[p.id] ? '<img src="' + K.photos[p.id] + '" alt="">' : '<span>' + esc(kpName(p).slice(0, 1)) + '</span>') + '</div><div class="kpinfo"><h2>' + esc(kpName(p)) + '</h2><div class="kprole">' + esc((st.lang === 'en' ? p.title_en : p.title_ar) || kpTeamL(p)) + '</div>' +
      '<div class="kpline2"><span>' + kp('id') + '</span><b class="num">' + esc(p.id) + '</b></div><div class="kpline2"><span>' + kp('team') + '</span><b>' + esc(kpTeamL(p)) + '</b></div>' +
      '<div class="kpline2"><span>' + kp('hire') + '</span><b class="num">' + esc(p.hire || '—') + '</b></div><div class="kpline2"><span>' + kp('rankOf') + '</span><b>' + (E.rank ? '<span class="num">' + E.rank + '</span> ' + kp('of') + ' <span class="num">' + E.of + '</span>' : '—') + '</b></div></div></div>' +
      '<div class="kpcard kpcircles' + (circles.length >= 6 ? ' n6' : '') + '">' + circles.map(function (c) {
        var v = c[1], cc = c[0] === 'overall' ? col : (KP_COL[kpBand(v)] || '#666');
        return '<div class="kpc' + (c[0] === 'overall' ? ' big' : '') + '"><div class="kpct"><i></i>' + kp(c[0]) + '</div><div class="kpcr">' + kpRing(v, v === null ? '#555' : cc, circles.length >= 6 ? (c[0] === 'overall' ? 98 : 76) : (c[0] === 'overall' ? 112 : 96), '') + '<div class="kpcv">' + kpIco(c[0], v === null ? '#777' : cc) + '<b class="num">' + (v === null || v === undefined ? '—' : v + '%') + '</b></div></div><div class="kpcw">' + (c[2] ? kp('w') + ' ' + c[2] + '%' : (band ? '<span style="color:' + col + '">' + kp('band' + band) + '</span>' : '')) + '</div></div>';
      }).join('') + '</div></div>' +
      '<div class="kpcard kpchart"><div class="kpct big"><i></i>' + kp(E.unit === 'month' ? 'byMonth' : 'byDay') + (D.teamAvg[p.team] !== null ? '<span class="kpavg">' + kp('teamAvg') + ': <b class="num">' + D.teamAvg[p.team] + '%</b></span>' : '') + '</div>' + kpLine(E.series, E.unit) + '</div>' +
      '<div class="kprow3"><div class="kpcard"><div class="kpct big"><i></i>' + kp('breakdown') + '</div>' + kpDonut(E.contrib, E.overall) + '</div>' +
      '<div class="kpcard"><div class="kpct big"><i></i>' + kp('facts') + '</div><div class="kpfacts">' + facts + '</div>' +
      '<div class="kpnoteline"><b>' + kp('notesT') + (X.notes.length ? ' (<span class="num">' + X.notes.length + '</span>)' : '') + ':</b> ' + (X.notes.length ? nl + (X.notes.length > 2 ? ' …' : '') : kp('notesNone')) + '</div></div>' +
      '<div class="kpbanner"><img src="kpi-banner.jpg" alt=""></div></div>' +
      '<div class="kpfoot"><span>' + esc(kp(isA ? 'formulaA' : p.team === 'STN' ? 'formulaS' : 'formula', { eq: S.vioEq, t: S.target, m: S.cdcMin, vio: '' })) + '</span><span>' + kp('gen') + ' <span class="ltr">' + esc(D.generated) + '</span> · ' + kp('by') + ': ' + esc(st.user.name || '') + '</span></div>' +
      '</div></div>';
  }
  /* التقرير بعرض ثابت (A4 بالعرض = 1123 بكسل) ويتصغّر على الشاشة الصغيرة */
  function kpFit() {
    var w = document.querySelector('.kpwrap'), s = document.getElementById('kpSheet'); if (!w || !s) return;
    var z = Math.min(1, (w.clientWidth - 2) / 1123); s.style.zoom = z < 1 ? z.toFixed(3) : '';
  }
  window.addEventListener('resize', function () { if (st.kpi && st.kpi.view === 'emp') kpFit(); });
  /* PDF: نسخة من التقرير في حاوية مستقلة + A4 بالعرض لهذي الطباعة فقط (باقي تقارير البوابة تبقى بالطول) */
  function kpPrint() {
    var sh = document.getElementById('kpSheet'); if (!sh) return;
    var box = document.getElementById('kpPrint') || document.body.appendChild(Object.assign(document.createElement('div'), { id: 'kpPrint' }));
    box.innerHTML = ''; var c = sh.cloneNode(true); c.removeAttribute('id'); c.style.zoom = ''; box.appendChild(c);
    var pg = document.createElement('style'); pg.id = 'kpPage'; pg.textContent = '@page{size:A4 landscape;margin:0}'; document.head.appendChild(pg);
    var t0 = document.title, E = st.kpi.d.emp; document.title = 'MBCO_KPI_' + (E ? E.profile.id : '') + '_' + st.kpi.from + '_' + st.kpi.to;
    document.body.classList.add('kpprint');
    var done = function () { document.body.classList.remove('kpprint'); pg.remove(); box.innerHTML = ''; document.title = t0; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    var img = c.querySelector('.kpbanner img');
    var go = function () { window.print(); setTimeout(done, 1500); };
    if (img && !img.complete) { img.onload = img.onerror = go; } else go();
  }
  function kpPhoto(id) {
    var K = st.kpi; if (K.photos[id] !== undefined) return;
    K.photos[id] = null;
    api('kpiPhoto', { emp: id }).then(function (j) { K.photos[id] = j.data || ''; var el = document.getElementById('kpPhoto'); if (el && j.data && K.emp === id) el.innerHTML = '<img src="' + j.data + '" alt="">'; }).catch(function () {});
  }
  function kpXlsx() {
    var X = window.MBCO_XLSX, K = st.kpi; if (!X) return;
    var head = { b: true, color: '#FFFFFF', fill: '#7B1E8F', h: 'center', border: 1, wrap: true }, cell = { border: 1 };
    var cols = [['#', function (r, i) { return i + 1; }], [kp('id'), function (r) { return r.id; }], [kp('emp'), function (r) { return kpName(r); }], [kp('team'), function (r) { return kpTeamL(r); }],
      [kp('overall'), function (r) { return r.overall; }], [kp('band' + 'A').slice(0, 0) + (st.lang === 'en' ? 'Band' : 'التقدير'), function (r) { return r.band ? kp('band' + r.band) : ''; }],
      [kp('att'), function (r) { return r.scores.att; }], [kp('punc'), function (r) { return r.scores.punc; }], [kp('prod'), function (r) { return r.scores.prod; }], [kp('cdc'), function (r) { return r.scores.cdc; }], [kp('rate'), function (r) { return r.scores.rate; }], [kp('notes'), function (r) { return r.scores.notes; }],
      [kp('workDays'), function (r) { return r.raw.workDays; }], [kp('stnI'), function (r) { return r.raw.stn; }], [kp('enfI'), function (r) { return r.raw.enf; }], [kp('vio'), function (r) { return r.raw.vio; }],
      [kp('fines'), function (r) { return r.raw.fines; }], [kp('ops'), function (r) { return r.raw.ops; }], [kp('perDay'), function (r) { return r.raw.perDay; }], [kp('cdcN'), function (r) { return r.raw.cdc; }],
      [kp('arrOk'), function (r) { return r.raw.arrN ? r.raw.arrOk + '/' + r.raw.arrN : ''; }], [kp('arrAvg'), function (r) { return r.raw.arrAvg; }], [kp('present'), function (r) { return r.raw.present; }], [kp('absent'), function (r) { return r.raw.absent; }]];
    var rows = kpRows();
    var a = document.createElement('a');
    a.href = URL.createObjectURL(X.write([{ name: 'KPI', rtl: st.lang !== 'en', freeze: 'D4', cols: cols.map(function (c, i) { return i === 2 ? 26 : 11; }), merges: ['A1:' + X.colName(cols.length - 1) + '1'],
      rows: [[{ v: 'MBCO · ' + kp('title') + ' · ' + K.from + ' → ' + K.to, s: { b: true, sz: 14, color: '#7B1E8F' } }], [kp('formula', { eq: K.d.settings.vioEq, t: K.d.settings.target, m: K.d.settings.cdcMin, vio: '' })], cols.map(function (c) { return { v: c[0], s: head }; })]
        .concat(rows.map(function (r, i) { return cols.map(function (c) { var v = c[1](r, i); return { v: v === null || v === undefined ? '' : v, s: cell }; }); })) }]));
    a.download = 'MBCO_KPI_' + K.from + '_' + K.to + '.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  /* ---------- 2.4: التبويبات + الملاحظات + التقييم الشهري ---------- */
  function kpTabs() {
    var K = st.kpi, el = document.getElementById('kTabs'); if (!el) return;
    var me = (K.d && K.d.me) || {}, tabs = [['rank', kp('tabRank')]];
    if (me.note || me.approve) tabs.push(['notes', kp('tabNotes') + (me.pending ? ' <span class="kpbadge num">' + me.pending + '</span>' : '')]);
    if (me.rate || me.approve) tabs.push(['rate', kp('tabRate')]);
    if (tabs.length < 2) { el.innerHTML = ''; K.tab = 'rank'; return; }
    el.innerHTML = tabs.map(function (x) { return '<button type="button" data-ktab="' + x[0] + '" class="' + (K.tab === x[0] ? 'on' : '') + '">' + x[1] + '</button>'; }).join('');
    el.querySelectorAll('[data-ktab]').forEach(function (b) { b.onclick = function () { K.tab = b.getAttribute('data-ktab'); kpDraw(); }; });
  }
  function kpBusy(b) { b.innerHTML = '<div class="loading"><div class="spin"></div>' + t('loading') + '</div>'; }
  function kpNotesLoad(force) {
    var K = st.kpi, b = document.getElementById('kpiBody'), ck = K.from + '|' + K.to;
    if (K.nd && K.nkey === ck && !force) return kpNotesDraw();
    kpBusy(b); setSync(true);
    return api('kpiNotes', { from: K.from, to: K.to }).then(function (j) { K.nd = j.data; K.nkey = ck; if (K.tab === 'notes' && route() === 'people') kpNotesDraw(); })
      .catch(function (e) { failBox(b, e, function () { kpNotesLoad(true); }); }).then(function () { setSync(false); });
  }
  function kpNk(k) { return '<span class="kpnk ' + esc(k) + '">' + esc(kp(k)) + '</span>'; }
  function kpNotesDraw() {
    var K = st.kpi, N = K.nd, b = document.getElementById('kpiBody'); if (!b || !N) return;
    var stK = { P: 'بانتظار الاعتماد', A: 'معتمدة', R: 'مرفوضة' }, cnt = function (k) { return N.notes.filter(function (n) { return n.status === stK[k]; }).length; };
    var list = N.notes.filter(function (n) { return !K.nst || n.status === stK[K.nst]; });
    var nm = function (id, name) { var t_ = N.targets.filter(function (x) { return x.id === id; })[0]; return esc(st.lang === 'en' && t_ && t_.name_en ? t_.name_en : name); };
    var stCls = function (s_) { return s_ === stK.A ? 'ok' : s_ === stK.R ? 'bad' : s_ === stK.P ? 'warn' : ''; };
    var stL = function (s_) { return s_ === stK.A ? kp('stA') : s_ === stK.R ? kp('stR') : s_ === stK.P ? kp('stP') : s_; };
    b.innerHTML = '<div class="kpis k4">' + rKpi(kp('stP'), cnt('P'), 'warn') + rKpi(kp('stA'), cnt('A'), 'ok') + rKpi(kp('stR'), cnt('R'), 'bad') + rKpi(kp('tabNotes'), N.notes.length) + '</div>' +
      '<p class="muted kphow">' + esc(kp('notesHow')) + (N.notesOn ? '' : ' <b>' + esc(kp('notesOff')) + '</b>') + '</p>' +
      '<div class="toolbar noprint"><div class="seg">' + [['P', 'stP'], ['A', 'stA'], ['R', 'stR'], ['', 'stAll']].map(function (x) { return '<button type="button" data-knst="' + x[0] + '" class="' + (K.nst === x[0] ? 'on' : '') + '">' + kp(x[1]) + '</button>'; }).join('') + '</div><span class="sp"></span>' +
      (N.targets.length ? '<button type="button" class="btn primary sm" id="kNew">' + icon('plus') + kp('addNote') + '</button>' : '') + '</div>' +
      '<div class="tblwrap rtbl"><table class="tbl kpnotes"><thead><tr><th>' + kp('ndate') + '</th><th>' + kp('emp') + '</th><th>' + kp('kind') + '</th><th>' + kp('cat') + '</th><th>' + kp('text') + '</th><th>' + kp('nby') + '</th><th>' + kp('nst') + '</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map(function (n) {
        var acts = '';
        if (N.approve && n.status === stK.P) acts = '<button type="button" class="btn sm ok" data-nact="approve" data-nid="' + esc(n.id) + '">' + kp('approve') + '</button><button type="button" class="btn sm ghost" data-nact="reject" data-nid="' + esc(n.id) + '">' + kp('reject') + '</button>';
        else if (N.approve && (n.status === stK.A || n.status === stK.R)) acts = '<button type="button" class="btn sm ghost" data-nact="reopen" data-nid="' + esc(n.id) + '">' + kp('reopen') + '</button>';
        if (n.by === N.me && n.status === stK.P && !N.approve) acts += '<button type="button" class="btn sm ghost" data-nact="withdraw" data-nid="' + esc(n.id) + '">' + kp('withdraw') + '</button>';
        return '<tr><td class="num nowrap">' + esc(n.d) + '</td><td class="nowrap"><b>' + nm(n.emp, n.name) + '</b><div class="muted num">' + esc(n.emp) + '</div></td><td>' + kpNk(n.kind) + '</td><td>' + esc(n.cat) + '</td>' +
          '<td class="kpntext">' + esc(n.text || '—') + (n.decNote ? '<div class="muted">↳ ' + esc(n.decNote) + '</div>' : '') + '</td><td class="nowrap">' + esc(n.byName) + (n.src === 'bot' ? ' <span class="muted">· bot</span>' : '') + '</td>' +
          '<td class="nowrap"><span class="rstat ' + stCls(n.status) + '">' + esc(stL(n.status)) + '</span>' + (n.decBy ? '<div class="muted">' + esc(n.decBy) + '</div>' : '') + '</td><td class="nowrap">' + acts + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">' + kp('noNotes') + '</td></tr>') + '</tbody></table></div>';
    b.querySelectorAll('[data-knst]').forEach(function (x) { x.onclick = function () { K.nst = x.getAttribute('data-knst'); kpNotesDraw(); }; });
    var nw = b.querySelector('#kNew'); if (nw) nw.onclick = kpNoteModal;
    b.querySelectorAll('[data-nact]').forEach(function (x) {
      x.onclick = function () {
        var a = x.getAttribute('data-nact'), id = x.getAttribute('data-nid');
        var go = function (note) { setSync(true); api('kpiNoteDecide', { id: id, act: a, note: note || '' }).then(function () { cdModalClose(); K.key = ''; kpRefreshMe(); kpNotesLoad(true); }).catch(function (e) { toast(errText(e)); }).then(function () { setSync(false); }); };
        if (a !== 'reject') return go('');
        cdModal('<h3>' + kp('reject') + '</h3><label class="field">' + kp('rejReason') + '<textarea class="input" id="kRej" rows="3"></textarea></label><div class="mact"><button type="button" class="btn ghost" data-x>' + kp('cancel') + '</button><button type="button" class="btn primary" id="kRejGo">' + kp('reject') + '</button></div>',
          function (ov) { ov.querySelector('#kRejGo').onclick = function () { go(ov.querySelector('#kRej').value.trim()); }; });
      };
    });
  }
  function kpRefreshMe() { var K = st.kpi; return api('kpi', { from: K.from, to: K.to }).then(function (j) { K.d = j.data; K.key = K.from + '|' + K.to + '|'; kpTabs(); }).catch(function () {}); }
  function kpNoteModal() {
    var K = st.kpi, N = K.nd, today = (K.d && K.d.today) || todayStr();
    var min = new Date(today + 'T12:00:00'); min.setDate(min.getDate() - 30); min = min.toISOString().slice(0, 10);
    var grp = {}; N.targets.forEach(function (x) { var g = x.group === 'SUP' ? 'SUP' : x.group; (grp[g] = grp[g] || []).push(x); });
    var opts = Object.keys(grp).map(function (g) { return '<optgroup label="' + esc(kp(g)) + '">' + grp[g].map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(kpName(x)) + ' (' + esc(x.id) + ')</option>'; }).join('') + '</optgroup>'; }).join('');
    var kinds = Object.keys(N.types);
    cdModal('<h3>' + kp('addNote') + '</h3><div class="kpform">' +
      '<label class="field">' + kp('emp') + '<select class="input" id="nEmp">' + opts + '</select></label>' +
      '<div class="field"><span>' + kp('kind') + '</span><div class="seg kpkinds">' + kinds.map(function (k, i) { var v = N.types[k]; return '<button type="button" data-nk="' + k + '" class="' + (i === 0 ? 'on' : '') + '">' + kp(k) + ' <span class="num muted">' + (v > 0 ? '+' : '') + v + '</span></button>'; }).join('') + '</div></div>' +
      '<label class="field">' + kp('cat') + '<select class="input" id="nCat"></select></label>' +
      '<label class="field">' + kp('ndate') + '<input class="input num" type="date" id="nDate" value="' + today + '" min="' + min + '" max="' + today + '"></label>' +
      '<label class="field">' + kp('text') + '<textarea class="input" id="nText" rows="3" maxlength="600"></textarea></label></div>' +
      '<div class="mact"><button type="button" class="btn ghost" data-x>' + kp('cancel') + '</button><button type="button" class="btn primary" id="nGo">' + kp('save') + '</button></div>', function (ov) {
        var kind = kinds[0];
        var fill = function () { var L = kind === 'praise' ? N.praiseCats : N.cats; ov.querySelector('#nCat').innerHTML = L.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join(''); };
        fill();
        ov.querySelectorAll('[data-nk]').forEach(function (b) { b.onclick = function () { kind = b.getAttribute('data-nk'); ov.querySelectorAll('[data-nk]').forEach(function (x) { x.classList.toggle('on', x === b); }); fill(); }; });
        ov.querySelector('#nGo').onclick = function () {
          var btn = this; btn.disabled = true; setSync(true);
          api('kpiNoteAdd', { emp: ov.querySelector('#nEmp').value, kind: kind, cat: ov.querySelector('#nCat').value, date: ov.querySelector('#nDate').value, text: ov.querySelector('#nText').value.trim() })
            .then(function (j) { cdModalClose(); toast(kp(j.note && j.note.status === 'معتمدة' ? 'noteSavedA' : 'noteSaved')); K.key = ''; kpRefreshMe(); kpNotesLoad(true); })
            .catch(function (e) { btn.disabled = false; toast(errText(e)); }).then(function () { setSync(false); });
        };
      });
  }
  function kpRateLoad(force) {
    var K = st.kpi, b = document.getElementById('kpiBody');
    if (!K.rm) K.rm = ((K.d && K.d.today) || todayStr()).slice(0, 7);
    if (K.rd && K.rkey === K.rm && !force) return kpRateDraw();
    kpBusy(b); setSync(true);
    return api('kpiRates', { month: K.rm }).then(function (j) { K.rd = j.data; K.rkey = K.rm; if (K.tab === 'rate' && route() === 'people') kpRateDraw(); })
      .catch(function (e) { failBox(b, e, function () { kpRateLoad(true); }); }).then(function () { setSync(false); });
  }
  function kpRateDraw() {
    var K = st.kpi, R = K.rd, b = document.getElementById('kpiBody'); if (!b || !R) return;
    var maxM = ((K.d && K.d.today) || todayStr()).slice(0, 7);
    var gl = function (x) { return x.group === 'SUP' ? kp('SUP1') + ' · ' + kp(x.base) : kp(x.group); };
    var card = function (x) {
      var r = x.rating || {}, it = r.items || [];
      return '<div class="card kprc" data-remp="' + esc(x.id) + '"><div class="kprch"><div><b>' + esc(kpName(x)) + '</b><div class="muted"><span class="num">' + esc(x.id) + '</span> · ' + esc(gl(x)) + '</div></div><div class="kprsc num" data-rsc>' + (r.score ? r.score + '%' : '—') + '</div></div>' +
        R.items.map(function (lab, i) { return '<div class="kpri"><span>' + esc(lab) + '</span><div class="seg kpr5">' + [1, 2, 3, 4, 5].map(function (v) { return '<button type="button" title="' + esc(kp('r' + v)) + '" data-ri="' + i + '" data-rv="' + v + '" class="' + (it[i] === v ? 'on' : '') + '">' + v + '</button>'; }).join('') + '</div></div>'; }).join('') +
        '<textarea class="input" rows="2" data-rcm placeholder="' + esc(kp('comment')) + '">' + esc(r.comment || '') + '</textarea>' +
        '<div class="kprf"><span class="muted">' + (r.at ? esc(r.by + ' · ' + r.at) : esc(kp('notRated'))) + '</span><button type="button" class="btn primary sm" data-rsave>' + kp('save') + '</button></div></div>';
    };
    b.innerHTML = '<div class="toolbar noprint"><label class="field">' + kp('rmonth') + '<input class="input num" type="month" id="kRm" value="' + esc(R.month) + '" max="' + maxM + '"></label><span class="muted kphow">' + esc(kp('rateHow')) + ' ' + [1, 2, 3, 4, 5].map(function (v) { return v + ' ' + kp('r' + v); }).join(' · ') + '</span></div>' +
      (R.targets.length ? '<div class="kprgrid">' + R.targets.map(card).join('') + '</div>' : (R.all ? '' : '<div class="empty card">' + kp('rateNone') + '</div>')) +
      (R.all ? '<h3 class="kph3">' + kp('rateAll') + '</h3><div class="tblwrap rtbl"><table class="tbl"><thead><tr><th>' + kp('emp') + '</th><th>' + kp('team') + '</th><th>' + kp('rater') + '</th><th>' + kp('rate') + '</th></tr></thead><tbody>' +
        R.all.map(function (x) { return '<tr><td><b>' + esc(kpName(x)) + '</b> <span class="muted num">' + esc(x.id) + '</span></td><td>' + esc(gl(x)) + '</td><td>' + esc(R.names[x.rater] || x.rater || '—') + '</td><td>' + (x.rating ? kpScoreCell(x.rating.score) + (x.rating.comment ? ' <span class="muted">' + esc(x.rating.comment) + '</span>' : '') : '<span class="kpst warn">' + kp('notRated') + '</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '');
    var m = b.querySelector('#kRm'); if (m) m.onchange = function () { if (m.value) { K.rm = m.value > maxM ? maxM : m.value; kpRateLoad(false); } };
    b.querySelectorAll('.kprc').forEach(function (c) {
      var calc = function () { var v = []; c.querySelectorAll('.kpri').forEach(function (row) { var on = row.querySelector('.on'); v.push(on ? +on.getAttribute('data-rv') : 0); }); return v; };
      c.querySelectorAll('[data-ri]').forEach(function (btn) {
        btn.onclick = function () { btn.parentNode.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === btn); }); var v = calc(); if (v.indexOf(0) < 0) c.querySelector('[data-rsc]').textContent = Math.round(v.reduce(function (a, x) { return a + x; }, 0) / v.length / 5 * 1000) / 10 + '%'; };
      });
      c.querySelector('[data-rsave]').onclick = function () {
        var v = calc(), btn = this; if (v.indexOf(0) >= 0) return toast(kp('rateMiss'));
        btn.disabled = true; setSync(true);
        api('kpiRateSave', { emp: c.getAttribute('data-remp'), month: R.month, items: v, comment: c.querySelector('[data-rcm]').value.trim() })
          .then(function () { toast(kp('rateSaved')); K.key = ''; kpRateLoad(true); }).catch(function (e) { btn.disabled = false; toast(errText(e)); }).then(function () { setSync(false); });
      };
    });
  }
  function kpBind(b) {
    var K = st.kpi;
    b.querySelectorAll('[data-kteam]').forEach(function (x) { x.onclick = function () { K.team = x.getAttribute('data-kteam'); kpDraw(); }; });
    b.querySelectorAll('[data-ksort]').forEach(function (th) { th.onclick = function () { var k = th.getAttribute('data-ksort'); K.sort = { k: k, d: K.sort.k === k ? -K.sort.d : -1 }; kpDraw(); }; });
    var q = b.querySelector('#kQ'); if (q) q.oninput = function () { var p = q.selectionStart; K.q = q.value; kpDraw(); var n = document.getElementById('kQ'); if (n) { n.focus(); n.setSelectionRange(p, p); } };
    var x = b.querySelector('#kX'); if (x) x.onclick = kpXlsx;
    b.querySelectorAll('[data-kemp]').forEach(function (tr_) { tr_.onclick = function () { K.emp = tr_.getAttribute('data-kemp'); K.view = 'emp'; kpLoad(false); window.scrollTo(0, 0); }; });
    var bk = b.querySelector('#kBack'); if (bk) bk.onclick = function () { K.view = 'rank'; kpLoad(false); };
    var se = b.querySelector('#kEmp'); if (se) se.onchange = function () { K.emp = se.value; kpLoad(false); };
    var pd = b.querySelector('#kPdf'); if (pd) pd.onclick = kpPrint;
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
    if (key === 'people') {
      main.innerHTML = title + '<div class="ctlnative" id="kpiWrap"></div>';
      if (st.user.role === 'Officer') { document.getElementById('kpiWrap').innerHTML = '<div class="ctlmsg"><p>' + esc(t('ctl_role')) + '</p></div>'; return; }
      renderKpi(document.getElementById('kpiWrap'), false);
      return;
    }
    if (mode === 'ctl') {
      if (key === 'car') {
        main.innerHTML = title + '<div class="ctlnative" id="ctlWrap"></div>';
        bindModeSwitch(key);
        if (st.user.role === 'Officer') { document.getElementById('ctlWrap').innerHTML = '<div class="ctlmsg"><p>' + esc(t('ctl_role')) + '</p></div>'; return; }
        renderCar(document.getElementById('ctlWrap'), false);
        return;
      }
      if (key === 'cdc') {
        main.innerHTML = title + '<div class="ctlnative" id="ctlWrap"></div>';
        bindModeSwitch(key);
        if (st.user.role === 'Officer') { document.getElementById('ctlWrap').innerHTML = '<div class="ctlmsg"><p>' + esc(t('ctl_role')) + '</p></div>'; return; }
        renderCdc(document.getElementById('ctlWrap'), false);
        return;
      }
      if (key === 'ins') {
        main.innerHTML = title + '<div class="ctlnative" id="ctlWrap"></div>';
        bindModeSwitch(key);
        if (st.user.role === 'Officer') { document.getElementById('ctlWrap').innerHTML = '<div class="ctlmsg"><p>' + esc(t('ctl_role')) + '</p></div>'; return; }
        renderIns(document.getElementById('ctlWrap'), false);
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
