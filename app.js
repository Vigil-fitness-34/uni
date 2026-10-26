/* Lernklar: Stundenplan, Lernplan, geführte Lern-Sessions, Erinnerungen. Alles lokal (localStorage), kein Server. */
(() => {
'use strict';

const KEY = 'lernklar-v1';
const ICS = window.LK_ICS;
const $ = (s, r = document) => r.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dk = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const pd = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, +k.slice(8, 10));
const addD = (k, n) => { const d = pd(k); d.setDate(d.getDate() + n); return dk(d); };
const diffD = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const today = () => dk();
const tmin = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + (m || 0); };
const fmtHM = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.round(m) % 60)}`;
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const WD = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
const WEEK = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];
const WDS = { mo: 'Mo', di: 'Di', mi: 'Mi', do: 'Do', fr: 'Fr', sa: 'Sa', so: 'So' };
const WDL = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag', so: 'Sonntag' };
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
const wdOf = k => WD[pd(k).getDay()];
const fmtDay = k => { const d = pd(k); return `${WDS[WD[d.getDay()]]}, ${d.getDate()}. ${MON[d.getMonth()]}`; };
const relLow = k => { const n = diffD(today(), k); return n === 0 ? 'heute' : n === 1 ? 'morgen' : n === -1 ? 'gestern' : 'am ' + fmtDay(k); };
const relDay = k => { const n = diffD(today(), k); return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n === -1 ? 'Gestern' : fmtDay(k); };
const KIND = {
  vl: { n: 'Vorlesung', s: 'VL', i: 'ph-chalkboard-teacher' },
  ue: { n: 'Übung', s: 'Übung', i: 'ph-pencil-simple-line' },
  tut: { n: 'Tutorium', s: 'Tut', i: 'ph-users-three' },
  sem: { n: 'Seminar', s: 'Seminar', i: 'ph-chats-circle' },
  prak: { n: 'Praktikum', s: 'Praktikum', i: 'ph-flask' },
  sonst: { n: 'Termin', s: 'Termin', i: 'ph-calendar-dot' }
};
const EXAMT = ['Klausur', 'Mündliche Prüfung', 'Abgabe', 'Referat', 'Testat'];
const COLORS = ['#5b5bd6', '#e5484d', '#12a594', '#f76b15', '#d6409f', '#3e9b4f', '#0090ff', '#a18072'];
const TASK = {
  lb: { n: 'Lernblock', i: 'ph-brain' },
  nb: { n: 'Vorlesung nachbereiten', i: 'ph-notebook' },
  ue: { n: 'Übungsblatt machen', i: 'ph-pencil-simple-line' }
};

/* ---------- State ---------- */
const defaults = () => ({
  v: 1,
  set: {
    name: '', theme: 'system', block: 25, dayMin: 60, lead: 15, nbMin: 20, ueMin: 45,
    days: { mo: '18:00', di: '18:00', mi: null, do: '18:00', fr: null, sa: null, so: '11:00' },
    icsUrl: ''
  },
  subjects: [],   // { id, name, color, topics: [{ id, t, done }] }
  events: [],     // Stundenplan-Reihen: { id, sid, kind, title, room, start, end, dates: [dk], src: 'ics'|'hand' }
  exams: [],      // { id, sid, type, date, time, room }
  sessions: [],   // { id, sid, date, min, note, type, ts }
  done: {},       // erledigte Plan-Aufgaben nach Schlüssel
  dayPlan: null,  // für heute eingefrorene Zuteilung der Lernblöcke
  notified: {}
});

let S;
try { S = JSON.parse(localStorage.getItem(KEY)); } catch (e) { S = null; }
if (!S || !S.set) S = defaults();
else {
  const d = defaults();
  S.set = Object.assign(d.set, S.set);
  S.set.days = Object.assign(d.set.days, S.set.days);
  for (const k of ['subjects', 'events', 'exams', 'sessions']) S[k] = S[k] || [];
  for (const k of ['done', 'notified']) S[k] = S[k] || {};
}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Speichern fehlgeschlagen. Speicher voll?'); } };

function applyTheme() {
  const t = S.set.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
applyTheme();

const ui = { tab: 'heute', planSeg: 'plan', imp: null, sub: null };
{
  const q = new URLSearchParams(location.search);
  if (['heute', 'plan', 'faecher', 'stats'].includes(q.get('tab'))) ui.tab = q.get('tab');
}

/* ---------- Daten-Helfer ---------- */
const subj = id => S.subjects.find(s => s.id === id);
const sName = id => (subj(id) || {}).name || 'Lernen';
const sColor = id => (subj(id) || {}).color || 'var(--accent)';
const occOn = k => S.events.filter(e => e.dates.includes(k)).sort((a, b) => a.start.localeCompare(b.start));
const futureExams = (from = today()) => S.exams.filter(x => x.date >= from).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
const nextExam = (sid, from = today()) => futureExams(from).find(x => x.sid === sid);
const lastStudied = sid => S.sessions.filter(s => s.sid === sid).reduce((m, s) => (s.date > m ? s.date : m), '');
const openTopics = s => (s.topics || []).filter(t => !t.done);
function findSubject(name) {
  const n = String(name || '').trim(); if (!n) return null;
  return S.subjects.find(s => s.name.toLowerCase() === n.toLowerCase()) || null;
}
function ensureSubject(name) {
  let s = findSubject(name);
  if (!s) { s = { id: uid(), name: String(name).trim(), color: COLORS[S.subjects.length % COLORS.length], topics: [] }; S.subjects.push(s); }
  return s;
}

/* ---------- Lernplan ----------
   Pro Tag: Termine aus dem Stundenplan, Vorlesung nachbereiten (am selben Tag),
   Übungsblatt (am Tag vor der Übung), Lernblöcke an Lerntagen.
   Lernblöcke gehen an das Fach mit der dringendsten Prüfung (offene Themen / Tage bis dahin),
   sonst an das Fach, das am längsten liegt. Die letzten 3 Tage vor einer Prüfung gehören ihr. */
function planSig() {
  return JSON.stringify([S.subjects.map(s => s.id), S.exams.map(x => [x.sid, x.date]), S.set.days, S.set.dayMin, S.set.block]);
}
function blockCount() { return Math.max(1, Math.round(S.set.dayMin / S.set.block)); }
function pickSubject(k, last, remain, used) {
  let best = null, bestSc = -1;
  for (const s of S.subjects) {
    let sc = 0;
    const ex = nextExam(s.id, k);
    if (ex) {
      const dd = diffD(k, ex.date);
      if (dd === 0) continue; // am Prüfungstag selbst kein Lernblock mehr
      if (dd <= 3) sc += 100 - dd;
      else if (dd <= 42) sc += (remain[s.id] + 2) * 12 / dd;
    }
    const since = last[s.id] ? diffD(last[s.id], k) : 21;
    sc += Math.min(since, 21) * 0.35;
    if (used.has(s.id)) sc *= 0.55;
    if (sc > bestSc) { bestSc = sc; best = s; }
  }
  return best;
}
function learnStart(k) {
  const t = S.set.days[wdOf(k)];
  if (!t) return null;
  let m = tmin(t);
  // nicht mitten in eine Veranstaltung legen
  for (const e of occOn(k)) if (tmin(e.start) < m + S.set.block && tmin(e.end) > m) m = tmin(e.end) + 15;
  return m;
}
function dayTasks(k, isToday, sim) {
  const tasks = [];
  // Vorlesungen nachbereiten (heute: auch die der letzten 3 Tage, wenn noch offen)
  for (let back = isToday ? 3 : 0; back >= 0; back--) {
    const kk = addD(k, -back);
    for (const e of occOn(kk)) if (e.kind === 'vl' && e.sid) {
      const key = `nb:${e.id}:${kk}`;
      if (back > 0 && S.done[key]) continue;
      tasks.push({ key, type: 'nb', sid: e.sid, min: S.set.nbMin, at: tmin(e.end), ref: kk, late: back > 0 });
    }
  }
  // Übungsblatt: am Tag vor der Übung (heute zusätzlich für Übungen heute und übermorgen)
  const ahead = isToday ? [0, 1, 2] : [1];
  for (const n of ahead) {
    const kk = addD(k, n);
    for (const e of occOn(kk)) if ((e.kind === 'ue' || e.kind === 'tut') && e.sid) {
      if (n === 0 && nowMin() > tmin(e.start)) continue;
      tasks.push({ key: `ue:${e.id}:${kk}`, type: 'ue', sid: e.sid, min: S.set.ueMin, at: null, ref: kk, forDay: kk, time: e.start });
    }
  }
  // Lernblöcke
  const start = S.subjects.length ? learnStart(k) : null;
  if (start != null) {
    let blocks;
    if (isToday && S.dayPlan && S.dayPlan.k === k && S.dayPlan.sig === planSig()) blocks = S.dayPlan.blocks;
    else {
      const used = new Set();
      blocks = [];
      for (let j = 0; j < blockCount(); j++) {
        const s = S.subjects.length ? pickSubject(k, sim.last, sim.remain, used) : null;
        if (s) { used.add(s.id); sim.last[s.id] = k; sim.remain[s.id] = Math.max(0, sim.remain[s.id] - 1); }
        blocks.push({ key: `lb:${k}:${j}`, sid: s ? s.id : null });
      }
      if (isToday) { S.dayPlan = { k, sig: planSig(), blocks }; persist(); }
    }
    // Thema pro Block: das nächste offene, das noch kein früherer (offener) Block belegt
    blocks.forEach((b, j) => {
      const ti = b.sid ? (sim.cnt[b.sid] || 0) : 0;
      if (b.sid && !S.done[b.key]) sim.cnt[b.sid] = ti + 1;
      if (isToday && b.sid) sim.last[b.sid] = k;
      tasks.push({ key: b.key, type: 'lb', sid: b.sid, min: S.set.block, at: start + j * (S.set.block + 10), ti });
    });
  }
  return { tasks, learnAt: start };
}
function planRange(from, n) {
  const sim = { last: {}, remain: {}, cnt: {} };
  for (const s of S.subjects) { sim.last[s.id] = lastStudied(s.id); sim.remain[s.id] = openTopics(s).length; }
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = addD(from, i);
    const { tasks, learnAt } = dayTasks(k, k === today(), sim);
    out.push({ k, evs: occOn(k), tasks, learnAt, exams: S.exams.filter(x => x.date === k) });
  }
  return out;
}
const todayPlan = () => planRange(today(), 1)[0];
function taskTitle(t) {
  if (t.type === 'lb') {
    const s = subj(t.sid); if (!s) return 'Lernblock';
    const open = openTopics(s), top = open[t.ti || 0];
    return top ? `${s.name}: ${top.t}` : open.length || !(s.topics || []).length ? s.name : `${s.name}: Wiederholen`;
  }
  if (t.type === 'nb') return `${sName(t.sid)} nachbereiten`;
  return `Übungsblatt ${sName(t.sid)}`;
}
function taskSub(t) {
  if (t.type === 'lb') {
    const ex = t.sid && nextExam(t.sid);
    const d = ex ? diffD(today(), ex.date) : null;
    return `${t.min} Min Lernblock${ex ? ` · ${ex.type || 'Prüfung'} in ${d} ${d === 1 ? 'Tag' : 'Tagen'}` : ''}`;
  }
  if (t.type === 'nb') return `${t.min} Min · Vorlesung ${t.late ? `von ${relLow(t.ref).replace(/^am /, "")}` : `bis ${fmtHM(t.at)}`}`;
  return `${t.min} Min · Übung ${relLow(t.forDay)}, ${t.time}`;
}

/* ---------- Maskottchen „Ole“ (Eule mit Doktorhut) ---------- */
function ole(mood = 'ok', book = false) {
  const ink = '#16181c';
  const eyes = {
    ok: `<circle cx="40" cy="48" r="5.4" fill="${ink}"/><circle cx="60" cy="48" r="5.4" fill="${ink}"/><circle cx="41.8" cy="46.2" r="1.8" fill="#fff"/><circle cx="61.8" cy="46.2" r="1.8" fill="#fff"/>`,
    happy: `<path d="M33.5 50 q6.5 -8 13 0 M53.5 50 q6.5 -8 13 0" stroke="${ink}" stroke-width="3.6" fill="none" stroke-linecap="round"/>`,
    sleepy: `<circle cx="40" cy="51" r="4.4" fill="${ink}"/><circle cx="60" cy="51" r="4.4" fill="${ink}"/><path d="M28.4 48 a11.6 11.6 0 0 1 23.2 0 Z M48.4 48 a11.6 11.6 0 0 1 23.2 0 Z" fill="var(--accent)"/><path d="M29 48 h22 M49 48 h22" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`,
    stress: `<circle cx="40" cy="48" r="3.2" fill="${ink}"/><circle cx="60" cy="48" r="3.2" fill="${ink}"/>`
  }[mood] || '';
  const extra = mood === 'stress' ? `<path class="drop" d="M82 30 q5 7 0 10.5 q-5 -3.5 0 -10.5z" fill="#7cc4ff"/>` :
    mood === 'sleepy' ? `<text class="zz" x="78" y="34" font-size="14" font-weight="800" fill="var(--text)" font-family="inherit">z</text>` : '';
  const bk = book ? `<g class="book"><path d="M30 74 L50 78 L70 74 L70 88 L50 92 L30 88 Z" fill="#fff"/><path d="M50 78 L50 92" stroke="${ink}" stroke-opacity=".25" stroke-width="1.6"/><path d="M30 74 L50 78 L70 74" stroke="#ffb547" stroke-width="2.4" fill="none" stroke-linejoin="round"/></g>` : '';
  return `<svg viewBox="0 0 100 100" class="ole ${mood}" aria-hidden="true"><g class="bodyg">
    <path d="M23 40 L25 19 L37 30 Z M77 40 L75 19 L63 30 Z" fill="var(--accent)"/>
    <ellipse cx="50" cy="57" rx="30" ry="31" fill="var(--accent)"/>
    <ellipse cx="38" cy="36" rx="8" ry="4.5" fill="#fff" opacity=".22" transform="rotate(-25 38 36)"/>
    <ellipse cx="50" cy="70" rx="17.5" ry="15" fill="#fff" opacity=".2"/>
    <path d="M43 67 q3 3 6 0 M51 67 q3 3 6 0 M47 74 q3 3 6 0" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse class="wing l" cx="21.5" cy="62" rx="6.5" ry="13" fill="#000" opacity=".14"/><ellipse class="wing r" cx="78.5" cy="62" rx="6.5" ry="13" fill="#000" opacity=".14"/>
    <circle cx="40" cy="48" r="11.6" fill="#fff"/><circle cx="60" cy="48" r="11.6" fill="#fff"/>
    <g class="eyes">${eyes}</g>
    <path d="M46 57 L54 57 L50 63.5 Z" fill="#ffb547"/>
    <path d="M40 87.5 q3 4 6 0 M54 87.5 q3 4 6 0" stroke="#ffb547" stroke-width="3.4" fill="none" stroke-linecap="round"/>
    <g class="cap"><rect x="40" y="25" width="20" height="8" rx="2.5" fill="${ink}"/><path d="M27 25 L50 15 L73 25 L50 33 Z" fill="${ink}"/><path class="tassel" d="M71 25.5 L72.5 38" stroke="#ffb547" stroke-width="2.2" stroke-linecap="round"/><circle cx="72.6" cy="39.6" r="2.8" fill="#ffb547"/></g>
    ${bk}</g>${extra}</svg>`;
}
const LINES = {
  setup: ['Hi! Ich bin Ole. Trag deine Fächer und Prüfungen ein, dann plane ich für dich.'],
  free: ['Heute ist kein Lerntag. Genieß es, morgen geht’s weiter.', 'Frei! Dein Gehirn lädt gerade auf.', 'Kein Lernplan heute. Ich denk trotzdem schon mal nach.'],
  start: ['Heute dran: {next}. Nur anfangen, der Rest kommt von allein.', 'Erst anfangen, dann kommt die Motivation. Klappt immer.', '{n} Sachen für heute. Wir machen das zusammen.'],
  mid: ['Läuft! Noch {n}.', 'Stark. Noch {n}, dann ist Feierabend.', 'Ich bin stolz auf dich. Noch {n}.'],
  done: ['Alles erledigt. Mehr kann eine Eule nicht verlangen.', 'Heute geschafft! Dein Prüfungs-Ich sagt danke.', 'Feierabend fürs Hirn. Gut gemacht.'],
  exam: ['{exam} in {d} Tagen. Jetzt zählt jeder Block.', 'Endspurt {exam}: noch {d} Tage. Ich glaub an dich.']
};
function moodNow(p) {
  const dayNum = Math.floor(Date.now() / 864e5);
  const pick = (arr, o = 0) => arr[(dayNum + o) % arr.length];
  if (!S.subjects.length) return { mood: 'ok', line: LINES.setup[0] };
  const total = p.tasks.length, done = p.tasks.filter(t => S.done[t.key]).length;
  const open = p.tasks.filter(t => !S.done[t.key]);
  const ex = futureExams().find(x => diffD(today(), x.date) > 0);
  const exD = ex ? diffD(today(), ex.date) : 99;
  if (!total) return { mood: 'sleepy', line: pick(LINES.free) };
  if (done >= total) return { mood: 'happy', line: pick(LINES.done, done) };
  if (exD <= 5 && done === 0) return { mood: 'stress', line: pick(LINES.exam).replace('{exam}', `${ex.type || 'Prüfung'} ${sName(ex.sid)}`).replace('{d}', exD) };
  const arr = done ? LINES.mid : LINES.start;
  return { mood: done ? 'ok' : 'ok', line: pick(arr, done).replace('{n}', open.length).replace('{next}', taskTitle(open[0])) };
}

/* ---------- Render ---------- */
const view = $('#view');
function render() {
  document.querySelectorAll('.tab[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  const v = { heute: vHeute, plan: vPlan, faecher: vFaecher, stats: vStats }[ui.tab];
  view.innerHTML = v();
}
const topBar = (title, sub) => `<header class="top"><div><p class="date">${esc(sub)}</p><h1>${esc(title)}</h1></div>
  <button class="icon-btn mobile-only" data-act="settings" aria-label="Einstellungen"><i class="ph-bold ph-gear-six"></i></button></header>`;

function taskRow(t, interactive = true) {
  const done = !!S.done[t.key];
  return `<div class="item task ${done ? 'done' : ''}" style="--c:${sColor(t.sid)}">
    <button class="check" data-act="toggleTask" data-key="${t.key}" aria-label="Erledigt"><i class="ph-bold ph-check"></i></button>
    <div class="it-main"><b>${esc(taskTitle(t))}</b><span class="muted small">${t.at != null && t.type === 'lb' ? `${fmtHM(t.at)} · ` : ''}${esc(taskSub(t))}</span></div>
    ${interactive && !done ? `<button class="play" data-act="startTask" data-key="${t.key}" aria-label="Starten"><i class="ph-fill ph-play"></i></button>` : ''}
  </div>`;
}
function eventRow(e, k) {
  const now = k === today() ? nowMin() : -1;
  const live = now >= tmin(e.start) && now < tmin(e.end), past = k === today() && now >= tmin(e.end);
  return `<div class="item ev ${live ? 'live' : ''} ${past ? 'past' : ''}" style="--c:${sColor(e.sid)}">
    <div class="time num"><b>${e.start}</b><span>${e.end}</span></div>
    <div class="it-main"><b>${esc(e.sid ? sName(e.sid) : e.title)}</b><span class="muted small"><i class="ph-bold ${KIND[e.kind].i}"></i> ${KIND[e.kind].n}${e.room ? ` · ${esc(e.room)}` : ''}${live ? ' · <em>läuft gerade</em>' : ''}</span></div>
  </div>`;
}
function examRow(x) {
  const d = diffD(today(), x.date);
  return `<button class="item exam" data-act="editSubject" data-id="${x.sid}" style="--c:${sColor(x.sid)}">
    <div class="count num"><b>${d}</b><span>${d === 1 ? 'Tag' : 'Tage'}</span></div>
    <div class="it-main"><b>${esc(x.type || 'Prüfung')} ${esc(sName(x.sid))}</b><span class="muted small">${fmtDay(x.date)}${x.time ? `, ${x.time} Uhr` : ''}${x.room ? ` · ${esc(x.room)}` : ''}</span></div>
  </button>`;
}

function vHeute() {
  const p = todayPlan(), mo = moodNow(p);
  const total = p.tasks.length, done = p.tasks.filter(t => S.done[t.key]).length;
  const next = p.tasks.find(t => !S.done[t.key]);
  const hi = (() => { const h = new Date().getHours(); return h < 11 ? 'Guten Morgen' : h < 18 ? 'Hallo' : 'Guten Abend'; })();
  const timeline = [
    ...p.evs.map(e => ({ m: tmin(e.start), h: eventRow(e, p.k) })),
    ...p.tasks.map(t => ({ m: t.at != null ? t.at : -1, h: taskRow(t) }))
  ].sort((a, b) => a.m - b.m);
  const exams = futureExams().slice(0, 4);
  const setup = setupSteps();
  return `${topBar(`${hi}${S.set.name ? `, ${S.set.name}` : ''}`, fmtDay(p.k))}
  <div class="today">
    <section class="hero">
      <div class="hero-top"><div class="mascot">${ole(mo.mood, mo.mood === 'happy')}</div><p class="bubble">${esc(mo.line)}</p></div>
      ${total ? `<div class="hero-mid"><div class="prog"><b class="num">${done}</b><span class="muted">von ${total} erledigt</span></div>${streak() > 1 ? `<span class="pill"><i class="ph-fill ph-fire"></i>${streak()} Lerntage in Folge</span>` : ''}</div>
      <div class="bar"><i style="--w:${Math.round(done / total * 100)}%"></i></div>` : ''}
      <div class="hero-actions">
        ${next ? `<button class="btn primary" data-act="startTask" data-key="${next.key}"><i class="ph-fill ph-play"></i>Los: ${esc(taskTitle(next))}</button>`
          : S.subjects.length ? `<button class="btn primary" data-act="freeSession"><i class="ph-fill ph-play"></i>Freie Lern-Session</button>`
          : `<button class="btn primary" data-act="newSubject"><i class="ph-bold ph-plus"></i>Erstes Fach anlegen</button>`}
      </div>
    </section>
    ${setup ? `<section class="card"><div class="card-head"><h2>In 2 Minuten eingerichtet</h2></div><div class="setup">${setup}</div></section>` : ''}
    <section class="card"><div class="card-head"><h2>Dein Tag</h2>${p.learnAt != null ? `<span class="muted small">Lernzeit ab ${fmtHM(p.learnAt)}</span>` : ''}</div>
      ${timeline.length ? `<div class="list">${timeline.map(x => x.h).join('')}</div>` : `<p class="muted">Heute keine Termine und nichts zu lernen. ${S.subjects.length ? 'Frei!' : ''}</p>`}
    </section>
    ${exams.length ? `<section class="card"><div class="card-head"><h2>Prüfungen</h2><button class="link" data-tab-go="faecher">Alle Fächer</button></div><div class="list">${exams.map(examRow).join('')}</div></section>` : ''}
    ${remBanner()}
  </div>`;
}
function setupSteps() {
  const steps = [
    { ok: S.subjects.length > 0, t: 'Fächer anlegen', act: 'newSubject' },
    { ok: S.exams.length > 0, t: 'Prüfungstermine eintragen', act: 'goFaecher' },
    { ok: S.events.length > 0, t: 'Stundenplan aus dem Uni-Kalender holen', act: 'importIcs' },
    { ok: localStorage.getItem('lernklar-setup-rem') === '1', t: 'Erinnerungen einschalten', act: 'reminders' }
  ];
  if (steps.every(s => s.ok)) return '';
  return steps.map((s, i) => `<button class="srow ${s.ok ? 'ok' : ''}" data-act="${s.act}"><span class="n">${s.ok ? '<i class="ph-bold ph-check"></i>' : i + 1}</span><span>${s.t}</span><i class="ph-bold ph-caret-right"></i></button>`).join('');
}
function remBanner() {
  if (!('Notification' in window) || Notification.permission !== 'default' || !S.subjects.length) return '';
  return `<section class="card soft"><div class="row" style="gap:14px"><i class="ph-bold ph-bell-ringing big"></i><div style="flex:1"><b>Soll Ole dich erinnern?</b><p class="muted small">Vor Vorlesungen, Übungen und zur Lernzeit.</p></div><button class="btn sm primary" data-act="reminders">Einrichten</button></div></section>`;
}

function vPlan() {
  const seg = `<div class="seg wide" style="margin-bottom:16px"><button class="${ui.planSeg === 'plan' ? 'on' : ''}" data-act="planSeg" data-v="plan"><i class="ph-bold ph-list-checks"></i>Lernplan</button><button class="${ui.planSeg === 'stunden' ? 'on' : ''}" data-act="planSeg" data-v="stunden"><i class="ph-bold ph-calendar-blank"></i>Stundenplan</button></div>`;
  return topBar(ui.planSeg === 'plan' ? 'Lernplan' : 'Stundenplan', ui.planSeg === 'plan' ? 'Die nächsten 14 Tage' : 'Vorlesungen, Übungen, Tutorien') + seg + (ui.planSeg === 'plan' ? planList() : stundenplan());
}
function planList() {
  const days = planRange(today(), 14);
  if (!S.subjects.length && !S.events.length) return `<div class="card empty"><div class="mascot sm">${ole('ok')}</div><p>Leg zuerst deine Fächer an oder hol dir den Stundenplan aus dem Uni-Kalender. Dann baue ich den Plan.</p><div class="row wrap"><button class="btn primary" data-act="newSubject"><i class="ph-bold ph-plus"></i>Fach anlegen</button><button class="btn" data-act="importIcs"><i class="ph-bold ph-calendar-plus"></i>Kalender importieren</button></div></div>`;
  return `<div class="days">${days.map(d => {
    const items = [
      ...d.exams.map(x => ({ m: x.time ? tmin(x.time) : -2, h: `<div class="item exam-day" style="--c:${sColor(x.sid)}"><i class="ph-fill ph-seal-warning"></i><div class="it-main"><b>${esc(x.type || 'Prüfung')} ${esc(sName(x.sid))}</b><span class="muted small">${x.time ? `${x.time} Uhr` : 'ganztägig'}${x.room ? ` · ${esc(x.room)}` : ''}</span></div></div>` })),
      ...d.evs.map(e => ({ m: tmin(e.start), h: eventRow(e, d.k) })),
      ...d.tasks.map(t => ({ m: t.at != null ? t.at : -1, h: taskRow(t, d.k === today()) }))
    ].sort((a, b) => a.m - b.m);
    const lern = S.set.days[wdOf(d.k)];
    return `<section class="card day ${d.k === today() ? 'is-today' : ''}"><div class="card-head"><h3>${relDay(d.k)}${diffD(today(), d.k) > 1 ? '' : ` <span class="muted small">${fmtDay(d.k)}</span>`}</h3>${lern ? `<span class="pill"><i class="ph-bold ph-brain"></i>Lerntag</span>` : ''}</div>
      ${items.length ? `<div class="list">${items.map(x => x.h).join('')}</div>` : `<p class="muted small">Frei.</p>`}</section>`;
  }).join('')}</div>`;
}
function stundenplan() {
  const k0 = today();
  const live = S.events.filter(e => e.dates.some(x => x >= k0));
  const byWd = {};
  for (const e of live) { const w = wdOf(e.dates.find(x => x >= k0)); (byWd[w] = byWd[w] || []).push(e); }
  const actions = `<div class="row wrap" style="margin-bottom:16px">
    <button class="btn primary sm" data-act="importIcs"><i class="ph-bold ph-calendar-plus"></i>Uni-Kalender importieren</button>
    <button class="btn sm" data-act="newEvent"><i class="ph-bold ph-plus"></i>Termin von Hand</button>
    ${S.set.icsUrl ? `<button class="btn sm ghost" data-act="syncUrl"><i class="ph-bold ph-arrows-clockwise"></i>Neu laden</button>` : ''}
  </div>`;
  if (!live.length) return actions + `<div class="card empty"><div class="mascot sm">${ole('ok', true)}</div><p><b>So holst du deinen Stundenplan:</b> Im Uni-Portal (Stud.IP, ILIAS, Moodle, HISinOne, TUMonline, …) gibt es meist „Kalender exportieren“ oder „iCal“. Lade die .ics-Datei herunter und wähle sie hier aus. Oder trag deine Termine von Hand ein.</p></div>`;
  return actions + `<div class="stack">${WEEK.filter(w => byWd[w]).map(w => `<section class="card"><div class="card-head"><h3>${WDL[w]}</h3></div><div class="list">${byWd[w].sort((a, b) => a.start.localeCompare(b.start)).map(e => {
    const left = e.dates.filter(x => x >= k0).length;
    return `<button class="item ev" data-act="editEvent" data-id="${e.id}" style="--c:${sColor(e.sid)}"><div class="time num"><b>${e.start}</b><span>${e.end}</span></div><div class="it-main"><b>${esc(e.sid ? sName(e.sid) : e.title)}</b><span class="muted small"><i class="ph-bold ${KIND[e.kind].i}"></i> ${KIND[e.kind].n}${e.room ? ` · ${esc(e.room)}` : ''} · noch ${left}×</span></div><i class="ph-bold ph-caret-right muted"></i></button>`;
  }).join('')}</div></section>`).join('')}</div>`;
}

function vFaecher() {
  const k0 = today();
  const cards = S.subjects.map(s => {
    const ex = nextExam(s.id), d = ex ? diffD(k0, ex.date) : null;
    const tp = s.topics || [], dn = tp.filter(t => t.done).length;
    const wk = minutesSince(addD(k0, -6), s.id);
    const evs = S.events.filter(e => e.sid === s.id && e.dates.some(x => x >= k0));
    return `<section class="card subj" style="--c:${s.color}">
      <button class="subj-head" data-act="editSubject" data-id="${s.id}"><span class="dot"></span><h2>${esc(s.name)}</h2><i class="ph-bold ph-pencil-simple muted"></i></button>
      <div class="subj-meta">
        ${ex ? `<span class="pill strong"><i class="ph-bold ph-calendar-check"></i>${esc(ex.type || 'Prüfung')} in ${d} ${d === 1 ? 'Tag' : 'Tagen'}</span>` : `<span class="pill">Keine Prüfung eingetragen</span>`}
        ${evs.length ? `<span class="pill">${evs.map(e => KIND[e.kind].s).filter((x, i, a) => a.indexOf(x) === i).join(' + ')}</span>` : ''}
        <span class="pill num">${wk} Min diese Woche</span>
      </div>
      ${tp.length ? `<div class="bar thin"><i style="--w:${Math.round(dn / tp.length * 100)}%;background:var(--c)"></i></div><p class="muted small">${dn} von ${tp.length} Themen durch</p>` : `<p class="muted small">Tipp: Themen eintragen (z. B. Kapitel aus dem Skript), dann weiß Ole, was noch offen ist.</p>`}
      <div class="row" style="margin-top:12px"><button class="btn sm primary" data-act="freeSession" data-id="${s.id}"><i class="ph-fill ph-play"></i>Jetzt lernen</button><button class="btn sm" data-act="editSubject" data-id="${s.id}">Themen & Prüfung</button></div>
    </section>`;
  }).join('');
  return topBar('Fächer', `${S.subjects.length} ${S.subjects.length === 1 ? 'Fach' : 'Fächer'}`) +
    `<div class="grid2">${cards}<button class="card add-card" data-act="newSubject"><i class="ph-bold ph-plus"></i><b>Fach hinzufügen</b></button></div>`;
}

function minutesSince(from, sid) { return S.sessions.filter(s => s.date >= from && (!sid || s.sid === sid)).reduce((a, s) => a + s.min, 0); }
function streak() {
  // Lerntage in Folge mit mindestens einer Session; Tage ohne Lernplan unterbrechen nicht
  const days = new Set(S.sessions.map(s => s.date));
  let n = 0, k = today();
  if (!days.has(k)) k = addD(k, -1);
  for (let i = 0; i < 120; i++, k = addD(k, -1)) {
    if (days.has(k)) n++;
    else if (S.set.days[wdOf(k)]) break;
  }
  return n;
}
function vStats() {
  const k0 = today(), from = addD(k0, -6);
  const week = [];
  for (let i = 6; i >= 0; i--) { const k = addD(k0, -i); week.push({ k, m: S.sessions.filter(s => s.date === k).reduce((a, s) => a + s.min, 0) }); }
  const max = Math.max(30, ...week.map(w => w.m));
  const per = S.subjects.map(s => ({ s, m: minutesSince(from, s.id) })).sort((a, b) => b.m - a.m);
  const pm = Math.max(1, ...per.map(p => p.m));
  const recent = S.sessions.slice().sort((a, b) => b.ts - a.ts).slice(0, 8);
  return topBar('Fortschritt', 'Die letzten 7 Tage') + `<div class="grid2">
    <section class="card"><div class="goals">
      <div class="goal"><b class="num">${minutesSince(from)}</b><small>Minuten gelernt</small></div>
      <div class="goal"><b class="num">${streak()}</b><small>Lerntage in Folge</small></div>
      <div class="goal"><b class="num">${S.sessions.filter(s => s.date >= from).length}</b><small>Sessions</small></div>
      <div class="goal"><b class="num">${S.subjects.reduce((a, s) => a + (s.topics || []).filter(t => t.done).length, 0)}</b><small>Themen durch</small></div>
    </div></section>
    <section class="card"><div class="card-head"><h2>Woche</h2></div><div class="chart">${week.map(w => `<div class="col ${w.k === k0 ? 'now' : ''}"><i style="--h:${Math.round(w.m / max * 100)}%"></i><span>${WDS[wdOf(w.k)]}</span></div>`).join('')}</div></section>
    <section class="card"><div class="card-head"><h2>Pro Fach</h2></div>${per.length ? per.map(p => `<div class="hbar" style="--c:${p.s.color}"><span>${esc(p.s.name)}</span><div class="bar thin"><i style="--w:${Math.round(p.m / pm * 100)}%;background:var(--c)"></i></div><b class="num">${p.m}</b></div>`).join('') : '<p class="muted">Noch keine Fächer.</p>'}</section>
    <section class="card"><div class="card-head"><h2>Wo du aufgehört hast</h2></div>${recent.length ? `<div class="list">${recent.map(s => `<div class="item" style="--c:${sColor(s.sid)}"><span class="dot"></span><div class="it-main"><b>${esc(sName(s.sid))} <span class="muted small num">· ${s.min} Min · ${relDay(s.date)}</span></b>${s.note ? `<span class="small">„${esc(s.note)}“</span>` : ''}</div></div>`).join('')}</div>` : '<p class="muted">Nach deiner ersten Session steht hier, wo du weitermachst.</p>'}</section>
  </div>`;
}

/* ---------- Sheets ---------- */
const sheetEl = $('#sheet');
function openSheet(html) {
  sheetEl.innerHTML = `<div class="sheet-wrap"><div class="sheet-bg" data-act="closeSheet"></div><div class="sheet" role="dialog"><div class="grab"></div>${html}</div></div>`;
  sheetEl.hidden = false;
}
function closeSheet() { sheetEl.hidden = true; sheetEl.innerHTML = ''; ui.sub = null; ui.imp = null; }
const sheetHead = t => `<div class="sheet-head"><h2>${t}</h2><button class="icon-btn" data-act="closeSheet" aria-label="Schließen"><i class="ph-bold ph-x"></i></button></div>`;
const colorPick = cur => `<div class="colors">${COLORS.map(c => `<button class="sw ${c === cur ? 'on' : ''}" data-act="pickColor" data-c="${c}" style="background:${c}" aria-label="Farbe"></button>`).join('')}</div>`;

function subjectSheet(id) {
  const s = id ? subj(id) : null;
  ui.sub = id || null;
  if (!s) {
    openSheet(`${sheetHead('Neues Fach')}<div class="form">
      <label class="f">Name<input class="input" id="sName" placeholder="z. B. Statistik" autocomplete="off"></label>
      <label class="f">Prüfung (optional)<div class="two"><input class="input" type="date" id="exDate"><input class="input" type="time" id="exTime"></div></label>
      <button class="btn primary block" data-act="saveNewSubject">Anlegen</button></div>`);
    setTimeout(() => $('#sName') && $('#sName').focus(), 60);
    return;
  }
  const ex = S.exams.filter(x => x.sid === s.id).sort((a, b) => a.date.localeCompare(b.date));
  openSheet(`${sheetHead(esc(s.name))}<div class="form">
    <label class="f">Name<input class="input" data-sub="name" value="${esc(s.name)}"></label>
    <div class="f"><span>Farbe</span>${colorPick(s.color)}</div>
    <div class="set-sec"><h3>Prüfungen & Abgaben</h3>
      ${ex.map(x => `<div class="row exrow"><select class="input" data-ex="${x.id}" data-k="type">${EXAMT.map(t => `<option ${t === (x.type || 'Klausur') ? 'selected' : ''}>${t}</option>`).join('')}</select><input class="input" type="date" data-ex="${x.id}" data-k="date" value="${x.date}"><input class="input" type="time" data-ex="${x.id}" data-k="time" value="${x.time || ''}"><button class="x-btn" data-act="delExam" data-id="${x.id}" aria-label="Löschen"><i class="ph-bold ph-trash"></i></button></div>`).join('') || '<p class="muted small">Noch keine Prüfung. Ole plant dann nur nach „wie lange liegt das Fach schon“.</p>'}
      <div class="row exrow"><select class="input" id="nxType">${EXAMT.map(t => `<option>${t}</option>`).join('')}</select><input class="input" type="date" id="nxDate"><input class="input" type="time" id="nxTime"><button class="add-btn" data-act="addExam" aria-label="Prüfung hinzufügen"><i class="ph-bold ph-plus"></i></button></div>
    </div>
    <div class="set-sec"><h3>Themen <span class="muted small">(Kapitel, Foliensätze, Übungsblätter)</span></h3>
      <div class="topics">${(s.topics || []).map(t => `<div class="topic ${t.done ? 'done' : ''}"><button class="check" data-act="toggleTopic" data-id="${t.id}"><i class="ph-bold ph-check"></i></button><span>${esc(t.t)}</span><button class="x-btn" data-act="delTopic" data-id="${t.id}" aria-label="Löschen"><i class="ph-bold ph-x"></i></button></div>`).join('')}</div>
      <div class="add-row"><input class="input" id="nTopic" placeholder="Neues Thema, Enter für das nächste" autocomplete="off"><button class="add-btn" data-act="addTopic" aria-label="Thema hinzufügen"><i class="ph-bold ph-plus"></i></button></div>
      <button class="link" data-act="bulkTopics">Mehrere auf einmal einfügen</button>
    </div>
    <div class="set-sec"><button class="btn ghost block danger" data-act="delSubject" data-id="${s.id}"><i class="ph-bold ph-trash"></i>Fach löschen</button></div>
  </div>`);
}

function eventSheet(id) {
  const e = id ? S.events.find(x => x.id === id) : null;
  const subjOpts = (sel) => `<option value="">– Fach wählen –</option>${S.subjects.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}<option value="__new">+ Neues Fach …</option>`;
  const kinds = sel => Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.n}</option>`).join('');
  if (e) {
    const k0 = today(), left = e.dates.filter(x => x >= k0);
    openSheet(`${sheetHead(esc(e.sid ? sName(e.sid) : e.title))}<div class="form">
      <p class="muted small">${esc(e.title)} · ${WDL[wdOf(left[0] || e.dates[0])]} ${e.start}–${e.end} · noch ${left.length} Termine bis ${left.length ? fmtDay(left[left.length - 1]) : '–'}</p>
      <div class="two"><label class="f">Fach<select class="input" data-evf="sid">${subjOpts(e.sid)}</select></label><label class="f">Art<select class="input" data-evf="kind">${kinds(e.kind)}</select></label></div>
      <label class="f">Raum<input class="input" data-evf="room" value="${esc(e.room || '')}"></label>
      <div class="two"><label class="f">Von<input class="input" type="time" data-evf="start" value="${e.start}"></label><label class="f">Bis<input class="input" type="time" data-evf="end" value="${e.end}"></label></div>
      <input type="hidden" id="evId" value="${e.id}">
      <button class="btn ghost block danger" data-act="delEvent" data-id="${e.id}"><i class="ph-bold ph-trash"></i>Aus dem Stundenplan löschen</button>
    </div>`);
    return;
  }
  const until = addD(today(), 7 * 15);
  openSheet(`${sheetHead('Termin von Hand')}<div class="form">
    <div class="two"><label class="f">Fach<select class="input" id="neSid">${subjOpts(S.subjects[0] && S.subjects[0].id)}</select></label><label class="f">Art<select class="input" id="neKind">${kinds('vl')}</select></label></div>
    <label class="f" id="neNewWrap" hidden>Neues Fach<input class="input" id="neNew" placeholder="z. B. Mikroökonomie"></label>
    <div class="two"><label class="f">Wochentag<select class="input" id="neWd">${WEEK.map(w => `<option value="${w}">${WDL[w]}</option>`).join('')}</select></label><label class="f">Raum<input class="input" id="neRoom" placeholder="optional"></label></div>
    <div class="two"><label class="f">Von<input class="input" type="time" id="neStart" value="10:15"></label><label class="f">Bis<input class="input" type="time" id="neEnd" value="11:45"></label></div>
    <div class="two"><label class="f">Wöchentlich bis<input class="input" type="date" id="neUntil" value="${until}"></label><label class="f">Rhythmus<select class="input" id="neIv"><option value="1">jede Woche</option><option value="2">alle 2 Wochen</option></select></label></div>
    <button class="btn primary block" data-act="saveEvent">Eintragen</button>
  </div>`);
}

