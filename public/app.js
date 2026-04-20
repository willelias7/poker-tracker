// ── CONFIG ────────────────────────────────────────────────────────────────────
// Summer = today through end of August of the current year
const SUMMER_START  = new Date('2026-04-20T00:00:00'); // start of tracking period
const SUMMER_END    = new Date(new Date().getFullYear(), 7, 31, 23, 59, 59); // Aug 31
// All-time profit earned before this app was started
const ALLTIME_BASELINE = 5596;

// ── STATE ─────────────────────────────────────────────────────────────────────
let sessions    = [];
let currentPage = 'calendar';
let calYear     = new Date().getFullYear();
let calMonth    = new Date().getMonth();
let editingId   = null;   // session id being edited, or null for new
let modalDate   = null;   // date string 'YYYY-MM-DD' the modal was opened for

// Chart instances (kept so we can destroy+recreate on data change)
let chartAlltime = null;
let chartSummer  = null;
let chartHourly  = null;

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadSessions();
  bindNav();
  bindCalendarNav();
  bindModal();
  renderCalendar();
});

// ── API ───────────────────────────────────────────────────────────────────────
async function loadSessions() {
  const res = await fetch('/api/sessions');
  sessions  = await res.json();
  sessions.sort((a, b) => a.date.localeCompare(b.date));
}

async function apiPost(body) {
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiPut(id, body) {
  const res = await fetch(`/api/sessions/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function apiDelete(id) {
  await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
}

// ── NAV ───────────────────────────────────────────────────────────────────────
function bindNav() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.page;
      switchPage(page);
    });
  });

  document.getElementById('btn-add-session').addEventListener('click', () => {
    const today = fmtDate(new Date());
    openModalNew(today);
  });
}

function switchPage(page) {
  currentPage = page;
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${page}`));
  if (page === 'graphs') {
    renderGraphsPage();
  }
}

// ── CALENDAR ──────────────────────────────────────────────────────────────────
function bindCalendarNav() {
  document.getElementById('prev-month').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  document.getElementById('next-month').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
}

function renderCalendar() {
  renderCalendarStats();

  const title = document.getElementById('month-title');
  title.textContent = new Date(calYear, calMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const grid   = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev  = new Date(calYear, calMonth, 0).getDate();
  const today = fmtDate(new Date());

  // leading cells from previous month
  for (let i = 0; i < firstDay; i++) {
    const d = daysInPrev - firstDay + 1 + i;
    grid.appendChild(makeCell(null, d, false));
  }

  // current month
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = fmtDate(new Date(calYear, calMonth, d));
    const isToday = dateStr === today;
    grid.appendChild(makeCell(dateStr, d, true, isToday));
  }

  // trailing cells
  const total = firstDay + daysInMonth;
  const trail = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let i = 1; i <= trail; i++) {
    grid.appendChild(makeCell(null, i, false));
  }
}

function makeCell(dateStr, dayNum, isCurrentMonth, isToday = false) {
  const cell = document.createElement('div');
  cell.classList.add('cal-day');
  if (!isCurrentMonth) cell.classList.add('other-month');
  if (isToday) cell.classList.add('today');

  const numEl = document.createElement('div');
  numEl.classList.add('day-num');
  numEl.textContent = dayNum;
  cell.appendChild(numEl);

  if (dateStr) {
    const daySessions = sessionsForDate(dateStr);
    if (daySessions.length > 0) {
      const net   = daySessions.reduce((s, x) => s + netOf(x), 0);
      const hours = daySessions.reduce((s, x) => s + x.hours, 0);

      cell.classList.add(net >= 0 ? 'win' : 'loss');

      const netEl = document.createElement('div');
      netEl.classList.add('day-net', net >= 0 ? 'positive' : 'negative');
      netEl.textContent = fmtMoney(net);
      cell.appendChild(netEl);

      const hrEl = document.createElement('div');
      hrEl.classList.add('day-hours');
      hrEl.textContent = `${hours.toFixed(1)} hrs`;
      cell.appendChild(hrEl);

      if (daySessions.length > 1) {
        const badge = document.createElement('div');
        badge.classList.add('day-sessions-count');
        badge.textContent = `${daySessions.length}x`;
        cell.appendChild(badge);
      }
    }

    cell.addEventListener('click', () => openModalForDay(dateStr));
  }

  return cell;
}

