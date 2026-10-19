/* Teacher Helper — hourly lessons, groups & student tracker
 * All data is stored locally in the browser (localStorage).
 */
'use strict';

const KEY = 'teacher-helper-v1';
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const COLOR_NAMES = ['Indigo', 'Sky', 'Green', 'Amber', 'Red', 'Violet', 'Pink', 'Teal'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayISO = () => toISO(new Date());
const nowHM = () => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}`; };
const sum = (arr, f) => arr.reduce((t, x) => t + (f(x) || 0), 0);
const avg = arr => arr.length ? arr.reduce((t, x) => t + x, 0) / arr.length : null;
const sortSessions = arr => arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const byDateDesc = (a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || ''));
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const pct = n => n == null ? '—' : Math.round(n) + '%';
const scoreCls = p => p >= 85 ? 'score-good' : p >= 60 ? 'score-mid' : 'score-low';
const scoreCell = p => p == null ? '<span class="muted">—</span>' : `<b class="${scoreCls(p)}">${pct(p)}</b>`;
const num = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n || 0);

/* ---------- state ---------- */
function defaults() {
  return {
    version: 2, students: [], groups: [], sessions: [], assessments: [],
    settings: { currency: 'EGP', teacherName: '', weekStart: 6, defaultDuration: 1 }
  };
}
/* Accepts v1 data (one student per lesson) and upgrades it. */
function migrate(d) {
  const out = defaults();
  out.students = Array.isArray(d.students) ? d.students : [];
  out.groups = Array.isArray(d.groups) ? d.groups.map(g => ({ ...g, studentIds: Array.isArray(g.studentIds) ? g.studentIds : [] })) : [];
  out.assessments = Array.isArray(d.assessments) ? d.assessments.map(a => ({ ...a, scores: Array.isArray(a.scores) ? a.scores : [] })) : [];
  out.settings = { ...out.settings, ...(d.settings || {}) };
  out.sessions = (Array.isArray(d.sessions) ? d.sessions : []).map(s => {
    if (Array.isArray(s.attendees)) return { groupId: null, ...s };
    const { studentId, rate, paid, ...rest } = s;
    return { ...rest, groupId: null, attendees: studentId ? [{ studentId, rate: +rate || 0, paid: !!paid, present: true }] : [] };
  });
  return out;
}
function load() {
  try { const raw = localStorage.getItem(KEY); return raw ? migrate(JSON.parse(raw)) : defaults(); }
  catch (e) { return defaults(); }
}
let state = load();
const ui = {
  view: 'dashboard', id: null, period: 'month', weekOffset: 0,
  filter: { student: '', group: '', status: '', paid: '', month: '' },
  gfilter: { group: '', type: '' }
};
const charts = {};

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — browser storage is full or blocked'); }
}
function commit(msg) { persist(); render(); if (msg) toast(msg); }

/* ---------- domain ---------- */
const money = n => num(n) + ' ' + esc(state.settings.currency);
const plainMoney = n => num(n) + ' ' + state.settings.currency;
const hrs = h => (Math.round((h || 0) * 100) / 100) + ' h';
const student = id => state.students.find(s => s.id === id);
const group = id => id ? state.groups.find(g => g.id === id) : null;
const sName = id => student(id)?.name || 'Deleted student';
const sColor = id => student(id)?.color || '#94a3b8';
const activeStudents = () => state.students.filter(s => s.active !== false);
const activeGroups = () => state.groups.filter(g => g.active !== false);
const lineAmt = (s, a) => (+s.duration || 0) * (+a.rate || 0);
const isCharged = (s, a) => s.status === 'done' && a.present !== false;
function allLines() {
  const o = [];
  state.sessions.forEach(s => s.attendees.forEach(a => o.push({ s, a, amt: lineAmt(s, a) })));
  return o;
}
const chargedLines = () => allLines().filter(l => isCharged(l.s, l.a));
const sessionValue = s => sum(s.attendees.filter(a => s.status !== 'done' || a.present !== false), a => lineAmt(s, a));
function sessionLabel(s) {
  const g = group(s.groupId);
  if (g) return g.name;
  const n = s.attendees.map(a => sName(a.studentId));
  if (!n.length) return 'No students';
  return n.length > 2 ? `${n.slice(0, 2).join(', ')} +${n.length - 2}` : n.join(', ');
}
const sessionColor = s => group(s.groupId)?.color || (s.attendees[0] ? sColor(s.attendees[0].studentId) : '#94a3b8');
function endTime(start, dur) { const t = toMin(start) + Math.round(dur * 60); return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; }
function fmtDate(iso) { const d = fromISO(iso); return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; }
function isOverdue(s) {
  const t = todayISO();
  return s.status === 'scheduled' && (s.date < t || (s.date === t && toMin(endTime(s.start, s.duration)) <= toMin(nowHM())));
}
function periodRange(p) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  switch (p) {
    case 'month': return [toISO(new Date(y, m, 1)), toISO(new Date(y, m + 1, 0))];
    case 'last': return [toISO(new Date(y, m - 1, 1)), toISO(new Date(y, m, 0))];
    case '3m': return [toISO(new Date(y, m - 2, 1)), toISO(new Date(y, m + 1, 0))];
    case 'year': return [`${y}-01-01`, `${y}-12-31`];
    default: return ['0000-01-01', '9999-12-31'];
  }
}
const PERIODS = { month: 'This month', last: 'Last month', '3m': 'Last 3 months', year: 'This year', all: 'All time' };
const inRange = (x, [a, b]) => x.date >= a && x.date <= b;

function scoresFor(id) {
  const o = [];
  state.assessments.forEach(as => {
    const sc = as.scores.find(x => x.studentId === id);
    if (sc && sc.score !== '' && sc.score != null) o.push({ as, score: +sc.score, pct: +as.maxScore ? +sc.score / +as.maxScore * 100 : 0 });
  });
  return o.sort((a, b) => a.as.date.localeCompare(b.as.date));
}
function assessmentAvg(as) {
  const v = as.scores.filter(x => x.score !== '' && x.score != null).map(x => +as.maxScore ? +x.score / +as.maxScore * 100 : 0);
  return { avg: avg(v), n: v.length, hi: v.length ? Math.max(...v) : null, lo: v.length ? Math.min(...v) : null };
}
function studentStats(id) {
  const ls = allLines().filter(l => l.a.studentId === id && l.s.status === 'done');
  const pres = ls.filter(l => l.a.present !== false);
  const owed = pres.filter(l => !l.a.paid);
  const scores = scoresFor(id);
  return {
    lessons: pres.length, total: ls.length, hours: sum(pres, l => +l.s.duration), earned: sum(pres, l => l.amt),
    attendance: ls.length ? pres.length / ls.length * 100 : null, outstanding: sum(owed, l => l.amt), unpaid: owed.length,
    avgScore: avg(scores.map(x => x.pct)), last: scores[scores.length - 1] || null, scores
  };
}
function groupStats(g) {
  const ses = state.sessions.filter(s => s.groupId === g.id);
  const done = ses.filter(s => s.status === 'done');
  const ls = [];
  done.forEach(s => s.attendees.forEach(a => ls.push({ s, a, amt: lineAmt(s, a) })));
  const pres = ls.filter(l => l.a.present !== false);
  const asm = state.assessments.filter(a => a.groupId === g.id).sort((a, b) => a.date.localeCompare(b.date));
  return {
    lessons: done.length, hours: sum(done, s => +s.duration), earned: sum(pres, l => l.amt),
    outstanding: sum(pres.filter(l => !l.a.paid), l => l.amt),
    attendance: ls.length ? pres.length / ls.length * 100 : null,
    avgScore: avg(asm.map(a => assessmentAvg(a).avg).filter(x => x != null)), assessments: asm, sessions: ses
  };
}
function memberInGroup(g, id) {
  const ls = [];
  state.sessions.filter(s => s.groupId === g.id && s.status === 'done').forEach(s => {
    const a = s.attendees.find(x => x.studentId === id);
    if (a) ls.push({ s, a, amt: lineAmt(s, a) });
  });
  const pres = ls.filter(l => l.a.present !== false);
  const sc = scoresFor(id).filter(x => x.as.groupId === g.id);
  return {
    lessons: pres.length, attendance: ls.length ? pres.length / ls.length * 100 : null,
    avgScore: avg(sc.map(x => x.pct)), last: sc[sc.length - 1] || null,
    outstanding: sum(pres.filter(l => !l.a.paid), l => l.amt)
  };
}

/* ---------- shared templates ---------- */
const kpi = (label, value, sub = '', cls = '') => `<div class="card kpi ${cls}"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const STATUS = { scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' };
const statusBadge = s => `<span class="badge ${s.status}">${STATUS[s.status]}</span>`;
const typeBadge = t => `<span class="badge ${t}">${t === 'exam' ? 'Exam' : 'Quiz'}</span>`;
function payBadge(s) {
  if (s.status !== 'done') return '';
  const ch = s.attendees.filter(a => a.present !== false);
  if (!ch.length) return '';
  const p = ch.filter(a => a.paid).length;
  if (p === ch.length) return '<span class="badge paid">Paid</span>';
  if (!p) return '<span class="badge unpaid">Unpaid</span>';
  return `<span class="badge partial">Paid ${p}/${ch.length}</span>`;
}
function lineBadge(s, a) {
  if (s.status !== 'done') return statusBadge(s);
  if (a.present === false) return '<span class="badge absent">Absent</span>';
  return `<span class="badge ${a.paid ? 'paid' : 'unpaid'}">${a.paid ? 'Paid' : 'Unpaid'}</span>`;
}
function sessionActions(s) {
  let a = '';
  if (s.status === 'scheduled') a += `<button class="btn sm" data-action="done" data-id="${s.id}">✓ Done</button><button class="btn sm ghost" data-action="cancel" data-id="${s.id}">Cancel</button>`;
  if (s.status === 'done' && s.attendees.length === 1 && s.attendees[0].present !== false) {
    const at = s.attendees[0];
    a += `<button class="btn sm ${at.paid ? 'ghost' : ''}" data-action="paid" data-id="${s.id}" data-st="${at.studentId}">${at.paid ? 'Unpay' : 'Mark paid'}</button>`;
  }
  const multiDone = s.status === 'done' && s.attendees.length > 1;
  return a + `<button class="btn sm ghost" data-action="edit-session" data-id="${s.id}">${multiDone ? 'Attendance & pay' : 'Edit'}</button>`;
}
function sessionRow(s) {
  const n = s.attendees.length;
  return `<div class="srow" style="--c:${sessionColor(s)}">
    <div class="srow-main"><strong>${esc(sessionLabel(s))}</strong>${n > 1 ? `<em class="count">${n} students</em>` : ''}
      <span>${fmtDate(s.date)} · ${s.start}–${endTime(s.start, s.duration)} · ${hrs(s.duration)}</span></div>
    <div class="srow-side"><span class="amt">${money(sessionValue(s))}</span>${statusBadge(s)}${payBadge(s)}${sessionActions(s)}</div>
  </div>`;
}
function welcome() {
  return `<div class="card welcome">
    <img class="logo" src="icon.svg" alt="">
    <h1>Welcome to Teacher Helper</h1>
    <p>Add your students and groups with their hourly rate, schedule private or group lessons, and track attendance, payments and exam & quiz grades — all in one place.</p>
    <div class="row">
      <button class="btn" data-action="add-student">+ Add first student</button>
      <button class="btn ghost" data-action="sample">Try with sample data</button>
    </div>
  </div>`;
}
const notFound = (view, label) => `<div class="card welcome"><h1>Not found</h1><p>This ${label} may have been deleted.</p><div class="row"><button class="btn" data-view="${view}">Back</button></div></div>`;
const back = (view, label) => `<button class="back" data-view="${view}">← ${label}</button>`;

/* ---------- views ---------- */
const views = {};
const after = {};

views.dashboard = () => {
  if (!state.students.length) return welcome();
  const r = periodRange(ui.period);
  const doneS = state.sessions.filter(s => s.status === 'done' && inRange(s, r));
  const cl = chargedLines().filter(l => inRange(l.s, r));
  const hours = sum(doneS, s => +s.duration), earned = sum(cl, l => l.amt), collected = sum(cl.filter(l => l.a.paid), l => l.amt);
  const owed = chargedLines().filter(l => !l.a.paid), outstanding = sum(owed, l => l.amt);
  const cancelled = state.sessions.filter(s => s.status === 'cancelled' && inRange(s, r)).length;
  const toConfirm = sortSessions(state.sessions.filter(isOverdue));
  const limit = toISO(addDays(new Date(), 7));
  const nextAll = state.sessions.filter(s => s.status === 'scheduled' && !isOverdue(s) && s.date <= limit);
  const upcoming = sortSessions([...nextAll]).slice(0, 8);
  const asm = state.assessments.filter(a => inRange(a, r));
  const asmAvg = avg(asm.map(a => assessmentAvg(a).avg).filter(x => x != null));
  const top = state.students.map(st => {
    const l = cl.filter(x => x.a.studentId === st.id);
    return { st, n: l.length, h: sum(l, x => +x.s.duration), e: sum(l, x => x.amt) };
  }).filter(x => x.n).sort((a, b) => b.e - a.e);
  const recent = [...state.assessments].sort(byDateDesc).slice(0, 5);
  const grps = activeGroups();

  return `
  <div class="page-head">
    <div><h1>Dashboard</h1><p>${PERIODS[ui.period]} · ${r[0] === '0000-01-01' ? 'all records' : fmtDate(r[0]) + ' → ' + fmtDate(r[1])}</p></div>
    <div class="row">
      <select data-action="period" aria-label="Period">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${k === ui.period ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn" data-action="add-session">+ Lesson</button>
    </div>
  </div>

  <div class="grid kpis">
    ${kpi('Earned', money(earned), `${doneS.length} lessons · ${cl.length} student-lessons`, 'highlight')}
    ${kpi('Hours taught', hrs(hours), `Avg ${money(hours ? earned / hours : 0)} / hour`)}
    ${kpi('Collected', money(collected), `${earned ? Math.round(collected / earned * 100) : 0}% of earned`)}
    ${kpi('Outstanding (all time)', money(outstanding), `${owed.length} unpaid student-lessons`, outstanding ? 'alert' : '')}
    ${kpi('Next 7 days', money(sum(nextAll, sessionValue)), `${nextAll.length} lessons booked · ${cancelled} cancelled in period`)}
    ${kpi('Average grade', pct(asmAvg), `${asm.length} exams & quizzes in period`)}
  </div>

  ${toConfirm.length ? `
  <div class="card mb">
    <div class="card-head"><h2>Lessons to confirm (${toConfirm.length})</h2>
      <button class="btn sm" data-action="confirm-all">Mark all done</button></div>
    <div class="list">${toConfirm.slice(0, 6).map(sessionRow).join('')}</div>
    ${toConfirm.length > 6 ? `<p class="hint">+ ${toConfirm.length - 6} more in Billing</p>` : ''}
  </div>` : ''}

  <div class="grid two">
    <div class="card"><div class="card-head"><h2>Earnings & hours — last 12 months</h2></div>
      <div class="chart-box"><canvas id="chartMonthly"></canvas></div></div>
    <div class="card"><div class="card-head"><h2>Hours by student</h2><span>${PERIODS[ui.period]}</span></div>
      ${top.length ? '<div class="chart-box"><canvas id="chartStudents"></canvas></div>' : '<p class="empty-note">No completed lessons in this period.</p>'}</div>
  </div>

  <div class="grid halves mt">
    <div class="card"><div class="card-head"><h2>Upcoming lessons</h2><button class="btn sm ghost" data-view="schedule">Open schedule</button></div>
      <div class="list">${upcoming.length ? upcoming.map(sessionRow).join('') : '<p class="empty-note">Nothing booked for the next 7 days.</p>'}</div></div>
    <div class="card"><div class="card-head"><h2>Students — ${PERIODS[ui.period].toLowerCase()}</h2><button class="btn sm ghost" data-view="students">All students</button></div>
      ${top.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Student</th><th class="num">Lessons</th><th class="num">Hours</th><th class="num">Earned</th></tr></thead>
        <tbody>${top.map(x => `<tr class="click" data-action="open-student" data-id="${x.st.id}"><td><span class="dot" style="--c:${x.st.color}"></span>${esc(x.st.name)}</td><td class="num">${x.n}</td><td class="num">${hrs(x.h)}</td><td class="num">${money(x.e)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td></td><td class="num">${money(earned)}</td></tr></tfoot>
      </table></div>` : '<p class="empty-note">No completed lessons in this period.</p>'}</div>
  </div>

  <div class="grid halves mt">
    <div class="card"><div class="card-head"><h2>Recent grades</h2><button class="btn sm ghost" data-view="grades">All grades</button></div>
      ${recent.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Assessment</th><th>For</th><th class="num">Avg</th></tr></thead>
        <tbody>${recent.map(a => `<tr class="click" data-action="edit-assessment" data-id="${a.id}"><td>${fmtDate(a.date)}</td><td>${typeBadge(a.type)} ${esc(a.title)}</td><td>${esc(group(a.groupId)?.name || 'Individual')}</td><td class="num">${scoreCell(assessmentAvg(a).avg)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="empty-note">No exams or quizzes yet. <button class="btn sm ghost" data-action="add-assessment" data-type="quiz">+ Quiz</button></p>'}</div>
    <div class="card"><div class="card-head"><h2>Groups</h2><button class="btn sm ghost" data-view="groups">All groups</button></div>
      ${grps.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Group</th><th class="num">Students</th><th class="num">Attendance</th><th class="num">Avg grade</th><th class="num">Outstanding</th></tr></thead>
        <tbody>${grps.map(g => { const x = groupStats(g); return `<tr class="click" data-action="open-group" data-id="${g.id}"><td><span class="dot" style="--c:${g.color}"></span>${esc(g.name)}</td><td class="num">${g.studentIds.length}</td><td class="num">${pct(x.attendance)}</td><td class="num">${scoreCell(x.avgScore)}</td><td class="num">${money(x.outstanding)}</td></tr>`; }).join('')}</tbody>
      </table></div>` : '<p class="empty-note">No groups yet. <button class="btn sm ghost" data-action="add-group">+ Group</button></p>'}</div>
  </div>`;
};

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function mkChart(id, cfg) {
  const el = $('#' + id);
  if (!window.Chart || !el) return;
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  charts[id] = new Chart(el, cfg);
}
const gridColor = () => cssVar('--border');

after.dashboard = () => {
  const n = new Date();
  const months = [...Array(12)].map((_, i) => new Date(n.getFullYear(), n.getMonth() - 11 + i, 1));
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const cl = chargedLines();
  const doneS = state.sessions.filter(s => s.status === 'done');
  mkChart('chartMonthly', {
    data: {
      labels: months.map(m => `${MONTHS[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`),
      datasets: [
        { type: 'bar', label: `Earned (${state.settings.currency})`, data: months.map(m => sum(cl.filter(l => l.s.date.startsWith(key(m))), l => l.amt)), backgroundColor: cssVar('--accent'), borderRadius: 6, yAxisID: 'y' },
        { type: 'line', label: 'Hours', data: months.map(m => sum(doneS.filter(s => s.date.startsWith(key(m))), s => +s.duration)), borderColor: cssVar('--accent-2'), backgroundColor: cssVar('--accent-2'), tension: .35, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, grid: { color: gridColor() } }, y1: { position: 'right', beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } },
      plugins: { legend: { position: 'bottom' } }
    }
  });
  const r = periodRange(ui.period);
  const rows = state.students.map(st => ({ st, h: sum(cl.filter(l => l.a.studentId === st.id && inRange(l.s, r)), l => +l.s.duration) })).filter(x => x.h);
  mkChart('chartStudents', {
    type: 'doughnut',
    data: { labels: rows.map(x => x.st.name), datasets: [{ data: rows.map(x => x.h), backgroundColor: rows.map(x => x.st.color), borderColor: cssVar('--surface'), borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} h` } } } }
  });
};

function weekStartDate() {
  const n = new Date(); n.setHours(0, 0, 0, 0);
  const diff = (n.getDay() - (+state.settings.weekStart) + 7) % 7;
  return addDays(n, -diff + ui.weekOffset * 7);
}

views.schedule = () => {
  if (!state.students.length) return welcome();
  const ws = weekStartDate();
  const days = [...Array(7)].map((_, i) => addDays(ws, i));
  const a = toISO(days[0]), b = toISO(days[6]), t = todayISO();
  const wk = state.sessions.filter(s => s.date >= a && s.date <= b);
  const active = wk.filter(s => s.status !== 'cancelled');
  const label = `${days[0].getDate()} ${MONTHS[days[0].getMonth()]} – ${days[6].getDate()} ${MONTHS[days[6].getMonth()]} ${days[6].getFullYear()}`;
  return `
  <div class="page-head">
    <div><h1>Schedule</h1><p>${label}</p></div>
    <div class="row">
      <button class="btn ghost icon" data-action="week" data-dir="-1" aria-label="Previous week">‹</button>
      <button class="btn ghost" data-action="week" data-dir="0">This week</button>
      <button class="btn ghost icon" data-action="week" data-dir="1" aria-label="Next week">›</button>
      <button class="btn" data-action="add-session">+ Lesson</button>
    </div>
  </div>
  <div class="chips">
    <span class="chip">Lessons <b>${active.length}</b></span>
    <span class="chip">Planned hours <b>${hrs(sum(active, s => +s.duration))}</b></span>
    <span class="chip">Students taught <b>${sum(active, s => s.attendees.length)}</b></span>
    <span class="chip">Week value <b>${money(sum(active, sessionValue))}</b></span>
    <span class="chip">Done <b>${wk.filter(s => s.status === 'done').length}</b></span>
  </div>
  <div class="week">
    ${days.map(d => {
      const iso = toISO(d);
      const list = sortSessions(wk.filter(s => s.date === iso));
      return `<div class="day ${iso === t ? 'today' : ''}">
        <div class="day-head"><span>${DAY_NAMES[d.getDay()]}</span><b>${d.getDate()}</b></div>
        ${list.map(s => `<button class="lesson ${s.status}" style="--c:${sessionColor(s)}" data-action="edit-session" data-id="${s.id}">
          <span class="t">${s.start}–${endTime(s.start, s.duration)}${s.attendees.length > 1 ? ` · ${s.attendees.length} 👥` : ''}</span>
          <span class="n">${esc(sessionLabel(s))}</span></button>`).join('')}
        <button class="add-slot" data-action="add-session" data-date="${iso}" aria-label="Add lesson on ${fmtDate(iso)}">+</button>
      </div>`;
    }).join('')}
  </div>`;
};

/* --- All students dashboard --- */
views.students = () => {
  const head = `<div class="page-head">
    <div><h1>Students</h1><p>${activeStudents().length} active students · ${activeGroups().length} groups</p></div>
    <div class="row"><button class="btn ghost" data-action="add-assessment" data-type="quiz">+ Grade</button><button class="btn" data-action="add-student">+ Student</button></div>
  </div>`;
  if (!state.students.length) return head + welcome();
  const rows = [...state.students]
    .sort((x, y) => (y.active !== false) - (x.active !== false) || x.name.localeCompare(y.name))
    .map(st => ({ st, x: studentStats(st.id), groups: state.groups.filter(g => g.studentIds.includes(st.id)) }));
  const act = rows.filter(r => r.st.active !== false);
  const att = avg(act.map(r => r.x.attendance).filter(v => v != null));
  const sc = avg(act.map(r => r.x.avgScore).filter(v => v != null));
  const attention = act.map(r => {
    const why = [];
    if (r.x.avgScore != null && r.x.avgScore < 60) why.push(`<span class="badge absent">Avg ${pct(r.x.avgScore)}</span>`);
    if (r.x.attendance != null && r.x.attendance < 85) why.push(`<span class="badge partial">Attendance ${pct(r.x.attendance)}</span>`);
    if (r.x.outstanding > 0) why.push(`<span class="badge unpaid">Owes ${money(r.x.outstanding)}</span>`);
    return { r, why };
  }).filter(a => a.why.length).sort((a, b) => b.why.length - a.why.length || b.r.x.outstanding - a.r.x.outstanding).slice(0, 7);
  return head + `
  <div class="grid kpis">
    ${kpi('Active students', act.length, `${state.students.length - act.length} inactive`, 'highlight')}
    ${kpi('Avg attendance', pct(att), 'across all lessons')}
    ${kpi('Avg grade', pct(sc), `${state.assessments.length} exams & quizzes`)}
    ${kpi('Outstanding', money(sum(act, r => r.x.outstanding)), `${act.filter(r => r.x.outstanding > 0).length} students owe`, sum(act, r => r.x.outstanding) ? 'alert' : '')}
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h2>Average grade by student</h2></div>
      ${act.some(r => r.x.avgScore != null) ? '<div class="chart-box"><canvas id="chartStudentScores"></canvas></div>' : '<p class="empty-note">Add exams or quizzes to see grades here.</p>'}</div>
    <div class="card"><div class="card-head"><h2>Needs attention</h2></div>
      ${attention.length ? `<div class="list">${attention.map(a => `<div class="srow click" style="--c:${a.r.st.color}" data-action="open-student" data-id="${a.r.st.id}"><div class="srow-main"><strong>${esc(a.r.st.name)}</strong></div><div class="srow-side">${a.why.join('')}</div></div>`).join('')}</div>` : '<p class="empty-note">Everyone is on track. 🎉</p>'}</div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>All students</h2><span>Tap a student to open their dashboard</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Student</th><th>Level</th><th>Groups</th><th class="num">Rate</th><th class="num">Lessons</th><th class="num">Hours</th><th class="num">Attendance</th><th class="num">Avg grade</th><th class="num">Last</th><th class="num">Outstanding</th></tr></thead>
      <tbody>${rows.map(({ st, x, groups }) => `<tr class="click ${st.active === false ? 'inactive' : ''}" data-action="open-student" data-id="${st.id}">
        <td><span class="dot" style="--c:${st.color}"></span><b>${esc(st.name)}</b></td>
        <td>${esc(st.level || '—')}</td>
        <td>${groups.length ? groups.map(g => esc(g.name)).join(', ') : '<span class="muted">Private</span>'}</td>
        <td class="num">${money(st.rate)}</td><td class="num">${x.lessons}</td><td class="num">${hrs(x.hours)}</td>
        <td class="num">${pct(x.attendance)}</td><td class="num">${scoreCell(x.avgScore)}</td><td class="num">${x.last ? scoreCell(x.last.pct) : '—'}</td>
        <td class="num">${x.outstanding ? `<b class="score-mid">${money(x.outstanding)}</b>` : money(0)}</td></tr>`).join('')}</tbody>
    </table></div>
  </div>`;
};
after.students = () => {
  const rows = activeStudents().map(st => ({ st, v: studentStats(st.id).avgScore })).filter(r => r.v != null).sort((a, b) => b.v - a.v);
  mkChart('chartStudentScores', {
    type: 'bar',
    data: { labels: rows.map(r => r.st.name), datasets: [{ label: 'Avg grade %', data: rows.map(r => Math.round(r.v)), backgroundColor: rows.map(r => r.st.color), borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, max: 100, grid: { color: gridColor() } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
  });
};

/* --- Single student dashboard --- */
views.student = () => {
  const st = student(ui.id);
  if (!st) return notFound('students', 'student');
  const x = studentStats(st.id);
  const groups = state.groups.filter(g => g.studentIds.includes(st.id));
  const lessons = allLines().filter(l => l.a.studentId === st.id).sort((a, b) => byDateDesc(a.s, b.s));
  const next = sortSessions(lessons.filter(l => l.s.status === 'scheduled' && !isOverdue(l.s)).map(l => l.s))[0];
  const grades = [...x.scores].reverse();
  return `
  ${back('students', 'All students')}
  <div class="page-head">
    <div><h1><span class="dot big" style="--c:${st.color}"></span>${esc(st.name)}</h1>
      <p>${money(st.rate)} / h${st.level ? ' · ' + esc(st.level) : ''}${st.phone ? ' · ' + esc(st.phone) : ''}${st.active === false ? ' · inactive' : ''}</p>
      <div class="pills">${groups.map(g => `<button class="pill" data-action="open-group" data-id="${g.id}"><span class="dot" style="--c:${g.color}"></span>${esc(g.name)}</button>`).join('') || '<span class="pill static">Private student</span>'}</div>
    </div>
    <div class="row">
      <button class="btn" data-action="add-session" data-student="${st.id}">+ Lesson</button>
      <button class="btn ghost" data-action="add-assessment" data-student="${st.id}" data-type="quiz">+ Grade</button>
      ${x.outstanding ? `<button class="btn ghost" data-action="payall" data-id="${st.id}">Collect ${money(x.outstanding)}</button>` : ''}
      <button class="btn ghost" data-action="edit-student" data-id="${st.id}">Edit</button>
    </div>
  </div>
  <div class="grid kpis">
    ${kpi('Lessons attended', x.lessons, `of ${x.total} · ${hrs(x.hours)}`, 'highlight')}
    ${kpi('Attendance', pct(x.attendance), `${x.total - x.lessons} absences`)}
    ${kpi('Average grade', scoreCell(x.avgScore), x.last ? `Last: ${esc(x.last.as.title)} ${pct(x.last.pct)}` : 'No grades yet')}
    ${kpi('Total paid + due', money(x.earned), `${x.lessons} charged lessons`)}
    ${kpi('Outstanding', money(x.outstanding), `${x.unpaid} unpaid lessons`, x.outstanding ? 'alert' : '')}
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h2>Grade progress</h2><span>% of max score</span></div>
      ${x.scores.length ? '<div class="chart-box"><canvas id="chartProgress"></canvas></div>' : '<p class="empty-note">No exams or quizzes recorded yet.</p>'}</div>
    <div class="card"><h2 class="mb-s">Details</h2>
      <dl class="details">
        <dt>Next lesson</dt><dd>${next ? `${fmtDate(next.date)} at ${next.start} — ${esc(sessionLabel(next))}` : 'Nothing booked'}</dd>
        <dt>Phone</dt><dd>${esc(st.phone || '—')}</dd>
        <dt>Parent phone</dt><dd>${esc(st.parentPhone || '—')}</dd>
        <dt>Level</dt><dd>${esc(st.level || '—')}</dd>
        <dt>Notes</dt><dd>${esc(st.notes || '—')}</dd>
      </dl>
    </div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>Exams & quizzes</h2><span>${grades.length} recorded</span></div>
    ${grades.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Group</th><th class="num">Score</th><th class="num">%</th><th class="num">Class avg</th></tr></thead>
      <tbody>${grades.map(g => `<tr class="click" data-action="edit-assessment" data-id="${g.as.id}"><td>${fmtDate(g.as.date)} ${g.as.date.slice(0, 4)}</td><td>${typeBadge(g.as.type)}</td><td>${esc(g.as.title)}</td><td>${esc(group(g.as.groupId)?.name || '—')}</td>
        <td class="num">${num(g.score)} / ${num(g.as.maxScore)}</td><td class="num">${scoreCell(g.pct)}</td><td class="num">${g.as.scores.length > 1 ? pct(assessmentAvg(g.as).avg) : '—'}</td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty-note">No grades yet.</p>'}
  </div>
  <div class="card mt">
    <div class="card-head"><h2>Lessons & payments</h2><span>${lessons.length} lessons</span></div>
    ${lessons.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Time</th><th>Lesson</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${lessons.slice(0, 200).map(({ s, a, amt }) => `<tr>
        <td>${fmtDate(s.date)} ${s.date.slice(0, 4)}</td><td>${s.start}–${endTime(s.start, s.duration)}</td>
        <td>${esc(group(s.groupId)?.name || 'Private')}</td><td class="num">${hrs(s.duration)}</td><td class="num">${money(a.rate)}</td>
        <td class="num">${isCharged(s, a) || s.status === 'scheduled' ? money(amt) : '<span class="muted">—</span>'}</td>
        <td>${lineBadge(s, a)}</td>
        <td class="num">${isCharged(s, a) ? `<button class="btn sm ${a.paid ? 'ghost' : ''}" data-action="paid" data-id="${s.id}" data-st="${st.id}">${a.paid ? 'Unpay' : 'Mark paid'}</button>` : ''}<button class="btn sm ghost" data-action="edit-session" data-id="${s.id}">Edit</button></td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty-note">No lessons yet.</p>'}
  </div>`;
};
after.student = () => {
  const st = student(ui.id);
  if (!st) return;
  const sc = scoresFor(st.id);
  const labels = sc.map(x => `${fmtDate(x.as.date).slice(4)}`);
  const byType = t => sc.map(x => x.as.type === t ? Math.round(x.pct) : null);
  mkChart('chartProgress', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Exams', data: byType('exam'), borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent'), spanGaps: true, tension: .3, pointRadius: 5 },
        { label: 'Quizzes', data: byType('quiz'), borderColor: cssVar('--accent-2'), backgroundColor: cssVar('--accent-2'), spanGaps: true, tension: .3, pointRadius: 4 },
        { label: 'Class avg', data: sc.map(x => x.as.scores.length > 1 ? Math.round(assessmentAvg(x.as).avg) : null), borderColor: cssVar('--muted'), borderDash: [5, 5], pointRadius: 0, spanGaps: true, tension: .3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { min: 0, max: 100, grid: { color: gridColor() } }, x: { grid: { display: false } } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { title: i => { const x = sc[i[0].dataIndex]; return `${x.as.title} — ${fmtDate(x.as.date)}`; }, label: c => ` ${c.dataset.label}: ${c.raw}%` } } }
    }
  });
};

/* --- Groups --- */
views.groups = () => {
  const list = [...state.groups].sort((x, y) => (y.active !== false) - (x.active !== false) || x.name.localeCompare(y.name));
  return `
  <div class="page-head">
    <div><h1>Groups</h1><p>${activeGroups().length} active groups</p></div>
    <button class="btn" data-action="add-group">+ Group</button>
  </div>
  ${!list.length ? `<div class="card welcome"><h1>No groups yet</h1><p>Create a group (e.g. "Grade 6 — Group A") and add students to it. Then you can schedule one lesson for the whole group, record attendance and payments for each student, and enter exam & quiz grades for everyone at once.</p><div class="row"><button class="btn" data-action="add-group">+ Create group</button></div></div>` :
  `<div class="grid students">${list.map(g => {
    const x = groupStats(g);
    const next = sortSessions(x.sessions.filter(s => s.status === 'scheduled' && !isOverdue(s)))[0];
    return `<div class="card group-card click ${g.active === false ? 'inactive' : ''}" style="--c:${g.color}" data-action="open-group" data-id="${g.id}">
      <div class="card-head"><h3>${esc(g.name)}</h3><span>${g.rate ? money(g.rate) + ' / student / h' : 'own rates'}</span></div>
      <div class="members">${g.studentIds.map(id => `<span>${esc(sName(id))}</span>`).join('') || '<span>No students</span>'}</div>
      <div class="stats">
        <div><small>Lessons done</small><b>${x.lessons}</b></div>
        <div><small>Attendance</small><b>${pct(x.attendance)}</b></div>
        <div><small>Avg grade</small><b>${scoreCell(x.avgScore)}</b></div>
        <div><small>Outstanding</small><b class="${x.outstanding ? 'score-mid' : ''}">${money(x.outstanding)}</b></div>
      </div>
      <div class="muted small">Next: ${next ? `${fmtDate(next.date)} at ${next.start}` : 'nothing booked'}</div>
    </div>`;
  }).join('')}</div>`}`;
};

views.group = () => {
  const g = group(ui.id);
  if (!g) return notFound('groups', 'group');
  const x = groupStats(g);
  const members = g.studentIds.map(student).filter(Boolean);
  const upcoming = sortSessions(x.sessions.filter(s => s.status === 'scheduled' && !isOverdue(s))).slice(0, 3);
  const recentDone = x.sessions.filter(s => s.status === 'done').sort(byDateDesc).slice(0, 6);
  return `
  ${back('groups', 'All groups')}
  <div class="page-head">
    <div><h1><span class="dot big" style="--c:${g.color}"></span>${esc(g.name)}</h1>
      <p>${members.length} students · ${g.rate ? money(g.rate) + ' per student / hour' : "each student's own rate"}${g.active === false ? ' · inactive' : ''}</p></div>
    <div class="row">
      <button class="btn" data-action="add-session" data-group="${g.id}">+ Lesson</button>
      <button class="btn ghost" data-action="add-assessment" data-group="${g.id}" data-type="quiz">+ Quiz</button>
      <button class="btn ghost" data-action="add-assessment" data-group="${g.id}" data-type="exam">+ Exam</button>
      <button class="btn ghost" data-action="edit-group" data-id="${g.id}">Edit</button>
    </div>
  </div>
  <div class="grid kpis">
    ${kpi('Lessons done', x.lessons, hrs(x.hours) + ' taught', 'highlight')}
    ${kpi('Earned', money(x.earned), `${members.length} students`)}
    ${kpi('Outstanding', money(x.outstanding), 'unpaid by group members', x.outstanding ? 'alert' : '')}
    ${kpi('Attendance', pct(x.attendance), 'all group lessons')}
    ${kpi('Average grade', scoreCell(x.avgScore), `${x.assessments.length} exams & quizzes`)}
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h2>Class average per exam & quiz</h2></div>
      ${x.assessments.length ? '<div class="chart-box"><canvas id="chartGroup"></canvas></div>' : '<p class="empty-note">No exams or quizzes for this group yet.</p>'}</div>
    <div class="card"><div class="card-head"><h2>Upcoming lessons</h2></div>
      <div class="list">${upcoming.length ? upcoming.map(sessionRow).join('') : '<p class="empty-note">Nothing booked.</p>'}</div></div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>Students in this group</h2><span>Attendance, grades & balance within the group</span></div>
    ${members.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Student</th><th class="num">Lessons</th><th class="num">Attendance</th><th class="num">Avg grade</th><th class="num">Last</th><th class="num">Outstanding</th><th></th></tr></thead>
      <tbody>${members.map(st => { const m = memberInGroup(g, st.id); return `<tr class="click" data-action="open-student" data-id="${st.id}">
        <td><span class="dot" style="--c:${st.color}"></span><b>${esc(st.name)}</b></td><td class="num">${m.lessons}</td><td class="num">${pct(m.attendance)}</td>
        <td class="num">${scoreCell(m.avgScore)}</td><td class="num">${m.last ? scoreCell(m.last.pct) : '—'}</td>
        <td class="num">${m.outstanding ? `<b class="score-mid">${money(m.outstanding)}</b>` : money(0)}</td>
        <td class="num">${m.outstanding ? `<button class="btn sm" data-action="payall" data-id="${st.id}" data-group="${g.id}">Record payment</button>` : ''}</td></tr>`; }).join('')}</tbody>
    </table></div>` : '<p class="empty-note">No students yet. <button class="btn sm ghost" data-action="edit-group" data-id="' + g.id + '">Add students</button></p>'}
  </div>
  <div class="grid halves mt">
    <div class="card"><div class="card-head"><h2>Exams & quizzes</h2></div>
      ${x.assessments.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Assessment</th><th class="num">Graded</th><th class="num">Avg</th><th class="num">High</th><th class="num">Low</th></tr></thead>
        <tbody>${[...x.assessments].reverse().map(a => { const v = assessmentAvg(a); return `<tr class="click" data-action="edit-assessment" data-id="${a.id}"><td>${fmtDate(a.date)}</td><td>${typeBadge(a.type)} ${esc(a.title)}</td><td class="num">${v.n}/${members.length}</td><td class="num">${scoreCell(v.avg)}</td><td class="num">${pct(v.hi)}</td><td class="num">${pct(v.lo)}</td></tr>`; }).join('')}</tbody>
      </table></div>` : '<p class="empty-note">None yet.</p>'}</div>
    <div class="card"><div class="card-head"><h2>Recent lessons</h2></div>
      <div class="list">${recentDone.length ? recentDone.map(sessionRow).join('') : '<p class="empty-note">No completed lessons yet.</p>'}</div></div>
  </div>`;
};
after.group = () => {
  const g = group(ui.id);
  if (!g) return;
  const asm = groupStats(g).assessments;
  mkChart('chartGroup', {
    type: 'bar',
    data: {
      labels: asm.map(a => a.title.length > 18 ? a.title.slice(0, 17) + '…' : a.title),
      datasets: [{ label: 'Class average %', data: asm.map(a => Math.round(assessmentAvg(a).avg || 0)), backgroundColor: asm.map(a => a.type === 'exam' ? cssVar('--accent') : cssVar('--accent-2')), borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, max: 100, grid: { color: gridColor() } }, x: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => { const a = asm[i[0].dataIndex]; return `${a.type === 'exam' ? 'Exam' : 'Quiz'}: ${a.title} — ${fmtDate(a.date)}`; } } } }
    }
  });
};

/* --- Grades (exams & quizzes) --- */
views.grades = () => {
  const f = ui.gfilter;
  const list = state.assessments.filter(a =>
    (!f.type || a.type === f.type) &&
    (!f.group || (f.group === 'none' ? !a.groupId : a.groupId === f.group))
  ).sort(byDateDesc);
  const allAvg = avg(list.map(a => assessmentAvg(a).avg).filter(v => v != null));
  return `
  <div class="page-head">
    <div><h1>Grades</h1><p>Exams & quizzes for groups and individual students</p></div>
    <div class="row">
      <button class="btn ghost" data-action="export-grades">Export CSV</button>
      <button class="btn ghost" data-action="add-assessment" data-type="quiz">+ Quiz</button>
      <button class="btn" data-action="add-assessment" data-type="exam">+ Exam</button>
    </div>
  </div>
  <div class="grid kpis">
    ${kpi('Exams', list.filter(a => a.type === 'exam').length, 'in this view', 'highlight')}
    ${kpi('Quizzes', list.filter(a => a.type === 'quiz').length, 'in this view')}
    ${kpi('Average grade', scoreCell(allAvg), 'mean of class averages')}
    ${kpi('Scores entered', sum(list, a => assessmentAvg(a).n), 'student results')}
  </div>
  <div class="card">
    <div class="card-head"><h2>All exams & quizzes</h2>
      <div class="row">
        <select data-gfilter="group" aria-label="Group"><option value="">All groups</option><option value="none" ${f.group === 'none' ? 'selected' : ''}>Individual (no group)</option>${state.groups.map(g => `<option value="${g.id}" ${f.group === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
        <select data-gfilter="type" aria-label="Type"><option value="">Exams & quizzes</option><option value="exam" ${f.type === 'exam' ? 'selected' : ''}>Exams</option><option value="quiz" ${f.type === 'quiz' ? 'selected' : ''}>Quizzes</option></select>
      </div>
    </div>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>For</th><th class="num">Max</th><th class="num">Graded</th><th class="num">Avg</th><th class="num">High</th><th class="num">Low</th></tr></thead>
      <tbody>${list.map(a => { const v = assessmentAvg(a); return `<tr class="click" data-action="edit-assessment" data-id="${a.id}">
        <td>${fmtDate(a.date)} ${a.date.slice(0, 4)}</td><td>${typeBadge(a.type)}</td><td><b>${esc(a.title)}</b></td>
        <td>${a.groupId ? esc(group(a.groupId)?.name || 'Deleted group') : (v.n === 1 ? esc(sName(a.scores.find(s => s.score !== '' && s.score != null)?.studentId)) : 'Individual')}</td>
        <td class="num">${num(a.maxScore)}</td><td class="num">${v.n}</td><td class="num">${scoreCell(v.avg)}</td><td class="num">${pct(v.hi)}</td><td class="num">${pct(v.lo)}</td></tr>`; }).join('')}</tbody>
    </table></div>` : '<p class="empty-note">No exams or quizzes yet. Add one to start tracking grades.</p>'}
  </div>`;
};

/* --- Billing --- */
views.billing = () => {
  const owedRows = state.students.map(st => {
    const l = chargedLines().filter(x => x.a.studentId === st.id && !x.a.paid);
    return { st, n: l.length, h: sum(l, x => +x.s.duration), total: sum(l, x => x.amt) };
  }).filter(x => x.n).sort((a, b) => b.total - a.total);
  const f = ui.filter;
  const list = allLines().filter(({ s, a }) =>
    (!f.student || a.studentId === f.student) &&
    (!f.group || (f.group === 'none' ? !s.groupId : s.groupId === f.group)) &&
    (!f.status || s.status === f.status) &&
    (!f.month || s.date.startsWith(f.month)) &&
    (!f.paid || (isCharged(s, a) && (f.paid === 'paid' ? a.paid : !a.paid)))
  ).sort((x, y) => byDateDesc(x.s, y.s));
  const charged = list.filter(l => isCharged(l.s, l.a));
  const shown = list.slice(0, 300);
  const any = f.student || f.group || f.status || f.paid || f.month;
  return `
  <div class="page-head">
    <div><h1>Billing</h1><p>Who owes what — every student in every lesson</p></div>
    <button class="btn ghost" data-action="export-csv">Export CSV</button>
  </div>
  <div class="card mb">
    <div class="card-head"><h2>Outstanding by student</h2><span>${money(sum(owedRows, x => x.total))} total</span></div>
    ${owedRows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Student</th><th class="num">Unpaid lessons</th><th class="num">Hours</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${owedRows.map(x => `<tr><td><span class="dot" style="--c:${x.st.color}"></span>${esc(x.st.name)}</td><td class="num">${x.n}</td><td class="num">${hrs(x.h)}</td><td class="num"><b>${money(x.total)}</b></td>
        <td class="num"><button class="btn sm" data-action="payall" data-id="${x.st.id}">Record payment</button></td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty-note">Everyone is paid up. 🎉</p>'}
  </div>
  <div class="card">
    <div class="card-head"><h2>Student lessons</h2>
      <div class="row">
        <select data-filter="student" aria-label="Student"><option value="">All students</option>${state.students.map(s => `<option value="${s.id}" ${f.student === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select data-filter="group" aria-label="Group"><option value="">All lessons</option><option value="none" ${f.group === 'none' ? 'selected' : ''}>Private only</option>${state.groups.map(g => `<option value="${g.id}" ${f.group === g.id ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
        <select data-filter="status" aria-label="Status"><option value="">Any status</option>${['scheduled', 'done', 'cancelled'].map(x => `<option value="${x}" ${f.status === x ? 'selected' : ''}>${STATUS[x]}</option>`).join('')}</select>
        <select data-filter="paid" aria-label="Payment"><option value="">Paid & unpaid</option><option value="paid" ${f.paid === 'paid' ? 'selected' : ''}>Paid</option><option value="unpaid" ${f.paid === 'unpaid' ? 'selected' : ''}>Unpaid</option></select>
        <input type="month" data-filter="month" value="${f.month}" aria-label="Month">
        ${any ? '<button class="btn sm ghost" data-action="clear-filters">Clear</button>' : ''}
      </div>
    </div>
    ${shown.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Time</th><th>Student</th><th>Lesson</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${shown.map(({ s, a, amt }) => `<tr>
        <td>${fmtDate(s.date)} ${s.date.slice(0, 4)}</td><td>${s.start}–${endTime(s.start, s.duration)}</td>
        <td><span class="dot" style="--c:${sColor(a.studentId)}"></span>${esc(sName(a.studentId))}</td>
        <td>${esc(group(s.groupId)?.name || 'Private')}</td>
        <td class="num">${hrs(s.duration)}</td><td class="num">${money(a.rate)}</td>
        <td class="num">${s.status === 'cancelled' || (s.status === 'done' && a.present === false) ? '<span class="muted">—</span>' : money(amt)}</td>
        <td>${lineBadge(s, a)}</td>
        <td class="num">${isCharged(s, a) ? `<button class="btn sm ${a.paid ? 'ghost' : ''}" data-action="paid" data-id="${s.id}" data-st="${a.studentId}">${a.paid ? 'Unpay' : 'Mark paid'}</button>` : ''}${s.status === 'scheduled' ? `<button class="btn sm" data-action="done" data-id="${s.id}">✓ Done</button>` : ''}<button class="btn sm ghost" data-action="edit-session" data-id="${s.id}">Edit</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">Charged in this view</td><td class="num"></td><td></td><td class="num">${money(sum(charged, l => l.amt))}</td><td colspan="2">${money(sum(charged.filter(l => l.a.paid), l => l.amt))} paid</td></tr></tfoot>
    </table></div>${list.length > 300 ? `<p class="hint">Showing latest 300 of ${list.length}. Use filters or export CSV.</p>` : ''}` : '<p class="empty-note">No lessons match these filters.</p>'}
  </div>`;
};

views.settings = () => {
  const s = state.settings;
  return `
  <div class="page-head"><div><h1>Settings</h1><p>Preferences and your data</p></div></div>
  <div class="grid halves">
    <form class="card" id="settingsForm">
      <h2 class="mb-s">Preferences</h2>
      <div class="field"><label for="tn">Teacher name</label><input type="text" id="tn" name="teacherName" value="${esc(s.teacherName)}" placeholder="e.g. Ms. Sara"></div>
      <div class="fields">
        <div class="field"><label for="cur">Currency</label><input type="text" id="cur" name="currency" value="${esc(s.currency)}" maxlength="6" required></div>
        <div class="field"><label for="dd">Default lesson length (h)</label><input type="number" id="dd" name="defaultDuration" value="${s.defaultDuration}" min="0.25" step="0.25"></div>
      </div>
      <div class="field"><label for="wsd">Week starts on</label>
        <select id="wsd" name="weekStart">${[[6, 'Saturday'], [0, 'Sunday'], [1, 'Monday']].map(([v, l]) => `<option value="${v}" ${+s.weekStart === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <button class="btn" type="submit">Save preferences</button>
    </form>
    <div class="card">
      <h2 class="mb-s">Your data</h2>
      <p class="muted" style="margin-top:0">Everything is saved in this browser only. Export a backup regularly, and import it to move to another device.</p>
      <div class="list">
        <button class="btn ghost" data-action="export-json">⬇ Export backup (JSON)</button>
        <button class="btn ghost" data-action="import">⬆ Import backup</button>
        <button class="btn ghost" data-action="export-csv">⬇ Export lessons & payments (CSV / Excel)</button>
        <button class="btn ghost" data-action="export-grades">⬇ Export grades (CSV / Excel)</button>
        <button class="btn ghost" data-action="sample">Load sample data</button>
        <button class="btn danger" data-action="reset">Delete all data</button>
      </div>
      <p class="hint">${state.students.length} students · ${state.groups.length} groups · ${state.sessions.length} lessons · ${state.assessments.length} exams & quizzes stored</p>
    </div>
  </div>`;
};

/* ---------- render & routing ---------- */
const TAB_OF = { student: 'students', group: 'groups' };
function render() {
  if (!views[ui.view]) ui.view = 'dashboard';
  const tab = TAB_OF[ui.view] || ui.view;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === tab));
  $('#teacherLabel').textContent = state.settings.teacherName || 'Lessons, groups & grades';
  Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; });
  $('#view').innerHTML = views[ui.view]();
  if (after[ui.view]) after[ui.view]();
}
function go(view, id = null) {
  ui.view = view; ui.id = id;
  try { history.replaceState(null, '', '#' + view + (id ? '/' + id : '')); } catch (e) { /* ignore */ }
  render();
  window.scrollTo(0, 0);
}
function readHash() {
  const [v, id] = location.hash.slice(1).split('/');
  ui.view = views[v] ? v : 'dashboard';
  ui.id = id || null;
}

/* ---------- modal forms ---------- */
function openModal(html, onSubmit, wide = false) {
  const m = $('#modal'), f = $('#modalForm');
  m.classList.toggle('wide', wide);
  f.innerHTML = html;
  f.onsubmit = e => {
    e.preventDefault();
    const act = e.submitter?.value || 'save';
    if (act === 'cancel') { m.close(); return; }
    if (act === 'save' && !f.checkValidity()) { f.reportValidity(); return; }
    const fd = Object.fromEntries(new FormData(f));
    if (onSubmit(fd, act, f) !== false) m.close();
  };
  m.showModal();
}
const statusOptions = cur => ['scheduled', 'done', 'cancelled'].map(x => `<option value="${x}" ${cur === x ? 'selected' : ''}>${STATUS[x]}</option>`).join('');

function sessionForm(existing, preset = {}) {
  if (!activeStudents().length && !existing) { toast('Add a student first'); go('students'); return; }
  const isNew = !existing;
  const pg = group(preset.groupId);
  const s = existing || {
    date: preset.date || todayISO(), start: '16:00', duration: +state.settings.defaultDuration || 1,
    status: 'scheduled', notes: '', groupId: pg ? pg.id : null,
    attendees: pg ? pg.studentIds.filter(student).map(id => ({ studentId: id, rate: +(pg.rate || student(id).rate) || 0, present: true, paid: false }))
      : preset.studentId ? [{ studentId: preset.studentId, rate: +student(preset.studentId)?.rate || 0, present: true, paid: false }] : []
  };
  const att = new Map(s.attendees.map(a => [a.studentId, a]));
  const ids = [...new Set([...s.attendees.map(a => a.studentId), ...activeStudents().map(x => x.id)])].filter(student);
  ids.sort((a, b) => (att.has(b) - att.has(a)) || sName(a).localeCompare(sName(b)));
  const rows = ids.map(id => {
    const st = student(id), a = att.get(id);
    return `<div class="att-row ${a ? 'on' : ''}" data-row="${id}" style="--c:${st.color}">
      <label class="check"><input type="checkbox" data-inc ${a ? 'checked' : ''}><span>${esc(st.name)}</span></label>
      <input type="number" data-rate min="0" step="any" value="${a ? a.rate : st.rate}" aria-label="Rate per hour for ${esc(st.name)}">
      <label class="mini"><input type="checkbox" data-present ${!a || a.present !== false ? 'checked' : ''}> Present</label>
      <label class="mini"><input type="checkbox" data-paid ${a && a.paid ? 'checked' : ''}> Paid</label>
    </div>`;
  }).join('');
  openModal(`
    <h2>${isNew ? 'New lesson' : 'Edit lesson'}</h2>
    <div class="field"><label for="f-g">Group</label>
      <select id="f-g" name="groupId"><option value="">Private / pick students</option>${state.groups.filter(g => g.active !== false || g.id === s.groupId).map(g => `<option value="${g.id}" ${g.id === s.groupId ? 'selected' : ''}>${esc(g.name)} (${g.studentIds.length})</option>`).join('')}</select></div>
    <div class="field"><label>Students & rate per hour</label>
      <div class="att-list ${s.status === 'done' ? '' : 'not-done'}" id="attList">${rows}</div>
      <p class="hint" id="attHint">Tick the students in this lesson. Each student has their own rate and payment. When the lesson is Done, absent students are not charged.</p></div>
    <div class="fields">
      <div class="field"><label for="f-d">Date</label><input type="date" id="f-d" name="date" value="${s.date}" required></div>
      <div class="field"><label for="f-t">Start time</label><input type="time" id="f-t" name="start" value="${s.start}" required></div>
      <div class="field"><label for="f-du">Duration (hours)</label><input type="number" id="f-du" name="duration" value="${s.duration}" min="0.25" max="12" step="0.25" required></div>
      <div class="field"><label for="f-s">Status</label><select id="f-s" name="status">${statusOptions(s.status)}</select></div>
      ${isNew ? `<div class="field"><label for="f-rep">Repeat weekly</label><select id="f-rep" name="repeat">${[1, 2, 4, 8, 12, 16, 24].map(n => `<option value="${n}">${n === 1 ? 'Just once' : n + ' weeks'}</option>`).join('')}</select></div>` : ''}
    </div>
    <div class="field"><label for="f-n">Notes</label><textarea id="f-n" name="notes" rows="2" placeholder="Topic, homework…">${esc(s.notes)}</textarea></div>
    <div class="preview" id="f-prev"></div>
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}<span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="save">${isNew ? 'Add lesson' : 'Save'}</button>
    </div>`,
    (fd, act, f) => {
      if (act === 'delete') {
        if (!confirm('Delete this lesson?')) return false;
        state.sessions = state.sessions.filter(x => x.id !== existing.id);
        commit('Lesson deleted'); return;
      }
      const done = fd.status === 'done';
      const attendees = [...f.querySelectorAll('.att-row')].filter(r => r.querySelector('[data-inc]').checked).map(r => {
        const present = !done || r.querySelector('[data-present]').checked;
        return { studentId: r.dataset.row, rate: +r.querySelector('[data-rate]').value || 0, present, paid: done && present && r.querySelector('[data-paid]').checked };
      });
      if (!attendees.length) { toast('Choose at least one student'); return false; }
      const data = { date: fd.date, start: fd.start, duration: +fd.duration, status: fd.status, groupId: fd.groupId || null, notes: (fd.notes || '').trim(), attendees };
      const clash = data.status !== 'cancelled' && state.sessions.find(x => x !== existing && x.status !== 'cancelled' && x.date === data.date &&
        toMin(data.start) < toMin(x.start) + x.duration * 60 && toMin(x.start) < toMin(data.start) + data.duration * 60);
      if (clash && !confirm(`This overlaps with ${sessionLabel(clash)} at ${clash.start}. Save anyway?`)) return false;
      if (isNew) {
        const n = Math.max(1, Math.min(52, +fd.repeat || 1));
        for (let i = 0; i < n; i++) {
          state.sessions.push({
            id: uid(), ...data, date: toISO(addDays(fromISO(data.date), 7 * i)),
            status: i ? 'scheduled' : data.status,
            attendees: data.attendees.map(a => i ? { ...a, present: true, paid: false } : { ...a })
          });
        }
        commit(n > 1 ? `${n} weekly lessons added` : 'Lesson added');
      } else { Object.assign(existing, data); commit('Lesson updated'); }
    }, true);

  const f = $('#modalForm'), list = $('#attList');
  const upd = () => {
    const d = +f.duration.value || 0, done = f.status.value === 'done';
    list.classList.toggle('not-done', !done);
    let n = 0, total = 0;
    f.querySelectorAll('.att-row').forEach(r => {
      const on = r.querySelector('[data-inc]').checked;
      r.classList.toggle('on', on);
      if (!on) return;
      n++;
      if (!done || r.querySelector('[data-present]').checked) total += d * (+r.querySelector('[data-rate]').value || 0);
    });
    $('#f-prev').textContent = `${n} student${n === 1 ? '' : 's'} · ${d} h · total ${num(total)} ${state.settings.currency}  ·  ends ${f.start.value ? endTime(f.start.value, d) : '—'}`;
  };
  f.groupId.onchange = () => {
    const g = group(f.groupId.value);
    if (!g) { upd(); return; }
    f.querySelectorAll('.att-row').forEach(r => {
      const inG = g.studentIds.includes(r.dataset.row);
      r.querySelector('[data-inc]').checked = inG;
      if (inG) r.querySelector('[data-rate]').value = +(g.rate || student(r.dataset.row)?.rate) || 0;
    });
    upd();
  };
  list.addEventListener('input', upd);
  list.addEventListener('change', upd);
  f.duration.oninput = f.start.oninput = f.status.onchange = upd;
  upd();
}

function studentForm(st) {
  const isNew = !st;
  const s = st || { name: '', rate: '', phone: '', parentPhone: '', level: '', notes: '', color: COLORS[state.students.length % COLORS.length], active: true };
  openModal(`
    <h2>${isNew ? 'New student' : 'Edit student'}</h2>
    <div class="field"><label for="s-n">Name</label><input type="text" id="s-n" name="name" value="${esc(s.name)}" required></div>
    <div class="fields">
      <div class="field"><label for="s-r">Private hourly rate (${esc(state.settings.currency)})</label><input type="number" id="s-r" name="rate" value="${s.rate}" min="0" step="any" required></div>
      <div class="field"><label for="s-l">Level / grade</label><input type="text" id="s-l" name="level" value="${esc(s.level || '')}" placeholder="e.g. Grade 6, B1, IELTS"></div>
      <div class="field"><label for="s-p">Phone / WhatsApp</label><input type="tel" id="s-p" name="phone" value="${esc(s.phone)}"></div>
      <div class="field"><label for="s-pp">Parent phone</label><input type="tel" id="s-pp" name="parentPhone" value="${esc(s.parentPhone || '')}"></div>
      <div class="field"><label for="s-c">Colour</label><select id="s-c" name="color">${COLORS.map((c, i) => `<option value="${c}" ${c === s.color ? 'selected' : ''}>${COLOR_NAMES[i]}</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}> Active student</label></div>
    </div>
    <div class="field"><label for="s-no">Notes</label><textarea id="s-no" name="notes" rows="2" placeholder="Goals, strengths, what to work on…">${esc(s.notes)}</textarea></div>
    <p class="hint">Add the student to a group from the Groups page. Changing the rate only affects new lessons.</p>
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}<span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="save">${isNew ? 'Add student' : 'Save'}</button>
    </div>`,
    (fd, act) => {
      if (act === 'delete') {
        if (!confirm(`Delete ${st.name} with all their lesson records and grades? This cannot be undone.\nTip: untick "Active" instead to keep their history.`)) return false;
        state.students = state.students.filter(x => x.id !== st.id);
        state.sessions.forEach(x => { x.attendees = x.attendees.filter(a => a.studentId !== st.id); });
        state.sessions = state.sessions.filter(x => x.attendees.length);
        state.groups.forEach(g => { g.studentIds = g.studentIds.filter(id => id !== st.id); });
        state.assessments.forEach(a => { a.scores = a.scores.filter(x => x.studentId !== st.id); });
        commit('Student deleted');
        if (ui.view === 'student') go('students');
        return;
      }
      const data = { name: fd.name.trim(), rate: +fd.rate, level: (fd.level || '').trim(), phone: (fd.phone || '').trim(), parentPhone: (fd.parentPhone || '').trim(), color: fd.color, notes: (fd.notes || '').trim(), active: !!fd.active };
      if (!data.name) { toast('Name is required'); return false; }
      if (isNew) { state.students.push({ id: uid(), ...data }); commit('Student added'); }
      else { Object.assign(st, data); commit('Student updated'); }
    });
}

function groupForm(g) {
  if (!state.students.length) { toast('Add students first'); go('students'); return; }
  const isNew = !g;
  const x = g || { name: '', rate: '', color: COLORS[(state.groups.length + 2) % COLORS.length], studentIds: [], notes: '', active: true };
  const ids = [...new Set([...x.studentIds, ...activeStudents().map(s => s.id)])].filter(student);
  openModal(`
    <h2>${isNew ? 'New group' : 'Edit group'}</h2>
    <div class="field"><label for="g-n">Group name</label><input type="text" id="g-n" name="name" value="${esc(x.name)}" placeholder="e.g. Grade 6 — Group A" required></div>
    <div class="fields">
      <div class="field"><label for="g-r">Rate per student / hour</label><input type="number" id="g-r" name="rate" value="${x.rate ?? ''}" min="0" step="any" placeholder="Leave empty = own rate"></div>
      <div class="field"><label for="g-c">Colour</label><select id="g-c" name="color">${COLORS.map((c, i) => `<option value="${c}" ${c === x.color ? 'selected' : ''}>${COLOR_NAMES[i]}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>Students <span id="g-count"></span></label>
      <div class="att-list">${ids.map(id => { const st = student(id); return `<label class="check member-row" style="--c:${st.color}"><input type="checkbox" name="m_${id}" ${x.studentIds.includes(id) ? 'checked' : ''}><span class="dot"></span>${esc(st.name)}${st.level ? `<span class="muted small"> · ${esc(st.level)}</span>` : ''}</label>`; }).join('')}</div></div>
    <div class="field"><label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> Active group</label></div>
    <div class="field"><label for="g-no">Notes</label><textarea id="g-no" name="notes" rows="2" placeholder="Book, schedule, syllabus…">${esc(x.notes)}</textarea></div>
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}<span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="save">${isNew ? 'Create group' : 'Save'}</button>
    </div>`,
    (fd, act) => {
      if (act === 'delete') {
        if (!confirm(`Delete group "${g.name}"? Its lessons and grades stay in each student's history.`)) return false;
        state.groups = state.groups.filter(y => y.id !== g.id);
        state.sessions.forEach(s => { if (s.groupId === g.id) s.groupId = null; });
        state.assessments.forEach(a => { if (a.groupId === g.id) a.groupId = null; });
        commit('Group deleted');
        if (ui.view === 'group') go('groups');
        return;
      }
      const data = {
        name: fd.name.trim(), rate: fd.rate === '' ? '' : +fd.rate, color: fd.color, notes: (fd.notes || '').trim(), active: !!fd.active,
        studentIds: Object.keys(fd).filter(k => k.startsWith('m_')).map(k => k.slice(2))
      };
      if (!data.name) { toast('Name is required'); return false; }
      if (isNew) { const id = uid(); state.groups.push({ id, ...data }); persist(); go('group', id); toast('Group created'); }
      else { Object.assign(g, data); commit('Group updated'); }
    });
  const f = $('#modalForm');
  const cnt = () => { $('#g-count').textContent = `(${f.querySelectorAll('.member-row input:checked').length} selected)`; };
  f.addEventListener('change', cnt);
  cnt();
}

function assessmentForm(existing, preset = {}) {
  if (!state.students.length) { toast('Add a student first'); go('students'); return; }
  const isNew = !existing;
  const type = preset.type || 'quiz';
  const a = existing || { type, title: '', date: todayISO(), maxScore: type === 'exam' ? 100 : 20, groupId: group(preset.groupId) ? preset.groupId : null, scores: [], notes: '' };
  const vals = new Map(a.scores.map(x => [x.studentId, x.score]));
  const candidates = gid => {
    const g = group(gid);
    const ids = g ? [...g.studentIds] : activeStudents().map(s => s.id);
    a.scores.forEach(x => { if (!ids.includes(x.studentId)) ids.push(x.studentId); });
    if (preset.studentId) { const i = ids.indexOf(preset.studentId); if (i > 0) ids.splice(i, 1); if (i !== 0) ids.unshift(preset.studentId); }
    return ids.map(student).filter(Boolean);
  };
  const rowsHtml = gid => candidates(gid).map(st => `<div class="score-row" data-row="${st.id}" style="--c:${st.color}">
      <span><span class="dot"></span>${esc(st.name)}</span>
      <input type="number" data-score min="0" step="any" value="${vals.has(st.id) && vals.get(st.id) !== '' ? esc(vals.get(st.id)) : ''}" placeholder="—" aria-label="Score for ${esc(st.name)}">
    </div>`).join('') || '<p class="empty-note">No students in this group yet.</p>';
  openModal(`
    <h2>${isNew ? (a.type === 'exam' ? 'New exam' : 'New quiz') : 'Edit ' + (a.type === 'exam' ? 'exam' : 'quiz')}</h2>
    <div class="fields">
      <div class="field"><label for="a-t">Type</label><select id="a-t" name="type"><option value="quiz" ${a.type === 'quiz' ? 'selected' : ''}>Quiz</option><option value="exam" ${a.type === 'exam' ? 'selected' : ''}>Exam</option></select></div>
      <div class="field"><label for="a-d">Date</label><input type="date" id="a-d" name="date" value="${a.date}" required></div>
    </div>
    <div class="field"><label for="a-ti">Title</label><input type="text" id="a-ti" name="title" value="${esc(a.title)}" placeholder="e.g. Unit 3 vocabulary" required></div>
    <div class="fields">
      <div class="field"><label for="a-g">Group</label><select id="a-g" name="groupId"><option value="">Individual students</option>${state.groups.filter(g => g.active !== false || g.id === a.groupId).map(g => `<option value="${g.id}" ${g.id === a.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="a-m">Out of (max score)</label><input type="number" id="a-m" name="maxScore" value="${a.maxScore}" min="1" step="any" required></div>
    </div>
    <div class="field"><label>Scores <span class="muted">(leave empty if the student didn't take it)</span></label>
      <div class="att-list score-list" id="scoreList">${rowsHtml(a.groupId)}</div></div>
    <div class="field"><label for="a-no">Notes</label><textarea id="a-no" name="notes" rows="2">${esc(a.notes || '')}</textarea></div>
    <div class="preview" id="a-prev"></div>
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}<span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="save">${isNew ? 'Save grades' : 'Save'}</button>
    </div>`,
    (fd, act, f) => {
      if (act === 'delete') {
        if (!confirm(`Delete "${existing.title}" and all its scores?`)) return false;
        state.assessments = state.assessments.filter(x => x.id !== existing.id);
        commit('Deleted'); return;
      }
      const max = +fd.maxScore;
      const scores = [...f.querySelectorAll('.score-row')].map(r => ({ studentId: r.dataset.row, v: r.querySelector('[data-score]').value }))
        .filter(x => x.v !== '').map(x => ({ studentId: x.studentId, score: +x.v }));
      const over = scores.find(x => x.score > max);
      if (over) { toast(`${sName(over.studentId)}'s score is higher than ${num(max)}`); return false; }
      if (!scores.length && !confirm('No scores entered. Save anyway?')) return false;
      const data = { type: fd.type, title: fd.title.trim(), date: fd.date, maxScore: max, groupId: fd.groupId || null, notes: (fd.notes || '').trim(), scores };
      if (isNew) { state.assessments.push({ id: uid(), ...data }); commit(`${data.type === 'exam' ? 'Exam' : 'Quiz'} saved`); }
      else { Object.assign(existing, data); commit('Grades updated'); }
    }, true);
  const f = $('#modalForm'), list = $('#scoreList');
  const upd = () => {
    const max = +f.maxScore.value || 0;
    const v = [...list.querySelectorAll('[data-score]')].filter(i => i.value !== '').map(i => +i.value);
    $('#a-prev').textContent = v.length && max ? `${v.length} graded · average ${num(avg(v))} / ${num(max)} (${Math.round(avg(v) / max * 100)}%)` : 'Enter scores to see the class average';
  };
  f.groupId.onchange = () => {
    list.querySelectorAll('.score-row').forEach(r => vals.set(r.dataset.row, r.querySelector('[data-score]').value));
    list.innerHTML = rowsHtml(f.groupId.value || null);
    upd();
  };
  list.addEventListener('input', upd);
  f.maxScore.oninput = upd;
  upd();
}

/* ---------- data import / export ---------- */
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const toCSV = rows => '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
function exportCSV() {
  const rows = [['Date', 'Start', 'End', 'Student', 'Group', 'Hours', 'Rate', 'Amount', 'Currency', 'Status', 'Attendance', 'Paid', 'Notes']];
  sortSessions([...state.sessions]).forEach(s => s.attendees.forEach(a => rows.push([
    s.date, s.start, endTime(s.start, s.duration), sName(a.studentId), group(s.groupId)?.name || 'Private', s.duration, a.rate,
    isCharged(s, a) ? lineAmt(s, a) : 0, state.settings.currency, s.status,
    s.status === 'done' ? (a.present === false ? 'absent' : 'present') : '', isCharged(s, a) ? (a.paid ? 'yes' : 'no') : '', s.notes || ''])));
  download(toCSV(rows), `teacher-helper-lessons-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}
function exportGrades() {
  const rows = [['Date', 'Type', 'Title', 'Group', 'Student', 'Score', 'Max', 'Percent']];
  [...state.assessments].sort((a, b) => a.date.localeCompare(b.date)).forEach(a => a.scores.forEach(x => rows.push([
    a.date, a.type, a.title, group(a.groupId)?.name || 'Individual', sName(x.studentId), x.score, a.maxScore, Math.round(x.score / a.maxScore * 100) + '%'])));
  download(toCSV(rows), `teacher-helper-grades-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}
function importJSON(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.students) || !Array.isArray(d.sessions)) throw new Error('bad');
      if (!confirm(`Import ${d.students.length} students and ${d.sessions.length} lessons? This replaces your current data.`)) return;
      state = migrate(d);
      commit('Backup imported');
    } catch (e) { toast('That file is not a valid Teacher Helper backup'); }
  };
  r.readAsText(file);
}
function loadSample() {
  if ((state.students.length || state.sessions.length) && !confirm('Replace your current data with sample data?')) return;
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const mk = (name, rate, level, i) => ({ id: uid() + i, name, rate, level, phone: '', parentPhone: '', color: COLORS[i % COLORS.length], notes: '', active: true });
  const S = [mk('Mariam Adel', 200, 'Grade 6', 0), mk('Omar Khaled', 200, 'Grade 6', 1), mk('Nour Hassan', 200, 'Grade 6', 2), mk('Hana Mostafa', 200, 'Grade 6', 3),
    mk('Karim Fathy', 350, 'IELTS', 4), mk('Salma Tarek', 350, 'IELTS', 5), mk('Youssef Samir', 300, 'B1', 6)];
  const ability = [0.9, 0.72, 0.55, 0.8, 0.68, 0.82, 0.62];
  const G = [
    { id: uid() + 'g1', name: 'Grade 6 — Group A', color: COLORS[0], rate: 150, studentIds: S.slice(0, 4).map(s => s.id), notes: 'Sun & Wed 4pm', active: true },
    { id: uid() + 'g2', name: 'IELTS Prep', color: COLORS[5], rate: 300, studentIds: [S[4].id, S[5].id], notes: 'Mon & Thu 6pm', active: true }
  ];
  const plans = [
    { groupId: G[0].id, members: S.slice(0, 4), rate: 150, days: [0, 3], start: '16:00', dur: 1.5 },
    { groupId: G[1].id, members: [S[4], S[5]], rate: 300, days: [1, 4], start: '18:00', dur: 2 },
    { groupId: null, members: [S[6]], rate: 300, days: [6, 2], start: '15:00', dur: 1 }
  ];
  const sessions = [], assessments = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = todayISO();
  const scoreOf = (st, off, max) => {
    const i = S.indexOf(st);
    const p = Math.max(0.3, Math.min(1, ability[i] + (off + 150) / 150 * 0.08 + (rnd() - 0.5) * 0.2));
    return Math.round(p * max * 2) / 2;
  };
  const addAsm = (type, title, iso, off, max, groupId, members) => assessments.push({
    id: uid() + assessments.length, type, title, date: iso, maxScore: max, groupId, notes: '',
    scores: members.filter(() => rnd() > 0.05).map(m => ({ studentId: m.id, score: scoreOf(m, off, max) }))
  });
  let qa = 0, ea = 0, mi = 0, yq = 0;
  for (let off = -150; off <= 14; off++) {
    const d = addDays(today, off), iso = toISO(d), past = iso < t;
    plans.forEach(p => {
      if (!p.days.includes(d.getDay())) return;
      const cancelled = past && rnd() < 0.05;
      sessions.push({
        id: uid() + sessions.length, date: iso, start: p.start, duration: p.dur, groupId: p.groupId, notes: '',
        status: past ? (cancelled ? 'cancelled' : 'done') : 'scheduled',
        attendees: p.members.map(m => {
          const present = !past || rnd() > 0.07;
          return { studentId: m.id, rate: p.rate, present, paid: past && !cancelled && present && (off < -14 || rnd() < 0.4) };
        })
      });
    });
    if (off >= 0) continue;
    const k = off + 150;
    if (k % 14 === 7) addAsm('quiz', `Quiz ${++qa}: Unit ${qa}`, iso, off, 20, G[0].id, S.slice(0, 4));
    if (k % 30 === 29) addAsm('exam', `Monthly exam ${++ea}`, iso, off, 50, G[0].id, S.slice(0, 4));
    if (k % 21 === 10) addAsm('exam', `Mock test ${++mi}`, iso, off, 40, G[1].id, [S[4], S[5]]);
    if (k % 21 === 15) addAsm('quiz', `Grammar quiz ${++yq}`, iso, off, 10, null, [S[6]]);
  }
  state = { ...defaults(), students: S, groups: G, sessions, assessments, settings: { ...state.settings } };
  persist();
  go('dashboard');
  toast('Sample data loaded');
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-view],[data-action]');
  if (!t || t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.closest('dialog')) return;
  if (t.dataset.view) { go(t.dataset.view); return; }
  const id = t.dataset.id;
  const s = state.sessions.find(x => x.id === id);
  switch (t.dataset.action) {
    case 'open-student': go('student', id); break;
    case 'open-group': go('group', id); break;
    case 'add-session': sessionForm(null, { date: t.dataset.date, studentId: t.dataset.student, groupId: t.dataset.group }); break;
    case 'edit-session': if (s) sessionForm(s); break;
    case 'done': if (s) { s.status = 'done'; commit(s.attendees.length > 1 ? 'Marked as done — tap "Attendance & pay" to record absences' : 'Marked as done'); } break;
    case 'cancel': if (s) { s.status = 'cancelled'; s.attendees.forEach(a => { a.paid = false; }); commit('Lesson cancelled'); } break;
    case 'paid': {
      const a = s && s.attendees.find(x => x.studentId === t.dataset.st);
      if (a) { a.paid = !a.paid; commit(a.paid ? 'Marked as paid' : 'Marked as unpaid'); }
      break;
    }
    case 'confirm-all': {
      const l = state.sessions.filter(isOverdue);
      if (confirm(`Mark ${l.length} past lessons as done (everyone present)?`)) { l.forEach(x => { x.status = 'done'; }); commit('Lessons confirmed'); }
      break;
    }
    case 'add-student': studentForm(); break;
    case 'edit-student': studentForm(student(id)); break;
    case 'add-group': groupForm(); break;
    case 'edit-group': groupForm(group(id)); break;
    case 'add-assessment': assessmentForm(null, { type: t.dataset.type, groupId: t.dataset.group, studentId: t.dataset.student }); break;
    case 'edit-assessment': { const a = state.assessments.find(x => x.id === id); if (a) assessmentForm(a); break; }
    case 'payall': {
      const gid = t.dataset.group;
      const l = chargedLines().filter(x => x.a.studentId === id && !x.a.paid && (!gid || x.s.groupId === gid));
      if (l.length && confirm(`Record payment of ${plainMoney(sum(l, x => x.amt))} from ${sName(id)} for ${l.length} lessons?`)) {
        l.forEach(x => { x.a.paid = true; }); commit('Payment recorded');
      }
      break;
    }
    case 'week': ui.weekOffset = t.dataset.dir === '0' ? 0 : ui.weekOffset + (+t.dataset.dir); render(); break;
    case 'clear-filters': ui.filter = { student: '', group: '', status: '', paid: '', month: '' }; render(); break;
    case 'export-json': download(JSON.stringify(state, null, 2), `teacher-helper-backup-${todayISO()}.json`, 'application/json'); break;
    case 'export-csv': exportCSV(); break;
    case 'export-grades': exportGrades(); break;
    case 'import': $('#importFile').click(); break;
    case 'sample': loadSample(); break;
    case 'reset':
      if (confirm('Delete ALL students, groups, lessons, grades and settings? Export a backup first if you might need them.')) { state = defaults(); commit('All data deleted'); }
      break;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.closest('dialog')) return;
  if (t.dataset.action === 'period') { ui.period = t.value; render(); }
  else if (t.dataset.filter) { ui.filter[t.dataset.filter] = t.value; render(); }
  else if (t.dataset.gfilter) { ui.gfilter[t.dataset.gfilter] = t.value; render(); }
  else if (t.id === 'importFile') { importJSON(t.files[0]); t.value = ''; }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'settingsForm') return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  state.settings = {
    ...state.settings, teacherName: fd.teacherName.trim(), currency: fd.currency.trim() || 'EGP',
    defaultDuration: Math.max(0.25, +fd.defaultDuration || 1), weekStart: +fd.weekStart
  };
  commit('Preferences saved');
});
window.addEventListener('hashchange', () => {
  const v = ui.view, id = ui.id;
  readHash();
  if (v !== ui.view || id !== ui.id) render();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());

readHash();
render();