function importSheet(res, srcName) {
  ui.imp = res;
  const names = [...new Set([...S.subjects.map(s => s.name), ...res.series.map(g => g.subj)])];
  const kinds = sel => Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v.n}</option>`).join('');
  openSheet(`${sheetHead('Kalender übernehmen')}<div class="form">
    <p class="muted small">${esc(srcName)}: ${res.series.length} Veranstaltungen${res.exams.length ? ` und ${res.exams.length} Prüfungstermine` : ''} gefunden. Prüf kurz Fach und Art, gleiche Fachnamen werden zusammengelegt.</p>
    <datalist id="subjNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="imp-list">${res.series.map((g, i) => `<div class="imp ${g.skip ? 'off' : ''}">
      <label class="tick"><input type="checkbox" data-imp="${i}" data-k="use" ${g.skip ? '' : 'checked'}><span></span></label>
      <div class="imp-main"><b>${esc(g.title)}</b><span class="muted small num">${WDS[WD[g.wd]]} ${g.start}–${g.end}${g.room ? ` · ${esc(g.room)}` : ''} · ${g.dates.length}×</span>
        <div class="two"><input class="input sm" list="subjNames" data-imp="${i}" data-k="subj" value="${esc(g.subj)}"><select class="input sm" data-imp="${i}" data-k="kind">${kinds(g.kind)}</select></div></div>
    </div>`).join('')}</div>
    ${res.exams.length ? `<div class="set-sec"><h3>Prüfungen</h3>${res.exams.map((x, i) => `<div class="imp"><label class="tick"><input type="checkbox" data-impx="${i}" checked><span></span></label><div class="imp-main"><b>${esc(x.title)}</b><span class="muted small">${fmtDay(x.date)}${x.time ? ` · ${x.time}` : ''}</span><input class="input sm" list="subjNames" data-impx="${i}" data-k="subj" value="${esc(x.subj)}"></div></div>`).join('')}</div>` : ''}
    <button class="btn primary block" data-act="applyImport"><i class="ph-bold ph-check"></i>Übernehmen</button>
    ${S.events.some(e => e.src === 'ics') ? '<p class="muted small">Ein früher importierter Kalender wird dabei ersetzt. Termine von Hand bleiben.</p>' : ''}
  </div>`);
}

