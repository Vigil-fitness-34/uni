/* Lernklar: Kalender lesen (.ics vom Uni-Portal) und schreiben (Erinnerungen fürs Handy). Ohne Abhängigkeiten. */
(function (root) {
'use strict';

const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Wortgrenzen auch für Umlaute (\b kennt kein „ü“)
const word = list => new RegExp(`(?<![\\p{L}\\d])(?:${list})(?![\\p{L}\\d])`, 'iu');
const KIND_RX = [
  ['ue', word('übung|übungen|uebung|ü|ue|üb|exercise|exercises|übungsgruppe|hausübung|zentralübung|globalübung|großübung')],
  ['tut', word('tutorium|tutorien|tut|tutorial|tutor')],
  ['sem', word('seminar|proseminar|hauptseminar|kolloquium|colloquium')],
  ['prak', word('praktikum|labor|lab|praktische\\s+übung')],
  ['vl', word('vorlesung|vl|v|lecture|ringvorlesung')]
];
const EXAM_RX = word('klausur|prüfung|pruefung|exam|examen|testat|nachklausur|probeklausur');
const STRIP_RX = new RegExp(`(?<![\\p{L}\\d])(?:vorlesung|vl|übung|übungen|uebung|ü|ue|üb|exercise|tutorium|tutorien|tut|tutorial|seminar|proseminar|praktikum|labor|lab|lecture|übungsgruppe|gruppe\\s*\\w{1,3}|gr\\.?\\s*\\d+|zentralübung|globalübung|großübung|hausübung)(?![\\p{L}\\d])`, 'giu');

function kindOf(text) {
  for (const [k, rx] of KIND_RX) if (rx.test(text)) return k;
  return 'vl';
}
function cleanName(t) {
  let s = String(t || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(STRIP_RX, ' ')
    .replace(/^\s*[A-Z]{1,6}[-.\s]?\d{2,7}[a-z]?\s*[-:–|]?\s*/, '') // Modulnummer vorne, z. B. „MA 1101 –“
    .replace(/\s*[-:–|,/]+\s*$/, '').replace(/^\s*[-:–|,/]+\s*/, '')
    .replace(/\s{2,}/g, ' ').trim();
  return s || String(t || '').trim();
}

const unesc = v => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
function parseDT(v, P = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/.exec(v || '');
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
  if (!m[4] || P.VALUE === 'DATE') return { date: new Date(y, mo, d), allDay: true };
  const h = +m[4], mi = +m[5], s = +(m[6] || 0);
  // Ohne Z: Wanduhrzeit der Uni (TZID meist Europe/Berlin) = Ortszeit des Geräts
  return { date: m[7] ? new Date(Date.UTC(y, mo, d, h, mi, s)) : new Date(y, mo, d, h, mi, s), allDay: false };
}
function parseDur(v) {
  const m = /^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
  if (!m) return 0;
  return ((+m[2] || 0) * 7 * 864e5 + (+m[3] || 0) * 864e5 + (+m[4] || 0) * 36e5 + (+m[5] || 0) * 6e4 + (+m[6] || 0) * 1e3) * (m[1] ? -1 : 1);
}

function parse(txt) {
  const lines = String(txt).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const out = [];
  let cur = null, depth = 0;
  for (const ln of lines) {
    if (ln === 'BEGIN:VEVENT') { cur = { ex: [] }; depth = 0; continue; }
    if (ln === 'END:VEVENT') { if (cur) out.push(cur); cur = null; continue; }
    if (!cur) continue;
    if (/^BEGIN:/.test(ln)) { depth++; continue; } // VALARM o. ä. überspringen
    if (/^END:/.test(ln)) { depth--; continue; }
    if (depth > 0) continue;
    const i = ln.indexOf(':'); if (i < 0) continue;
    const [name, ...params] = ln.slice(0, i).split(';');
    const val = ln.slice(i + 1);
    const P = {};
    params.forEach(p => { const j = p.indexOf('='); if (j > 0) P[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, ''); });
    switch (name.toUpperCase()) {
      case 'SUMMARY': cur.sum = unesc(val); break;
      case 'LOCATION': cur.loc = unesc(val); break;
      case 'CATEGORIES': cur.cat = unesc(val); break;
      case 'DESCRIPTION': cur.desc = unesc(val); break;
      case 'UID': cur.uid = val; break;
      case 'STATUS': cur.status = val.toUpperCase(); break;
      case 'DTSTART': cur.s = parseDT(val, P); break;
      case 'DTEND': cur.e = parseDT(val, P); break;
      case 'DURATION': cur.dur = parseDur(val); break;
      case 'RRULE': cur.rr = Object.fromEntries(val.split(';').map(x => x.split('=')).map(([a, b]) => [a.toUpperCase(), b])); break;
      case 'EXDATE': val.split(',').forEach(v => { const d = parseDT(v, P); if (d) cur.ex.push(dk(d.date)); }); break;
      case 'RECURRENCE-ID': cur.rid = parseDT(val, P); break;
    }
  }
  return out;
}

// Wiederholungen ausrollen (wöchentlich/täglich reicht für Stundenpläne), höchstens ein gutes Jahr
function expand(ev) {
  if (!ev.s) return [];
  const start = ev.s.date;
  const dur = ev.e ? ev.e.date - start : (ev.dur || 0);
  const occ = [];
  const rr = ev.rr;
  if (!rr) occ.push(new Date(start));
  else {
    const iv = Math.max(1, +rr.INTERVAL || 1);
    let until = null;
    if (rr.UNTIL) { const u = parseDT(rr.UNTIL); if (u) until = u.allDay ? new Date(u.date.getFullYear(), u.date.getMonth(), u.date.getDate(), 23, 59, 59) : u.date; }
    let count = rr.COUNT ? +rr.COUNT : Infinity;
    const hard = new Date(start.getTime() + 400 * 864e5);
    const over = d => (until && d > until) || d > hard || count <= 0;
    if (rr.FREQ === 'WEEKLY') {
      const by = (rr.BYDAY ? rr.BYDAY.split(',').map(x => DAYS.indexOf(x.slice(-2).toUpperCase())).filter(x => x >= 0) : [start.getDay()])
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      const mon = new Date(start.getFullYear(), start.getMonth(), start.getDate() - ((start.getDay() + 6) % 7));
      outer: for (let w = 0; w < 60 * iv; w += iv) {
        for (const bd of by) {
          const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + w * 7 + ((bd + 6) % 7), start.getHours(), start.getMinutes(), start.getSeconds());
          if (d < start) continue;
          if (over(d)) break outer;
          occ.push(d); count--;
        }
      }
    } else if (rr.FREQ === 'DAILY') {
      for (let n = 0; n < 400; n += iv) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + n, start.getHours(), start.getMinutes(), start.getSeconds());
        if (over(d)) break;
        occ.push(d); count--;
      }
    } else occ.push(new Date(start));
  }
  const ex = new Set(ev.ex);
  return occ.filter(d => !ex.has(dk(d))).map(d => ({ date: d, end: new Date(d.getTime() + dur) }));
}

