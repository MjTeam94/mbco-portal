/* MBCO – وضع العرض: بيانات تجريبية للتجربة قبل التركيب (يعمل عندما يكون HUB_URL فارغاً أو ?demo=1) */
window.MBCO_DEMO = (function () {
  var SECTIONS = [
    ['home', 'الرئيسية', 'Home', ''], ['cdc', 'بلاغات العمليات CDC', 'CDC cases', 'ops'], ['ins', 'الفحص والمخالفات', 'Inspections & violations', 'ops'],
    ['car', 'السيارات Carlog', 'Vehicles (Carlog)', 'ops'], ['roster', 'الروستر والتوزيع', 'Roster & distribution', 'staff'], ['att', 'التحضير والغياب', 'Attendance', 'staff'],
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
        { label: 'طلبات عولجت قبل التصعيد', sys: 'الإجازات · 7 أيام', val: 100, target: 100 }, { label: 'تسليم السيارة بنفسه', sys: 'Carlog · 7 أيام', val: 88, target: 95 }
      ],
      cdc: { today: 27, open: 4, avgArrive: 18, waitingPatrol: 2, outcomes: [{ name: 'إنزال', n: 9 }, { name: 'مخالفة', n: 6 }, { name: 'شراء تذكرة', n: 5 }, { name: 'أخرى', n: 3 }] },
      ins: { inspections: 64, violations: 9, fines: 1800, coverageH: 14, last7: last7 },
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
      badges: { cdc: 4, leaves: 5, requests: 4, car: 2 }
    };
  }

  function section(key, from, to) {
    to = to || opDay(); from = from || add(to, -6);
    var cols = function (a) { return a.map(function (c) { return { key: c[0], ar: c[1], en: c[2] }; }); };
    var R = function (n, fn) { var a = []; for (var i = 0; i < n; i++) a.push(fn(i)); return a; };
    var day = function (i) { return add(to, -(i % 7)); };
    var res = { key: key, from: from, to: to, systems: [], canOpenDashboard: true };
    var routes = ['3', '7A', '7B', '11', '5', '1'], sts = ['المروة', 'قطار الحرمين', 'جبل الكعبة', 'التنعيم'];
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
      res.rows = R(30, function (i) { return { shift_date: day(i), shift: String(1 + i % 2), team: i % 2 ? 'التذاكر' : 'المحطات', emp_name: 'موظف تجريبي ' + (1 + i % 5), att_status: i % 9 === 3 ? 'غائب' : 'حاضر', late_min: i % 7 === 2 ? 15 : '', late_type: i % 7 === 2 ? 'متأخر عن بصمة الدخول' : '', exit_time: '' }; });
    } else {
      res.kpis = [{ label: 'سجلات', value: 24 }, { label: 'مفتوحة', value: 3, tone: 'warn' }, { label: 'مغلقة', value: 21 }, { label: 'ملاحظات', value: 2 }];
      res.columns = cols([['case_id', 'الرقم', 'ID'], ['shift_date', 'التاريخ', 'Date'], ['team', 'الفريق', 'Team'], ['emp_name', 'الموظف', 'Employee'], ['station', 'المحطة', 'Station'], ['route', 'المسار', 'Route'], ['status', 'الحالة', 'Status']]);
      res.rows = R(24, function (i) { return { case_id: key.toUpperCase() + '-' + day(i).replace(/-/g, '') + '-000' + (1 + i % 9), shift_date: day(i), team: i % 2 ? 'التذاكر' : 'المحطات', emp_name: 'موظف تجريبي ' + (1 + i % 5), station: sts[i % 4], route: routes[i % 6], status: i < 3 ? 'مفتوحة' : 'مغلقة' }; });
    }
    return res;
  }

  return {
    handle: function (p) {
      if (p.action === 'login') return p.emp_id === '10190' && p.pin === '1234' ? ok({ token: 'demo', user: USER, mustChange: false, sections: SECTIONS }) : fail('badpin');
      if (!p.token) return fail('auth');
      switch (p.action) {
        case 'home': return ok({ data: home(p.date, Number(p.heatDays) === 30 ? 30 : 7) });
        case 'section': return ok({ data: section(p.key, p.from, p.to) });
        case 'changePin': return p.old === '1234' ? ok({ token: 'demo' }) : fail('badpin');
        case 'users': return ok({ users: [{ emp_id: '10190', name: 'ماجد', team: 'ADM', role: 'Admin', access: 'نعم', last_login: opDay() + ' 13:40' }, { emp_id: '10090', name: 'سامي الهوساوي', team: 'ENF', role: 'Supervisor', access: 'نعم', last_login: '' }, { emp_id: '10001', name: 'موظف تجريبي 1', team: 'ENF', role: 'Officer', access: 'لا', last_login: '' }] });
        case 'setUser': return ok({ pin: p.resetPin ? '482913' : null });
        case 'ping': return ok({ systems: [{ code: 'CDC', name: 'بلاغات العمليات', ok: true, file: 'CDC cases passenger without ticket', ms: 820 }, { code: 'INS', name: 'الفحص والمخالفات', ok: true, file: 'Inspection and Violations', ms: 760 }, { code: 'RST', name: 'الروستر والطلبات', ok: true, file: 'MBCO Roster & Attendance', ms: 910 }, { code: 'CAR', name: 'السيارات Carlog', ok: true, file: 'Carlog – تسليم واستلام السيارات', ms: 700 }] });
        case 'dashLink': return ok({ url: null });
        default: return fail('unknown');
      }
    }
  };
})();