function importChooser() {
  openSheet(`${sheetHead('Uni-Kalender importieren')}<div class="form">
    <p class="muted">Im Uni-Portal findest du meist <b>„Kalender exportieren“</b>, <b>„iCal“</b> oder <b>„Stundenplan abonnieren“</b> (Stud.IP, ILIAS, Moodle, HISinOne, TUMonline, …). Ole liest daraus Vorlesungen, Übungen, Tutorien und Prüfungen.</p>
    <button class="btn primary block" data-act="pickIcs"><i class="ph-bold ph-file-arrow-up"></i>.ics-Datei auswählen</button>
    <div class="set-sec"><label class="f">Oder Kalender-Link (https:// oder webcal://)<input class="input" id="icsUrl" value="${esc(S.set.icsUrl)}" placeholder="https://…/calendar.ics" autocomplete="off"></label>
      <button class="btn block" data-act="loadUrl"><i class="ph-bold ph-link"></i>Link laden</button>
      <p class="muted small">Manche Unis blockieren das direkte Laden aus einer Web-App. Dann klappt die Datei immer.</p></div>
  </div>`);
}

function settingsSheet() {
  const st = S.set;
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  openSheet(`${sheetHead('Einstellungen')}<div class="form">
    <div class="set-sec"><label class="f">Dein Name<input class="input" data-set="name" value="${esc(st.name)}" placeholder="Wie soll Ole dich nennen?"></label>
      <div class="f"><span>Aussehen</span><div class="seg">${[['system', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([v, l]) => `<button class="${st.theme === v ? 'on' : ''}" data-act="theme" data-v="${v}">${l}</button>`).join('')}</div></div></div>
    <div class="set-sec"><h3>Lerntage</h3><p class="muted small">An diesen Tagen plant Ole Lernblöcke ein, ab der Uhrzeit (verschiebt sich nach hinten, wenn da eine Vorlesung ist).</p>
      <div class="days-pick">${WEEK.map(w => `<div class="dp ${st.days[w] ? 'on' : ''}"><button data-act="toggleDay" data-w="${w}">${WDS[w]}</button></div>`).join('')}</div>
      <div class="day-times">${WEEK.filter(w => st.days[w]).map(w => `<label class="dt"><span>${WDL[w]}</span><input class="input sm" type="time" data-day="${w}" value="${st.days[w]}"></label>`).join('')}</div>
      <div class="three"><label class="f">Pro Lerntag<select class="input" data-set="dayMin">${[30, 45, 60, 90, 120, 180].map(n => `<option value="${n}" ${n === st.dayMin ? 'selected' : ''}>${n} Min</option>`).join('')}</select></label>
        <label class="f">Block<select class="input" data-set="block">${[20, 25, 30, 45, 50].map(n => `<option value="${n}" ${n === st.block ? 'selected' : ''}>${n} Min</option>`).join('')}</select></label>
        <label class="f">Übungsblatt<select class="input" data-set="ueMin">${[30, 45, 60, 90].map(n => `<option value="${n}" ${n === st.ueMin ? 'selected' : ''}>${n} Min</option>`).join('')}</select></label></div></div>
    <div class="set-sec"><h3>Erinnerungen</h3>
      <p class="muted small">${perm === 'granted' ? 'Benachrichtigungen sind an.' : perm === 'denied' ? 'Benachrichtigungen sind im Browser blockiert. In den Website-Einstellungen wieder erlauben.' : perm === 'unsupported' ? 'Dieser Browser kann keine Benachrichtigungen. Am iPhone: Lernklar erst zum Home-Bildschirm hinzufügen.' : 'Noch nicht erlaubt.'}</p>
      <label class="f">Vor Vorlesung/Übung erinnern<select class="input" data-set="lead">${[5, 10, 15, 30, 60].map(n => `<option value="${n}" ${n === st.lead ? 'selected' : ''}>${n} Min vorher</option>`).join('')}</select></label>
      <button class="btn block" data-act="reminders"><i class="ph-bold ph-bell-ringing"></i>Erinnerungen einrichten</button></div>
    <div class="set-sec"><h3>Daten</h3><p class="muted small">Alles liegt nur auf diesem Gerät. Sicherung als Datei:</p>
      <div class="two"><button class="btn" data-act="export"><i class="ph-bold ph-download-simple"></i>Sichern</button><button class="btn" data-act="import"><i class="ph-bold ph-upload-simple"></i>Laden</button></div></div>
  </div>`);
}

