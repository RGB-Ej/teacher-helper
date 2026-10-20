/* Teacher Helper — hourly lessons, groups & student tracker
 * All data is stored locally in the browser (localStorage).
 * Translations live in i18n.js (window.TH_AR).
 */
'use strict';

const KEY = 'teacher-helper-v1';
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const COLOR_NAMES = ['Indigo', 'Sky', 'Green', 'Amber', 'Red', 'Violet', 'Pink', 'Teal'];
const DAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
};
const MONTH_NAMES = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  ar: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
};

/* ---------- language ---------- */
let LANG = 'en';
const AR = window.TH_AR || {};
function t(s, v) {
  let r = LANG === 'ar' && AR[s] != null ? AR[s] : s;
  if (v) r = r.replace(/\{(\w+)\}/g, (m, k) => (v[k] ?? m));
  return r;
}
const dayName = i => DAYS[LANG][i];
const monthName = i => MONTH_NAMES[LANG][i];
const isRTL = () => LANG === 'ar';

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
const sum = (arr, f) => arr.reduce((tot, x) => tot + (f(x) || 0), 0);
const avg = arr => arr.length ? arr.reduce((tot, x) => tot + x, 0) / arr.length : null;
const sortSessions = arr => arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const byDateDesc = (a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || ''));
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const pct = n => n == null ? '—' : Math.round(n) + '%';
const scoreCls = p => p >= 85 ? 'score-good' : p >= 60 ? 'score-mid' : 'score-low';
const scoreCell = p => p == null ? '<span class="muted">—</span>' : `<b class="${scoreCls(p)}">${pct(p)}</b>`;
const num = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n || 0);