function renderCalendarStats() {
  const monthSessions = sessions.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    return d.getFullYear() === calYear && d.getMonth() === calMonth;
  });

  const net   = monthSessions.reduce((s, x) => s + netOf(x), 0);
  const hours = monthSessions.reduce((s, x) => s + x.hours, 0);
  const hr    = hours > 0 ? net / hours : 0;
  const wins  = monthSessions.filter(x => netOf(x) > 0).length;
  const wr    = monthSessions.length > 0 ? (wins / monthSessions.length * 100) : 0;

  document.getElementById('calendar-stats').innerHTML = `
    ${statCard('Month P&L',    fmtMoney(net),           net > 0 ? 'positive' : net < 0 ? 'negative' : '')}
    ${statCard('Hours Played', hours.toFixed(1) + ' h', '')}
    ${statCard('Sessions',     monthSessions.length,    '')}
    ${statCard('Hourly Rate',  fmtMoney(hr) + '/hr',    hr >= 0 ? 'gold' : 'negative')}
    ${statCard('Win Rate',     wr.toFixed(0) + '%',      wr >= 50 ? 'positive' : wr > 0 ? '' : '')}
  `;
}

// ── GRAPHS ────────────────────────────────────────────────────────────────────
function renderGraphsPage() {
  renderGraphsStats();
  renderCharts();
}

function renderGraphsStats() {
  const trackedNet = sessions.reduce((s, x) => s + netOf(x), 0);
  const allNet     = ALLTIME_BASELINE + trackedNet;
  const allHours   = sessions.reduce((s, x) => s + x.hours, 0);
  const allHr      = allHours > 0 ? trackedNet / allHours : 0;
  const allWins    = sessions.filter(x => netOf(x) > 0).length;
  const allWR      = sessions.length > 0 ? (allWins / sessions.length * 100) : 0;

  const sumSess    = summerSessions();
  const sumNet     = sumSess.reduce((s, x) => s + netOf(x), 0);
  const sumHours   = sumSess.reduce((s, x) => s + x.hours, 0);
  const sumHr      = sumHours > 0 ? sumNet / sumHours : 0;

  document.getElementById('graphs-stats').innerHTML = `
    ${statCard('All-Time P&L',    fmtMoney(allNet),    allNet  >= 0 ? 'positive' : 'negative')}
    ${statCard('All-Time Hrs',    allHours.toFixed(1) + ' h', '')}
    ${statCard('All-Time $/hr',   fmtMoney(allHr) + '/hr',    allHr  >= 0 ? 'gold' : 'negative')}
    ${statCard('All-Time Win %',  allWR.toFixed(0) + '%',     allWR  >= 50 ? 'positive' : '')}
    ${statCard('Summer P&L',      fmtMoney(sumNet),    sumNet  >= 0 ? 'positive' : 'negative')}
    ${statCard('Summer $/hr',     fmtMoney(sumHr) + '/hr',    sumHr  >= 0 ? 'gold' : 'negative')}
  `;
}

function renderCharts() {
  const now = new Date();
  renderAlltimeChart();
  renderSummerChart();
  renderHourlyChart();
}

function renderAlltimeChart() {
  if (chartAlltime) { chartAlltime.destroy(); chartAlltime = null; }
  const canvas = document.getElementById('chart-alltime');

  if (sessions.length === 0) {
    canvas.closest('.chart-wrap').innerHTML = '<div class="empty-chart">No sessions yet — baseline: ' + fmtMoney(ALLTIME_BASELINE) + '</div>';
    return;
  }

  // Start chart from all-time baseline
  let running = ALLTIME_BASELINE;
  const labels = ['Start'];
  const data   = [ALLTIME_BASELINE];

  sessions.forEach(s => {
    running += netOf(s);
    labels.push(fmtDateShort(s.date));
    data.push(running);
  });

  chartAlltime = new Chart(canvas, chartConfig({
    labels, data,
    color: '#e8001a',
    fill: 'rgba(232,0,26,0.08)',
    label: 'All-Time P&L',
  }));
}

function renderSummerChart() {
  if (chartSummer) { chartSummer.destroy(); chartSummer = null; }
  const canvas = document.getElementById('chart-summer');

  const ss = summerSessions();
  if (ss.length === 0) {
    canvas.closest('.chart-wrap').innerHTML = '<div class="empty-chart">No sessions tracked yet</div>';
    return;
  }

  let running = 0;
  const labels = [];
  const data   = [];

  ss.forEach(s => {
    running += netOf(s);
    labels.push(fmtDateShort(s.date));
    data.push(running);
  });

  chartSummer = new Chart(canvas, chartConfig({
    labels, data,
    color: '#22c55e',
    fill: 'rgba(34,197,94,0.08)',
    label: 'Summer P&L',
  }));
}