function remindersSheet() {
  localStorage.setItem('lernklar-setup-rem', '1');
  const perm = 'Notification' in window ? Notification.permission : 'unsupported';
  openSheet(`${sheetHead('Erinnerungen')}<div class="form">
    <div class="rem-opt"><div class="ri"><i class="ph-bold ph-calendar-check"></i></div><div><b>Kalender aufs Handy <span class="pill strong">zuverlässig</span></b><p class="muted small">Ole schreibt Lernzeiten, Übungsblätter und Prüfungen mit Weckern in deinen Kalender (iPhone, Mac, Google, Outlook). Dein Handy erinnert dich dann, auch wenn Lernklar zu ist.</p>
      <button class="btn primary block" data-act="exportIcs"><i class="ph-bold ph-calendar-plus"></i>In meinen Kalender eintragen</button>
      <p class="muted small" style="margin-top:6px">Am besten einmal eintragen, wenn Stundenplan und Prüfungen stehen. Wer später nochmal einträgt, sollte die alten Lernklar-Termine vorher löschen, sonst stehen sie doppelt drin.</p></div></div>
    <div class="rem-opt"><div class="ri"><i class="ph-bold ph-bell-ringing"></i></div><div><b>Benachrichtigungen von Lernklar</b><p class="muted small">Pop-ups ${S.set.lead} Minuten vor Vorlesung und Übung, zur Lernzeit und wenn ein Timer abläuft. Klappt, solange Lernklar geöffnet oder im Hintergrund ist.</p>
      ${perm === 'granted' ? `<button class="btn block" data-act="testNotify"><i class="ph-bold ph-paper-plane-tilt"></i>Test-Benachrichtigung</button>` :
        perm === 'denied' ? '<p class="small">Im Browser blockiert. In den Website-Einstellungen erlauben.</p>' :
        perm === 'unsupported' ? '<p class="small">Am iPhone: erst „Zum Home-Bildschirm“, dann Lernklar von dort öffnen.</p>' :
        `<button class="btn block" data-act="askNotify"><i class="ph-bold ph-bell"></i>Benachrichtigungen erlauben</button>`}</div></div>
  </div>`);
}