/* ---------- state ---------- */
function defaults() {
  const browserAr = (navigator.language || '').toLowerCase().startsWith('ar');
  return {
    version: 2, students: [], groups: [], sessions: [], assessments: [],
    settings: { currency: 'EGP', teacherName: '', weekStart: 6, defaultDuration: 1, lang: browserAr ? 'ar' : 'en' }
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
  catch (e) { toast(t('Could not save — browser storage is full or blocked')); }
}
function commit(msg) { persist(); render(); if (msg) toast(msg); }

/* ---------- domain ---------- */
const money = n => num(n) + ' ' + esc(state.settings.currency);
const plainMoney = n => num(n) + ' ' + state.settings.currency;
const hrs = h => (Math.round((h || 0) * 100) / 100) + ' ' + t('h');
const student = id => state.students.find(s => s.id === id);
const group = id => id ? state.groups.find(g => g.id === id) : null;
const sName = id => student(id)?.name || t('Deleted student');
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
  if (!n.length) return t('No students');
  return n.length > 2 ? `${n.slice(0, 2).join('، ')} +${n.length - 2}` : n.join(isRTL() ? '، ' : ', ');
}
const sessionColor = s => group(s.groupId)?.color || (s.attendees[0] ? sColor(s.attendees[0].studentId) : '#94a3b8');
function endTime(start, dur) { const m = toMin(start) + Math.round(dur * 60); return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`; }
function fmtDate(iso) { const d = fromISO(iso); return `${dayName(d.getDay())} ${d.getDate()} ${monthName(d.getMonth())}`; }
function fmtDM(iso) { const d = fromISO(iso); return `${d.getDate()} ${monthName(d.getMonth())}`; }
const fmtFull = iso => `${fmtDate(iso)} ${iso.slice(0, 4)}`;
function isOverdue(s) {
  const td = todayISO();
  return s.status === 'scheduled' && (s.date < td || (s.date === td && toMin(endTime(s.start, s.duration)) <= toMin(nowHM())));
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
const PERIOD_KEYS = { month: 'This month', last: 'Last month', '3m': 'Last 3 months', year: 'This year', all: 'All time' };
const periodName = k => t(PERIOD_KEYS[k]);
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
const STATUS_KEYS = { scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' };
const statusName = k => t(STATUS_KEYS[k]);
const statusBadge = s => `<span class="badge ${s.status}">${statusName(s.status)}</span>`;
const typeName = k => k === 'exam' ? t('Exam') : t('Quiz');
const typeBadge = k => `<span class="badge ${k}">${typeName(k)}</span>`;
function payBadge(s) {
  if (s.status !== 'done') return '';
  const ch = s.attendees.filter(a => a.present !== false);
  if (!ch.length) return '';
  const p = ch.filter(a => a.paid).length;
  if (p === ch.length) return `<span class="badge paid">${t('Paid')}</span>`;
  if (!p) return `<span class="badge unpaid">${t('Unpaid')}</span>`;
  return `<span class="badge partial">${t('Paid {p}/{n}', { p, n: ch.length })}</span>`;
}
function lineBadge(s, a) {
  if (s.status !== 'done') return statusBadge(s);
  if (a.present === false) return `<span class="badge absent">${t('Absent')}</span>`;
  return `<span class="badge ${a.paid ? 'paid' : 'unpaid'}">${a.paid ? t('Paid') : t('Unpaid')}</span>`;
}
const paidBtn = (s, studentId, paid) => `<button class="btn sm ${paid ? 'ghost' : ''}" data-action="paid" data-id="${s.id}" data-st="${studentId}">${paid ? t('Unpay') : t('Mark paid')}</button>`;
function sessionActions(s) {
  let a = '';
  if (s.status === 'scheduled') a += `<button class="btn sm" data-action="done" data-id="${s.id}">✓ ${t('Done')}</button><button class="btn sm ghost" data-action="cancel" data-id="${s.id}">${t('Cancel')}</button>`;
  if (s.status === 'done' && s.attendees.length === 1 && s.attendees[0].present !== false) a += paidBtn(s, s.attendees[0].studentId, s.attendees[0].paid);
  const multiDone = s.status === 'done' && s.attendees.length > 1;
  return a + `<button class="btn sm ghost" data-action="edit-session" data-id="${s.id}">${multiDone ? t('Attendance & pay') : t('Edit')}</button>`;
}
function sessionRow(s) {
  const n = s.attendees.length;
  return `<div class="srow" style="--c:${sessionColor(s)}">
    <div class="srow-main"><strong>${esc(sessionLabel(s))}</strong>${n > 1 ? `<em class="count">${t('{n} students', { n })}</em>` : ''}
      <span>${fmtDate(s.date)} · ${s.start}–${endTime(s.start, s.duration)} · ${hrs(s.duration)}</span></div>
    <div class="srow-side"><span class="amt">${money(sessionValue(s))}</span>${statusBadge(s)}${payBadge(s)}${sessionActions(s)}</div>
  </div>`;
}
function welcome() {
  return `<div class="card welcome">
    <img class="logo" src="icon.svg" alt="">
    <h1>${t('Welcome to Teacher Helper')}</h1>
    <p>${t('Add your students and groups with their hourly rate, schedule private or group lessons, and track attendance, payments and exam & quiz grades — all in one place.')}</p>
    <div class="row">
      <button class="btn" data-action="add-student">+ ${t('Add first student')}</button>
      <button class="btn ghost" data-action="sample">${t('Try with sample data')}</button>
    </div>
    <div class="row"><button class="btn sm ghost" data-action="toggle-lang">${LANG === 'ar' ? 'English' : 'العربية'}</button></div>
  </div>`;
}
const notFound = (view, what) => `<div class="card welcome"><h1>${t('Not found')}</h1><p>${t('This {what} may have been deleted.', { what })}</p><div class="row"><button class="btn" data-view="${view}">${t('Back')}</button></div></div>`;
const back = (view, label) => `<button class="back" data-view="${view}">${isRTL() ? '→' : '←'} ${label}</button>`;
const optionsHtml = (pairs, cur) => pairs.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('');

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
    <div><h1>${t('Dashboard')}</h1><p>${periodName(ui.period)} · ${r[0] === '0000-01-01' ? t('all records') : fmtDate(r[0]) + (isRTL() ? ' ← ' : ' → ') + fmtDate(r[1])}</p></div>
    <div class="row">
      <select data-action="period" aria-label="${t('Period')}">${optionsHtml(Object.keys(PERIOD_KEYS).map(k => [k, periodName(k)]), ui.period)}</select>
      <button class="btn" data-action="add-session">+ ${t('Lesson')}</button>
    </div>
  </div>

  <div class="grid kpis">
    ${kpi(t('Earned'), money(earned), t('{a} lessons · {b} student-lessons', { a: doneS.length, b: cl.length }), 'highlight')}
    ${kpi(t('Hours taught'), hrs(hours), t('Avg {x} / hour', { x: money(hours ? earned / hours : 0) }))}
    ${kpi(t('Collected'), money(collected), t('{p}% of earned', { p: earned ? Math.round(collected / earned * 100) : 0 }))}
    ${kpi(t('Outstanding (all time)'), money(outstanding), t('{n} unpaid student-lessons', { n: owed.length }), outstanding ? 'alert' : '')}
    ${kpi(t('Next 7 days'), money(sum(nextAll, sessionValue)), t('{a} lessons booked · {b} cancelled in period', { a: nextAll.length, b: cancelled }))}
    ${kpi(t('Average grade'), pct(asmAvg), t('{n} exams & quizzes in period', { n: asm.length }))}
  </div>

  ${toConfirm.length ? `
  <div class="card mb">
    <div class="card-head"><h2>${t('Lessons to confirm ({n})', { n: toConfirm.length })}</h2>
      <button class="btn sm" data-action="confirm-all">${t('Mark all done')}</button></div>
    <div class="list">${toConfirm.slice(0, 6).map(sessionRow).join('')}</div>
    ${toConfirm.length > 6 ? `<p class="hint">${t('+ {n} more in Billing', { n: toConfirm.length - 6 })}</p>` : ''}
  </div>` : ''}

  <div class="grid two">
    <div class="card"><div class="card-head"><h2>${t('Earnings & hours — last 12 months')}</h2></div>
      <div class="chart-box"><canvas id="chartMonthly"></canvas></div></div>
    <div class="card"><div class="card-head"><h2>${t('Hours by student')}</h2><span>${periodName(ui.period)}</span></div>
      ${top.length ? '<div class="chart-box"><canvas id="chartStudents"></canvas></div>' : `<p class="empty-note">${t('No completed lessons in this period.')}</p>`}</div>
  </div>

  <div class="grid halves mt">
    <div class="card"><div class="card-head"><h2>${t('Upcoming lessons')}</h2><button class="btn sm ghost" data-view="schedule">${t('Open schedule')}</button></div>
      <div class="list">${upcoming.length ? upcoming.map(sessionRow).join('') : `<p class="empty-note">${t('Nothing booked for the next 7 days.')}</p>`}</div></div>
    <div class="card"><div class="card-head"><h2>${t('Students')} — ${periodName(ui.period)}</h2><button class="btn sm ghost" data-view="students">${t('All students')}</button></div>
      ${top.length ? `<div class="table-wrap"><table>
        <thead><tr><th>${t('Student')}</th><th class="num">${t('Lessons')}</th><th class="num">${t('Hours')}</th><th class="num">${t('Earned')}</th></tr></thead>
        <tbody>${top.map(x => `<tr class="click" data-action="open-student" data-id="${x.st.id}"><td><span class="dot" style="--c:${x.st.color}"></span>${esc(x.st.name)}</td><td class="num">${x.n}</td><td class="num">${hrs(x.h)}</td><td class="num">${money(x.e)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>${t('Total')}</td><td></td><td></td><td class="num">${money(earned)}</td></tr></tfoot>
      </table></div>` : `<p class="empty-note">${t('No completed lessons in this period.')}</p>`}</div>
  </div>

  <div class="grid halves mt">
    <div class="card"><div class="card-head"><h2>${t('Recent grades')}</h2><button class="btn sm ghost" data-view="grades">${t('All grades')}</button></div>
      ${recent.length ? `<div class="table-wrap"><table>
        <thead><tr><th>${t('Date')}</th><th>${t('Assessment')}</th><th>${t('For')}</th><th class="num">${t('Avg')}</th></tr></thead>
        <tbody>${recent.map(a => `<tr class="click" data-action="edit-assessment" data-id="${a.id}"><td>${fmtDate(a.date)}</td><td>${typeBadge(a.type)} ${esc(a.title)}</td><td>${esc(group(a.groupId)?.name || t('Individual'))}</td><td class="num">${scoreCell(assessmentAvg(a).avg)}</td></tr>`).join('')}</tbody>
      </table></div>` : `<p class="empty-note">${t('No exams or quizzes yet.')} <button class="btn sm ghost" data-action="add-assessment" data-type="quiz">+ ${t('Quiz')}</button></p>`}</div>
    <div class="card"><div class="card-head"><h2>${t('Groups')}</h2><button class="btn sm ghost" data-view="groups">${t('All groups')}</button></div>
      ${grps.length ? `<div class="table-wrap"><table>
        <thead><tr><th>${t('Group')}</th><th class="num">${t('Students')}</th><th class="num">${t('Attendance')}</th><th class="num">${t('Avg grade')}</th><th class="num">${t('Outstanding')}</th></tr></thead>
        <tbody>${grps.map(g => { const x = groupStats(g); return `<tr class="click" data-action="open-group" data-id="${g.id}"><td><span class="dot" style="--c:${g.color}"></span>${esc(g.name)}</td><td class="num">${g.studentIds.length}</td><td class="num">${pct(x.attendance)}</td><td class="num">${scoreCell(x.avgScore)}</td><td class="num">${money(x.outstanding)}</td></tr>`; }).join('')}</tbody>
      </table></div>` : `<p class="empty-note">${t('No groups yet.')} <button class="btn sm ghost" data-action="add-group">+ ${t('Group')}</button></p>`}</div>
  </div>`;
};

function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function mkChart(id, cfg) {
  const el = $('#' + id);
  if (!window.Chart || !el) return;
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.font.family = isRTL() ? 'Cairo, Inter, system-ui, sans-serif' : 'Inter, system-ui, sans-serif';
  cfg.options = cfg.options || {};
  cfg.options.plugins = cfg.options.plugins || {};
  cfg.options.plugins.legend = { ...(cfg.options.plugins.legend || {}), rtl: isRTL() };
  cfg.options.plugins.tooltip = { ...(cfg.options.plugins.tooltip || {}), rtl: isRTL() };
  if (isRTL() && cfg.options.scales?.x) cfg.options.scales.x.reverse = true;
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
      labels: months.map(m => `${monthName(m.getMonth())} ${String(m.getFullYear()).slice(2)}`),
      datasets: [
        { type: 'bar', label: `${t('Earned')} (${state.settings.currency})`, data: months.map(m => sum(cl.filter(l => l.s.date.startsWith(key(m))), l => l.amt)), backgroundColor: cssVar('--accent'), borderRadius: 6, yAxisID: 'y' },
        { type: 'line', label: t('Hours'), data: months.map(m => sum(doneS.filter(s => s.date.startsWith(key(m))), s => +s.duration)), borderColor: cssVar('--accent-2'), backgroundColor: cssVar('--accent-2'), tension: .35, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: {
        y: { position: isRTL() ? 'right' : 'left', beginAtZero: true, grid: { color: gridColor() } },
        y1: { position: isRTL() ? 'left' : 'right', beginAtZero: true, grid: { display: false } },
        x: { grid: { display: false } }
      },
      plugins: { legend: { position: 'bottom' } }
    }
  });
  const r = periodRange(ui.period);
  const rows = state.students.map(st => ({ st, h: sum(cl.filter(l => l.a.studentId === st.id && inRange(l.s, r)), l => +l.s.duration) })).filter(x => x.h);
  mkChart('chartStudents', {
    type: 'doughnut',
    data: { labels: rows.map(x => x.st.name), datasets: [{ data: rows.map(x => x.h), backgroundColor: rows.map(x => x.st.color), borderColor: cssVar('--surface'), borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${hrs(c.raw)}` } } } }
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
  const a = toISO(days[0]), b = toISO(days[6]), td = todayISO();
  const wk = state.sessions.filter(s => s.date >= a && s.date <= b);
  const active = wk.filter(s => s.status !== 'cancelled');
  const label = `${days[0].getDate()} ${monthName(days[0].getMonth())} – ${days[6].getDate()} ${monthName(days[6].getMonth())} ${days[6].getFullYear()}`;
  const prev = isRTL() ? '›' : '‹', next = isRTL() ? '‹' : '›';
  return `
  <div class="page-head">
    <div><h1>${t('Schedule')}</h1><p>${label}</p></div>
    <div class="row">
      <button class="btn ghost icon" data-action="week" data-dir="-1" aria-label="${t('Previous week')}">${prev}</button>
      <button class="btn ghost" data-action="week" data-dir="0">${t('This week')}</button>
      <button class="btn ghost icon" data-action="week" data-dir="1" aria-label="${t('Next week')}">${next}</button>
      <button class="btn" data-action="add-session">+ ${t('Lesson')}</button>
    </div>
  </div>
  <div class="chips">
    <span class="chip">${t('Lessons')} <b>${active.length}</b></span>
    <span class="chip">${t('Planned hours')} <b>${hrs(sum(active, s => +s.duration))}</b></span>
    <span class="chip">${t('Students taught')} <b>${sum(active, s => s.attendees.length)}</b></span>
    <span class="chip">${t('Week value')} <b>${money(sum(active, sessionValue))}</b></span>
    <span class="chip">${t('Done')} <b>${wk.filter(s => s.status === 'done').length}</b></span>
  </div>
  <div class="week">
    ${days.map(d => {
      const iso = toISO(d);
      const list = sortSessions(wk.filter(s => s.date === iso));
      return `<div class="day ${iso === td ? 'today' : ''}">
        <div class="day-head"><span>${dayName(d.getDay())}</span><b>${d.getDate()}</b></div>
        ${list.map(s => `<button class="lesson ${s.status}" style="--c:${sessionColor(s)}" data-action="edit-session" data-id="${s.id}">
          <span class="t">${s.start}–${endTime(s.start, s.duration)}${s.attendees.length > 1 ? ` · ${s.attendees.length} 👥` : ''}</span>
          <span class="n">${esc(sessionLabel(s))}</span></button>`).join('')}
        <button class="add-slot" data-action="add-session" data-date="${iso}" aria-label="${t('Add lesson on {d}', { d: fmtDate(iso) })}">+</button>
      </div>`;
    }).join('')}
  </div>`;
};

