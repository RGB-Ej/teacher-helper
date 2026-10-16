/* Teacher Helper — hourly lessons tracker
 * All data is stored locally in the browser (localStorage).
 */
'use strict';

const KEY = 'teacher-helper-v1';
const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
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
const sortSessions = arr => arr.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

/* ---------- state ---------- */
function defaults() {
  return { students: [], sessions: [], settings: { currency: 'EGP', teacherName: '', weekStart: 6, defaultDuration: 1 } };
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw);
    return {
      students: Array.isArray(d.students) ? d.students : [],
      sessions: Array.isArray(d.sessions) ? d.sessions : [],
      settings: { ...defaults().settings, ...(d.settings || {}) }
    };
  } catch (e) { return defaults(); }
}
let state = load();
const ui = { view: location.hash.slice(1) || 'dashboard', period: 'month', weekOffset: 0, filter: { student: '', status: '', paid: '', month: '' } };
const charts = {};

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast('Could not save — browser storage is full or blocked'); }
}
function commit(msg) { persist(); render(); if (msg) toast(msg); }

/* ---------- domain ---------- */
const money = n => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n || 0) + ' ' + esc(state.settings.currency);
const hrs = h => (Math.round((h || 0) * 100) / 100) + ' h';
const amount = s => (+s.duration || 0) * (+s.rate || 0);
const student = id => state.students.find(s => s.id === id);
const sName = id => student(id)?.name || 'Deleted student';
const sColor = id => student(id)?.color || '#94a3b8';
const done = () => state.sessions.filter(s => s.status === 'done');
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
const inRange = (s, [a, b]) => s.date >= a && s.date <= b;

/* ---------- shared templates ---------- */
function badges(s) {
  const label = { scheduled: 'Scheduled', done: 'Done', cancelled: 'Cancelled' }[s.status];
  let b = `<span class="badge ${s.status}">${label}</span>`;
  if (s.status === 'done') b += `<span class="badge ${s.paid ? 'paid' : 'unpaid'}">${s.paid ? 'Paid' : 'Unpaid'}</span>`;
  return b;
}
function sessionActions(s) {
  let a = '';
  if (s.status === 'scheduled') a += `<button class="btn sm" data-action="done" data-id="${s.id}">✓ Done</button><button class="btn sm ghost" data-action="cancel" data-id="${s.id}">Cancel</button>`;
  if (s.status === 'done') a += `<button class="btn sm ${s.paid ? 'ghost' : ''}" data-action="paid" data-id="${s.id}">${s.paid ? 'Unpay' : 'Mark paid'}</button>`;
  return a + `<button class="btn sm ghost" data-action="edit-session" data-id="${s.id}">Edit</button>`;
}
function sessionRow(s) {
  return `<div class="srow" style="--c:${sColor(s.studentId)}">
    <div class="srow-main"><strong>${esc(sName(s.studentId))}</strong>
      <span>${fmtDate(s.date)} · ${s.start}–${endTime(s.start, s.duration)} · ${hrs(s.duration)}</span></div>
    <div class="srow-side"><span class="amt">${money(amount(s))}</span>${badges(s)}${sessionActions(s)}</div>
  </div>`;
}
function welcome() {
  return `<div class="card welcome">
    <img class="logo" src="icon.svg" alt="">
    <h1>Welcome to Teacher Helper</h1>
    <p>Add your students with their hourly rate, schedule lessons, and Teacher Helper will calculate your hours, earnings and what each student still owes.</p>
    <div class="row">
      <button class="btn" data-action="add-student">+ Add first student</button>
      <button class="btn ghost" data-action="sample">Try with sample data</button>
    </div>
  </div>`;
}

/* ---------- views ---------- */
const views = {};
const after = {};