function renderHourlyChart() {
  if (chartHourly) { chartHourly.destroy(); chartHourly = null; }
  const canvas = document.getElementById('chart-hourly');

  const ss = summerSessions();
  if (ss.length === 0) {
    canvas.closest('.chart-wrap').innerHTML = '<div class="empty-chart">No sessions tracked yet</div>';
    return;
  }

  let runNet   = 0;
  let runHours = 0;
  const labels = [];
  const data   = [];

  ss.forEach(s => {
    runNet   += netOf(s);
    runHours += s.hours;
    labels.push(fmtDateShort(s.date));
    data.push(runHours > 0 ? parseFloat((runNet / runHours).toFixed(2)) : 0);
  });

  chartHourly = new Chart(canvas, chartConfig({
    labels, data,
    color: '#a78bfa',
    fill: 'rgba(167,139,250,0.08)',
    label: '$/hr',
    zeroline: true,
  }));
}

function chartConfig({ labels, data, color, fill, label, zeroline = false }) {
  const positiveColor = color;
  const negativeColor = '#ef4444';

  return {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: fill,
        borderWidth: 2,
        fill: true,
        tension: 0.35,
        pointRadius: data.length > 40 ? 0 : 4,
        pointHoverRadius: 6,
        pointBackgroundColor: data.map(v => v >= 0 ? positiveColor : negativeColor),
        pointBorderColor: 'transparent',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e2333',
          borderColor: '#252a3a',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#f1f5f9',
          padding: 10,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              return `  ${label}: ${label === '$/hr' ? fmtMoney(v) + '/hr' : fmtMoney(v)}`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: '#1e2333' },
          ticks: { color: '#475569', maxTicksLimit: 10, font: { size: 11 } },
          border: { color: '#1e2333' },
        },
        y: {
          grid: {
            color: ctx => {
              if (zeroline && ctx.tick.value === 0) return '#475569';
              return '#1e2333';
            },
          },
          ticks: {
            color: '#475569',
            font: { size: 11 },
            callback: v => fmtMoney(v),
          },
          border: { color: '#1e2333' },
        },
      },
    },
  };
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function bindModal() {
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });
  document.getElementById('btn-cancel-form').addEventListener('click', () => {
    const daySess = modalDate ? sessionsForDate(modalDate) : [];
    if (daySess.length > 0 && editingId === null) {
      // go back to sessions list
      showSessionsList(modalDate);
      showForm(false);
    } else {
      closeModal();
    }
  });

  // live net calculation
  ['form-buyin', 'form-cashout'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateFormNet);
  });

  document.getElementById('session-form').addEventListener('submit', async e => {
    e.preventDefault();
    await saveSession();
  });
}

function openModalForDay(dateStr) {
  modalDate = dateStr;
  editingId = null;
  const daySess = sessionsForDate(dateStr);

  const label = new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  document.getElementById('modal-title').textContent = label;

  if (daySess.length > 0) {
    showSessionsList(dateStr);
    showForm(false);
  } else {
    showSessionsList(null);
    showForm(true);
    resetForm(dateStr);
  }

  document.getElementById('modal-overlay').classList.remove('hidden');
}