/* --- All students dashboard --- */
views.students = () => {
  const head = `<div class="page-head">
    <div><h1>${t('Students')}</h1><p>${t('{a} active students · {b} groups', { a: activeStudents().length, b: activeGroups().length })}</p></div>
    <div class="row"><button class="btn ghost" data-action="add-assessment" data-type="quiz">+ ${t('Grade')}</button><button class="btn" data-action="add-student">+ ${t('Student')}</button></div>
  </div>`;
  if (!state.students.length) return head + welcome();
  const rows = [...state.students]
    .sort((x, y) => (y.active !== false) - (x.active !== false) || x.name.localeCompare(y.name))
    .map(st => ({ st, x: studentStats(st.id), groups: state.groups.filter(g => g.studentIds.includes(st.id)) }));
  const act = rows.filter(r => r.st.active !== false);
  const att = avg(act.map(r => r.x.attendance).filter(v => v != null));
  const sc = avg(act.map(r => r.x.avgScore).filter(v => v != null));
  const owedTotal = sum(act, r => r.x.outstanding);
  const attention = act.map(r => {
    const why = [];
    if (r.x.avgScore != null && r.x.avgScore < 60) why.push(`<span class="badge absent">${t('Avg {p}', { p: pct(r.x.avgScore) })}</span>`);
    if (r.x.attendance != null && r.x.attendance < 85) why.push(`<span class="badge partial">${t('Attendance {p}', { p: pct(r.x.attendance) })}</span>`);
    if (r.x.outstanding > 0) why.push(`<span class="badge unpaid">${t('Owes {x}', { x: money(r.x.outstanding) })}</span>`);
    return { r, why };
  }).filter(a => a.why.length).sort((a, b) => b.why.length - a.why.length || b.r.x.outstanding - a.r.x.outstanding).slice(0, 7);
  return head + `
  <div class="grid kpis">
    ${kpi(t('Active students'), act.length, t('{n} inactive', { n: state.students.length - act.length }), 'highlight')}
    ${kpi(t('Avg attendance'), pct(att), t('across all lessons'))}
    ${kpi(t('Avg grade'), pct(sc), t('{n} exams & quizzes', { n: state.assessments.length }))}
    ${kpi(t('Outstanding'), money(owedTotal), t('{n} students owe', { n: act.filter(r => r.x.outstanding > 0).length }), owedTotal ? 'alert' : '')}
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h2>${t('Average grade by student')}</h2></div>
      ${act.some(r => r.x.avgScore != null) ? '<div class="chart-box"><canvas id="chartStudentScores"></canvas></div>' : `<p class="empty-note">${t('Add exams or quizzes to see grades here.')}</p>`}</div>
    <div class="card"><div class="card-head"><h2>${t('Needs attention')}</h2></div>
      ${attention.length ? `<div class="list">${attention.map(a => `<div class="srow click" style="--c:${a.r.st.color}" data-action="open-student" data-id="${a.r.st.id}"><div class="srow-main"><strong>${esc(a.r.st.name)}</strong></div><div class="srow-side">${a.why.join('')}</div></div>`).join('')}</div>` : `<p class="empty-note">${t('Everyone is on track.')} 🎉</p>`}</div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>${t('All students')}</h2><span>${t('Tap a student to open their dashboard')}</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>${t('Student')}</th><th>${t('Level')}</th><th>${t('Groups')}</th><th class="num">${t('Rate')}</th><th class="num">${t('Lessons')}</th><th class="num">${t('Hours')}</th><th class="num">${t('Attendance')}</th><th class="num">${t('Avg grade')}</th><th class="num">${t('Last')}</th><th class="num">${t('Outstanding')}</th></tr></thead>
      <tbody>${rows.map(({ st, x, groups }) => `<tr class="click ${st.active === false ? 'inactive' : ''}" data-action="open-student" data-id="${st.id}">
        <td><span class="dot" style="--c:${st.color}"></span><b>${esc(st.name)}</b></td>
        <td>${esc(st.level || '—')}</td>
        <td>${groups.length ? groups.map(g => esc(g.name)).join('، ') : `<span class="muted">${t('Private')}</span>`}</td>
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
    data: { labels: rows.map(r => r.st.name), datasets: [{ label: t('Avg grade') + ' %', data: rows.map(r => Math.round(r.v)), backgroundColor: rows.map(r => r.st.color), borderRadius: 6 }] },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { position: isRTL() ? 'right' : 'left', beginAtZero: true, max: 100, grid: { color: gridColor() } }, x: { grid: { display: false } } }, plugins: { legend: { display: false } } }
  });
};

/* --- Single student dashboard --- */
views.student = () => {
  const st = student(ui.id);
  if (!st) return notFound('students', t('student'));
  const x = studentStats(st.id);
  const groups = state.groups.filter(g => g.studentIds.includes(st.id));
  const lessons = allLines().filter(l => l.a.studentId === st.id).sort((a, b) => byDateDesc(a.s, b.s));
  const next = sortSessions(lessons.filter(l => l.s.status === 'scheduled' && !isOverdue(l.s)).map(l => l.s))[0];
  const grades = [...x.scores].reverse();
  return `
  ${back('students', t('All students'))}
  <div class="page-head">
    <div><h1><span class="dot big" style="--c:${st.color}"></span>${esc(st.name)}</h1>
      <p>${money(st.rate)} / ${t('h')}${st.level ? ' · ' + esc(st.level) : ''}${st.phone ? ' · ' + esc(st.phone) : ''}${st.active === false ? ' · ' + t('inactive') : ''}</p>
      <div class="pills">${groups.map(g => `<button class="pill" data-action="open-group" data-id="${g.id}"><span class="dot" style="--c:${g.color}"></span>${esc(g.name)}</button>`).join('') || `<span class="pill static">${t('Private student')}</span>`}</div>
    </div>
    <div class="row">
      <button class="btn" data-action="add-session" data-student="${st.id}">+ ${t('Lesson')}</button>
      <button class="btn ghost" data-action="add-assessment" data-student="${st.id}" data-type="quiz">+ ${t('Grade')}</button>
      ${x.outstanding ? `<button class="btn ghost" data-action="payall" data-id="${st.id}">${t('Collect {x}', { x: money(x.outstanding) })}</button>` : ''}
      <button class="btn ghost" data-action="edit-student" data-id="${st.id}">${t('Edit')}</button>
    </div>
  </div>
  <div class="grid kpis">
    ${kpi(t('Lessons attended'), x.lessons, t('of {n} · {h}', { n: x.total, h: hrs(x.hours) }), 'highlight')}
    ${kpi(t('Attendance'), pct(x.attendance), t('{n} absences', { n: x.total - x.lessons }))}
    ${kpi(t('Average grade'), scoreCell(x.avgScore), x.last ? t('Last: {title} {p}', { title: esc(x.last.as.title), p: pct(x.last.pct) }) : t('No grades yet'))}
    ${kpi(t('Total paid + due'), money(x.earned), t('{n} charged lessons', { n: x.lessons }))}
    ${kpi(t('Outstanding'), money(x.outstanding), t('{n} unpaid lessons', { n: x.unpaid }), x.outstanding ? 'alert' : '')}
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h2>${t('Grade progress')}</h2><span>${t('% of max score')}</span></div>
      ${x.scores.length ? '<div class="chart-box"><canvas id="chartProgress"></canvas></div>' : `<p class="empty-note">${t('No exams or quizzes recorded yet.')}</p>`}</div>
    <div class="card"><h2 class="mb-s">${t('Details')}</h2>
      <dl class="details">
        <dt>${t('Next lesson')}</dt><dd>${next ? `${t('{d} at {time}', { d: fmtDate(next.date), time: next.start })} — ${esc(sessionLabel(next))}` : t('Nothing booked')}</dd>
        <dt>${t('Phone')}</dt><dd dir="ltr">${esc(st.phone || '—')}</dd>
        <dt>${t('Parent phone')}</dt><dd dir="ltr">${esc(st.parentPhone || '—')}</dd>
        <dt>${t('Level')}</dt><dd>${esc(st.level || '—')}</dd>
        <dt>${t('Notes')}</dt><dd>${esc(st.notes || '—')}</dd>
      </dl>
    </div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>${t('Exams & quizzes')}</h2><span>${t('{n} recorded', { n: grades.length })}</span></div>
    ${grades.length ? `<div class="table-wrap"><table>
      <thead><tr><th>${t('Date')}</th><th>${t('Type')}</th><th>${t('Title')}</th><th>${t('Group')}</th><th class="num">${t('Score')}</th><th class="num">%</th><th class="num">${t('Class avg')}</th></tr></thead>
      <tbody>${grades.map(g => `<tr class="click" data-action="edit-assessment" data-id="${g.as.id}"><td>${fmtFull(g.as.date)}</td><td>${typeBadge(g.as.type)}</td><td>${esc(g.as.title)}</td><td>${esc(group(g.as.groupId)?.name || '—')}</td>
        <td class="num" dir="ltr">${num(g.score)} / ${num(g.as.maxScore)}</td><td class="num">${scoreCell(g.pct)}</td><td class="num">${g.as.scores.length > 1 ? pct(assessmentAvg(g.as).avg) : '—'}</td></tr>`).join('')}</tbody>
    </table></div>` : `<p class="empty-note">${t('No grades yet')}</p>`}
  </div>
  <div class="card mt">
    <div class="card-head"><h2>${t('Lessons & payments')}</h2><span>${t('{n} lessons', { n: lessons.length })}</span></div>
    ${lessons.length ? `<div class="table-wrap"><table>
      <thead><tr><th>${t('Date')}</th><th>${t('Time')}</th><th>${t('Lesson')}</th><th class="num">${t('Hours')}</th><th class="num">${t('Rate')}</th><th class="num">${t('Amount')}</th><th>${t('Status')}</th><th></th></tr></thead>
      <tbody>${lessons.slice(0, 200).map(({ s, a, amt }) => `<tr>
        <td>${fmtFull(s.date)}</td><td>${s.start}–${endTime(s.start, s.duration)}</td>
        <td>${esc(group(s.groupId)?.name || t('Private'))}</td><td class="num">${hrs(s.duration)}</td><td class="num">${money(a.rate)}</td>
        <td class="num">${isCharged(s, a) || s.status === 'scheduled' ? money(amt) : '<span class="muted">—</span>'}</td>
        <td>${lineBadge(s, a)}</td>
        <td class="num">${isCharged(s, a) ? paidBtn(s, st.id, a.paid) : ''}<button class="btn sm ghost" data-action="edit-session" data-id="${s.id}">${t('Edit')}</button></td></tr>`).join('')}</tbody>
    </table></div>` : `<p class="empty-note">${t('No lessons yet.')}</p>`}
  </div>`;
};
after.student = () => {
  const st = student(ui.id);
  if (!st) return;
  const sc = scoresFor(st.id);
  const byType = k => sc.map(x => x.as.type === k ? Math.round(x.pct) : null);
  mkChart('chartProgress', {
    type: 'line',
    data: {
      labels: sc.map(x => fmtDM(x.as.date)),
      datasets: [
        { label: t('Exams'), data: byType('exam'), borderColor: cssVar('--accent'), backgroundColor: cssVar('--accent'), spanGaps: true, tension: .3, pointRadius: 5 },
        { label: t('Quizzes'), data: byType('quiz'), borderColor: cssVar('--accent-2'), backgroundColor: cssVar('--accent-2'), spanGaps: true, tension: .3, pointRadius: 4 },
        { label: t('Class avg'), data: sc.map(x => x.as.scores.length > 1 ? Math.round(assessmentAvg(x.as).avg) : null), borderColor: cssVar('--muted'), borderDash: [5, 5], pointRadius: 0, spanGaps: true, tension: .3 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { position: isRTL() ? 'right' : 'left', min: 0, max: 100, grid: { color: gridColor() } }, x: { grid: { display: false } } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { title: i => { const x = sc[i[0].dataIndex]; return `${x.as.title} — ${fmtDate(x.as.date)}`; }, label: c => ` ${c.dataset.label}: ${c.raw}%` } } }
    }
  });
};

