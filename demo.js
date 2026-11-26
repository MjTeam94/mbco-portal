/* MBCO – وضع العرض: بيانات تجريبية للتجربة قبل التركيب (يعمل عندما يكون HUB_URL فارغاً أو ?demo=1) */
window.MBCO_DEMO = (function () {
  var SECTIONS = [
    ['home', 'الرئيسية', 'Home', ''], ['cdc', 'بلاغات العمليات', 'Operations cases', 'ops'], ['ins', 'الفحص والمخالفات', 'Inspections & violations', 'ops'],
    ['car', 'إدارة الأسطول', 'Carlog', 'ops'], ['roster', 'جدول الشفتات', 'Roster', 'staff'], ['dist', 'توزيع الموظفين', 'Staff distribution', 'staff'], ['att', 'الحضور والغياب', 'Attendance', 'staff'],
    ['leaves', 'الإجازات', 'Leaves', 'staff'], ['requests', 'الطلبات الإدارية', 'Admin requests', 'staff'], ['people', 'أداء الموظفين', 'Staff performance', 'analysis'],
    ['reports', 'التقرير اليومي', 'Daily report', 'analysis'], ['settings', 'الإعدادات والمستخدمين', 'Settings & users', 'system']
  ].map(function (s) { return { key: s[0], ar: s[1], en: s[2], group: s[3] }; });
  var USER = { emp_id: '10190', name: 'ماجد', role: 'Admin', team: 'ADM', team_name: 'الإدارة' };
  function opDay() { return new Date(Date.now() + 3 * 3600e3 - 7 * 3600e3).toISOString().slice(0, 10); }
  function add(d, n) { var p = d.split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
  function ok(x) { return new Promise(function (res) { setTimeout(function () { res(Object.assign({ ok: true }, x)); }, 250); }); }
  function fail(e) { return new Promise(function (res, rej) { setTimeout(function () { rej(new Error(e)); }, 250); }); }

  function home(date, heatDays) {
    var D = date || opDay();
    var mul = heatDays === 30 ? 4 : 1;
    var heat = [[1, 2, 4, 3, 1, 0], [0, 1, 2, 2, 0, 0], [2, 3, 6, 5, 1, 0], [0, 1, 1, 2, 0, 0], [1, 2, 5, 4, 2, 1], [0, 0, 1, 1, 0, 0], [3, 5, 14, 9, 3, 1], [2, 4, 8, 7, 2, 0], [0, 1, 2, 1, 0, 0], [1, 1, 3, 2, 1, 0], [0, 2, 4, 3, 0, 0], [1, 3, 7, 6, 2, 0], [0, 1, 2, 1, 0, 0]];
    var routes = ['1', '2', '3', '4', '5', '6', '7A', '7B', '8', '9', '10', '11', '12'];
    var last7 = [44, 58, 51, 66, 48, 61, 64].map(function (n, i) { return { date: add(D, i - 6), n: n }; });
    return {
      date: D, today: opDay(), isToday: D === opDay(), updated: new Date().toTimeString().slice(0, 5), heatDays: heatDays,
      systems: [],
      shifts: [
        { team: 'المحطات · الثانية (Team B)', time: '15:00–00:00', state: 'running', lead: 'صقر المجنوني', att: '5 / 6', dist: { label: 'معتمد', tone: 'ok' }, prep: { label: 'معتمد', tone: 'ok' } },
        { team: 'التذاكر · الثانية (Team D2)', time: '15:00–00:00', state: 'running', lead: 'سليمان الحازمي', att: '8 / 9', dist: { label: 'معتمد', tone: 'ok' }, prep: { label: 'بانتظار', tone: 'warn' } },
        { team: 'المحطات · الثالثة (Team C)', time: '23:00–08:00', state: 'upcoming', lead: 'مخلد العتيبي', att: '—', dist: { label: 'لم يُوزَّع بعد', tone: 'warn' }, prep: { label: 'قادمة', tone: 'muted' } }
      ],
      kpis: [
        { label: 'الحضور', sys: 'الروستر', val: 91, target: 95 }, { label: 'التوزيع قبل بداية الوردية', sys: 'الروستر', val: 83, target: 100 },
        { label: 'استلام بلاغ CDC خلال 10 د', sys: 'CDC', val: 78, target: 90 }, { label: 'الوصول للبلاغ خلال 30 د', sys: 'CDC', val: 86, target: 90 },
        { label: 'طلبات عولجت قبل التصعيد', sys: 'الإجازات · 7 أيام', val: 100, target: 100 }, { label: 'بلاغات فعّالة', sys: 'CDC', val: 63, target: 80 }, { label: 'تسليم السيارة بنفسه', sys: 'Carlog · 7 أيام', val: 88, target: 95 }
      ],
      cdc: { today: 27, open: 4, avgArrive: 18, waitingPatrol: 2, outcomes: [{ name: 'إنزال الراكب', n: 9 }, { name: 'مخالفة', n: 6 }, { name: 'تعذر التواصل', n: 5 }, { name: 'أخرى', n: 7 }] },
      ins: { inspections: 64, violations: 9, fines: 1800, coverageH: 14, last7: last7, rdy: { n: 41, items: [{ k: 'cctv', n: 3 }, { k: 'screens', n: 2 }, { k: 'validator', n: 2 }, { k: 'clean', n: 1 }, { k: 'uniform', n: 4 }] } },
      rst: { present: 31, absent: 2, leaveOff: 9, expected: 33, late: 3, lateMin: 47, permissions: 1, withdrawals: 0, rate: 94 },
      req: { pendingSup: 3, pendingMena: 2, adminNew: 4, adminDoing: 1, recent: [
        { type: 'مرضية · يومان', who: 'موظف من المحطات', status: 'بانتظار المشرف', tone: 'warn' },
        { type: 'سنوية · 5 أيام', who: 'موظف من التذاكر', status: 'موافقة المشرف – بانتظار Mena-Me', tone: 'accent' },
        { type: 'تعريف بالراتب', who: 'موظف من التذاكر', status: 'قيد التنفيذ', tone: 'ok' }] },
      car: { kmToday: 212, handoversToday: 5, openFaults: 1, vehicles: [
        { id: '6765', plate: 'DSR 6765', where: 'في المكتب', tone: 'ok', odo: 197863, oilLeft: 2137, oilPct: 21, oilTone: 'ok', inShop: false },
        { id: '6768', plate: 'DSR 6768', where: 'مع موظف · 3 س', tone: 'warn', odo: 220796, oilLeft: 340, oilPct: 3, oilTone: 'warn', inShop: false },
        { id: '6755', plate: 'DSR 6755', where: 'في الورشة', tone: 'bad', odo: 192722, oilLeft: null, oilPct: null, oilTone: 'bad', inShop: true }] },
      alerts: [
        { sys: 'CDC', tone: 'bad', text: 'بلاغ مسار 7A بدون استلام منذ 32 دقيقة' },
        { sys: 'الروستر', tone: 'warn', text: 'المحطات · الثالثة لم تُوزَّع بعد' },
        { sys: 'الإجازات', tone: 'warn', text: 'طلب قارب التصعيد (11 ساعة)' },
        { sys: 'Carlog', tone: 'warn', text: 'مركبة 6768 باقي 340 كم على تغيير الزيت' }
      ], alertsTotal: 4,
      heat: { cols: ['07–11', '11–15', '15–19', '19–23', '23–03', '03–07'], rows: routes.map(function (r, i) { return { route: r, cells: heat[i].map(function (n) { return n * mul; }) }; }), top: { route: '7A', col: '15–19', n: 14 * mul } },
      stations: [{ name: 'المروة', n: 23 * mul }, { name: 'قطار الحرمين', n: 18 * mul }, { name: 'جبل الكعبة', n: 12 * mul }, { name: 'التنعيم', n: 9 * mul }, { name: 'الأحوال المدنية (100)', n: 6 * mul }],
      buses: [{ no: 'MA1234', what: 'بلاغات CDC', n: 4 }, { no: 'MS5678', what: 'مخالفات', n: 3 }, { no: 'MA4321', what: 'بلاغات CDC', n: 3 }],
      people: [
        { name: 'موظف تجريبي 1', id: '10001', team: 'التذاكر · 2', post: 'استلام حالات CDC · مسارات 3، 7A', cdc: 6, ins: 4, vio: 2, car: '6768', att: 'حاضر', attTone: 'ok' },
        { name: 'موظف تجريبي 2', id: '10002', team: 'التذاكر · 2', post: 'فحص ميداني · مسارات 1، 5', cdc: 2, ins: 11, vio: 3, car: '', att: 'حاضر · متأخر 15 د', attTone: 'warn' },
        { name: 'موظف تجريبي 3', id: '10003', team: 'المحطات · 2', post: 'المروة', cdc: 0, ins: 9, vio: 1, car: '', att: 'حاضر', attTone: 'ok' },
        { name: 'موظف تجريبي 4', id: '10004', team: 'المحطات · 2', post: 'قطار الحرمين', cdc: 0, ins: 7, vio: 0, car: '', att: 'حاضر', attTone: 'ok' },
        { name: 'موظف تجريبي 5', id: '10005', team: 'التذاكر · 2', post: 'دعم المحطات · التنعيم', cdc: 1, ins: 5, vio: 1, car: '', att: 'غائب', attTone: 'bad' }
      ],
      dict: { 'صقر المجنوني': 'Saqer Almajnuni', 'سليمان الحازمي': 'Sulaiman Alhazmi', 'مخلد العتيبي': 'Mukhlid Alotaibi', 'موظف تجريبي 1': 'Demo employee 1', 'موظف تجريبي 2': 'Demo employee 2', 'موظف تجريبي 3': 'Demo employee 3', 'موظف تجريبي 4': 'Demo employee 4', 'موظف تجريبي 5': 'Demo employee 5' },
      badges: { cdc: 4, leaves: 5, requests: 4, car: 2 }
    };
  }

  /** التقرير اليومي المطوّر (v2.7): نفس أرقام التصور المعتمد */
  function reportX(date) {
    var D = date || opDay();
    var dr = function (id, name, ph, issue, reason, bus, route, time, n30, coord, place, pax) { return { id: id, name: name, phone: ph, issue: issue, reason: reason || '', bus: bus, route: route, time: time, n30: n30, coord: !!coord, place: place || '', pax: pax || 0 }; };
    return {
      date: D, generated: D + ' 23:10', repeatMin: 3,
      sum: { cdc: { n: 27, avg7: 23 }, eff: { rate: 63, avg7: 71, effective: 17, wasted: 10 }, unreach: { n: 5, wrong: 2, off: 2, noans: 1 }, uniform: { n: 4, avg7: 5 },
        its: { buses: 6, recurring: 3 }, top: { route: '7A', n: 14, col: '15–19' }, repeaters: ['48213', '47102'], oldest: { bus: 'MA1234', faults: ['cctv'], open: 6 } },
      act: { drivers: 9, its: 6, cdc: 4, enf: 3, fleet: 1 },
      drivers: [
        dr('48213', 'سائق تجريبي 1', '055 000 0101', 'unreach', 'wrong', 'MA1234', '7A', '16:40', 4, true),
        dr('47102', 'سائق تجريبي 2', '055 000 0102', 'unreach', 'off', 'MS5678', '3', '17:15', 3, true),
        dr('49330', 'سائق تجريبي 3', '055 000 0103', 'noticket', '', 'MA4321', '7B', '18:05', 2, false, '', 2),
        dr('46021', 'سائق تجريبي 4', '055 000 0104', 'unreach', 'noans', 'MA2210', '11', '15:50', 2),
        dr('45590', 'سائق تجريبي 6', '055 000 0106', 'uniform', '', 'MA3007', '1', '08:30', 2, false, 'الزاهر'),
        dr('48877', 'سائق تجريبي 5', '055 000 0105', 'unreach', 'wrong', 'MS1180', '5', '19:20', 1, true),
        dr('47745', 'سائق تجريبي 7', '055 000 0107', 'uniform', '', 'MS2045', '9', '10:10', 1, false, 'المنصور'),
        dr('49012', 'سائق تجريبي 8', '055 000 0108', 'uniform', '', 'MA0981', '4', '11:45', 1, false, 'النوارية'),
        dr('46688', 'سائق تجريبي 9', '055 000 0109', 'unreach', 'off', 'MA1502', '10', '20:35', 1, true)
      ], driversTotal: 9,
      its: [
        { bus: 'MA1234', faults: ['cctv'], src: 'rdy', place: 'الزاهر', cdcN: 0, first: add(D, -6), n30: 4, open: 6 },
        { bus: 'MS5678', faults: ['screens'], src: 'rdy', place: 'المنصور', cdcN: 0, first: add(D, -4), n30: 3, open: 4 },
        { bus: 'MA4321', faults: ['validator'], src: 'cdc', place: '', cdcN: 2, first: add(D, -3), n30: 3, open: 3 },
        { bus: 'MA3007', faults: ['cctv'], src: 'rdy', place: 'العزيزية', cdcN: 0, first: add(D, -1), n30: 2, open: 1 },
        { bus: 'MA2210', faults: ['cctv', 'screens'], src: 'rdy', place: 'النوارية', cdcN: 0, first: D, n30: 1, open: 0 },
        { bus: 'MS1180', faults: ['validator'], src: 'cdc', place: '', cdcN: 1, first: D, n30: 1, open: 0 }
      ], itsTotal: 6,
      fleet: [{ bus: 'MA0981', place: 'الأحوال المدنية', n30: 1 }],
      cdcq: { total: 27, effective: 17, wasted: 10, lostMin: 140, phoneIssues: 4, reasons: { off: 2, noans: 1, wrong: 2, unreach: 0, valid: 3, left: 2, 'false': 0, not_taken: 0 },
        ops: [{ name: 'منسق أ', n: 11, wasted: 6, pct: 55 }, { name: 'منسق ب', n: 9, wasted: 3, pct: 33 }, { name: 'منسق ج', n: 7, wasted: 1, pct: 14 }] },
      hot: { routes: [{ name: '7A', n: 14, avg: 8, d: 6 }, { name: '7B', n: 8, avg: 6, d: 2 }, { name: '11', n: 7, avg: 7, d: 0 }, { name: '3', n: 6, avg: 7, d: -1 }],
        stations: [{ name: 'الزاهر', n: 9, avg: 5, d: 4 }, { name: 'المنصور', n: 7, avg: 5, d: 2 }, { name: 'النوارية', n: 6, avg: 6, d: 0 }, { name: 'العزيزية', n: 4, avg: 5, d: -1 }],
        peak: { route: '7A', n: 14, col: '15–19' } },
      systems: [{ code: 'CDC', ok: true }, { code: 'INS', ok: true }]
    };
  }

  function section(key, from, to) {
    to = to || opDay(); from = from || add(to, -6);
    var cols = function (a) { return a.map(function (c) { return { key: c[0], ar: c[1], en: c[2] }; }); };
    var R = function (n, fn) { var a = []; for (var i = 0; i < n; i++) a.push(fn(i)); return a; };
    var day = function (i) { return add(to, -(i % 7)); };
    var res = { key: key, from: from, to: to, systems: [], canOpenDashboard: true };
    var routes = ['3', '7A', '7B', '11', '5', '1'], sts = ['المروة', 'قطار الحرمين', 'جبل الكعبة', 'التنعيم'];
    if (key === 'dist') {
      var people = [['10131', 'مخلد العتيبي', 'Mukhlid Alotaibi', 'STN', 'fixedTL'], ['12271', 'علي سلامي', 'Ali Salami', 'STN', 'fixed'], ['12279', 'نزار الحربي', 'Nezar Alharbi', 'STN', 'rot'], ['12310', 'زياد المالكي', 'Ziyad Almalki', 'STN', 'rot'], ['12400', 'عبدالعزيز الزهراني', 'Abdulaziz Alzahrani', 'STN', 'fixed2'],
        ['10171', 'سليمان الحازمي', 'Sulaiman Alhazmi', 'ENF', 'rot'], ['10675', 'عماد برناوي', 'Emad Barnawi', 'ENF', 'fixedCDC'], ['11686', 'عمر رمضان', 'Omar Ramadan', 'ENF', 'rot']];
      var enf = ['CDC Route Calls +(Violations)', 'Field Inspection (Bus Hopping)', 'تمركز: الزاهر', 'Station Support: المروة'];
      var nd = Math.round((Date.parse(to) - Date.parse(from)) / 864e5) + 1, items = [];
      people.forEach(function (pp, k) {
        for (var i = 0; i < nd; i++) {
          if ((i + k) % 8 >= 6) continue;
          var d = add(from, i), place;
          if (pp[4] === 'fixedTL') place = 'TL';
          else if (pp[4] === 'fixed') place = 'المروة';
          else if (pp[4] === 'fixed2') place = i % 5 === 0 ? 'التنعيم' : 'قطار الحرمين';
          else if (pp[4] === 'fixedCDC') place = enf[0];
          else place = pp[3] === 'STN' ? sts[(i + k) % 4] : enf[(i + k) % 4];
          items.push({ shift_date: d, shift: String(1 + k % 3), team: pp[3], emp_id: pp[0], emp_name: pp[2], report_label: place, location_type: pp[3] === 'STN' ? 'محطة' : 'ميداني', route: '', break_start: '' });
        }
      });
      var by = {}, places = {};
      items.forEach(function (r) { var pl = /^TL/.test(r.report_label) ? 'مسؤول الوردية (TL)' : r.report_label; r.place = pl; (by[r.emp_id] = by[r.emp_id] || []).push(r); places[pl] = (places[pl] || 0) + 1; });
      var emps = people.filter(function (pp) { return by[pp[0]]; }).map(function (pp) {
        var l = by[pp[0]], cnt = {}; l.forEach(function (x) { cnt[x.place] = (cnt[x.place] || 0) + 1; });
        var locs = Object.keys(cnt).map(function (k2) { return { p: k2, n: cnt[k2] }; }).sort(function (a, b) { return b.n - a.n; });
        var last = l[l.length - 1].place, streak = 0; for (var j = l.length - 1; j >= 0 && l[j].place === last; j--) streak++;
        var share = Math.round(locs[0].n / l.length * 100), isTL = /TL/.test(locs[0].p);
        return { emp_id: pp[0], name: pp[1], name_en: pp[2], team: pp[3], shifts: l.length, distinct: locs.length, top: locs[0].p, topN: locs[0].n, share: share, streak: streak, lastPlace: last, state: l.length < 3 ? 'few' : (!isTL && (share >= 70 || (streak >= 3 && !/TL/.test(last)))) ? 'fixed' : 'rotating', locs: locs, timeline: l.slice(-14).map(function (x) { return { d: x.shift_date, s: x.shift, p: x.place }; }) };
      }).sort(function (a, b) { var o = { fixed: 0, rotating: 1, few: 2 }; return o[a.state] - o[b.state] || b.share - a.share; });
      res.dist = { emps: emps, places: Object.keys(places).map(function (k2) { return { p: k2, n: places[k2] }; }).sort(function (a, b) { return b.n - a.n; }) };
      res.kpis = [{ label: 'موظفين موزعين', value: emps.length }, { label: 'ثابتين في نفس الموقع', value: emps.filter(function (e) { return e.state === 'fixed'; }).length, tone: 'warn' }, { label: 'يتنقلون بين المواقع', value: emps.filter(function (e) { return e.state === 'rotating'; }).length, tone: 'ok' }, { label: 'بنود توزيع', value: items.length }];
      res.columns = cols([['shift_date', 'التاريخ', 'Date'], ['shift', 'الوردية', 'Shift'], ['team', 'الفريق', 'Team'], ['emp_name', 'الموظف', 'Employee'], ['place', 'الموقع', 'Location'], ['location_type', 'نوع الموقع', 'Location type']]);
      res.rows = items.map(function (r) { return Object.assign({}, r, { team_code: r.team, team: r.team === 'STN' ? 'فريق المحطات' : 'فريق التذاكر' }); }).reverse();
      return res;
    }
    if (key === 'cdc') {
      res.kpis = [{ label: 'عدد البلاغات', value: 168 }, { label: 'مفتوحة', value: 4, tone: 'bad' }, { label: 'متوسط الوصول (د)', value: 19 }, { label: 'مخالفات محررة', value: 31 }];
      res.columns = cols([['id', 'رقم البلاغ', 'Case'], ['time', 'الوقت', 'Time'], ['route', 'المسار', 'Route'], ['station', 'المحطة', 'Station'], ['bus', 'الحافلة', 'Bus'], ['empName', 'المفتش', 'Inspector'], ['status', 'الحالة', 'Status'], ['outcome', 'النتيجة', 'Outcome']]);
      res.rows = R(40, function (i) { return { id: 'T-' + (1400 - i), time: day(i) + ' ' + (10 + i % 12) + ':' + (10 + i % 49), route: routes[i % 6], station: sts[i % 4], bus: 'MA' + (1200 + i * 7), empName: 'موظف تجريبي ' + (1 + i % 5), status: i < 4 ? 'في الطريق' : 'مغلق', outcome: i < 4 ? '' : ['إنزال', 'مخالفة', 'شراء تذكرة'][i % 3] }; });
    } else if (key === 'car') {
      var h = home(to, 7);
      res.vehicles = h.car.vehicles;
      res.kpis = [{ label: 'عهدات', value: 34 }, { label: 'كيلومترات', value: '1,486' }, { label: 'بلاغات أعطال مفتوحة', value: 1, tone: 'warn' }, { label: 'لم يسلّم بنفسه', value: 4 }];
      res.columns = cols([['case_id', 'الرقم', 'ID'], ['type', 'النوع', 'Type'], ['vehicle_id', 'المركبة', 'Vehicle'], ['emp_name', 'الموظف', 'Employee'], ['start_time', 'البداية', 'Start'], ['end_time', 'النهاية', 'End'], ['distance_km', 'كم', 'km'], ['status', 'الحالة', 'Status']]);
      res.rows = R(20, function (i) { return { case_id: 'VEH-HND-' + day(i).replace(/-/g, '') + '-000' + (1 + i % 5), type: 'عهدة مركبة', vehicle_id: ['6765', '6768', '6755'][i % 3], emp_name: 'موظف تجريبي ' + (1 + i % 5), start_time: day(i) + ' 08:1' + i % 10, end_time: i ? day(i) + ' 15:4' + i % 10 : '', distance_km: i ? 30 + i * 3 : '', status: i ? 'مغلقة' : 'مفتوحة' }; });
    } else if (key === 'att') {
      res.kpis = [{ label: 'نسبة الحضور', value: '94%' }, { label: 'غياب', value: 6, tone: 'bad' }, { label: 'تأخير (مرات / دقائق)', value: '11 / 164', tone: 'warn' }, { label: 'استئذان أو انسحاب', value: 3 }];
      res.columns = cols([['shift_date', 'التاريخ', 'Date'], ['shift', 'الوردية', 'Shift'], ['team', 'الفريق', 'Team'], ['emp_name', 'الموظف', 'Employee'], ['att_status', 'الحالة', 'Status'], ['late_min', 'التأخير (د)', 'Late (min)'], ['late_type', 'نوع التأخير', 'Late type'], ['exit_time', 'استئذان/انسحاب', 'Exit']]);
      res.rows = R(30, function (i) { return { shift_date: day(i), shift: String(1 + i % 2), team: i % 2 ? 'التذاكر' : 'المحطات', emp_name: 'موظف تجريبي ' + (1 + i % 5), att_status: i % 9 === 3 ? 'غائب' : i % 11 === 5 ? 'انسحاب' : i % 13 === 6 ? 'استئذان' : i % 10 === 8 ? 'إجازة' : 'حاضر', late_min: i % 7 === 2 ? 15 : '', late_type: i % 7 === 2 ? 'متأخر عن بصمة الدخول' : '', exit_time: i % 11 === 5 || i % 13 === 6 ? '13:20' : '' }; });
    } else {
      res.kpis = [{ label: 'سجلات', value: 24 }, { label: 'مفتوحة', value: 3, tone: 'warn' }, { label: 'مغلقة', value: 21 }, { label: 'ملاحظات', value: 2 }];
      res.columns = cols([['case_id', 'الرقم', 'ID'], ['shift_date', 'التاريخ', 'Date'], ['team', 'الفريق', 'Team'], ['emp_name', 'الموظف', 'Employee'], ['station', 'المحطة', 'Station'], ['route', 'المسار', 'Route'], ['status', 'الحالة', 'Status']]);
      res.rows = R(24, function (i) { return { case_id: key.toUpperCase() + '-' + day(i).replace(/-/g, '') + '-000' + (1 + i % 9), shift_date: day(i), team: i % 2 ? 'التذاكر' : 'المحطات', emp_name: 'موظف تجريبي ' + (1 + i % 5), station: sts[i % 4], route: routes[i % 6], status: i < 3 ? 'مفتوحة' : 'مغلقة' }; });
    }
    return res;
  }




  /* بيانات تجريبية لإدارة الأسطول */
  var CAR_DEMO = null;
  function carDemo(from, to) {
    var today = opDay(), F = from || today, T = to || today;
    var ms = function (d, hm) { return Date.parse(d + 'T' + hm + ':00+03:00'); };
    if (!CAR_DEMO) {
      var y = add(today, -1);
      CAR_DEMO = {
        handovers: [
          { case_id: 'VEH-HND-' + y.replace(/-/g, '') + '-0001', vehicle_id: '6768', plate: 'DSR 6768', emp_id: '10093', emp_name: 'Anwar M. Allahyani', team: 'STN', shift: 'الأولى', start_time: ms(y, '07:30'), end_time: ms(y, '15:41'), duration_min: 491, start_odometer: 223552, end_odometer: 223714, distance_km: 162, start_condition: 'سليمة', end_condition: 'سليمة', close_method: 'تسليم للمكتب', start_photo_url: 'https://example.com/a', end_photo_url: 'https://example.com/b' },
          { case_id: 'VEH-HND-' + y.replace(/-/g, '') + '-0002', vehicle_id: '6755', plate: 'DSR 6755', emp_id: '10090', emp_name: 'Sami A. Alhawsawi', team: 'ENF', shift: 'الأولى', start_time: ms(y, '07:55'), end_time: ms(y, '14:56'), duration_min: 421, start_odometer: 195533, end_odometer: 195654, distance_km: 121, start_condition: 'سليمة', end_condition: 'سليمة', close_method: 'تسليم للمكتب' },
          { case_id: 'VEH-HND-' + y.replace(/-/g, '') + '-0003', vehicle_id: '6765', plate: 'DSR 6765', emp_id: '11935', emp_name: 'Ali A. Alshahrani', team: 'ADM', shift: 'الإدارية', start_time: ms(y, '10:05'), end_time: ms(y, '11:19'), duration_min: 73, start_odometer: 198860, end_odometer: 198888, distance_km: 28, start_condition: 'سليمة', end_condition: 'يوجد ملاحظة', end_note: 'المكيف ضعيف', close_method: 'تسليم للمكتب' },
          { case_id: 'VEH-HND-' + today.replace(/-/g, '') + '-0001', vehicle_id: '6755', plate: 'DSR 6755', emp_id: '11687', emp_name: 'Turki K. Bakhashwin', team: 'ENF', shift: 'الأولى', start_time: ms(today, '07:40'), end_time: ms(today, '09:10'), duration_min: 90, start_odometer: 195654, end_odometer: 195700, distance_km: 46, start_condition: 'سليمة', end_condition: 'سليمة', close_method: 'استلام من زميل', end_emp_name: 'Muteb S. Alharbi', next_case_id: 'VEH-HND-' + today.replace(/-/g, '') + '-0002' },
          { case_id: 'VEH-HND-' + today.replace(/-/g, '') + '-0002', vehicle_id: '6755', plate: 'DSR 6755', emp_id: '12293', emp_name: 'Muteb S. Alharbi', team: 'STN', shift: 'الأولى', start_time: ms(today, '09:10'), start_odometer: 223790, start_condition: 'سليمة', prev_case_id: 'VEH-HND-' + today.replace(/-/g, '') + '-0001' }
        ],
        faults: [{ case_id: 'VEH-FLT-' + today.replace(/-/g, '') + '-0001', vehicle_id: '6765', plate: 'DSR 6765', fault_type: 'المكيف', severity: 'تعمل', description: 'التكييف لا يبرد', emp_id: '11935', emp_name: 'Ali A. Alshahrani', team: 'ADM', start_time: ms(today, '08:20'), status: 'مفتوحة' }],
        maint: [{ case_id: 'VEH-MNT-' + y.replace(/-/g, '') + '-0001', vehicle_id: '6765', plate: 'DSR 6765', maint_type: 'Engine Oil and Filter Change / تغيير زيت المحرك والفلتر', status: 'مغلقة', start_time: ms(y, '12:00'), end_time: ms(y, '16:30'), duration_min: 270, start_odometer: 188888, end_odometer: 188888, interval_km: 10000, next_due_km: 198888, start_note: 'ورشة الشركة', end_note: 'تم تغيير الزيت والفلتر', closed_by_name: 'Ali A. Alshahrani' }]
      };
    }
    var Dm = CAR_DEMO, now = Date.now(), ws = ms(F, '07:00'), we = ms(add(T, 1), '07:00');
    var hs = Dm.handovers.filter(function (r) { return r.start_time < we && (!r.end_time || r.end_time >= ws); });
    var open = function (vid) { return Dm.handovers.filter(function (r) { return r.vehicle_id === vid && !r.end_time; })[0]; };
    var lastOdo = function (vid) { var m = 0; Dm.handovers.forEach(function (r) { if (r.vehicle_id === vid) m = Math.max(m, r.end_odometer || 0, r.start_odometer || 0); }); return m; };
    var veh = [['6765', 'DSR 6765', 'NC-4002'], ['6768', 'DSR 6768', 'NC-0003'], ['6755', 'DSR 6755', 'NC-0002']].map(function (v) {
      var o = open(v[0]), lo = lastOdo(v[0]), fl = Dm.faults.filter(function (f) { return f.vehicle_id === v[0] && f.status === 'مفتوحة'; });
      var due = v[0] === '6765' ? 198888 + 10000 : v[0] === '6768' ? 231881 : 200898, rem = due - lo;
      return { vehicle_id: v[0], plate: v[1], vehicle_code: v[2], state: o ? 'out' : 'in', cond: fl.length ? 'warn' : 'ok', holder: o ? { case_id: o.case_id, emp_name: o.emp_name, team: o.team, start_time: o.start_time } : null, lastOdo: lo, faults: fl, maint: null,
        dues: [{ name: 'Engine Oil and Filter Change / تغيير زيت المحرك والفلتر', due: due, rem: rem, level: rem <= 0 ? 'over' : rem < 500 ? 'warn' : 'ok', interval: 10000 }], maintAlert: rem <= 0 ? 'over' : rem < 500 ? 'warn' : '' };
    });
    return { vehicles: veh, handovers: hs, faults: Dm.faults, maint: Dm.maint, requests: [], labels: { note: 'يوجد ملاحظة', peer: 'استلام من زميل', stop: 'متوقفة', open: 'مفتوحة' }, teams: { ENF: 'التذاكر', STN: 'المحطات', ADM: 'الإدارة' },
      ws: ws, we: we, now: now, today: today, from: F, to: T, templateReady: true, admins: [{ id: '10190', name: 'Majid N. Alhashmy', phone: '0540000000' }, { id: '11935', name: 'Ali A. Alshahrani', phone: '0547000000' }],
      maintTypes: [{ code: 'PM', name: 'Preventive Maintenance / الصيانة الوقائية' }, { code: 'OIL', name: 'Engine Oil and Filter Change / تغيير زيت المحرك والفلتر' }, { code: 'BRK_INS', name: 'Brake System Inspection / فحص نظام الفرامل' }, { code: 'AC', name: 'Air Conditioning Service / صيانة نظام تكييف الهواء' }], warnKm: 500 };
  }
  function carDemoAct(p) {
    var Dm = CAR_DEMO, now = Date.now();
    if (p.kind === 'cancel') {
      var i = Dm.handovers.findIndex(function (r) { return r.case_id === p.id; }), r = Dm.handovers[i], restored = '', to = '';
      if (r.prev_case_id) { var pr = Dm.handovers.filter(function (x) { return x.case_id === r.prev_case_id; })[0]; if (pr) { ['end_time', 'end_odometer', 'distance_km', 'close_method', 'end_emp_name', 'next_case_id', 'duration_min', 'end_condition'].forEach(function (k) { delete pr[k]; }); restored = pr.case_id; to = pr.emp_name; } }
      Dm.handovers.splice(i, 1);
      return { id: p.id, restored: restored, restored_to: to };
    }
    if (p.kind === 'fault') { Dm.faults.forEach(function (f) { if (f.case_id === p.id) { f.status = 'مغلقة'; f.end_time = now; f.duration_min = Math.round((now - f.start_time) / 60000); f.resolution_note = p.note; f.resolved_by_name = USER.name; } }); return {}; }
    if (p.kind === 'close') { Dm.handovers.forEach(function (r) { if (r.case_id === p.id) { r.end_time = now; r.end_odometer = +p.odo || r.start_odometer; r.distance_km = r.end_odometer - r.start_odometer; r.close_method = 'إغلاق إداري'; r.duration_min = Math.round((now - r.start_time) / 60000); } }); return {}; }
    return { id: 'VEH-REQ-DEMO', pdf: null, xlsx: null };
  }

  /* بيانات تجريبية لمحرر الروستر */
  var ROS_DEMO = null;
  function rosDemoInit() {
    if (ROS_DEMO) return ROS_DEMO;
    var shifts = [['1', 'الوردية الأولى', '07:00', '16:00', 'WORK', '#EDE3F3'], ['2', 'الوردية الثانية', '15:00', '00:00', 'WORK', '#D9C6E8'], ['3', 'الوردية الثالثة', '23:00', '08:00', 'WORK', '#C3A5DB'],
      ['4', 'دوام مكتبي', '09:00', '18:00', 'WORK', '#E9DDF0'], ['5', 'دوام مكتبي (2)', '10:00', '19:00', 'WORK', '#E9DDF0'], ['T', 'تدريب', '08:00', '17:00', 'OTHER', '#FDE7C8'],
      ['X', 'أوف', '', '', 'OFF', '#E5E7EB'], ['AL', 'إجازة سنوية', '', '', 'LEAVE', '#F6D7B0'], ['SL', 'إجازة مرضية', '', '', 'LEAVE', '#F4C7C3']].map(function (x) { return { code: x[0], name: x[1], start: x[2], end: x[3], kind: x[4], color: x[5] }; });
    var emps = [['10190', 'Majid N. Alhashmy', 'ماجد الهاشمي', 'ADM', 'Senior Enforcement Supervisor', 'Operation Management', '4', 7, 5], ['12166', 'Fahad A. AlMalki', 'فهد المالكي', 'ADM', 'Operation Adminstrator', 'Operation Adminstrator', '4', 7, 5],
      ['10090', 'Sami A. Alhawsawi', 'سامي الهوساوي', 'ENF', 'Enforcement Officer', 'Team D1 Responsible', '1', 8, 6], ['10675', 'Emad A. Barnawi', 'عماد برناوي', 'ENF', 'Enforcement Officer', 'Backup Team D1 Responsible', '1', 8, 6],
      ['10171', 'Sulaiman A. Alhazmi', 'سليمان الحازمي', 'ENF', 'Enforcement Officer', 'Team D2 Responsible', '2', 8, 6], ['10093', 'Anwar M. Allahyani', 'أنور اللحياني', 'STN', 'Driver Team Leader', 'Team A Responsible', '1', 8, 6],
      ['10546', 'Saqer A. Almajnuni', 'صقر المجنوني', 'STN', 'Driver Team Leader', 'Team B Responsible', '2', 8, 6], ['10131', 'Mukhlid M. Alotaibi', 'مخلد العتيبي', 'STN', 'Driver Team Leader', 'Team C Responsible', '3', 8, 6],
      ['12400', 'Abdulaziz M. Alzahrani', 'عبدالعزيز الزهراني', 'STN', 'Bus Operation Attendant', 'Station Team', '1', 8, 6]];
    var codes = {}, start = '2026-10-01';
    emps.forEach(function (e, k) {
      var c = codes[e[0]] = {};
      for (var i = 0; i < 61; i++) {
        var d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
        c[d] = ((i + k * 3) % e[7]) < e[8] ? e[6] : 'X';
      }
      if (k === 3) ['2026-11-20', '2026-11-21', '2026-11-22'].forEach(function (d) { c[d] = 'AL'; });
    });
    ROS_DEMO = { shifts: shifts, emps: emps.map(function (e) { var lead = /Responsible/.test(e[5]) ? (/Backup|Standby/.test(e[5]) ? 'STANDBY' : 'TL') : ''; return { id: e[0], en: e[1], ar: e[2], team: e[3], position: e[4], task: e[5], role: e[3] === 'ADM' ? 'Admin' : lead ? 'Supervisor' : 'Officer', lead: lead, lshift: lead ? e[6] : '', def: e[6], active: true }; }), names: emps, codes: codes, backup: null };
    ROS_DEMO.emps.push({ id: '12999', en: 'New K. Employee', ar: 'موظف جديد', team: 'STN', position: 'Bus Operation Attendant', task: 'Station Team', def: '2', active: true });
    return ROS_DEMO;
  }
  function rosDemoGet(p) {
    var D = rosDemoInit(), dates = Object.keys(D.codes['10190']).sort();
    return { from: p.from, to: p.to, dates: dates.filter(function (d) { return d >= p.from && d <= p.to; }), rows: D.names.filter(function (e) { return D.codes[e[0]]; }).map(function (e) { var c = {}; Object.keys(D.codes[e[0]]).forEach(function (d) { if (d >= p.from && d <= p.to && D.codes[e[0]][d]) c[d] = D.codes[e[0]][d]; }); return { id: e[0], name: e[1], team: e[3], codes: c }; })
      .concat(Object.keys(D.codes).filter(function (id) { return !D.names.some(function (e) { return e[0] === id; }); }).map(function (id) { var c = {}; Object.keys(D.codes[id]).forEach(function (d) { if (d >= p.from && d <= p.to && D.codes[id][d]) c[d] = D.codes[id][d]; }); return { id: id, name: (D.extra && D.extra[id] || {}).name || id, team: (D.extra && D.extra[id] || {}).team || '', codes: c }; })),
      emps: D.emps, shifts: D.shifts, hr: { '1': 59, '2': 58, '3': 30, '4': 26, '5': 27, 'T': 22 }, canEdit: true, hasBackup: !!D.backup, range: [dates[0], dates[dates.length - 1]] };
  }
  function rosDemoSave(p) {
    var D = rosDemoInit(), n = 0; D.backup = JSON.stringify(D.codes); D.extra = D.extra || {};
    (p.emps || []).forEach(function (e) { D.extra[e[0]] = { name: e[1], team: e[2] }; });
    (p.cells || []).forEach(function (c) { var m = D.codes[c[0]] = D.codes[c[0]] || {}; if ((m[c[1]] || '') !== c[2]) { m[c[1]] = c[2]; n++; } });
    return { changed: n };
  }

  /* بيانات تجريبية للوحة الروستر داخل البوابة */
  function rstDemo(month, date) {
    var D = date || opDay(), M = month || D.slice(0, 7);
    var y = +M.slice(0, 4), m = +M.slice(5, 7), n = new Date(Date.UTC(y, m, 0)).getUTCDate(), days = [];
    for (var i = 1; i <= n; i++) days.push(M + '-' + (i < 10 ? '0' : '') + i);
    var emps = [
      { id: '10190', ar: 'ماجد', en: 'Majed', team: 'ADM', role: 'مشرف عمليات أول', lead: '', reg: true, task: 'الإدارة' },
      { id: '10090', ar: 'سامي الهوساوي', en: 'Sami Alhawsawi', team: 'ENF', role: 'مشرف', lead: 'قائد وردية', reg: true, task: 'فحص' },
      { id: '10101', ar: 'خالد العتيبي', en: 'Khalid Alotaibi', team: 'ENF', role: 'مفتش', lead: '', reg: true, task: 'فحص' },
      { id: '10102', ar: 'فهد الحربي', en: 'Fahad Alharbi', team: 'ENF', role: 'مفتش', lead: '', reg: false, task: 'فحص' },
      { id: '10201', ar: 'عبدالله الزهراني', en: 'Abdullah Alzahrani', team: 'STN', role: 'مشرف محطات', lead: 'قائد وردية', reg: true, task: 'محطات' },
      { id: '10202', ar: 'تركي الشهري', en: 'Turki Alshehri', team: 'STN', role: 'موظف محطة', lead: '', reg: true, task: 'محطات' },
      { id: '10203', ar: 'نواف القرشي', en: 'Nawaf Alqurashi', team: 'STN', role: 'موظف محطة', lead: '', reg: true, task: 'محطات' }
    ];
    var shifts = { A: { name_ar: 'صباحي', color: '#E9DDF0' }, B: { name_ar: 'مسائي', color: '#FBE3D3' }, C: { name_ar: 'ليلي', color: '#D7EDE3' }, O: { name_ar: 'أوف', color: '#F1F2F4' }, AL: { name_ar: 'إجازة سنوية', color: '#F6D7B0' } };
    var pat = ['A', 'A', 'B', 'B', 'C', 'O', 'O'];
    var grid = emps.map(function (e, k) {
      return { id: e.id, cells: days.map(function (d, i) {
        var c = { c: pat[(i + k) % 7] };
        if (d < D && c.c !== 'O') c.a = (i + k) % 11 === 0 ? 'غائب' : 'حاضر';
        if (c.a === 'حاضر' && (i + k) % 9 === 0) c.late = 12;
        if (e.id === '10102' && i >= 20 && i <= 24) { c.lv = 'AL'; c.lvf = i > 22; }
        return c;
      }) };
    });
    var LV = { PENDING_SUP: 'بانتظار المشرف', SUP_APPROVED: 'موافقة المشرف – بانتظار Mena-Me', SUP_REJECTED: 'مرفوض من المشرف', FINAL: 'معتمد نهائياً (Mena-Me)', ADMIN_REJECTED: 'مرفوض إدارياً', CANCELLED: 'ملغى من الموظف', PENDING_ADMIN: 'بانتظار الإدارة' };
    var REQ = { NEW: 'جديد', WIP: 'قيد التنفيذ', DONE: 'منفذ', REJECTED: 'مرفوض', CANCELLED: 'ملغى من الموظف' };
    var lv = function (id, eid, nm, tm, type, f, t, days, st, extra) { return Object.assign({ case_id: id, emp_id: eid, emp_name: nm, team: tm, leave_type: type, from_date: f, to_date: t, days: days, request_status: st, created_at: D + ' 08:15', approver_name: 'سامي الهوساوي', approver_level: 'مشرف', escalated: '', emp_note: '', sup_note: '', admin_note: '', admin_by: '', admin_at: '', attachment_url: '' }, extra || {}); };
    var leaves = [
      lv('RST-LV-' + D.replace(/-/g, '') + '-0003', '10202', 'تركي الشهري', 'STN', 'إجازة اضطرارية', D, D, 1, LV.PENDING_SUP, { emp_note: 'ظرف عائلي' }),
      lv('RST-LV-' + D.replace(/-/g, '') + '-0002', '10102', 'فهد الحربي', 'ENF', 'إجازة سنوية', days[20], days[24], 5, LV.SUP_APPROVED, { sup_note: 'موافق، البديل خالد' }),
      lv('RST-LV-' + D.replace(/-/g, '') + '-0001', '10203', 'نواف القرشي', 'STN', 'إجازة مرضية', D, days[Math.min(n - 1, +D.slice(8) + 1)], 2, LV.PENDING_ADMIN, { attachment_url: 'https://example.com/report.pdf', escalated: 'Y' }),
      lv('RST-LV-20261101-0004', '10101', 'خالد العتيبي', 'ENF', 'إجازة سنوية', days[2], days[4], 3, LV.FINAL, { admin_by: 'ماجد', admin_at: M + '-01 10:20' })
    ];
    var reqs = [
      { case_id: 'RST-REQ-' + D.replace(/-/g, '') + '-0002', emp_id: '10101', emp_name: 'خالد العتيبي', team: 'ENF', req_type: 'تعريف بالراتب', details: 'مطلوب للبنك\nباللغة العربية', request_status: REQ.NEW, created_at: D + ' 09:02', attachment_url: '', admin_note: '', admin_by: '', admin_at: '' },
      { case_id: 'RST-REQ-' + D.replace(/-/g, '') + '-0001', emp_id: '10201', emp_name: 'عبدالله الزهراني', team: 'STN', req_type: 'تعديل بيانات', details: 'تحديث رقم الجوال', request_status: REQ.WIP, created_at: D + ' 07:40', attachment_url: '', admin_note: 'جاري التنفيذ مع HR', admin_by: 'ماجد', admin_at: D + ' 08:00' }
    ];
    var att = function (code, sup, items) { var c = { present: 0, late: 0, absent: 0, leave: 0, off: 0, permission: 0, withdrawal: 0 }; items.forEach(function (x) { if (x.att_status === 'حاضر') c.present++; if (x.att_status === 'غائب') c.absent++; if (x.att_status === 'إجازة') c.leave++; if (x.att_status === 'أوف') c.off++; if (+x.late_min > 0) c.late++; }); return Object.assign({ case_id: 'RST-ATT-' + D.replace(/-/g, '') + '-' + code, supervisor_name: sup }, c); };
    var it = function (id, nm, s, late, note) { return { emp_id: id, emp_name: nm, att_status: s, late_min: late || 0, note: note || '' }; };
    var stnItems = [it('10201', 'عبدالله الزهراني', 'حاضر'), it('10202', 'تركي الشهري', 'حاضر', 15, 'تأخير 15 د'), it('10203', 'نواف القرشي', 'إجازة', 0, 'إجازة مرضية')];
    var day = {
      STN: [{ code: 'A', hours: '07:00-15:00', dist: { case_id: 'RST-DST-' + D.replace(/-/g, '') + '-0001', version: 2 }, distItems: [{ emp_id: '10201', emp_name: 'عبدالله الزهراني', report_label: 'الزاهر (103)', break_start: '11:00', break_end: '11:30' }, { emp_id: '10202', emp_name: 'تركي الشهري', report_label: 'المروة', break_start: '11:30', break_end: '12:00' }], att: att('A', 'عبدالله الزهراني', stnItems), attItems: stnItems, scheduled: ['10201', '10202'], leave: [], off: [] },
            { code: 'B', hours: '15:00-23:00', dist: null, distItems: [], att: null, attItems: [], scheduled: ['10203'], leave: [], off: ['10202'] }],
      ENF: [{ code: 'A', hours: '07:00-15:00', dist: { case_id: 'RST-DSE-' + D.replace(/-/g, '') + '-0001', version: 1 }, distItems: [{ emp_id: '10101', emp_name: 'خالد العتيبي', report_label: 'فحص ميداني – مسار 10' }], att: null, attItems: [], scheduled: ['10090', '10101'], leave: [{ id: '10102', label: 'إجازة سنوية' }], off: [] }],
      ADM: []
    };
    var kpi = {}; emps.forEach(function (e, k) { kpi[e.id] = { work: 20 - k, present: 18 - k, absent: k % 3, late: k % 4, lateMin: (k % 4) * 9, permission: k % 2, withdrawal: 0, leaveDays: k === 3 ? 5 : 0, notes: k % 3, pending: k === 6 ? 1 : 0 }; });
    return { emps: emps, grid: grid, shifts: shifts, days: days, day: day, leaves: leaves, reqs: reqs, LV: LV, REQ: REQ, admins: ['ماجد'], kpi: kpi, rosterRange: [days[0], days[n - 1]], today: opDay(), now: opDay() + ' ' + new Date().toTimeString().slice(0, 5), month: M, date: D };
  }

  /* الفحص والمخالفات (v2.1): ثلاث مجموعات + التغطية + مؤشرات الموظفين بنفس شكل insKpi_ في الـ Hub */
  function insDemo(from, to) {
    var T = opDay(); to = to || T; from = from || to;
    var seed = 7; var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var pickA = function (a) { return a[Math.floor(rnd() * a.length)]; };
    var ENF = [['10090', 'سامي الهوساوي'], ['10675', 'عماد برناوي'], ['10171', 'سليمان الحازمي'], ['12272', 'سعدي المالكي'], ['10101', 'خالد العتيبي'], ['10102', 'فيصل الغامدي']];
    var STN = [['10093', 'أنور اللحياني'], ['12162', 'بديع ساعاتي'], ['10546', 'صقر المجنوني'], ['12293', 'متعب الحربي'], ['10131', 'مخلد العتيبي'], ['10201', 'عبدالله الزهراني']];
    var stations = ['المروة', 'قطار الحرمين', 'جبل الكعبة', 'التنعيم', 'الأحوال المدنية (100)'], routes = ['1', '2', '3', '4', '5', '6', '7A', '7B', '8', '9', '10', '11', '12'];
    var VT = [['3', 'عدم حمل تذكرة سارية', 100], ['7', 'التدخين داخل الحافلة', 200], ['11', 'الإضرار بممتلكات الحافلة', 500], ['5', 'إعاقة الأبواب', 100], ['9', 'تناول الطعام داخل الحافلة', 100]];
    var items = [['chk_clean', 'النظافة'], ['chk_reader', 'قارئ التذاكر'], ['chk_screens', 'الشاشات'], ['chk_uniform', 'زي السائق'], ['chk_cameras', 'الكاميرات']];
    var bus = function () { return (rnd() < .5 ? 'MA' : 'MS') + (1000 + Math.floor(rnd() * 80)); };
    var tm = function (d, sh) { var h = sh === '1' ? 7 + Math.floor(rnd() * 9) : sh === '2' ? 15 + Math.floor(rnd() * 9) : 23 + Math.floor(rnd() * 8); var dd = h >= 24 ? add(d, 1) : d; return dd + ' ' + ('0' + (h % 24)).slice(-2) + ':' + ('0' + Math.floor(rnd() * 60)).slice(-2); };
    var plus = function (ts, m) { var x = new Date(ts.replace(' ', 'T') + ':00Z'); x = new Date(x.getTime() + m * 60000); return x.toISOString().slice(0, 16).replace('T', ' '); };
    var rdy = [], ins = [], vio = [], cov = [], n = { r: 0, i: 0, v: 0, c: 0 };
    var id = function (p, d, k) { return p + '-' + d.replace(/-/g, '') + '-' + ('000' + k).slice(-4); };
    for (var d = from; d <= to; d = add(d, 1)) {
      var k = 0, perDay = d === T ? 0.55 : 1;
      for (var a = 0; a < Math.round(26 * perDay); a++) {
        var sh = pickA(['1', '2', '3']), e = pickA(STN), st0 = tm(d, sh), r = { case_id: id('STN-RDY', d, ++k), status: 'مغلقة', shift_date: d, shift: sh, team: 'STN', emp_id: e[0], emp_name: e[1], start_time: st0, end_time: plus(st0, 4 + Math.floor(rnd() * 6)), duration_min: 5, location_type: 'محطة', station: pickA(stations), bus_no: bus(), route: pickA(routes), map_link: '', parent_case_id: '', entry_method: rnd() < .1 ? 'نموذج ورقي' : 'البوت', notes: '', photo_url: 'https://drive.google.com/' };
        var failed = []; items.forEach(function (it, j) { var bad = rnd() < [.12, .09, .05, .04, .03][j]; r[it[0]] = bad ? 'غير مطابق' : 'مطابق'; if (bad) failed.push(it[1]); });
        r.failed_count = failed.length; r.failed_items = failed.join('، '); if (failed.length) r.notes = pickA(['تم إبلاغ السائق', 'تم الرفع للصيانة', '']); rdy.push(r);
      }
      k = 0;
      for (var b = 0; b < Math.round(22 * perDay); b++) {
        var sh2 = pickA(['1', '2']), e2 = pickA(ENF), st2 = tm(d, sh2), valid = 15 + Math.floor(rnd() * 40), noT = rnd() < .45 ? Math.floor(rnd() * 5) : 0, cdc = rnd() < .25, dur = 6 + Math.floor(rnd() * 14);
        var r2 = { case_id: id('ENF-INS', d, ++k), status: 'مغلقة', shift_date: d, shift: sh2, team: 'ENF', emp_id: e2[0], emp_name: e2[1], start_time: st2, end_time: plus(st2, dur), duration_min: dur, location_type: 'حافلة', station: '', bus_no: bus(), route: pickA(routes), map_link: 'https://maps.google.com/', parent_case_id: '', entry_method: rnd() < .15 ? 'نموذج ورقي' : 'البوت', notes: '',
          source: cdc ? 'بلاغ عمليات' : pickA(['فحص ميداني', 'تمركز محطة']), cdc_ref: cdc ? 'T-' + (1200 + Math.floor(rnd() * 300)) : '', driver_id: String(40000 + Math.floor(rnd() * 900)), valid_tickets: valid, no_tickets: noT, total_pax: valid + noT, violations_count: 0, form_photo_url: '', from_cdc: cdc };
        ins.push(r2);
        if (noT && rnd() < .5) {
          var vt = pickA(VT), vt0 = plus(st2, 3), pol = rnd() < .15;
          r2.violations_count = 1;
          vio.push({ case_id: id('ENF-VIO', d, ++n.v), status: 'مغلقة', shift_date: d, shift: sh2, team: 'ENF', emp_id: e2[0], emp_name: e2[1], start_time: vt0, end_time: '', duration_min: 0, location_type: 'حافلة', station: '', bus_no: r2.bus_no, route: r2.route, map_link: '', parent_case_id: r2.case_id, entry_method: 'البوت', notes: '',
            violation_code: vt[0], violation_type: vt[1], fine_amount: vt[2], violation_no: String(880000 + Math.floor(rnd() * 9999)), source: r2.source, cdc_ref: r2.cdc_ref, police: pol, police_call_time: pol ? plus(vt0, 2) : '', police_arrival_time: pol ? plus(vt0, 14 + Math.floor(rnd() * 20)) : '', photo_url: 'https://drive.google.com/', at_station: false });
        }
      }
      for (var c = 0; c < Math.round(4 * perDay); c++) {
        var e3 = pickA(ENF), sh3 = pickA(['1', '2']), vt3 = pickA(VT), t3 = tm(d, sh3);
        vio.push({ case_id: id('ENF-VIO', d, ++n.v), status: 'مغلقة', shift_date: d, shift: sh3, team: 'ENF', emp_id: e3[0], emp_name: e3[1], start_time: t3, end_time: '', duration_min: 0, location_type: 'محطة', station: pickA(stations), bus_no: '', route: '', map_link: '', parent_case_id: '', entry_method: 'البوت', notes: '',
          violation_code: vt3[0], violation_type: vt3[1], fine_amount: vt3[2], violation_no: String(880000 + Math.floor(rnd() * 9999)), source: 'تمركز محطة', cdc_ref: '', police: false, police_call_time: '', police_arrival_time: '', photo_url: '', at_station: true });
      }
      for (var q = 0; q < Math.round(2 * perDay); q++) {
        var e4 = pickA(ENF), t4 = tm(d, '1'), m4 = 60 + Math.floor(rnd() * 180);
        cov.push({ case_id: id('ENF-COV', d, ++n.c), status: 'مغلقة', shift_date: d, shift: '1', team: 'ENF', emp_id: e4[0], emp_name: e4[1], start_time: t4, end_time: plus(t4, m4), duration_min: m4, location_type: 'محطة', station: pickA(stations), bus_no: '', route: '', map_link: '', parent_case_id: '', entry_method: 'البوت', notes: '', reason: pickA(['نقص في فريق المحطات', 'دعم وقت الذروة']) });
      }
    }
    var srt = function (a, b) { return String(b.start_time).localeCompare(String(a.start_time)); };
    [rdy, ins, vio, cov].forEach(function (l) { l.sort(srt); });
    var m = {};
    var g = function (r) { return m[r.emp_id] || (m[r.emp_id] = { id: r.emp_id, name: r.emp_name, team: r.team, _d: {}, stn: { n: 0, ok: 0, failed: 0, okRate: null, buses: 0, _b: {} }, enf: { n: 0, pax: 0, noT: 0, rate: null, dur: 0, avgDur: null, cdc: 0 }, vio: { n: 0, fines: 0, police: 0, bus: 0, station: 0 }, cov: { n: 0, min: 0 } }); };
    rdy.forEach(function (r) { var p = g(r); p._d[r.shift_date] = 1; p.stn.n++; if (r.failed_count) p.stn.failed++; else p.stn.ok++; p.stn._b[r.bus_no] = 1; });
    ins.forEach(function (r) { var p = g(r); p._d[r.shift_date] = 1; p.enf.n++; p.enf.pax += r.total_pax; p.enf.noT += r.no_tickets; p.enf.dur += r.duration_min; if (r.from_cdc) p.enf.cdc++; });
    vio.forEach(function (r) { var p = g(r); p._d[r.shift_date] = 1; p.vio.n++; p.vio.fines += r.fine_amount; if (r.police) p.vio.police++; if (r.at_station) p.vio.station++; else p.vio.bus++; });
    cov.forEach(function (r) { var p = g(r); p._d[r.shift_date] = 1; p.cov.n++; p.cov.min += r.duration_min; });
    var kpi = Object.keys(m).map(function (x) { var p = m[x]; p.days = Object.keys(p._d).length; delete p._d; p.stn.buses = Object.keys(p.stn._b).length; delete p.stn._b;
      p.stn.okRate = p.stn.n ? Math.round(p.stn.ok / p.stn.n * 100) : null; p.enf.rate = p.enf.pax ? Math.round(p.enf.noT / p.enf.pax * 1000) / 10 : null; p.enf.avgDur = p.enf.n ? Math.round(p.enf.dur / p.enf.n) : null;
      p.total = p.stn.n + p.enf.n + p.vio.n; p.perDay = p.days ? Math.round(p.total / p.days * 10) / 10 : 0; return p; }).sort(function (a, b) { return b.total - a.total; });
    return { from: from, to: to, today: T, generated: T + ' ' + new Date().toTimeString().slice(0, 5), rdy: rdy, ins: ins, vio: vio, cov: cov, items: items, kpi: kpi, emps: [], shifts: [], dict: {}, systems: [] };
  }

  /* بلاغات العمليات (v2.2): لوحة الـ Hub (cdcDash) + محاكاة واجهة CDC (board/step/close…) بنفس شكل الردود */
  var CDCX = (function () {
    var seed = 11, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }, pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    var INSP = [['sami', 'سامي الهوساوي', '10090'], ['emad', 'عماد برناوي', '10675'], ['sulaiman', 'سليمان الحازمي', '10171'], ['saadi', 'سعدي المالكي', '12272'], ['khaled', 'خالد العتيبي', '10101'], ['faisal', 'فيصل الغامدي', '10102']];
    var ST = ['المروة', 'قطار الحرمين', 'جبل الكعبة', 'التنعيم', 'الأحوال المدنية (100)', 'شارع الحج (130)', 'العزيزية'], RT = ['1', '2', '3', '4', '5', '6', '7A', '7B', '8', '9', '10', '11', '12'];
    var OPS = ['أحمد (CDC)', 'ناصر', 'محمد'], outs = ['offload', 'fine', 'valid', 'bought', 'left', 'false'];
    var cases = [], nid = 1, no = 1500, now = Date.now();
    var mk = function (minsAgo, status) {
      var t0 = now - minsAgo * 60000, ins = pick(INSP), c = { id: nid++, caseNo: 'T-' + (no++), status: 'new', bus: (rnd() < .5 ? 'MA' : 'MS') + (1000 + Math.floor(rnd() * 80)), route: pick(RT), dest: pick(ST), type: 'ركاب بدون تذاكر',
        driverId: String(11000 + Math.floor(rnd() * 900)), driverName: pick(['Amir Khan', 'Saleem Ali', 'Rashid Noor']), driverPhone: '5' + Math.floor(10000000 + rnd() * 89999999), opsName: pick(OPS), opsUser: 'ops1',
        source: rnd() < .55 ? 'CDC app' : 'web', stationUrl: 'https://maps.google.com/', stationName: '', times: { requested: t0 }, outcomes: [], inspector: null, photos: [], transfers: [], passengers: 1 };
      c.stationName = c.dest;
      var flow = ['accepted', 'contacted', 'enroute', 'arrived', 'closed'], stop = flow.indexOf(status), t = t0;
      if (status === 'closed') stop = 4;
      for (var i = 0; i <= stop && stop >= 0; i++) { t += (2 + Math.floor(rnd() * (i === 2 ? 15 : 6))) * 60000; c.times[flow[i]] = Math.min(t, now - 30000); if (i === 0) c.inspector = { username: ins[0], name: ins[1], id: ins[2] }; }
      c.status = stop >= 0 ? flow[stop] : 'new';
      if (c.status === 'closed') { c.outcomes = [pick(outs)]; if (c.outcomes[0] === 'fine') c.violationNo = String(880000 + Math.floor(rnd() * 9999)); c.notes = 'تم التعامل مع الحالة'; if (rnd() < .2) { c.remote = true; delete c.times.enroute; delete c.times.arrived; } }
      cases.push(c); return c;
    };
    mk(3, 'new'); mk(1, 'new'); mk(14, 'accepted'); mk(22, 'contacted'); mk(31, 'enroute'); var a = mk(40, 'arrived'); a.status = 'patrol_called'; a.times.patrol_called = now - 6 * 60000;
    for (var k = 0; k < 9; k++) mk(60 + k * 45, 'closed');
    var me = { username: 'majed', name: 'ماجد', role: 'admin' };
    var users = [{ username: 'majed', name: 'ماجد', employeeId: '10190', role: 'admin', active: true, telegram: '@majed', lastLogin: now - 3600e3 },
      { username: 'ops1', name: 'أحمد', employeeId: '20001', role: 'ops', active: true, lastLogin: now - 7200e3 }, { username: 'newguy', name: 'موظف جديد', employeeId: '', role: 'pending', active: false }]
      .concat(INSP.map(function (x) { return { username: x[0], name: x[1], employeeId: x[2], role: 'insp', active: true, telegram: '@' + x[0], lastLogin: now - rnd() * 86400e3 }; }));
    var get = function (id) { return cases.filter(function (c) { return String(c.id) === String(id); })[0]; };
    var ok = function (d) { return Promise.resolve(JSON.parse(JSON.stringify(d))); };
    var bad = function (m) { return Promise.reject(new Error(m)); };
    return function (b) {
      var c = b.id !== undefined ? get(b.id) : null, t = Date.now();
      switch (b.action) {
        case 'board': return ok({ cases: cases, tg: false });
        case 'day': return ok({ date: b.date, cases: cases.filter(function (x) { var d = new Date(x.times.requested); return d.toISOString().slice(0, 10) === b.date || true; }) });
        case 'getCase': return c ? ok(c) : bad('not found');
        case 'photo': return ok({ data: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#E9DDF0"/><text x="160" y="105" font-size="22" text-anchor="middle" fill="#7B1E8F">🚌 bus photo</text></svg>') });
        case 'step':
          if (b.step === 'accepted') c.inspector = { username: me.username, name: me.name, id: '10190' };
          c.status = b.step; c.times[b.step] = t; return ok(c);
        case 'arrive': c.status = 'arrived'; c.times.arrived = t; (b.photos || []).forEach(function (p, i) { c.photos.push({ id: 'p' + c.id + i, name: 'arrival_' + (i + 1) + '.jpg' }); }); return ok(c);
        case 'close': c.status = 'closed'; c.times.closed = t; c.outcomes = b.outcomes; c.remote = !!b.remote; c.violationNo = b.violationNo; c.passengers = b.passengers; c.notes = b.notes; return ok(c);
        case 'closeUnattended': c.status = 'closed'; c.times.closed = t; c.outcomes = ['not_taken']; c.inspector = { username: me.username, name: me.name }; return ok(c);
        case 'closeUnreachable': c.status = 'closed'; c.times.closed = t; c.outcomes = ['unreachable']; return ok(c);
        case 'cancel': c.status = 'cancelled'; c.cancelReason = b.reason; c.times.closed = t; return ok(c);
        case 'policeNo': c.policeNo = (String(b.text).match(/\(([^)]+)\)/) || [0, b.text])[1]; return ok(c);
        case 'inspectors': return ok(INSP.map(function (x) { return { username: x[0], name: x[1], employeeId: x[2] }; }));
        case 'transfer':
          if (b.direct) { var x = INSP.filter(function (i) { return i[0] === b.to; })[0]; c.inspector = { username: x[0], name: x[1], id: x[2] }; c.transfers.push('تعيين مباشر إلى ' + x[1]); }
          else c.transferPending = { to: b.to, toName: b.to ? (INSP.filter(function (i) { return i[0] === b.to; })[0] || [])[1] : '', fromName: me.name };
          return ok(c);
        case 'transferAccept': c.inspector = { username: me.username, name: me.name }; delete c.transferPending; return ok(c);
        case 'transferDecline': case 'transferCancel': delete c.transferPending; return ok(c);
        case 'create': var n = mk(0, 'new'); Object.keys(b['case']).forEach(function (k) { if (b['case'][k]) n[k] = b['case'][k]; }); n.source = 'web'; return ok(n);
        case 'users': return ok(users);
        case 'saveUser': var u = users.filter(function (x) { return x.username === b.user.username; })[0]; if (!u) { u = { username: b.user.username }; users.push(u); }
          u.name = b.user.name; u.employeeId = b.user.employee_id; u.role = b.user.role; u.active = b.user.active; return ok(users);
        case 'tgLink': return ok({ url: 'https://t.me/CDC_tickets_bot?start=link_demo', hours: 6 });
      }
      return bad('unknown action');
    };
  })();
  function cdcDashDemo(from, to) {
    var T = opDay(); to = to || T; from = from || to;
    var seed = 5, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }, pick = function (a) { return a[Math.floor(rnd() * a.length)]; };
    var INSP = [['10090', 'سامي الهوساوي'], ['10675', 'عماد برناوي'], ['10171', 'سليمان الحازمي'], ['12272', 'سعدي المالكي'], ['10101', 'خالد العتيبي'], ['10102', 'فيصل الغامدي']];
    var ST = ['المروة', 'قطار الحرمين', 'جبل الكعبة', 'التنعيم', 'الأحوال المدنية (100)', 'شارع الحج (130)', 'العزيزية'], RT = ['1', '2', '3', '4', '5', '6', '7A', '7B', '8', '9', '10', '11', '12'];
    var OW = [['offload', 30], ['fine', 18], ['valid', 14], ['bought', 12], ['left', 12], ['false', 5], ['unreachable', 4], ['not_taken', 3], ['left_patrol', 1], ['nocoop', 1]];
    var wpick = function () { var s = 0, r = rnd() * 100; for (var i = 0; i < OW.length; i++) { s += OW[i][1]; if (r < s) return OW[i][0]; } return 'offload'; };
    var pad = function (n) { return ('0' + n).slice(-2); }, plus = function (ts, m) { var x = new Date(ts.replace(' ', 'T') + ':00Z'); return new Date(x.getTime() + m * 60000).toISOString().slice(0, 16).replace('T', ' '); };
    var rows = [], n = 1200;
    for (var d = from; d <= to; d = add(d, 1)) {
      var cnt = d === T ? 9 : 14 + Math.floor(rnd() * 8);
      for (var i = 0; i < cnt; i++) {
        var h = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0][Math.floor(Math.pow(rnd(), 0.8) * 18)], ins = pick(INSP), time = (h < 7 ? add(d, 1) : d) + ' ' + pad(h) + ':' + pad(Math.floor(rnd() * 60));
        var key = wpick(), take = key === 'not_taken' ? null : 2 + Math.floor(rnd() * rnd() * 22), remote = ['valid', 'left', 'false', 'bought'].indexOf(key) >= 0 && rnd() < .4, arr = remote || take === null ? null : take + 6 + Math.floor(rnd() * 28);
        var open = d === T && i >= cnt - 3, canc = rnd() < .03, pc = key === 'left_patrol' || key === 'nocoop' || (key === 'fine' && rnd() < .2);
        var close = take === null ? 25 : (arr || take) + 4 + Math.floor(rnd() * 15);
        rows.push({ no: 'T-' + (n++), date: d, time: time, shift: h >= 15 ? '2' : h >= 7 ? '1' : '0', status: canc ? 'cancelled' : open ? pick(['new', 'accepted', 'enroute']) : 'closed', statusAr: '',
          keys: open || canc ? [] : [key], route: pick(RT), station: pick(ST), bus: (rnd() < .5 ? 'MA' : 'MS') + (1000 + Math.floor(rnd() * 60)), dest: '',
          emp: take === null ? '' : ins[0], empName: take === null ? '' : ins[1], taken: take === null ? '' : plus(time, take), contacted: '', enroute: '', arrived: arr === null ? '' : plus(time, arr),
          pCalled: pc ? plus(time, (arr || 10) + 2) : '', pArrived: pc && key !== 'left_patrol' ? plus(time, (arr || 10) + 14 + Math.floor(rnd() * 15)) : '', closed: open ? '' : plus(time, close),
          fine: key === 'fine' && !open ? String(880000 + Math.floor(rnd() * 9999)) : '', police: '', remote: remote, pax: 1 + (rnd() < .2 ? 1 : 0), ops: pick(['أحمد', 'ناصر', 'محمد']), driver: '', source: '', src: rnd() < .55 ? 'app' : rnd() < .6 ? 'tg' : 'web',
          notes: '', cancelReason: canc ? 'بلاغ مكرر' : '', transferred: rnd() < .05, cancelled: canc, mTake: open && take > 15 ? null : take, mArrive: open ? null : arr, mClose: open ? null : close, mPatrol: pc && key !== 'left_patrol' ? 12 + Math.floor(rnd() * 15) : null });
        if (open) { var r = rows[rows.length - 1]; if (r.status === 'new') { r.emp = ''; r.empName = ''; r.mTake = null; } }
      }
    }
    rows.sort(function (a, b) { return String(b.time).localeCompare(String(a.time)); });
    var live = rows.filter(function (r) { return !r.cancelled; }), m = {};
    live.forEach(function (c) {
      if (!c.emp) return; var p = m[c.emp] || (m[c.emp] = { id: c.emp, name: c.empName, n: 0, closed: 0, open: 0, remote: 0, fines: 0, notTaken: 0, unreachable: 0, pax: 0, take: { n: 0, avg: null, within: 0, rate: null, s: 0 }, arrive: { n: 0, avg: null, within: 0, rate: null, s: 0 }, close: { n: 0, avg: null, s: 0 }, patrol: { n: 0, avg: null }, outcomes: {} });
      p.n++; if (c.status === 'closed') { p.closed++; p.pax += c.pax; } else p.open++; if (c.remote) p.remote++; if (c.keys[0] === 'fine') p.fines++; if (c.keys[0] === 'unreachable') p.unreachable++;
      c.keys.forEach(function (k) { p.outcomes[k] = (p.outcomes[k] || 0) + 1; });
      if (c.mTake !== null) { p.take.n++; p.take.s += c.mTake; if (c.mTake <= 10) p.take.within++; } if (c.mArrive !== null) { p.arrive.n++; p.arrive.s += c.mArrive; if (c.mArrive <= 30) p.arrive.within++; }
      if (c.mClose !== null) { p.close.n++; p.close.s += c.mClose; } if (c.pCalled) p.patrol.n++;
    });
    var kpi = Object.keys(m).map(function (k) { var p = m[k]; ['take', 'arrive', 'close'].forEach(function (g) { p[g].avg = p[g].n ? Math.round(p[g].s / p[g].n) : null; delete p[g].s; });
      p.take.rate = p.take.n ? Math.round(p.take.within / p.take.n * 100) : null; p.arrive.rate = p.arrive.n ? Math.round(p.arrive.within / p.arrive.n * 100) : null; return p; }).sort(function (a, b) { return b.n - a.n; });
    return { from: from, to: to, today: T, generated: T + ' ' + new Date().toTimeString().slice(0, 5), rows: rows, kpi: kpi, targets: { takeMin: 10, arriveMin: 30, take: 90, arrive: 90 },
      outcomes: {}, fields: ['pCalled', 'pArrived', 'remote', 'pax', 'ops'], dict: {}, systems: [] };
  }

  /* معايير الأداء KPI (v2.3): نفس شكل رد kpi_ في Kpi.gs ببيانات تجريبية */
  function kpiDemo(from, to, emp) {
    kpnInit();
    var T = opDay(); to = to || T; from = from || to.slice(0, 8) + '01';
    var S = { weights: { ENF: { att: 25, punc: 15, prod: 30, cdc: 20, notes: 10 }, STN: { att: 30, punc: 20, prod: 30, notes: 20 }, SUP: { att: 30, punc: 20, rate: 50 }, ADM: { att: 30, punc: 20, rate: 50 } }, target: 25, vioEq: 5, cdcMin: 30, bands: [90, 80, 70], sickW: 0.5, notesOn: true, notesFrom: T.slice(0, 8) + '01' };
    var P = [['10171', 'سليمان الحازمي', 'Sulaiman A. Alhazmi', 'ENF', 'قائد فريق الضبط', 'Enforcement Team Leader', '2021-09-07'], ['10090', 'سامي الهوساوي', 'Sami A. Alhawsawi', 'SUP', 'مشرف وردية', 'Shift Supervisor', '2021-01-06', 'ENF'],
      ['10675', 'عماد برناوي', 'Emad A. Barnawi', 'ENF', 'مفتش تذاكر', 'Ticket Inspector', '2022-03-14'], ['12272', 'سعدي المالكي', 'Sadi S. Almalki', 'ENF', 'مفتش تذاكر', 'Ticket Inspector', '2024-02-01'],
      ['10101', 'عبدالله عبدالمطلب', 'Abdullah Z. Abdulmuttalib', 'ENF', 'مفتش تذاكر', 'Ticket Inspector', '2021-01-06'], ['11686', 'عمر رمضان', 'Omar A. Ramadan', 'ENF', 'مفتش تذاكر', 'Ticket Inspector', '2023-05-20'],
      ['10664', 'نواف فلمبان', 'Nawaf Y. Felmban', 'ENF', 'مفتش تذاكر', 'Ticket Inspector', '2022-08-01'], ['11653', 'أحمد بخاري', 'Ahmad M. Bogari', 'ENF', 'مفتش تذاكر', 'Ticket Inspector', '2023-01-15'],
      ['10093', 'أنور اللحياني', 'Anwar M. Allahyani', 'SUP', 'مشرف وردية', 'Shift Supervisor', '2021-01-06', 'STN'], ['12162', 'بديع ساعاتي', 'Badia A. Saati', 'STN', 'مفتش محطات', 'Station Inspector', '2024-06-01'],
      ['12293', 'متعب الحربي', 'Muteb S. Alharbi', 'STN', 'مفتش محطات', 'Station Inspector', '2025-08-10'], ['12309', 'رامي مجلد', 'Rami G. Mjlid', 'STN', 'مفتش محطات', 'Station Inspector', '2025-08-10'],
      ['12280', 'عماد عاشور', 'Emad Ashour', 'STN', 'مفتش محطات', 'Station Inspector', '2025-08-10'], ['12341', 'أمجد العوفي', 'Amjad K. Aloufi', 'STN', 'مفتش محطات', 'Station Inspector', '2025-10-01'],
      ['10657', 'أشرف اللقماني', 'Ashraf A. Alluqmani', 'ADM', 'مشرف أول – فريق التذاكر', 'Senior Supervisor – Tickets', '2022-04-23', 'ENF'], ['10678', 'أحمد قدير', 'Ahmed Y. Qidair', 'ADM', 'مشرف أول – المحطات', 'Senior Supervisor – Stations', '2022-04-24', 'STN'],
      ['11294', 'مهند الأمير', 'Muhannad E. Alamir', 'ADM', 'إداري عمليات', 'Operations Admin', '2023-04-16'], ['11935', 'علي الشهراني', 'Ali A. Alshahrani', 'ADM', 'إداري عمليات', 'Operations Admin', '2024-03-17']];
    var seed = 3, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    var days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 864e5) + 1);
    var mk = function (q, team, n) {
      var work = Math.max(1, Math.round(n * (0.75 + rnd() * 0.2))), pres = work - Math.round(rnd() * 2), abs = Math.round(rnd() * 2), onT = pres - Math.round(rnd() * 3 * (1 - q));
      var enf = team === 'ENF' ? Math.round(work * (12 + q * 12)) : 0, vio = team === 'ENF' ? Math.round(work * (0.6 + q * 1.8)) : 0, stn = team === 'STN' ? Math.round(work * (18 + q * 14)) : 0;
      var arrN = team === 'ENF' ? Math.round(work * (1 + rnd() * 2)) : 0, arrOk = Math.round(arrN * (0.75 + q * 0.24));
      var ops = team === 'STN' ? stn : enf + vio * 5, r1 = function (v) { return Math.round(v * 10) / 10; };
      var isA = team === 'SUP' || team === 'ADM', nN = isA ? 0 : Math.round(rnd() * 2 * (1 - q) * 2);
      var sc = isA ? { att: r1(pres / (pres + abs) * 100), punc: r1(onT / Math.max(1, pres) * 100), rate: r1(Math.round((3 + q * 2) * 5) / 5 / 5 * 100) }
        : { att: r1(pres / (pres + abs) * 100), punc: r1(onT / Math.max(1, pres) * 100), prod: r1(Math.min(100, ops / (work * 25) * 100)), notes: 100 - nN * 5 };
      if (team === 'ENF') sc.cdc = arrN ? r1(arrOk / arrN * 100) : null;
      if (isA) { enf = vio = stn = arrN = arrOk = 0; ops = 0; }
      var W = S.weights[team], sw = 0, sv = 0, contrib = {};
      Object.keys(W).forEach(function (k) { if (sc[k] !== null && sc[k] !== undefined) { sw += W[k]; sv += W[k] * sc[k]; } });
      Object.keys(W).forEach(function (k) { if (sc[k] !== null && sc[k] !== undefined) contrib[k] = r1(W[k] * sc[k] / sw); });
      var ov = r1(sv / sw), band = ov >= 90 ? 'A' : ov >= 80 ? 'B' : ov >= 70 ? 'C' : 'D';
      return { overall: ov, band: band, scores: sc, contrib: contrib, raw: { workDays: work, activeDays: work, present: pres, absent: abs, leave: 0, onTime: onT, late: pres - onT, stn: stn, enf: enf, vio: vio, fines: vio * 140, ops: ops, perDay: r1(ops / work), cdc: isA ? 0 : arrN + 1, arrN: arrN, arrOk: arrOk, arrAvg: isA ? null : Math.round(8 + (1 - q) * 20), notesN: nN, notesPts: nN * 5 } };
    };
    var qual = {}; P.forEach(function (p, i) { qual[p[0]] = [0.95, 0.85, 0.7, 0.9, 0.55, 0.8, 0.65, 0.75, 0.97, 0.88, 0.92, 0.6, 0.78, 0.83, 0.9, 0.86, 0.8, 0.7][i]; });
    var rank = P.map(function (p) { var x = mk(qual[p[0]], p[3], days); return { id: p[0], name: p[1], name_en: p[2], team: p[3], base: p[7] || p[3], overall: x.overall, band: x.band, scores: x.scores, raw: x.raw }; })
      .sort(function (a, b) { return b.overall - a.overall; });
    var avg = function (t) { var l = rank.filter(function (r) { return r.team === t; }); return Math.round(l.reduce(function (a, r) { return a + r.overall; }, 0) / l.length * 10) / 10; };
    var out = { from: from, to: to, today: T, generated: T + ' ' + new Date().toTimeString().slice(0, 5), settings: S, rank: rank, teamAvg: { ENF: avg('ENF'), STN: avg('STN'), SUP: avg('SUP'), ADM: avg('ADM') }, sources: { historyRows: 5164 }, dict: {}, me: { id: '10190', group: 'MGR', approve: true, note: true, rate: true, pending: KPN.filter(function (n) { return n.status === 'بانتظار الاعتماد'; }).length }, excluded: { unknown: [{ id: '11035', name: '', name_en: '', stn: 0, enf: 0, vio: 0, cdc: 5 }, { id: 'مدير النظام', name: '', name_en: '', stn: 0, enf: 0, vio: 0, cdc: 1 }], adm: [] } };
    if (emp) {
      var p = P.filter(function (x) { return x[0] === emp; })[0];
      if (p) {
        var x = mk(qual[emp], p[3], days), long = days > 62, series = [], q0 = qual[emp];
        if (long) { for (var m = from.slice(0, 7); m <= to.slice(0, 7); m = add(m + '-28', 5).slice(0, 7)) series.push({ k: m, overall: Math.round(Math.min(100, (q0 * 100 - 8) + rnd() * 16) * 10) / 10 }); }
        else { for (var d = from; d <= to; d = add(d, 1)) series.push({ k: d, overall: rnd() < 0.15 ? null : Math.round(Math.min(100, (q0 * 100 - 15) + rnd() * 25) * 10) / 10 }); }
        var team = rank.filter(function (r) { return r.team === p[3]; }), pos = 0; team.forEach(function (r, i) { if (r.id === emp) pos = i + 1; });
        out.emp = { extra: { notes: KPN.filter(function (n) { return n.emp === emp && n.status === 'معتمدة'; }).map(function (n) { return { d: n.d, kind: n.kind, cat: n.cat, text: n.text, by: n.byName }; }), rates: p[3] === 'SUP' || p[3] === 'ADM' ? [{ m: to.slice(0, 7), score: x.scores.rate, items: [4, 4, 5, 4, 4], by: p[3] === 'SUP' ? 'أشرف اللقماني' : 'ماجد الهاشمي', comment: '' }] : [] }, profile: { id: p[0], team: p[3], base: p[7] || p[3], name: p[1], name_en: p[2], role: '', hire: p[6], title_ar: p[4], title_en: p[5] }, overall: x.overall, band: x.band, scores: x.scores, contrib: x.contrib, raw: x.raw, series: series, unit: long ? 'month' : 'day', rank: pos, of: team.length, notes: [] };
      }
    }
    return out;
  }
  /* 2.5: سجل الحضور التجريبي */
  var ATL = null, ATLE = { '10090': ['سامي الهوساوي', 'Sami Alhawsawi', 'ENF'], '10101': ['عبدالله عبدالمطلب', 'Abdullah Abdulmuttalib', 'ENF'], '10171': ['سليمان الحازمي', 'Sulaiman Alhazmi', 'ENF'],
    '10664': ['نواف فلمبان', 'Nawaf Filmban', 'ENF'], '11707': ['يوسف الزهراني', 'Yousef Alzahrani', 'ENF'], '12309': ['رامي مجلد', 'Rami Mjlid', 'STN'], '12402': ['نواف الجهني', 'Nawaf Aljohani', 'STN'],
    '12293': ['متعب الحربي', 'Muteb Alharbi', 'STN'], '10131': ['مخلد العتيبي', 'Mukhlid Alotaibi', 'STN'], '11294': ['مهند الأمير', 'Muhannad Alamir', 'ADM'], '10660': ['عبدالله هوساوي', 'Abdullah Hawsawi', 'ENF'] };
  function atlInit() {
    if (ATL) return ATL; ATL = []; var T = opDay(), ids = Object.keys(ATLE), seed = 7, rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }, n = 0;
    var mk = function (d, emp, st, lt, min, note, src, rev) { n++; ATL.push(['ATT-' + d.replace(/-/g, '') + '-' + n, d, emp, ATLE[emp][0], st, lt || '', min || '', '', note || '', src || 'أرشيف', rev || '', rev === 'مؤكد' ? 'ماجد الهاشمي' : '', '', '', '', '', '']); };
    for (var i = 1; i <= 300; i++) {
      var d = add(T, -i); if (d < T.slice(0, 4) + '-01-01') break;
      ids.forEach(function (e) {
        var x = rnd();
        if (x < 0.012) mk(d, e, 'غياب');
        else if (x < 0.04) mk(d, e, 'تأخير', '', [5, 8, 12, 20, 35][Math.floor(rnd() * 5)], 'IN ' + [5, 8, 12, 20, 35][Math.floor(rnd() * 5)] + ' min');
        else if (x < 0.055) mk(d, e, 'استئذان', '', '', 'مستأذن من الساعة 11:00 إلى 13:00');
        else if (x < 0.058) mk(d, e, 'انسحاب');
        else if (x < 0.1) mk(d, e, 'إجازة', ['سنوية', 'سنوية', 'مرضية', 'يوم بديل'][Math.floor(rnd() * 4)]);
      });
    }
    var p = function (d, e, sh) { n++; ATL.push(['ATT-P-' + n, d, e, ATLE[e][0], 'غياب', '', '', sh, '', 'تحضير', 'بانتظار المراجعة', '', '', '', '', sh, 'AB']); };
    p(T, '10101', '1'); p(add(T, -1), '12309', '2'); p(add(T, -1), '10664', '3');
    return ATL;
  }
  function atlDemo(from, to) {
    var L = atlInit(), T = opDay(); from = from || T.slice(0, 8) + '01'; to = to || T;
    var emps = {}; Object.keys(ATLE).forEach(function (k) { emps[k] = { ar: ATLE[k][0], en: ATLE[k][1], team: ATLE[k][2], active: true }; });
    return { from: from, to: to, today: T, rows: L.filter(function (r) { return (r[1] >= from && r[1] <= to) || r[10] === 'بانتظار المراجعة'; }), emps: emps, canReview: true,
      leaveTypes: ['سنوية', 'مرضية', 'يوم بديل', 'وفاة'], codes: { 'غياب': 'AB', 'سنوية': 'AL', 'مرضية': 'SL', 'يوم بديل': 'AD', 'وفاة': 'DV' }, sync: { added: 0 } };
  }
  function atlReviewDemo(p) {
    var r = atlInit().filter(function (x) { return x[0] === p.id; })[0]; if (!r) return { ok: false, error: 'not found' };
    if (p.act === 'confirm') { r[10] = 'مؤكد'; r[11] = USER.name; r[13] = p.note || ''; return { ok: true }; }
    r[14] = r[14] || r[4] + (r[5] ? ' – ' + r[5] : ''); r[10] = 'معدّل'; r[11] = USER.name; r[13] = p.note || '';
    if (p.status === 'حاضر') r[4] = 'ملغى'; else { r[4] = p.status; r[5] = p.status === 'إجازة' ? p.leave_type : ''; r[6] = p.status === 'تأخير' ? p.minutes : ''; }
    return { ok: true, roster: 'updated' };
  }
  var KPN = [];
  function kpnInit() {
    if (KPN.length) return; var T = opDay(), d = function (n) { return add(T, -n); };
    KPN.push({ id: 'NT-1', created: d(1) + ' 09:10', d: d(1), emp: '10101', name: 'عبدالله عبدالمطلب', kind: 'medium', cat: 'ترك الموقع بدون إذن', text: 'ترك محطة الحجون 40 دقيقة بدون إبلاغ', by: '10090', byName: 'سامي الهوساوي', src: 'bot', status: 'بانتظار الاعتماد', decBy: '', decNote: '' });
    KPN.push({ id: 'NT-2', created: d(2) + ' 15:30', d: d(2), emp: '12309', name: 'رامي مجلد', kind: 'minor', cat: 'المظهر والزي', text: 'بدون البطاقة التعريفية', by: '10093', byName: 'أنور اللحياني', src: 'bot', status: 'بانتظار الاعتماد', decBy: '', decNote: '' });
    KPN.push({ id: 'NT-3', created: d(4) + ' 11:00', d: d(4), emp: '10171', name: 'سليمان الحازمي', kind: 'praise', cat: 'أداء مميز', text: 'ضبط 6 حالات تزوير تذاكر في وردية واحدة', by: '10657', byName: 'أشرف اللقماني', src: 'portal', status: 'معتمدة', decBy: 'ماجد الهاشمي', decNote: '' });
    KPN.push({ id: 'NT-4', created: d(6) + ' 08:20', d: d(6), emp: '10664', name: 'نواف فلمبان', kind: 'minor', cat: 'تأخر عن الموقع', text: '', by: '10090', byName: 'سامي الهوساوي', src: 'bot', status: 'مرفوضة', decBy: 'ماجد الهاشمي', decNote: 'التأخير بسبب تغيير التوزيع' });
  }
  var KPR = {};
  function kpDemoPeople() { var r = kpiDemo().rank; return r.map(function (x) { return { id: x.id, name: x.name, name_en: x.name_en, group: x.team, base: x.base }; }); }
  function kpiNotesDemo() {
    kpnInit(); var P = kpDemoPeople();
    return { from: '', to: '', notes: KPN.slice().sort(function (a, b) { return (a.status === 'بانتظار الاعتماد' ? 0 : 1) - (b.status === 'بانتظار الاعتماد' ? 0 : 1) || b.created.localeCompare(a.created); }), targets: P,
      types: { minor: -5, medium: -10, major: -15, praise: 5 }, cats: 'تأخر عن الموقع,ترك الموقع بدون إذن,المظهر والزي,التعامل مع الركاب,استخدام الجوال أثناء العمل,تقصير في المهام,عدم الالتزام بالتعليمات,أخرى'.split(','),
      praiseCats: 'أداء مميز,تعامل مميز مع الركاب,مبادرة,التزام مميز'.split(','), approve: true, me: '10190', notesOn: true, notesFrom: opDay().slice(0, 8) + '01' };
  }
  function kpiRatesDemo(month) {
    month = month || opDay().slice(0, 7); var P = kpDemoPeople(), R = KPR[month] || {};
    var items = 'الالتزام,جودة العمل,سرعة الإنجاز,التعاون,المبادرة'.split(',');
    var rt = function (x) { return R[x.id] || null; };
    return { month: month, items: items, targets: P.filter(function (x) { return x.group === 'ADM'; }).map(function (x) { return Object.assign({}, x, { rating: rt(x) }); }),
      all: P.filter(function (x) { return x.group === 'ADM' || x.group === 'SUP'; }).map(function (x) { return Object.assign({}, x, { rater: x.group === 'ADM' ? '10190' : (x.base === 'ENF' ? '10657' : '10678'), rating: rt(x) }); }),
      names: { '10190': 'ماجد الهاشمي', '10657': 'أشرف اللقماني', '10678': 'أحمد قدير' } };
  }
  var KPI_AVATAR = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9e4ef"/><stop offset="1" stop-color="#cfc6da"/></linearGradient></defs><rect width="400" height="500" fill="url(#g)"/><circle cx="200" cy="190" r="86" fill="#9d8fb0"/><path d="M40 500c10-120 80-180 160-180s150 60 160 180z" fill="#9d8fb0"/></svg>');

  return {
    cdc: function (b) { return CDCX(b); },
    handle: function (p) {
      if (p.action === 'login') return p.emp_id === '10190' && p.pin === '1234' ? ok({ token: 'demo', user: USER, mustChange: false, sections: SECTIONS }) : fail('badpin');
      if (!p.token) return fail('auth');
      switch (p.action) {
        case 'me': return ok({ user: USER, sections: SECTIONS });
        case 'home': return ok({ data: home(p.date, Number(p.heatDays) === 30 ? 30 : 7) });
        case 'reportX': return ok({ data: reportX(p.date) });
        case 'section': return ok({ data: section(p.key, p.from, p.to) });
        case 'changePin': return p.old === '1234' ? ok({ token: 'demo' }) : fail('badpin');
        case 'users': return ok({ users: [{ emp_id: '10190', name: 'ماجد', team: 'ADM', role: 'Admin', access: 'نعم', last_login: opDay() + ' 13:40' }, { emp_id: '10090', name: 'سامي الهوساوي', team: 'ENF', role: 'Supervisor', access: 'نعم', last_login: '' }, { emp_id: '10001', name: 'موظف تجريبي 1', team: 'ENF', role: 'Officer', access: 'لا', last_login: '' }] });
        case 'setUser': return ok({ pin: p.resetPin ? '482913' : null });
        case 'ping': return ok({ systems: [{ code: 'CDC', name: 'بلاغات العمليات', ok: true, file: 'CDC cases passenger without ticket', ms: 820 }, { code: 'INS', name: 'الفحص والمخالفات', ok: true, file: 'Inspection and Violations', ms: 760 }, { code: 'RST', name: 'الروستر والطلبات', ok: true, file: 'MBCO Roster & Attendance', ms: 910 }, { code: 'CAR', name: 'إدارة الأسطول', ok: true, file: 'Carlog – تسليم واستلام السيارات', ms: 700 }] });
        case 'dashLink': return ok({ url: null });
        case 'embed': return ok({ reason: 'demo' });
        case 'rstDash': return ok({ data: rstDemo(p.month, p.date), canLeave: true, canReq: true, by: USER.name });
        case 'rstAct': return ok({});
        case 'carDash': return ok({ data: carDemo(p.from, p.to), canAct: true, me: { id: '10190', name: USER.name } });
        case 'carAct': return ok({ result: carDemoAct(p) });
        case 'insDash': return ok({ data: insDemo(p.from, p.to) });
        case 'cdcDash': return ok({ data: cdcDashDemo(p.from, p.to) });
        case 'kpi': return ok({ data: kpiDemo(p.from, p.to, p.emp) });
        case 'kpiPhoto': return ok({ data: KPI_AVATAR });
        case 'kpiNotes': return ok({ data: kpiNotesDemo() });
        case 'kpiNoteAdd': { kpnInit(); var tg = kpDemoPeople().filter(function (x) { return x.id === p.emp; })[0] || {}; KPN.push({ id: 'NT-' + (KPN.length + 1), created: opDay() + ' ' + new Date().toTimeString().slice(0, 5), d: p.date, emp: p.emp, name: tg.name, kind: p.kind, cat: p.cat, text: p.text, by: '10190', byName: USER.name, src: 'portal', status: 'معتمدة', decBy: USER.name, decNote: '' }); return ok({ note: { status: 'معتمدة' } }); }
        case 'kpiNoteDecide': { kpnInit(); var n0 = KPN.filter(function (x) { return x.id === p.id; })[0]; if (n0) { n0.status = p.act === 'approve' ? 'معتمدة' : p.act === 'reject' ? 'مرفوضة' : 'بانتظار الاعتماد'; n0.decBy = p.act === 'reopen' ? '' : USER.name; n0.decNote = p.note || ''; } return ok({}); }
        case 'kpiRates': return ok({ data: kpiRatesDemo(p.month) });
        case 'attLog': return ok({ data: atlDemo(p.from, p.to) });
        case 'attReview': return ok(atlReviewDemo(p));
        case 'attAdd': { atlInit(); var E0 = ATLE[p.emp] || ['', '', '']; ATL.push(['ATT-M-' + Date.now(), p.date, p.emp, E0[0], p.status, p.leave_type || '', p.minutes || '', '', p.note || '', 'البوابة', 'مؤكد', USER.name, '', '', '', '', '']); return ok({ id: 'x' }); }
        case 'kpiRateSave': { var sc0 = Math.round(p.items.reduce(function (a, v) { return a + v; }, 0) / p.items.length / 5 * 1000) / 10; (KPR[p.month] = KPR[p.month] || {})[p.emp] = { items: p.items, score: sc0, comment: p.comment, by: USER.name, at: opDay() + ' ' + new Date().toTimeString().slice(0, 5) }; return ok({ score: sc0 }); }
        case 'rosterGet': return ok(rosDemoGet(p));
        case 'rosterSave': return ok(rosDemoSave(p));
        case 'empUpdate': { var RD = rosDemoInit(); (p.upd || []).forEach(function (o) { var e = RD.emps.filter(function (x) { return x.id === o.id; })[0]; if (e) { if (o.team) e.team = o.team; if ('role' in o) e.role = o.role; if ('task' in o) e.task = o.task; if ('lead_level' in o) e.lead = o.lead_level; if ('lead_shift' in o) e.lshift = o.lead_shift; } }); return ok({ cells: (p.upd || []).length, grid: true, missing: [] }); }
        case 'rosterUndo': { var D0 = rosDemoInit(); if (D0.backup) { D0.codes = JSON.parse(D0.backup); D0.backup = null; } return ok({}); }
        case 'sendReport': window.__sentReport = { filename: p.filename, size: (p.pdf || '').length, caption: p.caption }; return ok({});
        default: return fail('unknown');
      }
    }
  };
})();