/* Kalender auswerten: gleiche Veranstaltung (Titel, Wochentag, Uhrzeit) wird zu einer Reihe.
   Viele Uni-Portale exportieren jeden Termin einzeln, das fängt die Gruppierung ab. */
function analyze(txt, fromKey) {
  const raw = parse(txt).filter(e => e.s && e.status !== 'CANCELLED');
  const masters = raw.filter(e => !e.rid), overrides = raw.filter(e => e.rid);
  for (const o of overrides) { const m = masters.find(x => x.uid && x.uid === o.uid); if (m) m.ex.push(dk(o.rid.date)); }
  const groups = new Map(), exams = new Map();
  for (const e of raw) {
    const title = (e.sum || 'Termin').replace(/\s+/g, ' ').trim();
    const isExam = EXAM_RX.test(title) || EXAM_RX.test(e.cat || '');
    for (const o of expand(e)) {
      const k = dk(o.date);
      if (fromKey && k < fromKey) continue;
      if (isExam) {
        const time = e.s.allDay ? '' : hm(o.date);
        exams.set(title + k, { title, subj: cleanName(title.replace(EXAM_RX, ' ')), date: k, time, room: e.loc || '' });
        continue;
      }
      if (e.s.allDay) continue;
      const st = hm(o.date), en = hm(o.end), wd = o.date.getDay();
      const key = `${title}|${wd}|${st}|${en}`;
      let g = groups.get(key);
      if (!g) { g = { title, wd, start: st, end: en, room: (e.loc || '').trim(), dates: [], kind: kindOf(`${title} ${e.cat || ''}`), subj: cleanName(title) }; groups.set(key, g); }
      g.dates.push(k);
    }
  }
  const series = [...groups.values()]
    .map(g => Object.assign(g, { dates: [...new Set(g.dates)].sort() }))
    .sort((a, b) => ((a.wd + 6) % 7) - ((b.wd + 6) % 7) || a.start.localeCompare(b.start));
  return { series, exams: [...exams.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

/* ---------- Schreiben ---------- */
const tx = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const dt = (k, t) => k.replace(/-/g, '') + (t ? 'T' + t.replace(':', '') + '00' : '');
function fold(line) {
  // Zeilen über 75 Byte umbrechen (RFC 5545), grob nach Zeichen reicht für Kalender-Apps
  const out = []; let s = line;
  while (s.length > 72) { out.push(s.slice(0, 72)); s = ' ' + s.slice(72); }
  out.push(s); return out.join('\r\n');
}
/* items: { uid, title, date, time?, min?, desc?, rrule?, exdates?, alarms: ['-PT15M', ...] } */
function build(items, calName) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lernklar//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${tx(calName || 'Lernklar')}`];
  for (const it of items) {
    L.push('BEGIN:VEVENT', `UID:${it.uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${tx(it.title)}`);
    if (it.time) {
      L.push(`DTSTART:${dt(it.date, it.time)}`, `DURATION:PT${Math.max(5, it.min || 60)}M`);
    } else {
      const d = new Date(+it.date.slice(0, 4), +it.date.slice(5, 7) - 1, +it.date.slice(8, 10) + 1);
      L.push(`DTSTART;VALUE=DATE:${dt(it.date)}`, `DTEND;VALUE=DATE:${dt(dk(d))}`);
    }
    if (it.rrule) L.push(`RRULE:${it.rrule}`);
    if (it.exdates && it.exdates.length) L.push(`EXDATE:${it.exdates.map(k => dt(k, it.time)).join(',')}`);
    if (it.loc) L.push(`LOCATION:${tx(it.loc)}`);
    if (it.desc) L.push(`DESCRIPTION:${tx(it.desc)}`);
    for (const a of it.alarms || []) L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${tx(it.title)}`, `TRIGGER:${a}`, 'END:VALARM');
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

root.LK_ICS = { parse, expand, analyze, build, kindOf, cleanName, dt };
if (typeof module !== 'undefined') module.exports = root.LK_ICS;
})(typeof window !== 'undefined' ? window : globalThis);