/* --- Groups --- */
views.groups = () => {
  const list = [...state.groups].sort((x, y) => (y.active !== false) - (x.active !== false) || x.name.localeCompare(y.name));
  return `
  <div class="page-head">
    <div><h1>${t('Groups')}</h1><p>${t('{n} active groups', { n: activeGroups().length })}</p></div>
    <button class="btn" data-action="add-group">+ ${t('Group')}</button>
  </div>
  ${!list.length ? `<div class="card welcome"><h1>${t('No groups yet')}</h1><p>${t('Create a group (e.g. "Grade 6 — Group A") and add students to it. Then you can schedule one lesson for the whole group, record attendance and payments for each student, and enter exam & quiz grades for everyone at once.')}</p><div class="row"><button class="btn" data-action="add-group">+ ${t('Create group')}</button></div></div>` :
  `<div class="grid students">${list.map(g => {
    const x = groupStats(g);
    const next = sortSessions(x.sessions.filter(s => s.status === 'scheduled' && !isOverdue(s)))[0];
    return `<div class="card group-card click ${g.active === false ? 'inactive' : ''}" style="--c:${g.color}" data-action="open-group" data-id="${g.id}">
      <div class="card-head"><h3>${esc(g.name)}</h3><span>${g.rate ? t('{x} / student / h', { x: money(g.rate) }) : t('own rates')}</span></div>
      <div class="members">${g.studentIds.map(id => `<span>${esc(sName(id))}</span>`).join('') || `<span>${t('No students')}</span>`}</div>
      <div class="stats">
        <div><small>${t('Lessons done')}</small><b>${x.lessons}</b></div>
        <div><small>${t('Attendance')}</small><b>${pct(x.attendance)}</b></div>
        <div><small>${t('Avg grade')}</small><b>${scoreCell(x.avgScore)}</b></div>
        <div><small>${t('Outstanding')}</small><b class="${x.outstanding ? 'score-mid' : ''}">${money(x.outstanding)}</b></div>
      </div>
      <div class="muted small">${t('Next')}: ${next ? t('{d} at {time}', { d: fmtDate(next.date), time: next.start }) : t('nothing booked')}</div>
    </div>`;
  }).join('')}</div>`}`;
};

