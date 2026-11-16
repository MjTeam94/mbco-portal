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
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'
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
    var draw = function (d) { if (route() === page) { main.innerHTML = homeHTML(d, isReport); bindHome(isReport); } };
    var go = function (force) {
      var mem = st.home && st.homeKey === key ? st.home : null;
      var shown = mem || ccGet(ck);
      if (shown && !force) { draw(shown); if (!mem) { st.home = shown; st.homeKey = key; setBadges(); } }
      if (mem && !force && !st.fresh && Date.now() - st.homeAt < 60000) return;
      var fresh = st.fresh; st.fresh = false;
      setSync(true);
      api('home', { date: st.date || '', heatDays: st.heatDays, fresh: fresh }).then(function (j) {
        st.home = j.data; st.homeKey = key; st.homeAt = Date.now(); ccSet(ck, j.data); setBadges();
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
    var p = document.getElementById('printBtn'); if (p) p.onclick = function () { window.print(); };
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
    h += '<div class="pagehead"><div><h1>' + (isReport ? t('report_title') : t('home_title')) + '</h1><div class="sub num">' + esc(d.date) + (d.isToday ? ' · ' + t('last_update') + ' ' + esc(d.updated) : '') + '</div></div>' +
      (isReport ? '<span class="tag b-accent ltr">' + t('daily') + ' · ' + esc(d.date) + '</span><button type="button" class="btn noprint" id="printBtn">' + icon('print') + t('print') + '</button>' : '') +
      (DEMO ? '<span class="notice">' + t('demo') + '</span>' : '') + '</div>';

    // الورديات
    h += '<section class="card" aria-label="' + esc(t('shifts_now')) + '"><div class="chead"><span class="bar4"></span><h2>' + (d.isToday ? t('shifts_now') : t('shifts_day')) + '</h2></div><div class="shifts">';
    if (!d.shifts.length) h += '<div class="empty">' + t('no_data') + '</div>';
    d.shifts.forEach(function (s) {
      h += '<div class="shift"><div class="t"><b>' + esc(s.team) + '</b><span class="muted ltr num" style="font-size:12px">' + esc(s.time) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;gap:8px;font-size:13px"><span>TL: ' + esc(s.lead) + '</span><span class="pill ' + ({ running: 'b-ok', upcoming: 'b-muted', ended: 'b-accent' }[s.state]) + '">' + t(s.state) + '</span></div>' +
        '<div class="chips"><span class="chip">' + t('attendance') + ' <span class="num ltr">' + esc(s.att) + '</span></span><span class="chip t-' + s.dist.tone + '">' + t('distribution') + ': ' + esc(s.dist.label) + '</span><span class="chip t-' + s.prep.tone + '">' + t('preparation') + ': ' + esc(s.prep.label) + '</span></div></div>';
    });
    h += '</div></section>';

    // مؤشرات الالتزام
    h += '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + t('kpis_title') + ' <small>' + t('kpis_sub') + '</small></h2></div><div class="rings">';
    d.kpis.forEach(function (k) {
      var tone = k.val === null ? 'muted' : k.val >= k.target ? 'ok' : k.target - k.val <= 10 ? 'warn' : 'bad';
      h += '<div class="ringbox">' + ring(k.val, toneColor(tone), '<b class="num t-' + tone + '" style="font-size:19px">' + (k.val === null ? '—' : k.val + '%') + '</b>') +
        '<span class="l">' + esc(k.label) + '</span><span class="s">' + esc(k.sys) + ' · ' + t('target') + ' ' + k.target + '%</span></div>';
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
        '<div class="legend">' + c.outcomes.map(function (o, i) { return '<span><i style="background:' + oc[i % 4] + '"></i>' + esc(o.name) + ' <b class="num">' + o.n + '</b></span>'; }).join('') + '</div>'
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
        return '<div class="it"><b style="flex:1 1 auto">' + esc(x.type) + '</b><span class="muted">' + esc(x.who) + '</span><span class="tag b-' + x.tone + '">' + esc(x.status) + '</span></div>';
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
        return '<div class="alert ' + (a.tone === 'bad' ? 'b-bad' : a.tone === 'warn' ? 'b-warn' : 'b-muted') + '" style="color:var(--text)"><span class="s t-' + a.tone + '">' + esc(a.sys) + '</span><span class="x">' + esc(a.text) + '</span></div>';
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
        return '<div style="display:flex;flex-direction:column;gap:4px"><div style="display:flex;justify-content:space-between;font-size:13px"><b style="font-weight:600">' + esc(s.name) + '</b><b class="num">' + s.n + '</b></div><div class="hbar"><div style="width:' + Math.round(s.n / smax * 100) + '%"></div></div></div>';
      }).join('') : '<div class="empty">' + t('no_data') + '</div>') + '</div>' +
      '<div class="chead"><span class="bar4"></span><h2>' + t('repeat_buses') + '</h2></div><div class="list">' +
      (d.buses.length ? d.buses.map(function (b) { return '<div class="it"><b class="ltr" style="flex:1 1 auto">' + esc(b.no) + '</b><span class="muted">' + esc(b.what) + '</span><b class="num">' + b.n + '</b></div>'; }).join('') : '<div class="empty">' + t('no_data') + '</div>') +
      '</div></section></div>';

    // الموظفون
    h += '<section class="card"><div class="chead"><span class="bar4"></span><h2>' + t('people_title') + ' <small>' + t('people_sub') + '</small></h2>' +
      (!isReport && secOK('reports') ? '<a class="btn sm noprint" href="#/reports">' + icon('print') + t('daily_report') + '</a>' : '') + '</div>' +
      '<div class="tblwrap"><table class="tbl" style="min-width:760px"><thead><tr><th>' + t('col_emp') + '</th><th>' + t('col_team') + '</th><th>' + t('col_post') + '</th><th>' + t('col_cdc') + '</th><th>' + t('col_ins') + '</th><th>' + t('col_vio') + '</th><th>' + t('col_car') + '</th><th>' + t('col_att') + '</th></tr></thead><tbody>' +
      (d.people.length ? d.people.map(function (p) {
        return '<tr><td><b>' + esc(p.name) + '</b> <span class="muted num">' + esc(p.id) + '</span></td><td>' + esc(p.team) + '</td><td>' + esc(p.post || '—') + '</td><td class="b num">' + p.cdc + '</td><td class="b num">' + p.ins + '</td><td class="b num">' + p.vio + '</td><td class="ltr num">' + esc(p.car || '—') + '</td><td>' + (p.att ? '<span class="tag b-' + p.attTone + '">' + esc(p.att) + '</span>' : '—') + '</td></tr>';
      }).join('') : '<tr><td colspan="8" class="empty">' + t('no_data') + '</td></tr>') + '</tbody></table></div></section>';
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
        '<span style="display:flex;align-items:center;gap:5px;font-size:11px"><span class="dot" style="background:' + toneColor(v.tone) + '"></span>' + esc(v.where) + '</span>' +
        '<span class="muted ltr num" style="font-size:11px">' + (v.odo ? v.odo.toLocaleString('en') + ' km' : '—') + '</span></div>';
    }).join('') + '</div>';
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
      s.data = d; s.from = d.from; s.to = d.to;
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
      '<div class="kpis k4">' + d.kpis.map(function (k) { return '<div class="kpi ' + (k.tone || '') + '"><span class="l">' + esc(k.label) + '</span><span class="v num">' + fmtN(k.value) + '</span></div>'; }).join('') + '</div>' +
      (d.vehicles ? '<div style="margin-top:14px">' + vehiclesHTML(d.vehicles) + '</div>' : '') +
      '<div id="sTable" style="margin-top:14px"></div>';
    drawTable(key);
  }

  function filtered(key) {
    var s = st.sec[key], d = s.data, q = (s.q || '').trim().toLowerCase();
    return q ? d.rows.filter(function (r) { return d.columns.some(function (c) { return String(r[c.key]).toLowerCase().indexOf(q) >= 0; }); }) : d.rows;
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
          if (isStatus(c.key) && v !== '') { var tn = tone(v); return '<td>' + (tn ? '<span class="tag b-' + tn + '">' + esc(v) + '</span>' : esc(v)) + '</td>'; }
          return '<td class="' + (typeof v === 'number' ? 'num b' : '') + '">' + (v === '' ? '<span class="muted">—</span>' : /^\d{4}-\d{2}-\d{2}|^[A-Z]{2,4}-/.test(String(v)) ? '<span class="ltr">' + esc(v) + '</span>' : esc(typeof v === 'number' ? v.toLocaleString('en') : v)) + '</td>';
        }).join('') + '</tr>';
      }).join('') : '<tr><td colspan="' + d.columns.length + '" class="empty">' + t('no_rows') + '</td></tr>') + '</tbody></table></div>';
  }

  function csv(key) {
    var d = st.sec[key].data, rows = filtered(key), L = st.lang === 'en';
    var q = function (v) { v = String(v === null || v === undefined ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var out = [d.columns.map(function (c) { return q(L ? c.en : c.ar); }).join(',')].concat(rows.map(function (r) { return d.columns.map(function (c) { return q(r[c.key]); }).join(','); })).join('\r\n');
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