function openModalNew(dateStr) {
  modalDate = dateStr;
  editingId = null;
  document.getElementById('modal-title').textContent = 'New Session';
  showSessionsList(null);
  showForm(true);
  resetForm(dateStr);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function openModalEdit(session) {
  editingId = session.id;
  modalDate = session.date;
  const label = new Date(session.date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  document.getElementById('modal-title').textContent = `Edit — ${label}`;
  showSessionsList(null);
  showForm(true);
  populateForm(session);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId = null;
  modalDate = null;
}

function showSessionsList(dateStr) {
  const listEl = document.getElementById('sessions-list');
  if (!dateStr) {
    listEl.classList.add('hidden');
    listEl.innerHTML = '';
    return;
  }

  const daySess = sessionsForDate(dateStr);
  if (daySess.length === 0) {
    listEl.classList.add('hidden');
    return;
  }

  let html = '';
  daySess.forEach(s => {
    const net = netOf(s);
    html += `
      <div class="session-item">
        <div class="session-item-net ${net >= 0 ? 'positive' : 'negative'}">${fmtMoney(net)}</div>
        <div class="session-item-meta">
          ${s.hours}h${s.venue ? ' &middot; ' + escHtml(s.venue) : ''}
          <br>Buy-in ${fmtMoney(s.buyIn)} → Cash-out ${fmtMoney(s.cashOut)}
        </div>
        <div class="session-item-actions">
          <button class="btn-icon" onclick="openModalEdit(sessions.find(x=>x.id==='${s.id}'))">Edit</button>
          <button class="btn-icon danger" onclick="confirmDelete('${s.id}')">Del</button>
        </div>
      </div>
    `;
  });

  html += `<button class="btn-add-another" onclick="addAnotherSession('${dateStr}')">+ Add another session</button>`;

  listEl.innerHTML = html;
  listEl.classList.remove('hidden');

  // add divider before form if form is shown
  const formWrap = document.getElementById('session-form-wrap');
  let divider = document.getElementById('modal-divider');
  if (!divider) {
    divider = document.createElement('hr');
    divider.id = 'modal-divider';
    divider.className = 'modal-divider';
    listEl.after(divider);
  }
}

function addAnotherSession(dateStr) {
  showForm(true);
  resetForm(dateStr);
}

function showForm(show) {
  document.getElementById('session-form-wrap').style.display = show ? '' : 'none';
  const divider = document.getElementById('modal-divider');
  if (divider) divider.style.display = show ? '' : 'none';
}

function resetForm(dateStr) {
  document.getElementById('form-id').value      = '';
  document.getElementById('form-date').value    = dateStr || '';
  document.getElementById('form-buyin').value   = '';
  document.getElementById('form-cashout').value = '';
  document.getElementById('form-hours').value   = '';
  document.getElementById('form-venue').value   = '';
  document.getElementById('form-notes').value   = '';
  document.getElementById('btn-save').textContent = 'Save Session';
  updateFormNet();
}

function populateForm(s) {
  document.getElementById('form-id').value      = s.id;
  document.getElementById('form-date').value    = s.date;
  document.getElementById('form-buyin').value   = s.buyIn;
  document.getElementById('form-cashout').value = s.cashOut;
  document.getElementById('form-hours').value   = s.hours;
  document.getElementById('form-venue').value   = s.venue  || '';
  document.getElementById('form-notes').value   = s.notes  || '';
  document.getElementById('btn-save').textContent = 'Update Session';
  updateFormNet();
}

function updateFormNet() {
  const buyIn   = parseFloat(document.getElementById('form-buyin').value)   || 0;
  const cashOut = parseFloat(document.getElementById('form-cashout').value) || 0;
  const net     = cashOut - buyIn;
  const el      = document.getElementById('form-net');

  if (!document.getElementById('form-buyin').value && !document.getElementById('form-cashout').value) {
    el.textContent = 'Net: —';
    el.className   = 'form-net';
    return;
  }

  el.textContent = `Net: ${fmtMoney(net)}`;
  el.className   = `form-net ${net > 0 ? 'positive' : net < 0 ? 'negative' : ''}`;
}

async function saveSession() {
  const id      = document.getElementById('form-id').value;
  const date    = document.getElementById('form-date').value;
  const buyIn   = parseFloat(document.getElementById('form-buyin').value);
  const cashOut = parseFloat(document.getElementById('form-cashout').value);
  const hours   = parseFloat(document.getElementById('form-hours').value);
  const venue   = document.getElementById('form-venue').value.trim();
  const notes   = document.getElementById('form-notes').value.trim();

  const body = { date, buyIn, cashOut, hours, venue, notes };

  const btn = document.getElementById('btn-save');
  btn.disabled = true;
  btn.textContent = 'Saving…';

  if (id) {
    const updated = await apiPut(id, body);
    const idx = sessions.findIndex(s => s.id === id);
    if (idx !== -1) sessions[idx] = updated;
  } else {
    const created = await apiPost(body);
    sessions.push(created);
    sessions.sort((a, b) => a.date.localeCompare(b.date));
  }

  btn.disabled = false;
  closeModal();
  renderCalendar();
  if (currentPage === 'graphs') renderGraphsPage();
}

async function confirmDelete(id) {
  if (!confirm('Delete this session?')) return;
  await apiDelete(id);
  sessions = sessions.filter(s => s.id !== id);
  closeModal();
  renderCalendar();
  if (currentPage === 'graphs') renderGraphsPage();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function netOf(s) {
  return (s.cashOut || 0) - (s.buyIn || 0);
}

function sessionsForDate(dateStr) {
  return sessions.filter(s => s.date === dateStr);
}

function summerSessions() {
  return sessions.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    return d >= SUMMER_START && d <= SUMMER_END;
  });
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMoney(n) {
  const abs = Math.abs(n);
  const str = abs % 1 === 0
    ? '$' + abs.toLocaleString()
    : '$' + abs.toFixed(2);
  return n < 0 ? '-' + str : str;
}

function statCard(label, value, cls = '') {
  return `
    <div class="stat-card">
      <div class="stat-label">${label}</div>
      <div class="stat-value ${cls}">${value}</div>
    </div>
  `;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