/* ---------- Kalender-Export ---------- */
function buildExport() {
  const k0 = today(), items = [];
  const url = location.origin + location.pathname;
  const lastExam = futureExams().map(x => x.date).pop();
  const lastEv = S.events.flatMap(e => e.dates).filter(x => x >= k0).sort().pop();
  const end = [lastExam, lastEv, addD(k0, 120)].filter(Boolean).sort().pop();
  const until = ICS.dt(end) + 'T235900';
  const BY = { mo: 'MO', di: 'TU', mi: 'WE', do: 'TH', fr: 'FR', sa: 'SA', so: 'SU' };
  for (const w of WEEK) {
    const t = S.set.days[w]; if (!t) continue;
    let k = k0; while (wdOf(k) !== w) k = addD(k, 1);
    items.push({ uid: `lernklar-lern-${w}@lernklar`, title: 'Lernzeit mit Ole 🦉', date: k, time: t, min: S.set.dayMin,
      rrule: `FREQ=WEEKLY;BYDAY=${BY[w]};UNTIL=${until}`, desc: `Was heute dran ist, steht in Lernklar: ${url}`, alarms: ['PT0M'] });
  }
  for (const x of futureExams()) {
    items.push({ uid: `lernklar-exam-${x.id}@lernklar`, title: `${x.type || 'Prüfung'}: ${sName(x.sid)}`, date: x.date, time: x.time || null, min: 120, loc: x.room,
      alarms: x.time ? ['-P7D', '-P1D', '-PT2H'] : ['-P7D', '-PT6H'] });
  }
  for (const e of S.events) {
    const left = e.dates.filter(x => x >= k0); if (!left.length) continue;
    // Übungsblatt: am Abend vor jeder Übung
    if ((e.kind === 'ue' || e.kind === 'tut') && e.sid) {
      const prev = left.map(x => addD(x, -1)).filter(x => x >= k0);
      prev.forEach(k => items.push({ uid: `lernklar-ue-${e.id}-${k}@lernklar`, title: `Übungsblatt ${sName(e.sid)} ✏️`, date: k, time: '17:00', min: S.set.ueMin,
        desc: `Morgen ${e.start} ist Übung. ${url}`, alarms: ['PT0M'] }));
    }
    // Termine von Hand stehen nicht im Uni-Kalender, darum mit eintragen
    if (e.src === 'hand') left.forEach(k => items.push({ uid: `lernklar-ev-${e.id}-${k}@lernklar`, title: `${KIND[e.kind].n}: ${sName(e.sid)}`, date: k, time: e.start,
      min: Math.max(15, tmin(e.end) - tmin(e.start)), loc: e.room, alarms: [`-PT${S.set.lead}M`] }));
  }
  return ICS.build(items, 'Lernklar');
}
function exportIcs() {
  const txt = buildExport();
  const blob = new Blob([txt], { type: 'text/calendar;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const a = document.createElement('a');
  a.href = href;
  // iPhone: ohne download-Attribut zeigt Safari direkt „Alle hinzufügen“ für den Kalender
  if (!ios) a.download = 'lernklar.ics';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60e3);
  toast(ios ? 'Tippe auf „Alle hinzufügen“.' : 'Datei öffnen, dann landen die Termine im Kalender.');
}

/* ---------- Kalender-Import ---------- */
function handleIcsText(txt, name) {
  let res;
  try { res = ICS.analyze(txt, addD(today(), -1)); } catch (e) { toast('Die Datei konnte ich nicht lesen.'); return; }
  if (!res.series.length && !res.exams.length) { toast('Keine kommenden Termine im Kalender gefunden.'); return; }
  // bekannte Fächer bevorzugen, wenn der bereinigte Name ähnlich ist
  for (const g of res.series.concat(res.exams)) {
    const hit = S.subjects.find(s => s.name.toLowerCase() === g.subj.toLowerCase() || g.title.toLowerCase().includes(s.name.toLowerCase()));
    if (hit) g.subj = hit.name;
  }
  importSheet(res, name);
}
async function loadUrl(u) {
  u = String(u || '').trim().replace(/^webcal:/i, 'https:');
  if (!/^https:\/\//i.test(u)) { toast('Bitte einen https://- oder webcal://-Link.'); return; }
  S.set.icsUrl = u; persist();
  try {
    const r = await fetch(u, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    handleIcsText(await r.text(), 'Kalender-Link');
  } catch (e) {
    toast('Deine Uni blockt das direkte Laden. Lade die .ics-Datei herunter und wähl sie aus.');
  }
}
function applyImport() {
  const res = ui.imp; if (!res) return;
  S.events = S.events.filter(e => e.src !== 'ics');
  let n = 0, x = 0;
  res.series.forEach(g => {
    if (g.skip) return;
    const s = g.subj && g.subj.trim() ? ensureSubject(g.subj) : null;
    S.events.push({ id: uid(), sid: s ? s.id : null, kind: g.kind, title: g.title, room: g.room, start: g.start, end: g.end, dates: g.dates, src: 'ics' });
    n++;
  });
  res.exams.forEach(e => {
    if (e.skip) return;
    const s = ensureSubject(e.subj || e.title);
    if (S.exams.some(y => y.sid === s.id && y.date === e.date)) return;
    S.exams.push({ id: uid(), sid: s.id, type: /abgabe/i.test(e.title) ? 'Abgabe' : 'Klausur', date: e.date, time: e.time, room: e.room });
    x++;
  });
  persist(); closeSheet();
  ui.tab = 'plan'; ui.planSeg = 'stunden'; render();
  toast(`${n} Veranstaltungen${x ? ` und ${x} Prüfungen` : ''} übernommen.`);
}

/* ---------- Lern-Session (geführt wie eine Routine) ---------- */
const focusEl = $('#focus');
let F = null, fTick = null, wake = null;
function findTask(key) { return todayPlan().tasks.find(t => t.key === key); }
function startSession(task) {
  const s = subj(task.sid), name = s ? s.name : 'Lernen';
  const top = s && openTopics(s)[task.ti || 0];
  const last = S.sessions.filter(x => x.sid === task.sid && x.note).sort((a, b) => b.ts - a.ts)[0];
  let steps;
  if (task.type === 'nb') steps = [
    { t: 'Folien durchgehen', d: `${name}: Was war neu? Markier dir, was du nicht verstehst.`, min: Math.max(5, task.min - 5) },
    { t: 'Fragen notieren', d: 'Schreib auf, was unklar ist. Das klärst du in der Übung oder im Tutorium.', min: 5 },
    { t: 'Kurz festhalten', end: true }];
  else if (task.type === 'ue') steps = [
    { t: 'Übungsblatt anfangen', d: `${name}: erst alle Aufgaben lesen, dann mit der leichtesten starten.`, min: Math.max(10, task.min - 5) },
    { t: 'Offene Punkte checken', d: 'Was fehlt noch? Notier dir, was du in der Übung fragen willst.', min: 5 },
    { t: 'Kurz festhalten', end: true }];
  else steps = [
    { t: 'Ankommen', d: last ? `Letztes Mal: „${last.note}“` : 'Unterlagen raus, Handy weg, Wasser hin.', min: 2 },
    { t: top ? top.t : `${name} lernen`, d: top ? `${name} · neuen Stoff durcharbeiten` : 'Neuen Stoff durcharbeiten.', min: task.min || S.set.block },
    { t: 'Selbst abfragen', d: 'Unterlagen zu. Erklär dir das Wichtigste laut oder schreib es aus dem Kopf auf.', min: 5 },
    { t: 'Wo hörst du auf?', end: true }];
  F = { task, steps, topic: top ? top.id : null, i: 0, start: Date.now(), t0: Date.now(), paused: false, pausedAt: 0, beeped: false, finished: false };
  try { navigator.wakeLock && navigator.wakeLock.request('screen').then(x => { wake = x; }).catch(() => {}); } catch (e) {}
  if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch (e) {} }
  focusEl.hidden = false; renderFocus();
  clearInterval(fTick); fTick = setInterval(tickFocus, 250);
}
function closeFocus() { F = null; focusEl.hidden = true; focusEl.innerHTML = ''; clearInterval(fTick); if (wake) { wake.release().catch(() => {}); wake = null; } document.title = 'Lernklar'; render(); }
const fmtT = s => { const neg = s < 0; s = Math.abs(Math.round(s)); return `${neg ? '+' : ''}${Math.floor(s / 60)}:${pad(s % 60)}`; };
function renderFocus() {
  if (!F) return;
  const name = F.task.sid ? sName(F.task.sid) : 'Lernen';
  const head = `<div class="fhead"><span><i class="ph-bold ${TASK[F.task.type].i}"></i> ${esc(name)}</span><button class="fbtn-x" data-act="fClose" aria-label="Schließen"><i class="ph-bold ph-x"></i></button></div>`;
  if (F.finished) {
    document.title = 'Lernklar';
    const nxt = todayPlan().tasks.find(t => !S.done[t.key]);
    focusEl.innerHTML = `${head}<div class="fmid"><div class="fmascot">${ole('happy', true)}</div><div class="fstep">Stark gemacht!</div>
      <p class="fcount">${F.mins} ${F.mins === 1 ? "Minute" : "Minuten"} ${esc(name)}. ${nxt ? `Als Nächstes: ${esc(taskTitle(nxt))}.` : 'Für heute ist alles erledigt.'}</p></div>
      <div class="factions">${nxt ? `<button class="fb alt" data-act="fClose">Pause</button><button class="fb main" data-act="fNext" data-key="${nxt.key}"><i class="ph-fill ph-play"></i>Weiter</button>` : `<button class="fb main" data-act="fClose" style="grid-column:1/-1">Fertig</button>`}</div>`;
    return;
  }
  const st = F.steps[F.i];
  const dots = `<div class="fdots">${F.steps.map((x, j) => `<i class="${j === F.i ? 'on' : j < F.i ? 'ok' : ''}"></i>`).join('')}</div>`;
  if (st.end) {
    document.title = 'Lernklar';
    const top = F.topic && subj(F.task.sid) && subj(F.task.sid).topics.find(t => t.id === F.topic);
    focusEl.innerHTML = `${head}<div class="fmid">
      <div class="fmascot" style="width:96px;height:96px">${ole('ok', true)}</div>
      <div class="fstep">${esc(st.t)}</div>
      <textarea class="finput" id="fNote" placeholder="z. B. „Kapitel 3.2, Aufgabe 4 hakt noch“">${esc(F.note || '')}</textarea>
      ${top ? `<label class="ftick"><input type="checkbox" id="fTopic"><span></span>„${esc(top.t)}“ ist durch</label>` : ''}
      ${dots}</div>
      <div class="factions"><button class="fb alt" data-act="fBack">Zurück</button><button class="fb main" data-act="fSave"><i class="ph-bold ph-check"></i>Speichern</button></div>`;
    return;
  }
  focusEl.innerHTML = `${head}<div class="fmid">
    <div class="fmascot" style="width:110px;height:110px">${ole(F.paused ? 'sleepy' : 'ok', F.i > 0)}</div>
    <p class="fcount num">Schritt ${F.i + 1} von ${F.steps.length}</p>
    <div class="fstep" key="${F.i}">${esc(st.t)}</div>
    <p class="fdesc">${esc(st.d)}</p>
    <div class="ftime num" id="fTime">${fmtT(st.min * 60)}</div>
    <button class="btn sm fpause" data-act="fPause"><i class="ph-bold ${F.paused ? 'ph-play' : 'ph-pause'}"></i>${F.paused ? 'Weiter' : 'Pause'}</button>
    ${dots}</div>
    <div class="factions"><button class="fb alt" data-act="fBack" ${F.i ? '' : 'disabled'}>Zurück</button><button class="fb main" data-act="fStep"><i class="ph-bold ph-arrow-right"></i>Weiter</button></div>`;
  tickFocus();
}
function tickFocus() {
  if (!F || F.finished) return;
  const st = F.steps[F.i]; if (!st || st.end) return;
  const el = $('#fTime'); if (!el) return;
  const left = st.min * 60 - ((F.paused ? F.pausedAt : Date.now()) - F.start) / 1000;
  el.textContent = fmtT(left);
  el.classList.toggle('over', left < 0);
  document.title = `${fmtT(left)} · ${st.t}`;
  if (left <= 0 && !F.beeped) {
    F.beeped = true; beep();
    try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch (e) {}
    const nx = F.steps[F.i + 1];
    if (document.hidden) notify('Zeit um ⏰', nx ? `Weiter mit: ${nx.t}` : 'Session fertig.', 'lk-timer');
  }
}
function fGo(i) { F.i = Math.max(0, Math.min(F.steps.length - 1, i)); F.start = Date.now(); F.paused = false; F.beeped = false; renderFocus(); }
function fSave() {
  const note = ($('#fNote') || {}).value || '';
  const mins = Math.max(1, Math.round((Date.now() - F.t0) / 60000));
  S.sessions.push({ id: uid(), sid: F.task.sid, date: today(), min: mins, note: note.trim(), type: F.task.type, ts: Date.now() });
  if (F.task.key) S.done[F.task.key] = true;
  const tick = $('#fTopic');
  if (tick && tick.checked) { const s = subj(F.task.sid); const t = s && s.topics.find(x => x.id === F.topic); if (t) t.done = true; }
  persist();
  F.finished = true; F.mins = mins;
  confetti(70); renderFocus();
}

/* ---------- Erinnerungen ---------- */
async function notify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return false;
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' });
    else new Notification(title, { body, tag, icon: 'icons/icon-192.png' });
    return true;
  } catch (e) { return false; }
}
function dueReminders() {
  const k = today(), nm = nowMin(), out = [];
  for (const e of occOn(k)) out.push({ key: `ev:${e.id}:${k}`, at: tmin(e.start) - S.set.lead,
    title: `${KIND[e.kind].n} in ${S.set.lead} Minuten`, body: `${e.sid ? sName(e.sid) : e.title} um ${e.start}${e.room ? ` · ${e.room}` : ''}` });
  const p = todayPlan(), open = p.tasks.filter(t => !S.done[t.key]);
  if (open.length && p.learnAt != null) out.push({ key: `lt:${k}`, at: p.learnAt, title: 'Lernzeit 🦉', body: `Heute dran: ${open.slice(0, 3).map(taskTitle).join(', ')}` });
  for (const x of futureExams()) {
    const d = diffD(k, x.date);
    if (d === 1) out.push({ key: `ex1:${x.id}`, at: 18 * 60, title: `Morgen: ${x.type || 'Prüfung'} ${sName(x.sid)}`, body: `${x.time ? `${x.time} Uhr. ` : ''}Früh schlafen, du packst das.` });
    if (d === 7) out.push({ key: `ex7:${x.id}`, at: 10 * 60, title: `Noch 7 Tage: ${sName(x.sid)}`, body: 'Ole legt ab jetzt mehr Blöcke dafür ein.' });
  }
  return out.filter(r => nm >= r.at && nm - r.at < 30 && !S.notified[r.key]);
}
async function checkReminders() {
  const due = dueReminders(); if (!due.length) return;
  for (const r of due) {
    S.notified[r.key] = today();
    const ok = await notify(r.title, r.body, r.key);
    if (!ok && !document.hidden) toast(`${r.title}: ${r.body}`);
  }
  // alte Einträge aufräumen
  const old = addD(today(), -10);
  for (const [k, v] of Object.entries(S.notified)) if (v < old) delete S.notified[k];
  persist();
}
setInterval(checkReminders, 20000);
setTimeout(checkReminders, 3000);