views.group = () => {
  const g = group(ui.id);
  if (!g) return notFound('groups', t('group'));
  const x = groupStats(g);
  const members = g.studentIds.map(student).filter(Boolean);
  const upcoming = sortSessions(x.sessions.filter(s => s.status === 'scheduled' && !isOverdue(s))).slice(0, 3);
  const recentDone = x.sessions.filter(s => s.status === 'done').sort(byDateDesc).slice(0, 6);
  return `
  ${back('groups', t('All groups'))}
  <div class="page-head">
    <div><h1><span class="dot big" style="--c:${g.color}"></span>${esc(g.name)}</h1>
      <p>${t('{n} students', { n: members.length })} · ${g.rate ? t('{x} per student / hour', { x: money(g.rate) }) : t("each student's own rate")}${g.active === false ? ' · ' + t('inactive') : ''}</p></div>
    <div class="row">
      <button class="btn" data-action="add-session" data-group="${g.id}">+ ${t('Lesson')}</button>
      <button class="btn ghost" data-action="add-assessment" data-group="${g.id}" data-type="quiz">+ ${t('Quiz')}</button>
      <button class="btn ghost" data-action="add-assessment" data-group="${g.id}" data-type="exam">+ ${t('Exam')}</button>
      <button class="btn ghost" data-action="edit-group" data-id="${g.id}">${t('Edit')}</button>
    </div>
  </div>
  <div class="grid kpis">
    ${kpi(t('Lessons done'), x.lessons, t('{h} taught', { h: hrs(x.hours) }), 'highlight')}
    ${kpi(t('Earned'), money(x.earned), t('{n} students', { n: members.length }))}
    ${kpi(t('Outstanding'), money(x.outstanding), t('unpaid by group members'), x.outstanding ? 'alert' : '')}
    ${kpi(t('Attendance'), pct(x.attendance), t('all group lessons'))}
    ${kpi(t('Average grade'), scoreCell(x.avgScore), t('{n} exams & quizzes', { n: x.assessments.length }))}
  </div>
  <div class="grid two">
    <div class="card"><div class="card-head"><h2>${t('Class average per exam & quiz')}</h2></div>
      ${x.assessments.length ? '<div class="chart-box"><canvas id="chartGroup"></canvas></div>' : `<p class="empty-note">${t('No exams or quizzes for this group yet.')}</p>`}</div>
    <div class="card"><div class="card-head"><h2>${t('Upcoming lessons')}</h2></div>
      <div class="list">${upcoming.length ? upcoming.map(sessionRow).join('') : `<p class="empty-note">${t('Nothing booked')}</p>`}</div></div>
  </div>
  <div class="card mt">
    <div class="card-head"><h2>${t('Students in this group')}</h2><span>${t('Attendance, grades & balance within the group')}</span></div>
    ${members.length ? `<div class="table-wrap"><table>
      <thead><tr><th>${t('Student')}</th><th class="num">${t('Lessons')}</th><th class="num">${t('Attendance')}</th><th class="num">${t('Avg grade')}</th><th class="num">${t('Last')}</th><th class="num">${t('Outstanding')}</th><th></th></tr></thead>
      <tbody>${members.map(st => { const m = memberInGroup(g, st.id); return `<tr class="click" data-action="open-student" data-id="${st.id}">
        <td><span class="dot" style="--c:${st.color}"></span><b>${esc(st.name)}</b></td><td class="num">${m.lessons}</td><td class="num">${pct(m.attendance)}</td>
        <td class="num">${scoreCell(m.avgScore)}</td><td class="num">${m.last ? scoreCell(m.last.pct) : '—'}</td>
        <td class="num">${m.outstanding ? `<b class="score-mid">${money(m.outstanding)}</b>` : money(0)}</td>
        <td class="num">${m.outstanding ? `<button class="btn sm" data-action="payall" data-id="${st.id}" data-group="${g.id}">${t('Record payment')}</button>` : ''}</td></tr>`; }).join('')}</tbody>
    </table></div>` : `<p class="empty-note">${t('No students yet.')} <button class="btn sm ghost" data-action="edit-group" data-id="${g.id}">${t('Add students')}</button></p>`}
  </div>
  <div class="grid halves mt">
    <div class="card"><div class="card-head"><h2>${t('Exams & quizzes')}</h2></div>
      ${x.assessments.length ? `<div class="table-wrap"><table>
        <thead><tr><th>${t('Date')}</th><th>${t('Assessment')}</th><th class="num">${t('Graded')}</th><th class="num">${t('Avg')}</th><th class="num">${t('High')}</th><th class="num">${t('Low')}</th></tr></thead>
        <tbody>${[...x.assessments].reverse().map(a => { const v = assessmentAvg(a); return `<tr class="click" data-action="edit-assessment" data-id="${a.id}"><td>${fmtDate(a.date)}</td><td>${typeBadge(a.type)} ${esc(a.title)}</td><td class="num">${v.n}/${members.length}</td><td class="num">${scoreCell(v.avg)}</td><td class="num">${pct(v.hi)}</td><td class="num">${pct(v.lo)}</td></tr>`; }).join('')}</tbody>
      </table></div>` : `<p class="empty-note">${t('None yet.')}</p>`}</div>
    <div class="card"><div class="card-head"><h2>${t('Recent lessons')}</h2></div>
      <div class="list">${recentDone.length ? recentDone.map(sessionRow).join('') : `<p class="empty-note">${t('No completed lessons yet.')}</p>`}</div></div>
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
      datasets: [{ label: t('Class avg') + ' %', data: asm.map(a => Math.round(assessmentAvg(a).avg || 0)), backgroundColor: asm.map(a => a.type === 'exam' ? cssVar('--accent') : cssVar('--accent-2')), borderRadius: 6 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { y: { position: isRTL() ? 'right' : 'left', beginAtZero: true, max: 100, grid: { color: gridColor() } }, x: { grid: { display: false } } },
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: i => { const a = asm[i[0].dataIndex]; return `${typeName(a.type)}: ${a.title} — ${fmtDate(a.date)}`; } } } }
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
    <div><h1>${t('Grades')}</h1><p>${t('Exams & quizzes for groups and individual students')}</p></div>
    <div class="row">
      <button class="btn ghost" data-action="export-grades">${t('Export CSV')}</button>
      <button class="btn ghost" data-action="add-assessment" data-type="quiz">+ ${t('Quiz')}</button>
      <button class="btn" data-action="add-assessment" data-type="exam">+ ${t('Exam')}</button>
    </div>
  </div>
  <div class="grid kpis">
    ${kpi(t('Exams'), list.filter(a => a.type === 'exam').length, t('in this view'), 'highlight')}
    ${kpi(t('Quizzes'), list.filter(a => a.type === 'quiz').length, t('in this view'))}
    ${kpi(t('Average grade'), scoreCell(allAvg), t('mean of class averages'))}
    ${kpi(t('Scores entered'), sum(list, a => assessmentAvg(a).n), t('student results'))}
  </div>
  <div class="card">
    <div class="card-head"><h2>${t('All exams & quizzes')}</h2>
      <div class="row">
        <select data-gfilter="group" aria-label="${t('Group')}">${optionsHtml([['', t('All groups')], ['none', t('Individual (no group)')], ...state.groups.map(g => [g.id, esc(g.name)])], f.group)}</select>
        <select data-gfilter="type" aria-label="${t('Type')}">${optionsHtml([['', t('Exams & quizzes')], ['exam', t('Exams')], ['quiz', t('Quizzes')]], f.type)}</select>
      </div>
    </div>
    ${list.length ? `<div class="table-wrap"><table>
      <thead><tr><th>${t('Date')}</th><th>${t('Type')}</th><th>${t('Title')}</th><th>${t('For')}</th><th class="num">${t('Max')}</th><th class="num">${t('Graded')}</th><th class="num">${t('Avg')}</th><th class="num">${t('High')}</th><th class="num">${t('Low')}</th></tr></thead>
      <tbody>${list.map(a => { const v = assessmentAvg(a); return `<tr class="click" data-action="edit-assessment" data-id="${a.id}">
        <td>${fmtFull(a.date)}</td><td>${typeBadge(a.type)}</td><td><b>${esc(a.title)}</b></td>
        <td>${a.groupId ? esc(group(a.groupId)?.name || t('Deleted group')) : (v.n === 1 ? esc(sName(a.scores.find(s => s.score !== '' && s.score != null)?.studentId)) : t('Individual'))}</td>
        <td class="num">${num(a.maxScore)}</td><td class="num">${v.n}</td><td class="num">${scoreCell(v.avg)}</td><td class="num">${pct(v.hi)}</td><td class="num">${pct(v.lo)}</td></tr>`; }).join('')}</tbody>
    </table></div>` : `<p class="empty-note">${t('No exams or quizzes yet. Add one to start tracking grades.')}</p>`}
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
    <div><h1>${t('Billing')}</h1><p>${t('Who owes what — every student in every lesson')}</p></div>
    <button class="btn ghost" data-action="export-csv">${t('Export CSV')}</button>
  </div>
  <div class="card mb">
    <div class="card-head"><h2>${t('Outstanding by student')}</h2><span>${t('{x} total', { x: money(sum(owedRows, x => x.total)) })}</span></div>
    ${owedRows.length ? `<div class="table-wrap"><table>
      <thead><tr><th>${t('Student')}</th><th class="num">${t('Unpaid lessons')}</th><th class="num">${t('Hours')}</th><th class="num">${t('Amount')}</th><th></th></tr></thead>
      <tbody>${owedRows.map(x => `<tr><td><span class="dot" style="--c:${x.st.color}"></span>${esc(x.st.name)}</td><td class="num">${x.n}</td><td class="num">${hrs(x.h)}</td><td class="num"><b>${money(x.total)}</b></td>
        <td class="num"><button class="btn sm" data-action="payall" data-id="${x.st.id}">${t('Record payment')}</button></td></tr>`).join('')}</tbody>
    </table></div>` : `<p class="empty-note">${t('Everyone is paid up.')} 🎉</p>`}
  </div>
  <div class="card">
    <div class="card-head"><h2>${t('Student lessons')}</h2>
      <div class="row">
        <select data-filter="student" aria-label="${t('Student')}">${optionsHtml([['', t('All students')], ...state.students.map(s => [s.id, esc(s.name)])], f.student)}</select>
        <select data-filter="group" aria-label="${t('Group')}">${optionsHtml([['', t('All lessons')], ['none', t('Private only')], ...state.groups.map(g => [g.id, esc(g.name)])], f.group)}</select>
        <select data-filter="status" aria-label="${t('Status')}">${optionsHtml([['', t('Any status')], ...Object.keys(STATUS_KEYS).map(k => [k, statusName(k)])], f.status)}</select>
        <select data-filter="paid" aria-label="${t('Payment')}">${optionsHtml([['', t('Paid & unpaid')], ['paid', t('Paid')], ['unpaid', t('Unpaid')]], f.paid)}</select>
        <input type="month" data-filter="month" value="${f.month}" aria-label="${t('Month')}">
        ${any ? `<button class="btn sm ghost" data-action="clear-filters">${t('Clear')}</button>` : ''}
      </div>
    </div>
    ${shown.length ? `<div class="table-wrap"><table>
      <thead><tr><th>${t('Date')}</th><th>${t('Time')}</th><th>${t('Student')}</th><th>${t('Lesson')}</th><th class="num">${t('Hours')}</th><th class="num">${t('Rate')}</th><th class="num">${t('Amount')}</th><th>${t('Status')}</th><th></th></tr></thead>
      <tbody>${shown.map(({ s, a, amt }) => `<tr>
        <td>${fmtFull(s.date)}</td><td>${s.start}–${endTime(s.start, s.duration)}</td>
        <td><span class="dot" style="--c:${sColor(a.studentId)}"></span>${esc(sName(a.studentId))}</td>
        <td>${esc(group(s.groupId)?.name || t('Private'))}</td>
        <td class="num">${hrs(s.duration)}</td><td class="num">${money(a.rate)}</td>
        <td class="num">${s.status === 'cancelled' || (s.status === 'done' && a.present === false) ? '<span class="muted">—</span>' : money(amt)}</td>
        <td>${lineBadge(s, a)}</td>
        <td class="num">${isCharged(s, a) ? paidBtn(s, a.studentId, a.paid) : ''}${s.status === 'scheduled' ? `<button class="btn sm" data-action="done" data-id="${s.id}">✓ ${t('Done')}</button>` : ''}<button class="btn sm ghost" data-action="edit-session" data-id="${s.id}">${t('Edit')}</button></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="4">${t('Charged in this view')}</td><td class="num"></td><td></td><td class="num">${money(sum(charged, l => l.amt))}</td><td colspan="2">${t('{x} paid', { x: money(sum(charged.filter(l => l.a.paid), l => l.amt)) })}</td></tr></tfoot>
    </table></div>${list.length > 300 ? `<p class="hint">${t('Showing latest 300 of {n}. Use filters or export CSV.', { n: list.length })}</p>` : ''}` : `<p class="empty-note">${t('No lessons match these filters.')}</p>`}
  </div>`;
};

views.settings = () => {
  const s = state.settings;
  return `
  <div class="page-head"><div><h1>${t('Settings')}</h1><p>${t('Preferences and your data')}</p></div></div>
  <div class="grid halves">
    <form class="card" id="settingsForm">
      <h2 class="mb-s">${t('Preferences')}</h2>
      <div class="field"><label for="lng">${t('Language')}</label>
        <div class="seg" role="radiogroup" aria-label="${t('Language')}">
          <label><input type="radio" name="lang" value="en" ${s.lang !== 'ar' ? 'checked' : ''}><span>English</span></label>
          <label><input type="radio" name="lang" value="ar" ${s.lang === 'ar' ? 'checked' : ''}><span>العربية</span></label>
        </div></div>
      <div class="field"><label for="tn">${t('Teacher name')}</label><input type="text" dir="auto" id="tn" name="teacherName" value="${esc(s.teacherName)}" placeholder="${t('e.g. Ms. Sara')}"></div>
      <div class="fields">
        <div class="field"><label for="cur">${t('Currency')}</label><input type="text" dir="auto" id="cur" name="currency" value="${esc(s.currency)}" maxlength="6" required></div>
        <div class="field"><label for="dd">${t('Default lesson length (h)')}</label><input type="text" inputmode="decimal" data-num id="dd" name="defaultDuration" value="${s.defaultDuration}" min="0.25" step="0.25"></div>
      </div>
      <div class="field"><label for="wsd">${t('Week starts on')}</label>
        <select id="wsd" name="weekStart">${optionsHtml([[6, dayName(6)], [0, dayName(0)], [1, dayName(1)]], s.weekStart)}</select></div>
      <button class="btn" type="submit">${t('Save preferences')}</button>
    </form>
    <div class="card">
      <h2 class="mb-s">${t('Your data')}</h2>
      <p class="muted" style="margin-top:0">${t('Everything is saved in this browser only. Export a backup regularly, and import it to move to another device.')}</p>
      <div class="list">
        <button class="btn ghost" data-action="export-json">⬇ ${t('Export backup (JSON)')}</button>
        <button class="btn ghost" data-action="import">⬆ ${t('Import backup')}</button>
        <button class="btn ghost" data-action="export-csv">⬇ ${t('Export lessons & payments (CSV / Excel)')}</button>
        <button class="btn ghost" data-action="export-grades">⬇ ${t('Export grades (CSV / Excel)')}</button>
        <button class="btn ghost" data-action="sample">${t('Load sample data')}</button>
        <button class="btn danger" data-action="reset">${t('Delete all data')}</button>
      </div>
      <p class="hint">${t('{a} students · {b} groups · {c} lessons · {d} exams & quizzes stored', { a: state.students.length, b: state.groups.length, c: state.sessions.length, d: state.assessments.length })}</p>
    </div>
  </div>`;
};

/* ---------- render & routing ---------- */
const TAB_OF = { student: 'students', group: 'groups' };
const NAV = { dashboard: ['Dashboard', 'Home'], schedule: ['Schedule', 'Schedule'], students: ['Students', 'Students'], groups: ['Groups', 'Groups'], grades: ['Grades', 'Grades'], billing: ['Billing', 'Billing'], settings: ['Settings', 'Settings'] };
function applyLang() {
  LANG = state.settings.lang === 'ar' ? 'ar' : 'en';
  const root = document.documentElement;
  root.lang = LANG;
  root.dir = isRTL() ? 'rtl' : 'ltr';
  document.querySelectorAll('.tabs button').forEach(b => {
    const n = NAV[b.dataset.view];
    if (!n) return;
    const lbl = b.querySelector('.lbl'), sh = b.querySelector('.short');
    if (lbl) lbl.textContent = t(n[0]);
    if (sh) sh.textContent = t(n[1]);
    b.setAttribute('aria-label', t(n[0]));
  });
  $('.tabs')?.setAttribute('aria-label', t('Main'));
}
function render() {
  applyLang();
  if (!views[ui.view]) ui.view = 'dashboard';
  const tab = TAB_OF[ui.view] || ui.view;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === tab));
  $('#teacherLabel').textContent = state.settings.teacherName || t('Lessons, groups & grades');
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
const modalActions = (isNew, saveLabel) => `<div class="modal-actions">
      ${isNew ? '' : `<button class="btn danger" value="delete" formnovalidate>${t('Delete')}</button>`}<span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>${t('Cancel')}</button>
      <button class="btn" value="save">${saveLabel}</button>
    </div>`;
const colorOptions = cur => optionsHtml(COLORS.map((c, i) => [c, t(COLOR_NAMES[i])]), cur);

function sessionForm(existing, preset = {}) {
  if (!activeStudents().length && !existing) { toast(t('Add a student first')); go('students'); return; }
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
      <input type="text" inputmode="decimal" data-num data-rate min="0" step="any" value="${a ? a.rate : st.rate}" aria-label="${t('Rate per hour for {name}', { name: esc(st.name) })}">
      <label class="mini"><input type="checkbox" data-present ${!a || a.present !== false ? 'checked' : ''}> ${t('Present')}</label>
      <label class="mini"><input type="checkbox" data-paid ${a && a.paid ? 'checked' : ''}> ${t('Paid')}</label>
    </div>`;
  }).join('');
  openModal(`
    <h2>${isNew ? t('New lesson') : t('Edit lesson')}</h2>
    <div class="field"><label for="f-g">${t('Group')}</label>
      <select id="f-g" name="groupId">${optionsHtml([['', t('Private / pick students')], ...state.groups.filter(g => g.active !== false || g.id === s.groupId).map(g => [g.id, `${esc(g.name)} (${g.studentIds.length})`])], s.groupId || '')}</select></div>
    <div class="field"><label>${t('Students & rate per hour')}</label>
      <div class="att-list ${s.status === 'done' ? '' : 'not-done'}" id="attList">${rows}</div>
      <p class="hint">${t('Tick the students in this lesson. Each student has their own rate and payment. When the lesson is Done, absent students are not charged.')}</p></div>
    <div class="fields">
      <div class="field"><label for="f-d">${t('Date')}</label><input type="date" id="f-d" name="date" value="${s.date}" required></div>
      <div class="field"><label for="f-t">${t('Start time')}</label><input type="time" id="f-t" name="start" value="${s.start}" required></div>
      <div class="field"><label for="f-du">${t('Duration (hours)')}</label><input type="text" inputmode="decimal" data-num id="f-du" name="duration" value="${s.duration}" min="0.25" max="12" step="0.25" required></div>
      <div class="field"><label for="f-s">${t('Status')}</label><select id="f-s" name="status">${optionsHtml(Object.keys(STATUS_KEYS).map(k => [k, statusName(k)]), s.status)}</select></div>
      ${isNew ? `<div class="field"><label for="f-rep">${t('Repeat weekly')}</label><select id="f-rep" name="repeat">${optionsHtml([1, 2, 4, 8, 12, 16, 24].map(n => [n, n === 1 ? t('Just once') : t('{n} weeks', { n })]), 1)}</select></div>` : ''}
    </div>
    <div class="field"><label for="f-n">${t('Notes')}</label><textarea dir="auto" id="f-n" name="notes" rows="2" placeholder="${t('Topic, homework…')}">${esc(s.notes)}</textarea></div>
    <div class="preview" id="f-prev"></div>
    ${modalActions(isNew, isNew ? t('Add lesson') : t('Save'))}`,
    (fd, act, f) => {
      if (act === 'delete') {
        if (!confirm(t('Delete this lesson?'))) return false;
        state.sessions = state.sessions.filter(x => x.id !== existing.id);
        commit(t('Lesson deleted')); return;
      }
      const done = fd.status === 'done';
      const attendees = [...f.querySelectorAll('.att-row')].filter(r => r.querySelector('[data-inc]').checked).map(r => {
        const present = !done || r.querySelector('[data-present]').checked;
        return { studentId: r.dataset.row, rate: +r.querySelector('[data-rate]').value || 0, present, paid: done && present && r.querySelector('[data-paid]').checked };
      });
      if (!attendees.length) { toast(t('Choose at least one student')); return false; }
      const data = { date: fd.date, start: fd.start, duration: +fd.duration, status: fd.status, groupId: fd.groupId || null, notes: (fd.notes || '').trim(), attendees };
      const clash = data.status !== 'cancelled' && state.sessions.find(x => x !== existing && x.status !== 'cancelled' && x.date === data.date &&
        toMin(data.start) < toMin(x.start) + x.duration * 60 && toMin(x.start) < toMin(data.start) + data.duration * 60);
      if (clash && !confirm(t('This overlaps with {name} at {time}. Save anyway?', { name: sessionLabel(clash), time: clash.start }))) return false;
      if (isNew) {
        const n = Math.max(1, Math.min(52, +fd.repeat || 1));
        for (let i = 0; i < n; i++) {
          state.sessions.push({
            id: uid(), ...data, date: toISO(addDays(fromISO(data.date), 7 * i)),
            status: i ? 'scheduled' : data.status,
            attendees: data.attendees.map(a => i ? { ...a, present: true, paid: false } : { ...a })
          });
        }
        commit(n > 1 ? t('{n} weekly lessons added', { n }) : t('Lesson added'));
      } else { Object.assign(existing, data); commit(t('Lesson updated')); }
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
    $('#f-prev').textContent = t('{n} students · {d} h · total {x}  ·  ends {e}', { n, d, x: plainMoney(total), e: f.start.value ? endTime(f.start.value, d) : '—' });
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
    <h2>${isNew ? t('New student') : t('Edit student')}</h2>
    <div class="field"><label for="s-n">${t('Name')}</label><input type="text" dir="auto" id="s-n" name="name" value="${esc(s.name)}" required></div>
    <div class="fields">
      <div class="field"><label for="s-r">${t('Private hourly rate ({c})', { c: esc(state.settings.currency) })}</label><input type="text" inputmode="decimal" data-num id="s-r" name="rate" value="${s.rate}" min="0" step="any" required></div>
      <div class="field"><label for="s-l">${t('Level / grade')}</label><input type="text" dir="auto" id="s-l" name="level" value="${esc(s.level || '')}" placeholder="${t('e.g. Grade 6, B1, IELTS')}"></div>
      <div class="field"><label for="s-p">${t('Phone / WhatsApp')}</label><input type="tel" id="s-p" name="phone" value="${esc(s.phone)}" dir="ltr"></div>
      <div class="field"><label for="s-pp">${t('Parent phone')}</label><input type="tel" id="s-pp" name="parentPhone" value="${esc(s.parentPhone || '')}" dir="ltr"></div>
      <div class="field"><label for="s-c">${t('Colour')}</label><select id="s-c" name="color">${colorOptions(s.color)}</select></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}> ${t('Active student')}</label></div>
    </div>
    <div class="field"><label for="s-no">${t('Notes')}</label><textarea dir="auto" id="s-no" name="notes" rows="2" placeholder="${t('Goals, strengths, what to work on…')}">${esc(s.notes)}</textarea></div>
    <p class="hint">${t('Add the student to a group from the Groups page. Changing the rate only affects new lessons.')}</p>
    ${modalActions(isNew, isNew ? t('Add student') : t('Save'))}`,
    (fd, act) => {
      if (act === 'delete') {
        if (!confirm(t('Delete {name} with all their lesson records and grades? This cannot be undone.\nTip: untick "Active" instead to keep their history.', { name: st.name }))) return false;
        state.students = state.students.filter(x => x.id !== st.id);
        state.sessions.forEach(x => { x.attendees = x.attendees.filter(a => a.studentId !== st.id); });
        state.sessions = state.sessions.filter(x => x.attendees.length);
        state.groups.forEach(g => { g.studentIds = g.studentIds.filter(id => id !== st.id); });
        state.assessments.forEach(a => { a.scores = a.scores.filter(x => x.studentId !== st.id); });
        commit(t('Student deleted'));
        if (ui.view === 'student') go('students');
        return;
      }
      const data = { name: fd.name.trim(), rate: +fd.rate, level: (fd.level || '').trim(), phone: (fd.phone || '').trim(), parentPhone: (fd.parentPhone || '').trim(), color: fd.color, notes: (fd.notes || '').trim(), active: !!fd.active };
      if (!data.name) { toast(t('Name is required')); return false; }
      if (isNew) { state.students.push({ id: uid(), ...data }); commit(t('Student added')); }
      else { Object.assign(st, data); commit(t('Student updated')); }
    });
}

function groupForm(g) {
  if (!state.students.length) { toast(t('Add students first')); go('students'); return; }
  const isNew = !g;
  const x = g || { name: '', rate: '', color: COLORS[(state.groups.length + 2) % COLORS.length], studentIds: [], notes: '', active: true };
  const ids = [...new Set([...x.studentIds, ...activeStudents().map(s => s.id)])].filter(student);
  openModal(`
    <h2>${isNew ? t('New group') : t('Edit group')}</h2>
    <div class="field"><label for="g-n">${t('Group name')}</label><input type="text" dir="auto" id="g-n" name="name" value="${esc(x.name)}" placeholder="${t('e.g. Grade 6 — Group A')}" required></div>
    <div class="fields">
      <div class="field"><label for="g-r">${t('Rate per student / hour')}</label><input type="text" inputmode="decimal" data-num id="g-r" name="rate" value="${x.rate ?? ''}" min="0" step="any" placeholder="${t('Leave empty = own rate')}"></div>
      <div class="field"><label for="g-c">${t('Colour')}</label><select id="g-c" name="color">${colorOptions(x.color)}</select></div>
    </div>
    <div class="field"><label>${t('Students')} <span id="g-count"></span></label>
      <div class="att-list">${ids.map(id => { const st = student(id); return `<label class="check member-row" style="--c:${st.color}"><input type="checkbox" name="m_${id}" ${x.studentIds.includes(id) ? 'checked' : ''}><span class="dot"></span>${esc(st.name)}${st.level ? `<span class="muted small"> · ${esc(st.level)}</span>` : ''}</label>`; }).join('')}</div></div>
    <div class="field"><label class="check"><input type="checkbox" name="active" ${x.active !== false ? 'checked' : ''}> ${t('Active group')}</label></div>
    <div class="field"><label for="g-no">${t('Notes')}</label><textarea dir="auto" id="g-no" name="notes" rows="2" placeholder="${t('Book, schedule, syllabus…')}">${esc(x.notes)}</textarea></div>
    ${modalActions(isNew, isNew ? t('Create group') : t('Save'))}`,
    (fd, act) => {
      if (act === 'delete') {
        if (!confirm(t('Delete group "{name}"? Its lessons and grades stay in each student\'s history.', { name: g.name }))) return false;
        state.groups = state.groups.filter(y => y.id !== g.id);
        state.sessions.forEach(s => { if (s.groupId === g.id) s.groupId = null; });
        state.assessments.forEach(a => { if (a.groupId === g.id) a.groupId = null; });
        commit(t('Group deleted'));
        if (ui.view === 'group') go('groups');
        return;
      }
      const data = {
        name: fd.name.trim(), rate: fd.rate === '' ? '' : +fd.rate, color: fd.color, notes: (fd.notes || '').trim(), active: !!fd.active,
        studentIds: Object.keys(fd).filter(k => k.startsWith('m_')).map(k => k.slice(2))
      };
      if (!data.name) { toast(t('Name is required')); return false; }
      if (isNew) { const id = uid(); state.groups.push({ id, ...data }); persist(); go('group', id); toast(t('Group created')); }
      else { Object.assign(g, data); commit(t('Group updated')); }
    });
  const f = $('#modalForm');
  const cnt = () => { $('#g-count').textContent = t('({n} selected)', { n: f.querySelectorAll('.member-row input:checked').length }); };
  f.addEventListener('change', cnt);
  cnt();
}

function assessmentForm(existing, preset = {}) {
  if (!state.students.length) { toast(t('Add a student first')); go('students'); return; }
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
      <input type="text" inputmode="decimal" data-num data-score min="0" step="any" value="${vals.has(st.id) && vals.get(st.id) !== '' ? esc(vals.get(st.id)) : ''}" placeholder="—" aria-label="${t('Score for {name}', { name: esc(st.name) })}">
    </div>`).join('') || `<p class="empty-note">${t('No students in this group yet.')}</p>`;
  const titleKey = isNew ? (a.type === 'exam' ? 'New exam' : 'New quiz') : (a.type === 'exam' ? 'Edit exam' : 'Edit quiz');
  openModal(`
    <h2>${t(titleKey)}</h2>
    <div class="fields">
      <div class="field"><label for="a-t">${t('Type')}</label><select id="a-t" name="type">${optionsHtml([['quiz', t('Quiz')], ['exam', t('Exam')]], a.type)}</select></div>
      <div class="field"><label for="a-d">${t('Date')}</label><input type="date" id="a-d" name="date" value="${a.date}" required></div>
    </div>
    <div class="field"><label for="a-ti">${t('Title')}</label><input type="text" dir="auto" id="a-ti" name="title" value="${esc(a.title)}" placeholder="${t('e.g. Unit 3 vocabulary')}" required></div>
    <div class="fields">
      <div class="field"><label for="a-g">${t('Group')}</label><select id="a-g" name="groupId">${optionsHtml([['', t('Individual students')], ...state.groups.filter(g => g.active !== false || g.id === a.groupId).map(g => [g.id, esc(g.name)])], a.groupId || '')}</select></div>
      <div class="field"><label for="a-m">${t('Out of (max score)')}</label><input type="text" inputmode="decimal" data-num id="a-m" name="maxScore" value="${a.maxScore}" min="1" step="any" required></div>
    </div>
    <div class="field"><label>${t('Scores')} <span class="muted">${t("(leave empty if the student didn't take it)")}</span></label>
      <div class="att-list score-list" id="scoreList">${rowsHtml(a.groupId)}</div></div>
    <div class="field"><label for="a-no">${t('Notes')}</label><textarea dir="auto" id="a-no" name="notes" rows="2">${esc(a.notes || '')}</textarea></div>
    <div class="preview" id="a-prev"></div>
    ${modalActions(isNew, isNew ? t('Save grades') : t('Save'))}`,
    (fd, act, f) => {
      if (act === 'delete') {
        if (!confirm(t('Delete "{title}" and all its scores?', { title: existing.title }))) return false;
        state.assessments = state.assessments.filter(x => x.id !== existing.id);
        commit(t('Deleted')); return;
      }
      const max = +fd.maxScore;
      const scores = [...f.querySelectorAll('.score-row')].map(r => ({ studentId: r.dataset.row, v: r.querySelector('[data-score]').value }))
        .filter(x => x.v !== '').map(x => ({ studentId: x.studentId, score: +x.v }));
      const over = scores.find(x => x.score > max);
      if (over) { toast(t("{name}'s score is higher than {max}", { name: sName(over.studentId), max: num(max) })); return false; }
      if (!scores.length && !confirm(t('No scores entered. Save anyway?'))) return false;
      const data = { type: fd.type, title: fd.title.trim(), date: fd.date, maxScore: max, groupId: fd.groupId || null, notes: (fd.notes || '').trim(), scores };
      if (isNew) { state.assessments.push({ id: uid(), ...data }); commit(data.type === 'exam' ? t('Exam saved') : t('Quiz saved')); }
      else { Object.assign(existing, data); commit(t('Grades updated')); }
    }, true);
  const f = $('#modalForm'), list = $('#scoreList');
  const upd = () => {
    const max = +f.maxScore.value || 0;
    const v = [...list.querySelectorAll('[data-score]')].filter(i => i.value !== '').map(i => +i.value);
    $('#a-prev').textContent = v.length && max ? t('{n} graded · average {a} / {m} ({p}%)', { n: v.length, a: num(avg(v)), m: num(max), p: Math.round(avg(v) / max * 100) }) : t('Enter scores to see the class average');
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
  const rows = [['Date', 'Start', 'End', 'Student', 'Group', 'Hours', 'Rate', 'Amount', 'Currency', 'Status', 'Attendance', 'Paid', 'Notes'].map(h => t(h))];
  sortSessions([...state.sessions]).forEach(s => s.attendees.forEach(a => rows.push([
    s.date, s.start, endTime(s.start, s.duration), sName(a.studentId), group(s.groupId)?.name || t('Private'), s.duration, a.rate,
    isCharged(s, a) ? lineAmt(s, a) : 0, state.settings.currency, statusName(s.status),
    s.status === 'done' ? (a.present === false ? t('Absent') : t('Present')) : '', isCharged(s, a) ? (a.paid ? t('Paid') : t('Unpaid')) : '', s.notes || ''])));
  download(toCSV(rows), `teacher-helper-lessons-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}
function exportGrades() {
  const rows = [['Date', 'Type', 'Title', 'Group', 'Student', 'Score', 'Max', 'Percent'].map(h => t(h))];
  [...state.assessments].sort((a, b) => a.date.localeCompare(b.date)).forEach(a => a.scores.forEach(x => rows.push([
    a.date, typeName(a.type), a.title, group(a.groupId)?.name || t('Individual'), sName(x.studentId), x.score, a.maxScore, Math.round(x.score / a.maxScore * 100) + '%'])));
  download(toCSV(rows), `teacher-helper-grades-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}
function importJSON(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.students) || !Array.isArray(d.sessions)) throw new Error('bad');
      if (!confirm(t('Import {a} students and {b} lessons? This replaces your current data.', { a: d.students.length, b: d.sessions.length }))) return;
      const lang = state.settings.lang;
      state = migrate(d);
      if (!d.settings || !d.settings.lang) state.settings.lang = lang;
      commit(t('Backup imported'));
    } catch (e) { toast(t('That file is not a valid Teacher Helper backup')); }
  };
  r.readAsText(file);
}
function loadSample() {
  if ((state.students.length || state.sessions.length) && !confirm(t('Replace your current data with sample data?'))) return;
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const ar = isRTL();
  const mk = (en, arn, rate, level, i) => ({ id: uid() + i, name: ar ? arn : en, rate, level, phone: '', parentPhone: '', color: COLORS[i % COLORS.length], notes: '', active: true });
  const S = [mk('Mariam Adel', 'مريم عادل', 200, 'Grade 6', 0), mk('Omar Khaled', 'عمر خالد', 200, 'Grade 6', 1), mk('Nour Hassan', 'نور حسن', 200, 'Grade 6', 2), mk('Hana Mostafa', 'هنا مصطفى', 200, 'Grade 6', 3),
    mk('Karim Fathy', 'كريم فتحي', 350, 'IELTS', 4), mk('Salma Tarek', 'سلمى طارق', 350, 'IELTS', 5), mk('Youssef Samir', 'يوسف سمير', 300, 'B1', 6)];
  const ability = [0.9, 0.72, 0.55, 0.8, 0.68, 0.82, 0.62];
  const G = [
    { id: uid() + 'g1', name: ar ? 'سادسة ابتدائي — مجموعة أ' : 'Grade 6 — Group A', color: COLORS[0], rate: 150, studentIds: S.slice(0, 4).map(s => s.id), notes: '', active: true },
    { id: uid() + 'g2', name: ar ? 'تحضير IELTS' : 'IELTS Prep', color: COLORS[5], rate: 300, studentIds: [S[4].id, S[5].id], notes: '', active: true }
  ];
  const plans = [
    { groupId: G[0].id, members: S.slice(0, 4), rate: 150, days: [0, 3], start: '16:00', dur: 1.5 },
    { groupId: G[1].id, members: [S[4], S[5]], rate: 300, days: [1, 4], start: '18:00', dur: 2 },
    { groupId: null, members: [S[6]], rate: 300, days: [6, 2], start: '15:00', dur: 1 }
  ];
  const sessions = [], assessments = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const td = todayISO();
  const scoreOf = (st, off, max) => {
    const i = S.indexOf(st);
    const p = Math.max(0.3, Math.min(1, ability[i] + (off + 150) / 150 * 0.08 + (rnd() - 0.5) * 0.2));
    return Math.round(p * max * 2) / 2;
  };
  const addAsm = (type, title, iso, off, max, groupId, members) => {
    let took = members.filter(() => rnd() > 0.05);
    if (!took.length) took = members;
    assessments.push({
      id: uid() + assessments.length, type, title, date: iso, maxScore: max, groupId, notes: '',
      scores: took.map(m => ({ studentId: m.id, score: scoreOf(m, off, max) }))
    });
  };
  let qa = 0, ea = 0, mi = 0, yq = 0;
  for (let off = -150; off <= 14; off++) {
    const d = addDays(today, off), iso = toISO(d), past = iso < td;
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
    if (k % 14 === 7) { qa++; addAsm('quiz', ar ? `كويز ${qa}: الوحدة ${qa}` : `Quiz ${qa}: Unit ${qa}`, iso, off, 20, G[0].id, S.slice(0, 4)); }
    if (k % 30 === 29) { ea++; addAsm('exam', ar ? `امتحان الشهر ${ea}` : `Monthly exam ${ea}`, iso, off, 50, G[0].id, S.slice(0, 4)); }
    if (k % 21 === 10) { mi++; addAsm('exam', ar ? `اختبار تجريبي ${mi}` : `Mock test ${mi}`, iso, off, 40, G[1].id, [S[4], S[5]]); }
    if (k % 21 === 15) { yq++; addAsm('quiz', ar ? `كويز جرامر ${yq}` : `Grammar quiz ${yq}`, iso, off, 10, null, [S[6]]); }
  }
  state = { ...defaults(), students: S, groups: G, sessions, assessments, settings: { ...state.settings } };
  persist();
  go('dashboard');
  toast(t('Sample data loaded'));
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------- bilingual input ----------
 * Number fields accept Arabic-Indic (٠-٩) and Persian (۰-۹) digits and the Arabic decimal mark,
 * converted to Western digits as you type. Phone fields get the same digit conversion.
 * Text fields use dir="auto" so Arabic or English text aligns correctly. */
const AR_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g;
const toLatinDigits = v => v.replace(AR_DIGITS, c => String((c.charCodeAt(0) & 0xf) % 10));
document.addEventListener('input', e => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement)) return;
  if (el.hasAttribute('data-num')) {
    let v = toLatinDigits(el.value).replace(/[\u066B\u060C,]/g, '.').replace(/[^0-9.]/g, '');
    const i = v.indexOf('.');
    if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, '');
    if (v !== el.value) el.value = v;
  } else if (el.type === 'tel') {
    const v = toLatinDigits(el.value);
    if (v !== el.value) el.value = v;
  }
}, true);

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-view],[data-action]');
  if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.closest('dialog')) return;
  if (el.dataset.view) { go(el.dataset.view); return; }
  const id = el.dataset.id;
  const s = state.sessions.find(x => x.id === id);
  switch (el.dataset.action) {
    case 'open-student': go('student', id); break;
    case 'open-group': go('group', id); break;
    case 'add-session': sessionForm(null, { date: el.dataset.date, studentId: el.dataset.student, groupId: el.dataset.group }); break;
    case 'edit-session': if (s) sessionForm(s); break;
    case 'done': if (s) { s.status = 'done'; commit(s.attendees.length > 1 ? t('Marked as done — tap "Attendance & pay" to record absences') : t('Marked as done')); } break;
    case 'cancel': if (s) { s.status = 'cancelled'; s.attendees.forEach(a => { a.paid = false; }); commit(t('Lesson cancelled')); } break;
    case 'paid': {
      const a = s && s.attendees.find(x => x.studentId === el.dataset.st);
      if (a) { a.paid = !a.paid; commit(a.paid ? t('Marked as paid') : t('Marked as unpaid')); }
      break;
    }
    case 'confirm-all': {
      const l = state.sessions.filter(isOverdue);
      if (confirm(t('Mark {n} past lessons as done (everyone present)?', { n: l.length }))) { l.forEach(x => { x.status = 'done'; }); commit(t('Lessons confirmed')); }
      break;
    }
    case 'add-student': studentForm(); break;
    case 'edit-student': studentForm(student(id)); break;
    case 'add-group': groupForm(); break;
    case 'edit-group': groupForm(group(id)); break;
    case 'add-assessment': assessmentForm(null, { type: el.dataset.type, groupId: el.dataset.group, studentId: el.dataset.student }); break;
    case 'edit-assessment': { const a = state.assessments.find(x => x.id === id); if (a) assessmentForm(a); break; }
    case 'payall': {
      const gid = el.dataset.group;
      const l = chargedLines().filter(x => x.a.studentId === id && !x.a.paid && (!gid || x.s.groupId === gid));
      if (l.length && confirm(t('Record payment of {x} from {name} for {n} lessons?', { x: plainMoney(sum(l, x => x.amt)), name: sName(id), n: l.length }))) {
        l.forEach(x => { x.a.paid = true; }); commit(t('Payment recorded'));
      }
      break;
    }
    case 'week': ui.weekOffset = el.dataset.dir === '0' ? 0 : ui.weekOffset + (+el.dataset.dir); render(); break;
    case 'clear-filters': ui.filter = { student: '', group: '', status: '', paid: '', month: '' }; render(); break;
    case 'toggle-lang': state.settings.lang = LANG === 'ar' ? 'en' : 'ar'; commit(); break;
    case 'export-json': download(JSON.stringify(state, null, 2), `teacher-helper-backup-${todayISO()}.json`, 'application/json'); break;
    case 'export-csv': exportCSV(); break;
    case 'export-grades': exportGrades(); break;
    case 'import': $('#importFile').click(); break;
    case 'sample': loadSample(); break;
    case 'reset':
      if (confirm(t('Delete ALL students, groups, lessons, grades and settings? Export a backup first if you might need them.'))) {
        const lang = state.settings.lang; state = defaults(); state.settings.lang = lang; commit(t('All data deleted'));
      }
      break;
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.closest('dialog')) return;
  if (el.dataset.action === 'period') { ui.period = el.value; render(); }
  else if (el.dataset.filter) { ui.filter[el.dataset.filter] = el.value; render(); }
  else if (el.dataset.gfilter) { ui.gfilter[el.dataset.gfilter] = el.value; render(); }
  else if (el.name === 'lang' && el.closest('#settingsForm')) { state.settings.lang = el.value; persist(); render(); toast(t('Language changed')); }
  else if (el.id === 'importFile') { importJSON(el.files[0]); el.value = ''; }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'settingsForm') return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  state.settings = {
    ...state.settings, teacherName: fd.teacherName.trim(), currency: fd.currency.trim() || 'EGP',
    defaultDuration: Math.max(0.25, +fd.defaultDuration || 1), weekStart: +fd.weekStart, lang: fd.lang === 'ar' ? 'ar' : 'en'
  };
  commit(t('Preferences saved'));
});
window.addEventListener('hashchange', () => {
  const v = ui.view, id = ui.id;
  readHash();
  if (v !== ui.view || id !== ui.id) render();
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());

readHash();
render();