views.dashboard = () => {
  if (!state.students.length) return welcome();
  const r = periodRange(ui.period);
  const d = done().filter(s => inRange(s, r));
  const hours = sum(d, s => +s.duration), earned = sum(d, amount), collected = sum(d.filter(s => s.paid), amount);
  const owedList = done().filter(s => !s.paid);
  const outstanding = sum(owedList, amount);
  const cancelled = state.sessions.filter(s => s.status === 'cancelled' && inRange(s, r)).length;
  const toConfirm = sortSessions(state.sessions.filter(isOverdue));
  const limit = toISO(addDays(new Date(), 7));
  const upcoming = sortSessions(state.sessions.filter(s => s.status === 'scheduled' && !isOverdue(s) && s.date <= limit)).slice(0, 8);
  const upcomingValue = sum(state.sessions.filter(s => s.status === 'scheduled' && !isOverdue(s) && s.date <= limit), amount);
  const avg = hours ? earned / hours : 0;

  const top = state.students.map(st => {
    const l = d.filter(s => s.studentId === st.id);
    return { st, n: l.length, h: sum(l, s => +s.duration), e: sum(l, amount) };
  }).filter(x => x.n).sort((a, b) => b.e - a.e);

  return `
  <div class="page-head">
    <div><h1>Dashboard</h1><p>${PERIODS[ui.period]} · ${esc(r[0] === '0000-01-01' ? 'all records' : fmtDate(r[0]) + ' → ' + fmtDate(r[1]))}</p></div>
    <div class="row">
      <select data-action="period" aria-label="Period">${Object.entries(PERIODS).map(([k, v]) => `<option value="${k}" ${k === ui.period ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn" data-action="add-session">+ Lesson</button>
    </div>
  </div>

  <div class="grid kpis">
    <div class="card kpi highlight"><div class="label">Earned</div><div class="value">${money(earned)}</div><div class="sub">${d.length} lessons completed</div></div>
    <div class="card kpi"><div class="label">Hours taught</div><div class="value">${hrs(hours)}</div><div class="sub">Avg ${money(avg)} / hour</div></div>
    <div class="card kpi"><div class="label">Collected</div><div class="value">${money(collected)}</div><div class="sub">${earned ? Math.round(collected / earned * 100) : 0}% of earned</div></div>
    <div class="card kpi ${outstanding ? 'alert' : ''}"><div class="label">Outstanding (all time)</div><div class="value">${money(outstanding)}</div><div class="sub">${owedList.length} unpaid lessons</div></div>
    <div class="card kpi"><div class="label">Next 7 days</div><div class="value">${money(upcomingValue)}</div><div class="sub">${upcoming.length} lessons booked · ${cancelled} cancelled in period</div></div>
  </div>

  ${toConfirm.length ? `
  <div class="card" style="margin-bottom:16px">
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
    <div class="card"><div class="card-head"><h2>Students — ${PERIODS[ui.period].toLowerCase()}</h2></div>
      ${top.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Student</th><th class="num">Lessons</th><th class="num">Hours</th><th class="num">Earned</th></tr></thead>
        <tbody>${top.map(x => `<tr><td><span class="dot" style="--c:${x.st.color}"></span>${esc(x.st.name)}</td><td class="num">${x.n}</td><td class="num">${hrs(x.h)}</td><td class="num">${money(x.e)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${d.length}</td><td class="num">${hrs(hours)}</td><td class="num">${money(earned)}</td></tr></tfoot>
      </table></div>` : '<p class="empty-note">No completed lessons in this period.</p>'}</div>
  </div>`;
};

after.dashboard = () => {
  if (!window.Chart || !$('#chartMonthly')) return;
  const css = getComputedStyle(document.documentElement);
  const v = n => css.getPropertyValue(n).trim();
  Chart.defaults.color = v('--muted');
  Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
  const n = new Date();
  const months = [...Array(12)].map((_, i) => new Date(n.getFullYear(), n.getMonth() - 11 + i, 1));
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const byMonth = m => done().filter(s => s.date.startsWith(key(m)));
  charts.monthly = new Chart($('#chartMonthly'), {
    data: {
      labels: months.map(m => `${MONTHS[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`),
      datasets: [
        { type: 'bar', label: `Earned (${state.settings.currency})`, data: months.map(m => sum(byMonth(m), amount)), backgroundColor: v('--accent'), borderRadius: 6, yAxisID: 'y' },
        { type: 'line', label: 'Hours', data: months.map(m => sum(byMonth(m), s => +s.duration)), borderColor: v('--accent-2'), backgroundColor: v('--accent-2'), tension: .35, yAxisID: 'y1' }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, grid: { color: v('--border') } }, y1: { position: 'right', beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } },
      plugins: { legend: { position: 'bottom' } }
    }
  });
  if ($('#chartStudents')) {
    const r = periodRange(ui.period);
    const rows = state.students.map(st => ({ st, h: sum(done().filter(s => s.studentId === st.id && inRange(s, r)), s => +s.duration) })).filter(x => x.h);
    charts.students = new Chart($('#chartStudents'), {
      type: 'doughnut',
      data: { labels: rows.map(x => x.st.name), datasets: [{ data: rows.map(x => x.h), backgroundColor: rows.map(x => x.st.color), borderColor: v('--surface'), borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} h` } } } }
    });
  }
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
    <span class="chip">Week value <b>${money(sum(active, amount))}</b></span>
    <span class="chip">Done <b>${wk.filter(s => s.status === 'done').length}</b></span>
  </div>
  <div class="week">
    ${days.map(d => {
      const iso = toISO(d);
      const list = sortSessions(wk.filter(s => s.date === iso));
      return `<div class="day ${iso === t ? 'today' : ''}">
        <div class="day-head"><span>${DAY_NAMES[d.getDay()]}</span><b>${d.getDate()}</b></div>
        ${list.map(s => `<button class="lesson ${s.status}" style="--c:${sColor(s.studentId)}" data-action="edit-session" data-id="${s.id}">
          <span class="t">${s.start}–${endTime(s.start, s.duration)}</span>
          <span class="n">${esc(sName(s.studentId))}</span></button>`).join('')}
        <button class="add-slot" data-action="add-session" data-date="${iso}" aria-label="Add lesson on ${fmtDate(iso)}">+</button>
      </div>`;
    }).join('')}
  </div>`;
};

views.students = () => {
  const list = [...state.students].sort((x, y) => (y.active !== false) - (x.active !== false) || x.name.localeCompare(y.name));
  return `
  <div class="page-head">
    <div><h1>Students</h1><p>${state.students.filter(s => s.active !== false).length} active students</p></div>
    <button class="btn" data-action="add-student">+ Student</button>
  </div>
  ${!list.length ? welcome() : `<div class="grid students">${list.map(st => {
    const mine = state.sessions.filter(s => s.studentId === st.id);
    const d = mine.filter(s => s.status === 'done');
    const owed = sum(d.filter(s => !s.paid), amount);
    const next = sortSessions(mine.filter(s => s.status === 'scheduled' && s.date >= todayISO()))[0];
    return `<div class="card student-card ${st.active === false ? 'inactive' : ''}" style="--c:${st.color}">
      <div class="card-head"><h3>${esc(st.name)}</h3><span>${money(st.rate)} / h</span></div>
      ${st.phone ? `<div class="muted">${esc(st.phone)}</div>` : ''}
      <div class="stats">
        <div><small>Lessons done</small><b>${d.length}</b></div>
        <div><small>Hours</small><b>${hrs(sum(d, s => +s.duration))}</b></div>
        <div><small>Total earned</small><b>${money(sum(d, amount))}</b></div>
        <div><small>Outstanding</small><b style="color:${owed ? 'var(--warn)' : 'inherit'}">${money(owed)}</b></div>
      </div>
      <div class="muted" style="font-size:.85rem;margin-bottom:12px">Next: ${next ? `${fmtDate(next.date)} at ${next.start}` : 'nothing booked'}</div>
      <div class="row">
        <button class="btn sm" data-action="add-session" data-student="${st.id}">+ Lesson</button>
        ${owed ? `<button class="btn sm ghost" data-action="payall" data-id="${st.id}">Collect ${money(owed)}</button>` : ''}
        <button class="btn sm ghost" data-action="edit-student" data-id="${st.id}">Edit</button>
      </div>
    </div>`;
  }).join('')}</div>`}`;
};

views.billing = () => {
  const owed = state.students.map(st => {
    const l = done().filter(s => s.studentId === st.id && !s.paid);
    return { st, n: l.length, h: sum(l, s => +s.duration), total: sum(l, amount) };
  }).filter(x => x.n).sort((a, b) => b.total - a.total);
  const f = ui.filter;
  const list = state.sessions.filter(s =>
    (!f.student || s.studentId === f.student) &&
    (!f.status || s.status === f.status) &&
    (!f.month || s.date.startsWith(f.month)) &&
    (!f.paid || (f.paid === 'paid' ? s.paid : (s.status === 'done' && !s.paid)))
  ).sort((a, b) => (b.date + b.start).localeCompare(a.date + a.start));
  const dl = list.filter(s => s.status === 'done');
  const shown = list.slice(0, 300);
  return `
  <div class="page-head">
    <div><h1>Billing</h1><p>Who owes what, and every lesson on record</p></div>
    <button class="btn ghost" data-action="export-csv">Export CSV</button>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="card-head"><h2>Outstanding by student</h2><span>${money(sum(owed, x => x.total))} total</span></div>
    ${owed.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Student</th><th class="num">Unpaid lessons</th><th class="num">Hours</th><th class="num">Amount</th><th></th></tr></thead>
      <tbody>${owed.map(x => `<tr><td><span class="dot" style="--c:${x.st.color}"></span>${esc(x.st.name)}</td><td class="num">${x.n}</td><td class="num">${hrs(x.h)}</td><td class="num"><b>${money(x.total)}</b></td>
        <td class="num"><button class="btn sm" data-action="payall" data-id="${x.st.id}">Record payment</button></td></tr>`).join('')}</tbody>
    </table></div>` : '<p class="empty-note">Everyone is paid up. 🎉</p>'}
  </div>
  <div class="card">
    <div class="card-head"><h2>Lessons</h2>
      <div class="row">
        <select data-filter="student" aria-label="Student"><option value="">All students</option>${state.students.map(s => `<option value="${s.id}" ${f.student === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select data-filter="status" aria-label="Status"><option value="">Any status</option>${['scheduled', 'done', 'cancelled'].map(x => `<option value="${x}" ${f.status === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select>
        <select data-filter="paid" aria-label="Payment"><option value="">Paid & unpaid</option><option value="paid" ${f.paid === 'paid' ? 'selected' : ''}>Paid</option><option value="unpaid" ${f.paid === 'unpaid' ? 'selected' : ''}>Unpaid</option></select>
        <input type="month" data-filter="month" value="${f.month}" aria-label="Month">
        ${f.student || f.status || f.paid || f.month ? '<button class="btn sm ghost" data-action="clear-filters">Clear</button>' : ''}
      </div>
    </div>
    ${shown.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Date</th><th>Time</th><th>Student</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead>
      <tbody>${shown.map(s => `<tr>
        <td>${fmtDate(s.date)} ${s.date.slice(0, 4)}</td><td>${s.start}–${endTime(s.start, s.duration)}</td>
        <td><span class="dot" style="--c:${sColor(s.studentId)}"></span>${esc(sName(s.studentId))}</td>
        <td class="num">${hrs(s.duration)}</td><td class="num">${money(s.rate)}</td><td class="num">${money(amount(s))}</td>
        <td>${badges(s)}</td><td class="num">${sessionActions(s)}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Completed in this view</td><td class="num">${hrs(sum(dl, s => +s.duration))}</td><td></td><td class="num">${money(sum(dl, amount))}</td><td colspan="2"></td></tr></tfoot>
    </table></div>${list.length > 300 ? `<p class="hint">Showing latest 300 of ${list.length}. Use filters or export CSV.</p>` : ''}` : '<p class="empty-note">No lessons match these filters.</p>'}
  </div>`;
};

views.settings = () => {
  const s = state.settings;
  return `
  <div class="page-head"><div><h1>Settings</h1><p>Preferences and your data</p></div></div>
  <div class="grid halves">
    <form class="card" id="settingsForm">
      <h2 style="margin-bottom:14px">Preferences</h2>
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
      <h2 style="margin-bottom:6px">Your data</h2>
      <p class="muted" style="margin-top:0">Everything is saved in this browser only. Export a backup regularly, and import it to move to another device.</p>
      <div class="list">
        <button class="btn ghost" data-action="export-json">⬇ Export backup (JSON)</button>
        <button class="btn ghost" data-action="import">⬆ Import backup</button>
        <button class="btn ghost" data-action="export-csv">⬇ Export lessons (CSV / Excel)</button>
        <button class="btn ghost" data-action="sample">Load sample data</button>
        <button class="btn danger" data-action="reset">Delete all data</button>
      </div>
      <p class="hint">${state.students.length} students · ${state.sessions.length} lessons stored</p>
    </div>
  </div>`;
};

/* ---------- render ---------- */
function render() {
  if (!views[ui.view]) ui.view = 'dashboard';
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  $('#teacherLabel').textContent = state.settings.teacherName || 'Hourly lessons tracker';
  Object.keys(charts).forEach(k => { charts[k].destroy(); delete charts[k]; });
  $('#view').innerHTML = views[ui.view]();
  if (after[ui.view]) after[ui.view]();
}
function go(view) {
  ui.view = view;
  try { history.replaceState(null, '', '#' + view); } catch (e) { /* ignore */ }
  render();
  window.scrollTo(0, 0);
}

/* ---------- modal forms ---------- */
function openModal(html, onSubmit) {
  const m = $('#modal'), f = $('#modalForm');
  f.innerHTML = html;
  f.onsubmit = e => {
    e.preventDefault();
    const act = e.submitter?.value || 'save';
    if (act === 'cancel') { m.close(); return; }
    if (act === 'save' && !f.checkValidity()) { f.reportValidity(); return; }
    const fd = Object.fromEntries(new FormData(f));
    if (onSubmit(fd, act) !== false) m.close();
  };
  m.showModal();
}

function sessionForm(existing, preset = {}) {
  const actives = state.students.filter(s => s.active !== false);
  if (!actives.length && !existing) { toast('Add a student first'); go('students'); return; }
  const isNew = !existing;
  const s = existing || {
    studentId: preset.studentId || actives[0].id, date: preset.date || todayISO(), start: '16:00',
    duration: +state.settings.defaultDuration || 1, status: 'scheduled', paid: false, notes: ''
  };
  const rate = s.rate ?? student(s.studentId)?.rate ?? 0;
  const opts = (existing ? state.students : actives).map(st => `<option value="${st.id}" ${st.id === s.studentId ? 'selected' : ''}>${esc(st.name)} — ${st.rate}/h</option>`).join('');
  openModal(`
    <h2>${isNew ? 'New lesson' : 'Edit lesson'}</h2>
    <div class="field"><label for="f-st">Student</label><select id="f-st" name="studentId" required>${opts}</select></div>
    <div class="fields">
      <div class="field"><label for="f-d">Date</label><input type="date" id="f-d" name="date" value="${s.date}" required></div>
      <div class="field"><label for="f-t">Start time</label><input type="time" id="f-t" name="start" value="${s.start}" required></div>
      <div class="field"><label for="f-du">Duration (hours)</label><input type="number" id="f-du" name="duration" value="${s.duration}" min="0.25" max="12" step="0.25" required></div>
      <div class="field"><label for="f-r">Rate / hour</label><input type="number" id="f-r" name="rate" value="${rate}" min="0" step="any" required></div>
      <div class="field"><label for="f-s">Status</label><select id="f-s" name="status">${['scheduled', 'done', 'cancelled'].map(x => `<option value="${x}" ${s.status === x ? 'selected' : ''}>${x[0].toUpperCase() + x.slice(1)}</option>`).join('')}</select></div>
      ${isNew ? `<div class="field"><label for="f-rep">Repeat weekly</label><select id="f-rep" name="repeat">${[1, 2, 4, 8, 12, 16, 24].map(n => `<option value="${n}">${n === 1 ? 'Just once' : n + ' weeks'}</option>`).join('')}</select></div>` : '<div></div>'}
    </div>
    <div class="field"><label class="check"><input type="checkbox" name="paid" ${s.paid ? 'checked' : ''}> Paid (completed lessons only)</label></div>
    <div class="field"><label for="f-n">Notes</label><textarea id="f-n" name="notes" rows="2" placeholder="Topic, homework…">${esc(s.notes)}</textarea></div>
    <div class="preview" id="f-prev"></div>
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}<span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="save">${isNew ? 'Add lesson' : 'Save'}</button>
    </div>`,
    (fd, act) => {
      if (act === 'delete') {
        if (!confirm('Delete this lesson?')) return false;
        state.sessions = state.sessions.filter(x => x.id !== s.id);
        commit('Lesson deleted'); return;
      }
      const data = {
        studentId: fd.studentId, date: fd.date, start: fd.start, duration: +fd.duration, rate: +fd.rate,
        status: fd.status, paid: fd.status === 'done' && !!fd.paid, notes: (fd.notes || '').trim()
      };
      const clash = data.status !== 'cancelled' && state.sessions.find(x => x.id !== s.id && x.status !== 'cancelled' && x.date === data.date &&
        toMin(data.start) < toMin(x.start) + x.duration * 60 && toMin(x.start) < toMin(data.start) + data.duration * 60);
      if (clash && !confirm(`This overlaps with ${sName(clash.studentId)} at ${clash.start}. Save anyway?`)) return false;
      if (isNew) {
        const n = Math.max(1, Math.min(52, +fd.repeat || 1));
        for (let i = 0; i < n; i++) {
          state.sessions.push({ id: uid(), ...data, date: toISO(addDays(fromISO(data.date), 7 * i)),
            status: i ? 'scheduled' : data.status, paid: i ? false : data.paid });
        }
        commit(n > 1 ? `${n} weekly lessons added` : 'Lesson added');
      } else { Object.assign(s, data); commit('Lesson updated'); }
    });
  const f = $('#modalForm');
  const upd = () => {
    const d = +f.duration.value || 0, r = +f.rate.value || 0;
    $('#f-prev').textContent = `${d} h × ${r} = ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(d * r)} ${state.settings.currency}  ·  ends ${f.start.value ? endTime(f.start.value, d) : '—'}`;
  };
  f.studentId.onchange = () => { const st = student(f.studentId.value); if (st) f.rate.value = st.rate; upd(); };
  f.duration.oninput = f.rate.oninput = f.start.oninput = upd;
  upd();
}

function studentForm(st) {
  const isNew = !st;
  const s = st || { name: '', rate: '', phone: '', notes: '', color: COLORS[state.students.length % COLORS.length], active: true };
  openModal(`
    <h2>${isNew ? 'New student' : 'Edit student'}</h2>
    <div class="field"><label for="s-n">Name</label><input type="text" id="s-n" name="name" value="${esc(s.name)}" required></div>
    <div class="fields">
      <div class="field"><label for="s-r">Hourly rate (${esc(state.settings.currency)})</label><input type="number" id="s-r" name="rate" value="${s.rate}" min="0" step="any" required></div>
      <div class="field"><label for="s-p">Phone / WhatsApp</label><input type="tel" id="s-p" name="phone" value="${esc(s.phone)}"></div>
      <div class="field"><label for="s-c">Colour</label><select id="s-c" name="color">${COLORS.map((c, i) => `<option value="${c}" ${c === s.color ? 'selected' : ''}>${['Indigo', 'Sky', 'Green', 'Amber', 'Red', 'Violet', 'Pink', 'Teal'][i]}</option>`).join('')}</select></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="active" ${s.active !== false ? 'checked' : ''}> Active student</label></div>
    </div>
    <div class="field"><label for="s-no">Notes</label><textarea id="s-no" name="notes" rows="2" placeholder="Level, goals, parent contact…">${esc(s.notes)}</textarea></div>
    ${isNew ? '' : '<p class="hint">Changing the rate only affects new lessons. Existing lessons keep their own rate.</p>'}
    <div class="modal-actions">
      ${isNew ? '' : '<button class="btn danger" value="delete" formnovalidate>Delete</button>'}<span class="spacer"></span>
      <button class="btn ghost" value="cancel" formnovalidate>Cancel</button>
      <button class="btn" value="save">${isNew ? 'Add student' : 'Save'}</button>
    </div>`,
    (fd, act) => {
      if (act === 'delete') {
        const n = state.sessions.filter(x => x.studentId === st.id).length;
        if (!confirm(`Delete ${st.name}${n ? ` and their ${n} lessons` : ''}? This cannot be undone.\nTip: untick "Active" instead to keep their history.`)) return false;
        state.students = state.students.filter(x => x.id !== st.id);
        state.sessions = state.sessions.filter(x => x.studentId !== st.id);
        commit('Student deleted'); return;
      }
      const data = { name: fd.name.trim(), rate: +fd.rate, phone: (fd.phone || '').trim(), color: fd.color, notes: (fd.notes || '').trim(), active: !!fd.active };
      if (!data.name) { toast('Name is required'); return false; }
      if (isNew) { state.students.push({ id: uid(), ...data }); commit('Student added'); }
      else { Object.assign(st, data); commit('Student updated'); }
    });
}

/* ---------- data import / export ---------- */
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportCSV() {
  const rows = [['Date', 'Start', 'End', 'Student', 'Hours', 'Rate', 'Amount', 'Currency', 'Status', 'Paid', 'Notes'],
    ...sortSessions([...state.sessions]).map(s => [s.date, s.start, endTime(s.start, s.duration), sName(s.studentId), s.duration, s.rate, amount(s), state.settings.currency, s.status, s.paid ? 'yes' : 'no', s.notes || ''])];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  download('\ufeff' + csv, `teacher-helper-lessons-${todayISO()}.csv`, 'text/csv;charset=utf-8');
}
function importJSON(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.students) || !Array.isArray(d.sessions)) throw new Error('bad');
      if (!confirm(`Import ${d.students.length} students and ${d.sessions.length} lessons? This replaces your current data.`)) return;
      state = { students: d.students, sessions: d.sessions, settings: { ...defaults().settings, ...(d.settings || {}) } };
      commit('Backup imported');
    } catch (e) { toast('That file is not a valid Teacher Helper backup'); }
  };
  r.readAsText(file);
}
function loadSample() {
  if ((state.students.length || state.sessions.length) && !confirm('Replace your current data with sample data?')) return;
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const people = [['Mariam Adel', 250, '16:00', 1], ['Omar Khaled', 300, '17:30', 1.5], ['Nour Hassan', 200, '19:00', 1], ['Youssef Samir', 350, '15:00', 2]];
  const students = people.map(([name, rate], i) => ({ id: uid() + i, name, rate, color: COLORS[i], phone: '', notes: '', active: true }));
  const sessions = [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = todayISO();
  for (let off = -150; off <= 14; off++) {
    const d = addDays(today, off), iso = toISO(d);
    students.forEach((st, i) => {
      const daysOf = [(i * 2) % 7, (i * 2 + 3) % 7];
      if (!daysOf.includes(d.getDay())) return;
      const past = iso < t;
      const cancelled = past && rnd() < 0.08;
      sessions.push({
        id: uid() + sessions.length, studentId: st.id, date: iso, start: people[i][2], duration: people[i][3], rate: st.rate,
        status: past ? (cancelled ? 'cancelled' : 'done') : 'scheduled',
        paid: past && !cancelled && (off < -14 || rnd() < 0.4), notes: ''
      });
    });
  }
  state = { students, sessions, settings: { ...state.settings } };
  commit('Sample data loaded');
  go('dashboard');
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-view],[data-action]');
  if (!t || t.tagName === 'SELECT' || t.tagName === 'INPUT') return;
  if (t.dataset.view) { go(t.dataset.view); return; }
  const id = t.dataset.id;
  const s = state.sessions.find(x => x.id === id);
  switch (t.dataset.action) {
    case 'add-session': sessionForm(null, { date: t.dataset.date, studentId: t.dataset.student }); break;
    case 'edit-session': if (s) sessionForm(s); break;
    case 'done': if (s) { s.status = 'done'; commit('Marked as done'); } break;
    case 'cancel': if (s) { s.status = 'cancelled'; s.paid = false; commit('Lesson cancelled'); } break;
    case 'paid': if (s) { s.paid = !s.paid; commit(s.paid ? 'Marked as paid' : 'Marked as unpaid'); } break;
    case 'confirm-all': {
      const l = state.sessions.filter(isOverdue);
      if (confirm(`Mark ${l.length} past lessons as done?`)) { l.forEach(x => { x.status = 'done'; }); commit('Lessons confirmed'); }
      break;
    }
    case 'add-student': studentForm(); break;
    case 'edit-student': studentForm(student(id)); break;
    case 'payall': {
      const l = done().filter(x => x.studentId === id && !x.paid);
      if (l.length && confirm(`Record payment of ${money(sum(l, amount)).replace(/&amp;/g, '&')} from ${sName(id)} for ${l.length} lessons?`)) {
        l.forEach(x => { x.paid = true; }); commit('Payment recorded');
      }
      break;
    }
    case 'week': ui.weekOffset = t.dataset.dir === '0' ? 0 : ui.weekOffset + (+t.dataset.dir); render(); break;
    case 'clear-filters': ui.filter = { student: '', status: '', paid: '', month: '' }; render(); break;
    case 'export-json': download(JSON.stringify(state, null, 2), `teacher-helper-backup-${todayISO()}.json`, 'application/json'); break;
    case 'export-csv': exportCSV(); break;
    case 'import': $('#importFile').click(); break;
    case 'sample': loadSample(); break;
    case 'reset':
      if (confirm('Delete ALL students, lessons and settings? Export a backup first if you might need them.')) { state = defaults(); commit('All data deleted'); }
      break;
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.action === 'period') { ui.period = t.value; render(); }
  else if (t.dataset.filter) { ui.filter[t.dataset.filter] = t.value; render(); }
  else if (t.id === 'importFile') { importJSON(t.files[0]); t.value = ''; }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'settingsForm') return;
  e.preventDefault();
  const fd = Object.fromEntries(new FormData(e.target));
  state.settings = { ...state.settings, teacherName: fd.teacherName.trim(), currency: fd.currency.trim() || 'EGP',
    defaultDuration: Math.max(0.25, +fd.defaultDuration || 1), weekStart: +fd.weekStart };
  commit('Preferences saved');
});
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (views[v] && v !== ui.view) { ui.view = v; render(); } });
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());

render();