/* ---------- Effekte ---------- */
let actx;
function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    [0, .18].forEach((d, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = i ? 880 : 660; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(.0001, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(.25, actx.currentTime + d + .02); g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + d + .3); o.start(actx.currentTime + d); o.stop(actx.currentTime + d + .32); });
  } catch (e) {}
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2700);
}
function confetti(n = 60) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('div'); c.className = 'confetti';
  const cols = ['#5b5bd6', '#ffb547', '#12a594', '#e5484d', '#fafaf7'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};--x:${(Math.random() - .5) * 240}px;--r:${(Math.random() * 2 - 1) * 720}deg;--d:${1.2 + Math.random() * 1.2}s;animation-delay:${Math.random() * .25}s`;
    c.appendChild(p);
  }
  document.body.appendChild(c); setTimeout(() => c.remove(), 2800);
}

/* ---------- Ereignisse ---------- */
function onClick(e) {
  const goTab = e.target.closest('[data-tab]'), goTab2 = e.target.closest('[data-tab-go]');
  if (goTab || goTab2) { ui.tab = (goTab || goTab2).dataset.tab || goTab2.dataset.tabGo; closeSheet(); render(); document.body.scrollTo(0, 0); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  const sub = ui.sub && subj(ui.sub);
  switch (a) {
    case 'closeSheet': closeSheet(); render(); break;
    case 'settings': settingsSheet(); break;
    case 'reminders': remindersSheet(); render(); break;
    case 'goFaecher': ui.tab = 'faecher'; render(); if (S.subjects[0]) subjectSheet(S.subjects[0].id); break;
    case 'newSubject': subjectSheet(null); break;
    case 'editSubject': if (b.dataset.id) subjectSheet(b.dataset.id); break;
    case 'saveNewSubject': {
      const n = $('#sName').value.trim(); if (!n) { $('#sName').focus(); return; }
      if (findSubject(n)) { toast('Das Fach gibt es schon.'); return; }
      const s = ensureSubject(n);
      const d = $('#exDate').value;
      if (d) S.exams.push({ id: uid(), sid: s.id, type: 'Klausur', date: d, time: $('#exTime').value || '', room: '' });
      persist(); subjectSheet(s.id); render(); toast(`${n} angelegt. Jetzt Themen eintragen?`);
      break;
    }
    case 'pickColor': if (sub) { sub.color = b.dataset.c; persist(); subjectSheet(sub.id); render(); } break;
    case 'addExam': {
      if (!sub) return;
      const d = $('#nxDate').value; if (!d) { $('#nxDate').focus(); return; }
      S.exams.push({ id: uid(), sid: sub.id, type: $('#nxType').value, date: d, time: $('#nxTime').value || '', room: '' });
      persist(); subjectSheet(sub.id); render();
      break;
    }
    case 'delExam': S.exams = S.exams.filter(x => x.id !== b.dataset.id); persist(); if (sub) subjectSheet(sub.id); render(); break;
    case 'addTopic': addTopic(); break;
    case 'bulkTopics': {
      const txt = prompt('Ein Thema pro Zeile (z. B. aus dem Inhaltsverzeichnis kopiert):');
      if (txt && sub) { txt.split(/\r?\n/).map(x => x.replace(/^\s*([-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).forEach(t => sub.topics.push({ id: uid(), t, done: false })); persist(); subjectSheet(sub.id); render(); }
      break;
    }
    case 'toggleTopic': if (sub) { const t = sub.topics.find(x => x.id === b.dataset.id); if (t) t.done = !t.done; persist(); subjectSheet(sub.id); render(); } break;
    case 'delTopic': if (sub) { sub.topics = sub.topics.filter(x => x.id !== b.dataset.id); persist(); subjectSheet(sub.id); render(); } break;
    case 'delSubject': {
      const s = subj(b.dataset.id); if (!s) return;
      if (!confirm(`„${s.name}“ mit Prüfungen und Themen löschen? Die Termine im Stundenplan bleiben ohne Fach.`)) return;
      S.subjects = S.subjects.filter(x => x.id !== s.id);
      S.exams = S.exams.filter(x => x.sid !== s.id);
      S.events.forEach(e => { if (e.sid === s.id) e.sid = null; });
      persist(); closeSheet(); render();
      break;
    }
    case 'toggleTask': { const k = b.dataset.key; if (S.done[k]) delete S.done[k]; else { S.done[k] = true; b.closest('.item') && b.closest('.item').classList.add('pulse'); } persist(); setTimeout(render, 160); break; }
    case 'startTask': { const t = findTask(b.dataset.key); if (t) startSession(t); break; }
    case 'freeSession': {
      const sid = b.dataset.id || (todayPlan().tasks.find(t => t.sid) || {}).sid || (S.subjects[0] && S.subjects[0].id);
      startSession({ key: null, type: 'lb', sid, min: S.set.block });
      break;
    }
    case 'planSeg': ui.planSeg = b.dataset.v; render(); break;
    case 'importIcs': importChooser(); break;
    case 'pickIcs': $('#icsFile').click(); break;
    case 'loadUrl': loadUrl($('#icsUrl').value); break;
    case 'syncUrl': loadUrl(S.set.icsUrl); break;
    case 'applyImport': applyImport(); break;
    case 'newEvent': if (!S.subjects.length) { toast('Leg zuerst ein Fach an, oder wähl „Neues Fach“.'); } eventSheet(null); break;
    case 'editEvent': eventSheet(b.dataset.id); break;
    case 'saveEvent': saveEvent(); break;
    case 'delEvent': S.events = S.events.filter(x => x.id !== b.dataset.id); persist(); closeSheet(); render(); break;
    case 'theme': S.set.theme = b.dataset.v; applyTheme(); persist(); settingsSheet(); break;
    case 'toggleDay': { const w = b.dataset.w; S.set.days[w] = S.set.days[w] ? null : '18:00'; persist(); settingsSheet(); render(); break; }
    case 'askNotify': Notification.requestPermission().then(p => { if (p === 'granted') notify('Ole ist bereit 🦉', 'Ich erinnere dich ab jetzt an Vorlesungen, Übungen und Lernzeiten.', 'lk-hello'); remindersSheet(); }); break;
    case 'testNotify': notify('Test von Ole 🦉', 'So sehen Erinnerungen aus.', 'lk-test'); break;
    case 'exportIcs': exportIcs(); break;
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `lernklar-${today()}.json`; l.click();
      break;
    }
    case 'import': $('#importFile').click(); break;
    case 'fClose': closeFocus(); break;
    case 'fPause': if (F.paused) { F.start += Date.now() - F.pausedAt; F.paused = false; } else { F.paused = true; F.pausedAt = Date.now(); } renderFocus(); break;
    case 'fStep': fGo(F.i + 1); break;
    case 'fBack': if (F.steps[F.i].end) F.note = ($('#fNote') || {}).value; fGo(F.i - 1); break;
    case 'fSave': fSave(); break;
    case 'fNext': { const t = findTask(b.dataset.key); if (t) startSession(t); else closeFocus(); break; }
  }
}
function addTopic() {
  const sub = ui.sub && subj(ui.sub); const inp = $('#nTopic');
  if (!sub || !inp || !inp.value.trim()) return;
  sub.topics.push({ id: uid(), t: inp.value.trim(), done: false });
  persist(); subjectSheet(sub.id); render();
  setTimeout(() => $('#nTopic') && $('#nTopic').focus(), 30);
}
function saveEvent() {
  let sid = $('#neSid').value;
  if (sid === '__new' || !sid) {
    const n = ($('#neNew').value || '').trim();
    if (!n) { $('#neNewWrap').hidden = false; $('#neNew').focus(); return; }
    sid = ensureSubject(n).id;
  }
  const w = $('#neWd').value, iv = +$('#neIv').value, until = $('#neUntil').value || addD(today(), 105);
  let k = today(); while (wdOf(k) !== w) k = addD(k, 1);
  const dates = []; for (; k <= until && dates.length < 60; k = addD(k, 7 * iv)) dates.push(k);
  const start = $('#neStart').value || '10:00', end = $('#neEnd').value || '11:30';
  const kind = $('#neKind').value;
  S.events.push({ id: uid(), sid, kind, title: `${KIND[kind].n} ${sName(sid)}`, room: $('#neRoom').value.trim(), start, end, dates, src: 'hand' });
  persist(); closeSheet(); ui.tab = 'plan'; ui.planSeg = 'stunden'; render();
  toast(`${KIND[kind].n} eingetragen, ${dates.length} Termine.`);
}
document.addEventListener('click', onClick);
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'nTopic') { e.preventDefault(); addTopic(); }
  if (e.key === 'Enter' && e.target.id === 'sName') { e.preventDefault(); $('[data-act="saveNewSubject"]').click(); }
  if (e.key === 'Escape') { if (!sheetEl.hidden) { closeSheet(); render(); } }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.set) {
    const k = t.dataset.set, num = ['dayMin', 'block', 'ueMin', 'lead'].includes(k);
    S.set[k] = num ? +t.value : t.value; persist(); render();
    return;
  }
  if (t.dataset.day) { S.set.days[t.dataset.day] = t.value || '18:00'; persist(); render(); return; }
  if (t.dataset.sub === 'name') { const s = subj(ui.sub); if (s && t.value.trim()) { s.name = t.value.trim(); persist(); render(); } return; }
  if (t.dataset.ex) { const x = S.exams.find(y => y.id === t.dataset.ex); if (x) { x[t.dataset.k] = t.value; persist(); render(); } return; }
  if (t.dataset.evf) {
    const ev = S.events.find(y => y.id === ($('#evId') || {}).value); if (!ev) return;
    if (t.dataset.evf === 'sid' && t.value === '__new') { const n = prompt('Name des neuen Fachs:'); if (n && n.trim()) ev.sid = ensureSubject(n).id; eventSheet(ev.id); }
    else ev[t.dataset.evf] = t.value || null;
    persist(); render(); return;
  }
  if (t.id === 'neSid') { $('#neNewWrap').hidden = t.value !== '__new'; return; }
  if (t.dataset.imp != null && ui.imp) {
    const g = ui.imp.series[+t.dataset.imp];
    if (t.dataset.k === 'use') { g.skip = !t.checked; t.closest('.imp').classList.toggle('off', g.skip); }
    else g[t.dataset.k] = t.value;
    return;
  }
  if (t.dataset.impx != null && ui.imp) {
    const x = ui.imp.exams[+t.dataset.impx];
    if (t.dataset.k === 'subj') x.subj = t.value; else x.skip = !t.checked;
    return;
  }
  if (t.id === 'icsFile' && t.files[0]) {
    const f = t.files[0]; const r = new FileReader();
    r.onload = () => handleIcsText(String(r.result), f.name);
    r.readAsText(f); t.value = '';
    return;
  }
  if (t.id === 'importFile' && t.files[0]) {
    const r = new FileReader();
    r.onload = () => {
      try { const d = JSON.parse(r.result); if (!d.set || !d.subjects) throw 0; S = Object.assign(defaults(), d); persist(); applyTheme(); closeSheet(); render(); toast('Daten geladen.'); }
      catch (err) { toast('Das ist keine Lernklar-Sicherung.'); }
    };
    r.readAsText(t.files[0]); t.value = '';
  }
});
document.addEventListener('input', e => { if (e.target.dataset.set === 'name') { S.set.name = e.target.value; persist(); } });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (!F) render(); checkReminders(); } });
// Mitternacht und laufende Vorlesungen: Ansicht jede Minute auffrischen
setInterval(() => { if (!F && sheetEl.hidden && !document.hidden) render(); }, 60e3);

/* ---------- Einführung beim ersten Start: Name, Lerntage, erstes Fach ---------- */
const onbEl = $('#onb');
const O = { i: 0, name: S.set.name, days: Object.assign({}, S.set.days), time: '18:00', dayMin: S.set.dayMin, subj: '', exam: '' };
function renderOnb() {
  const steps = 3, p = Math.round((O.i + 1) / steps * 100);
  const top = `<div class="onb-top"><div class="bar"><i style="--w:${p}%"></i></div><button class="onb-skip" data-onb="skip">Überspringen</button></div>`;
  let mid, bot;
  if (O.i === 0) {
    mid = `<div class="mascot">${ole('happy')}</div><h1>Hi, ich bin Ole!</h1><p class="lead">Ich plane dein Lernen, erinnere dich an Vorlesungen und passe auf, dass vor der Klausur nichts liegen bleibt. Wie heißt du?</p>
      <input class="input" id="onbName" placeholder="Dein Vorname" value="${esc(O.name)}" autocomplete="given-name">`;
    bot = `<button class="btn primary block" data-onb="next">Weiter</button>`;
  } else if (O.i === 1) {
    mid = `<div class="mascot">${ole('ok', true)}</div><h1>Wann willst du lernen${O.name ? `, ${esc(O.name)}` : ''}?</h1><p class="lead">An diesen Tagen plane ich Lernblöcke ein. Ändern kannst du das jederzeit.</p>
      <div class="days-pick">${WEEK.map(w => `<div class="dp ${O.days[w] ? 'on' : ''}"><button data-onb="day" data-w="${w}">${WDS[w]}</button></div>`).join('')}</div>
      <div class="two"><label class="f">Ab wann?<input class="input" type="time" id="onbTime" value="${O.time}"></label>
      <label class="f">Wie lange?<select class="input" id="onbMin">${[30, 45, 60, 90, 120].map(n => `<option value="${n}" ${n === O.dayMin ? 'selected' : ''}>${n} Minuten</option>`).join('')}</select></label></div>`;
    bot = `<button class="btn primary block" data-onb="next">Weiter</button><button class="btn ghost block" data-onb="back">Zurück</button>`;
  } else {
    mid = `<div class="mascot">${ole('ok')}</div><h1>Dein erstes Fach</h1><p class="lead">Mehr Fächer und deinen Stundenplan aus dem Uni-Kalender holst du dir danach.</p>
      <input class="input" id="onbSubj" placeholder="z. B. Statistik" value="${esc(O.subj)}" autocomplete="off">
      <label class="f">Prüfung am (optional)<input class="input" type="date" id="onbExam" value="${O.exam}"></label>`;
    bot = `<button class="btn primary block" data-onb="done">Los geht’s</button><button class="btn ghost block" data-onb="back">Zurück</button>`;
  }
  onbEl.innerHTML = `${top}<div class="onb-mid" key="${O.i}">${mid}</div><div class="onb-bot">${bot}</div>`;
}
function readOnb() {
  if ($('#onbName')) O.name = $('#onbName').value.trim();
  if ($('#onbMin')) O.dayMin = +$('#onbMin').value;
  if ($('#onbTime')) { O.time = $('#onbTime').value || '18:00'; for (const w of WEEK) if (O.days[w]) O.days[w] = O.time; }
  if ($('#onbSubj')) O.subj = $('#onbSubj').value.trim();
  if ($('#onbExam')) O.exam = $('#onbExam').value;
}
function finishOnb(save) {
  readOnb();
  if (save) {
    S.set.name = O.name; S.set.days = O.days; S.set.dayMin = O.dayMin;
    if (O.subj) {
      const s = ensureSubject(O.subj);
      if (O.exam) S.exams.push({ id: uid(), sid: s.id, type: 'Klausur', date: O.exam, time: '', room: '' });
    }
  }
  S.set.onboarded = true; persist();
  onbEl.hidden = true; onbEl.innerHTML = ''; render();
  if (save && O.subj) { confetti(60); toast('Fertig! Hol dir jetzt noch deinen Stundenplan.'); }
}
onbEl.addEventListener('click', e => {
  const b = e.target.closest('[data-onb]'); if (!b) return;
  const a = b.dataset.onb;
  readOnb();
  if (a === 'next') { if (O.i === 1 && !Object.values(O.days).some(Boolean)) { toast('Wähl mindestens einen Lerntag.'); return; } O.i++; renderOnb(); }
  else if (a === 'back') { O.i = Math.max(0, O.i - 1); renderOnb(); }
  else if (a === 'day') { const w = b.dataset.w; O.days[w] = O.days[w] ? null : O.time; renderOnb(); }
  else if (a === 'done') finishOnb(true);
  else if (a === 'skip') finishOnb(false);
});
onbEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); const b = onbEl.querySelector('[data-onb="next"], [data-onb="done"]'); b && b.click(); } });
if (!S.set.onboarded && !S.subjects.length) { onbEl.hidden = false; renderOnb(); }

$('.brand-mascot').innerHTML = ole('ok');
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
window.__lernklar = { S: () => S, planRange, buildExport, dueReminders, importText: handleIcsText };
})();
