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
      dict: { 'صقر المجنوني': 'Saqer Almajnuni', 'سليمان الحازمي': 'Sulaiman Alhazmi', 'مخلد العتيبي': 'Mukhlid Alotaibi', 'موظف تجريبي 1': 'Demo employee 1', 'موظف تجريبي 2': 'Demo employee 2', 'موظف تجريبي 3': 'Demo employee 3', 'موظف تجريبي 4': 'Demo employee 4', 'موظف تجريبي 5': 'Demo employee 5' },
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
    ROS_DEMO = { shifts: shifts, emps: emps.map(function (e) { return { id: e[0], en: e[1], ar: e[2], team: e[3], position: e[4], task: e[5], def: e[6], active: true }; }), names: emps, codes: codes, backup: null };
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

  return {
    handle: function (p) {
      if (p.action === 'login') return p.emp_id === '10190' && p.pin === '1234' ? ok({ token: 'demo', user: USER, mustChange: false, sections: SECTIONS }) : fail('badpin');
      if (!p.token) return fail('auth');
      switch (p.action) {
        case 'me': return ok({ user: USER, sections: SECTIONS });
        case 'home': return ok({ data: home(p.date, Number(p.heatDays) === 30 ? 30 : 7) });
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
        case 'rosterGet': return ok(rosDemoGet(p));
        case 'rosterSave': return ok(rosDemoSave(p));
        case 'rosterUndo': { var D0 = rosDemoInit(); if (D0.backup) { D0.codes = JSON.parse(D0.backup); D0.backup = null; } return ok({}); }
        case 'sendReport': window.__sentReport = { filename: p.filename, size: (p.pdf || '').length, caption: p.caption }; return ok({});
        default: return fail('unknown');
      }
    }
  };
})();
