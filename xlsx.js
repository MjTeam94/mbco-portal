/* MBCO – قارئ وكاتب Excel (.xlsx) صغير بدون مكتبات خارجية.
   القراءة: يفك ملف zip بـ DecompressionStream ويقرأ أول ورقة كجدول قيم.
   الكتابة: ينشئ ملف xlsx بتنسيق (ألوان، حدود، دمج خلايا، عرض أعمدة، تجميد). */
(function () {
  'use strict';
  var u8 = function (b) { return b instanceof Uint8Array ? b : new Uint8Array(b); };
  var dec = new TextDecoder('utf-8'), enc = new TextEncoder();

  /* ---------- zip: قراءة ---------- */
  function unzip(buf) {
    var b = u8(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength), files = {};
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('not_xlsx'));
    var n = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), jobs = [];
    for (var k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      var nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      var name = dec.decode(b.subarray(p + 46, p + 46 + nlen));
      var start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
      jobs.push(inflate(b.subarray(start, start + csize), method).then((function (nm) { return function (data) { files[nm] = data; }; })(name)));
      p += 46 + nlen + xlen + clen;
    }
    return Promise.all(jobs).then(function () { return files; });
  }
  function inflate(data, method) {
    if (method === 0) return Promise.resolve(data);
    if (method !== 8 || typeof DecompressionStream === 'undefined') return Promise.reject(new Error('zip_method'));
    var ds = new DecompressionStream('deflate-raw');
    var out = new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
    return out.then(u8);
  }
  function xml(bytes) { return new DOMParser().parseFromString(dec.decode(bytes), 'application/xml'); }
  function byTag(node, tag) { return Array.prototype.slice.call(node.getElementsByTagNameNS('*', tag)); }
  function colIdx(ref) { var m = /^([A-Z]+)/.exec(ref), n = 0; for (var i = 0; i < m[1].length; i++) n = n * 26 + m[1].charCodeAt(i) - 64; return n - 1; }

  /* يرجع { sheets: [{ name, rows: [[قيم]] }] } — التواريخ تبقى أرقام Excel */
  function read(buf) {
    return unzip(buf).then(function (f) {
      var shared = [];
      if (f['xl/sharedStrings.xml']) byTag(xml(f['xl/sharedStrings.xml']), 'si').forEach(function (si) { shared.push(byTag(si, 't').map(function (t) { return t.textContent; }).join('')); });
      var wb = xml(f['xl/workbook.xml']), rels = {};
      if (f['xl/_rels/workbook.xml.rels']) byTag(xml(f['xl/_rels/workbook.xml.rels']), 'Relationship').forEach(function (r) { rels[r.getAttribute('Id')] = r.getAttribute('Target'); });
      var sheets = byTag(wb, 'sheet').map(function (s, i) {
        var rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        var t = rels[rid] || ('worksheets/sheet' + (i + 1) + '.xml');
        t = t.replace(/^\/?xl\//, '').replace(/^\//, '');
        var data = f['xl/' + t]; if (!data) return null;
        var rows = [];
        byTag(xml(data), 'row').forEach(function (row) {
          var r = +row.getAttribute('r') - 1, line = rows[r] = rows[r] || [];
          byTag(row, 'c').forEach(function (c) {
            var ref = c.getAttribute('r'), t = c.getAttribute('t'), v = byTag(c, 'v')[0], val = null;
            if (t === 's') val = v ? shared[+v.textContent] : '';
            else if (t === 'inlineStr') val = byTag(c, 't').map(function (x) { return x.textContent; }).join('');
            else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
            else if (t === 'b') val = v ? v.textContent === '1' : false;
            else if (v) val = Number(v.textContent);
            line[colIdx(ref)] = val;
          });
        });
        for (var i2 = 0; i2 < rows.length; i2++) rows[i2] = rows[i2] || [];
        return { name: s.getAttribute('name'), rows: rows };
      }).filter(Boolean);
      return { sheets: sheets };
    });
  }

  /* ---------- zip: كتابة (بدون ضغط) ---------- */
  var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(entries) {
    var parts = [], central = [], off = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name), data = typeof e.data === 'string' ? enc.encode(e.data) : e.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (a, x) { return a + x.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- xlsx: كتابة ----------
     sheets: [{ name, rtl, cols: [عرض...], rows: [[خلية]], merges: ['A1:C1'], freeze: 'F6', heights: {رقم الصف: ارتفاع} }]
     الخلية: قيمة مباشرة، أو { v, s: { b, sz, color, fill, h:'center', wrap, border, fmt } } */
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function colName(i) { var s = ''; i++; while (i) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
  function argb(c) { c = String(c || '').replace('#', ''); return 'FF' + (c.length === 3 ? c.split('').map(function (x) { return x + x; }).join('') : c).toUpperCase(); }

  function write(sheets) {
    var fonts = ['<font><sz val="10"/><name val="Arial"/></font>'], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'],
      borders = ['<border><left/><right/><top/><bottom/><diagonal/></border>'], fmts = [], xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], keyMap = {};
    function idx(arr, x) { var i = arr.indexOf(x); if (i < 0) { arr.push(x); i = arr.length - 1; } return i; }
    function style(s) {
      if (!s) return 0;
      var k = JSON.stringify(s); if (keyMap[k] !== undefined) return keyMap[k];
      var f = idx(fonts, '<font>' + (s.b ? '<b/>' : '') + '<sz val="' + (s.sz || 10) + '"/>' + (s.color ? '<color rgb="' + argb(s.color) + '"/>' : '') + '<name val="Arial"/></font>');
      var fi = s.fill ? idx(fills, '<fill><patternFill patternType="solid"><fgColor rgb="' + argb(s.fill) + '"/><bgColor indexed="64"/></patternFill></fill>') : 0;
      var bw = s.border === 'medium' ? 'medium' : 'thin';
      var bo = s.border ? idx(borders, '<border><left style="' + bw + '"><color rgb="FF8C8C8C"/></left><right style="' + bw + '"><color rgb="FF8C8C8C"/></right><top style="' + bw + '"><color rgb="FF8C8C8C"/></top><bottom style="' + bw + '"><color rgb="FF8C8C8C"/></bottom><diagonal/></border>') : 0;
      var nf = 0; if (s.fmt) { var fi2 = fmts.indexOf(s.fmt); if (fi2 < 0) { fmts.push(s.fmt); fi2 = fmts.length - 1; } nf = 164 + fi2; }
      var al = (s.h || s.wrap || s.v) ? '<alignment' + (s.h ? ' horizontal="' + s.h + '"' : '') + ' vertical="' + (s.v || 'center') + '"' + (s.wrap ? ' wrapText="1"' : '') + '/>' : '';
      xfs.push('<xf numFmtId="' + nf + '" fontId="' + f + '" fillId="' + fi + '" borderId="' + bo + '" xfId="0"' + (nf ? ' applyNumberFormat="1"' : '') + ' applyFont="1"' + (fi ? ' applyFill="1"' : '') + (bo ? ' applyBorder="1"' : '') + (al ? ' applyAlignment="1">' + al + '</xf>' : '/>'));
      return (keyMap[k] = xfs.length - 1);
    }
    var sheetXml = sheets.map(function (sh) {
      var rowsXml = sh.rows.map(function (row, r) {
        if (!row) return '';
        var cells = row.map(function (cell, c) {
          if (cell === undefined || cell === null) return '';
          var v = cell, s = null;
          if (typeof cell === 'object' && !(cell instanceof Date)) { v = cell.v; s = cell.s; }
          var ref = colName(c) + (r + 1), si = style(s), sa = si ? ' s="' + si + '"' : '';
          if (v === undefined || v === null || v === '') return si ? '<c r="' + ref + '"' + sa + '/>' : '';
          if (typeof v === 'number') return '<c r="' + ref + '"' + sa + '><v>' + v + '</v></c>';
          return '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
        }).join('');
        var ht = sh.heights && sh.heights[r + 1];
        return '<row r="' + (r + 1) + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + cells + '</row>';
      }).join('');
      var fz = '';
      if (sh.freeze) { var m = /^([A-Z]+)(\d+)$/.exec(sh.freeze), xs = colIdx(sh.freeze), ys = +m[2] - 1; fz = '<pane' + (xs ? ' xSplit="' + xs + '"' : '') + (ys ? ' ySplit="' + ys + '"' : '') + ' topLeftCell="' + sh.freeze + '" activePane="bottomRight" state="frozen"/>'; }
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheetViews><sheetView workbookViewId="0"' + (sh.rtl ? ' rightToLeft="1"' : '') + '>' + fz + '</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
        (sh.cols ? '<cols>' + sh.cols.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '') +
        '<sheetData>' + rowsXml + '</sheetData>' +
        (sh.merges && sh.merges.length ? '<mergeCells count="' + sh.merges.length + '">' + sh.merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' : '') +
        '<pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
    });
    var stylesXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (fmts.length ? '<numFmts count="' + fmts.length + '">' + fmts.map(function (f, i) { return '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(f) + '"/>'; }).join('') + '</numFmts>' : '') +
      '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts><fills count="' + fills.length + '">' + fills.join('') + '</fills><borders count="' + borders.length + '">' + borders.join('') + '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    var entries = [
      { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>' },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' + sheets.map(function (s, i) { return '<sheet name="' + esc(String(s.name).slice(0, 31)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>' },
      { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: 'xl/styles.xml', data: stylesXml }
    ];
    sheetXml.forEach(function (x, i) { entries.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: x }); });
    return zip(entries);
  }

  /* تاريخ yyyy-MM-dd ↔ رقم Excel */
  function toSerial(d) { var p = d.split('-'); return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 864e5); }
  function fromSerial(n) { var d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5); return d.toISOString().slice(0, 10); }

  window.MBCO_XLSX = { read: read, write: write, toSerial: toSerial, fromSerial: fromSerial, colName: colName };
})();
