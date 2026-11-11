import {
  auth, db, login, logout, configured, EMULATOR,
  onAuthStateChanged, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, serverTimestamp, Timestamp, writeBatch
} from './fb.js';
import { USERS } from '../firebase-config.js';
import {
  STATUSES, STATUS_VAR, ASSIGNEES, PRIORITIES, ARCHIVE_DAYS, SEED_SUBJECTS,
  todayYMD, toYMD, toDate, ymdToDate, fmtShort, isOverdue, esc, uid, download, csvCell, lsGet, lsSet
} from './util.js';

// ---------------------------------------------------------------- estado
const S = {
  user: null, email: '', me: '', other: '',
  tasks: new Map(), subjects: [],
  tasksLoaded: false, subjectsLoaded: false,
  prevSeen: new Date(0), seenLocal: new Set(),
  filters: { who: lsGet('f-who', 'all'), subject: '', priority: '' },
  listSort: { key: 'default', dir: 1 },
  collapsed: { 'Terminado': true },
  boardTab: 0, dragging: false, pendingRender: false,
  detailId: null, unsubs: [], archiveRan: false
};

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const mq = matchMedia('(max-width: 899px)');
const isMobile = () => mq.matches;
const viewKey = () => (isMobile() ? 'view-mobile' : 'view-desktop');
const currentView = () => lsGet(viewKey(), isMobile() ? 'list' : 'board');

// ---------------------------------------------------------------- pantallas
function show(id) {
  for (const s of $$('.screen')) s.hidden = s.id !== id;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------------------------------------------------------------- auth
if (!configured) {
  show('screen-login');
  $('#btn-login').disabled = true;
  $('#login-error').textContent = 'Falta configurar Firebase: pega tu configuración en firebase-config.js (ver README).';
}

$('#btn-login').addEventListener('click', async () => {
  $('#login-error').textContent = '';
  try { await login(); } catch (e) {
    if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
      $('#login-error').textContent = 'No se pudo iniciar sesión. Intenta de nuevo.';
      console.error(e);
    }
  }
});
$('#btn-logout-denied').addEventListener('click', () => logout());

if (configured) onAuthStateChanged(auth, async (user) => {
  stopListeners();
  S.user = user;
  if (!user) { show('screen-login'); return; }
  show('screen-loading');
  S.email = (user.email || '').toLowerCase();
  S.me = USERS[S.email] || (user.displayName || S.email).split(' ')[0];
  S.other = S.me === 'Julian' ? 'Matteo' : 'Julian';

  // Verifica acceso leyendo el documento del usuario (las reglas deciden).
  const userRef = doc(db, 'users', S.email);
  try {
    const snap = await getDoc(userRef);
    const last = snap.exists() ? snap.data().lastSeen : null;
    S.prevSeen = last ? toDate(last) : new Date(0);
  } catch (e) {
    if (e?.code === 'permission-denied') {
      $('#denied-email').textContent = user.email || '';
      show('screen-denied');
      return;
    }
    console.error(e);
  }
  touchLastSeen();
  startApp();
});

function touchLastSeen() {
  if (!S.email) return;
  setDoc(doc(db, 'users', S.email), { lastSeen: serverTimestamp(), name: S.me }, { merge: true }).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (!S.user || !S.tasksLoaded) return;
  if (document.visibilityState === 'hidden') touchLastSeen();
  else runAutoArchive();
});

function stopListeners() {
  S.unsubs.forEach((u) => u());
  S.unsubs = [];
  S.tasks.clear(); S.subjects = [];
  S.tasksLoaded = S.subjectsLoaded = false; S.archiveRan = false;
  S.seenLocal.clear();
  closeAllModals();
}

// ---------------------------------------------------------------- datos
function startApp() {
  show('screen-app');
  $('#filter-other').textContent = 'De ' + S.other;
  $('#menu-user').textContent = S.user.email;
  syncFilterUI();
  $('#main').innerHTML = '<div class="center pad"><div class="spinner"></div></div>';

  S.unsubs.push(onSnapshot(collection(db, 'subjects'), { includeMetadataChanges: false }, (snap) => {
    if (snap.empty && !snap.metadata.fromCache) { seedSubjects(); return; }
    S.subjects = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
    S.subjectsLoaded = true;
    syncFilterUI();
    render();
    refreshOpenModals();
  }, onListenError));

  S.unsubs.push(onSnapshot(collection(db, 'tasks'), (snap) => {
    S.tasks = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }]));
    S.tasksLoaded = true;
    if (!S.archiveRan && !snap.metadata.fromCache) { S.archiveRan = true; runAutoArchive(); }
    render();
    refreshOpenModals();
    route();
  }, onListenError));
}

function onListenError(e) {
  console.error(e);
  if (e?.code === 'permission-denied') {
    $('#denied-email').textContent = S.user?.email || '';
    show('screen-denied');
  }
}

async function seedSubjects() {
  const b = writeBatch(db);
  SEED_SUBJECTS.forEach(([name, color], i) =>
    b.set(doc(db, 'subjects', 's' + (i + 1)), { name, color, order: i + 1 }));
  await b.commit().catch(console.error);
}

function runAutoArchive() {
  const cutoff = Date.now() - ARCHIVE_DAYS * 864e5;
  const due = [...S.tasks.values()].filter((t) => {
    if (t.archived || t.status !== 'Terminado') return false;
    const c = toDate(t.completedAt);
    const r = toDate(t.restoredAt);
    return c && c.getTime() < cutoff && (!r || r.getTime() < cutoff);
  });
  if (!due.length) return;
  const b = writeBatch(db);
  due.forEach((t) => b.update(doc(db, 'tasks', t.id), { archived: true, updatedAt: serverTimestamp() }));
  b.commit().catch(console.error);
}

const subjectById = (id) => S.subjects.find((s) => s.id === id);

function updateTask(id, patch) {
  return updateDoc(doc(db, 'tasks', id), { ...patch, updatedAt: serverTimestamp() })
    .catch((e) => { console.error(e); toast('No se pudo guardar'); });
}

function setStatus(id, status, extra = {}) {
  const t = S.tasks.get(id);
  if (!t) return;
  const patch = { status, ...extra };
  if (status === 'Terminado') {
    if (t.status !== 'Terminado' || !t.completedAt) patch.completedAt = serverTimestamp();
  } else {
    patch.completedAt = null;
    patch.archived = false;
  }
  return updateTask(id, patch);
}

function setAssignee(id, assignee) {
  return updateTask(id, { assignee, assignChangedAt: serverTimestamp(), assignChangedBy: S.me });
}

async function createTask({ title, assignee, subject }) {
  const ref = await addDoc(collection(db, 'tasks'), {
    title, notes: '', assignee, subject,
    status: 'Pendiente', waitingOn: '', dueDate: '', priority: 'Normal',
    assignedAt: serverTimestamp(), assignedBy: S.me,
    completedAt: null, archived: false, restoredAt: null, subtasks: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    assignChangedAt: serverTimestamp(), assignChangedBy: S.me
  });
  return ref.id;
}

// ---------------------------------------------------------------- filtros y orden
function isNew(t) {
  if (t.archived || S.seenLocal.has(t.id)) return false;
  if (t.assignee !== S.me && t.assignee !== 'Ambos') return false;
  if (!t.assignChangedBy || t.assignChangedBy === S.me) return false;
  const at = toDate(t.assignChangedAt);
  return !!at && at > S.prevSeen;
}

function visibleTasks() {
  const f = S.filters;
  return [...S.tasks.values()].filter((t) => {
    if (t.archived) return false;
    if (f.who === 'mine' && t.assignee !== S.me && t.assignee !== 'Ambos') return false;
    if (f.who === 'other' && t.assignee !== S.other && t.assignee !== 'Ambos') return false;
    if (f.subject && t.subject !== f.subject) return false;
    if (f.priority && (t.priority || 'Normal') !== f.priority) return false;
    return true;
  });
}

function defaultSort(a, b) {
  const oa = isOverdue(a) ? 0 : 1, ob = isOverdue(b) ? 0 : 1;
  if (oa !== ob) return oa - ob;
  const da = a.dueDate || '9999', dbb = b.dueDate || '9999';
  if (da !== dbb) return da < dbb ? -1 : 1;
  const pa = a.priority === 'Alta' ? 0 : 1, pb = b.priority === 'Alta' ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0);
}

function syncFilterUI() {
  const sel = $('#filter-subject');
  const cur = S.filters.subject;
  sel.innerHTML = '<option value="">Todos los temas</option>' +
    S.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  sel.value = S.subjects.some((s) => s.id === cur) ? cur : '';
  S.filters.subject = sel.value;
  $('#filter-priority').value = S.filters.priority;
  $$('#filter-who button').forEach((b) => b.classList.toggle('on', b.dataset.who === S.filters.who));
  $$('#view-toggle button').forEach((b) => b.classList.toggle('on', b.dataset.view === currentView()));
}

$('#filter-who').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  S.filters.who = b.dataset.who; lsSet('f-who', S.filters.who);
  syncFilterUI(); render();
});
$('#filter-subject').addEventListener('change', (e) => { S.filters.subject = e.target.value; render(); });
$('#filter-priority').addEventListener('change', (e) => { S.filters.priority = e.target.value; render(); });
$('#view-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  lsSet(viewKey(), b.dataset.view); syncFilterUI(); render();
});
mq.addEventListener('change', () => { syncFilterUI(); render(); });

// ---------------------------------------------------------------- render
function render() {
  if (!S.user || !S.tasksLoaded || !S.subjectsLoaded) return;
  if (S.dragging) { S.pendingRender = true; return; }
  const newCount = [...S.tasks.values()].filter(isNew).length;
  const badge = $('#new-badge');
  badge.hidden = newCount === 0;
  badge.innerHTML = `${newCount} ${newCount === 1 ? 'nueva' : 'nuevas'}<span class="long"> para ti</span>`;
  badge.title = 'Nuevas para ti desde tu última visita';

  const tasks = visibleTasks().sort(defaultSort);
  const view = currentView();
  const main = $('#main');
  if (view === 'board') main.innerHTML = isMobile() ? boardMobile(tasks) : boardDesktop(tasks);
  else main.innerHTML = isMobile() ? listMobile(tasks) : listDesktop(tasks);
  if (view === 'board' && isMobile()) {
    const sw = $('.board-swipe', main);
    sw.scrollLeft = S.boardTab * sw.clientWidth;
  }
}

function subjectChip(t) {
  const s = subjectById(t.subject);
  return s ? `<span class="subj-chip" style="--c:${esc(s.color)}">${esc(s.name)}</span>` : '';
}
function statusChip(t, clickable = true) {
  return `<button class="status-chip" ${clickable ? 'data-status-btn' : 'tabindex="-1"'} style="--c:${STATUS_VAR[t.status] || 'var(--status-pendiente)'}">${esc(t.status)}</button>`;
}
function subProgress(t) {
  const st = t.subtasks || [];
  if (!st.length) return '';
  const done = st.filter((x) => x.done).length;
  return `<span class="subs" title="Subtareas">☑ ${done}/${st.length}</span>`;
}

function card(t) {
  const od = isOverdue(t);
  const nw = isNew(t);
  return `<article class="card${od ? ' overdue' : ''}${nw ? ' is-new' : ''}" data-id="${esc(t.id)}" draggable="${!isMobile()}">
    <div class="card-top">
      ${statusChip(t)}
      ${t.priority === 'Alta' ? '<span class="prio">▲ Alta</span>' : ''}
      ${nw ? '<span class="new-tag">Nuevo para ti</span>' : ''}
    </div>
    <h3 class="card-title">${esc(t.title)}</h3>
    ${t.status === 'En espera' && t.waitingOn ? `<p class="waiting">En espera de ${esc(t.waitingOn)}</p>` : ''}
    <div class="card-meta">
      ${subjectChip(t)}
      <span class="assignee">${esc(t.assignee)}</span>
      ${t.dueDate ? `<span class="due${od ? ' red' : ''}">${od ? 'Vencida · ' : ''}${esc(fmtShort(t.dueDate))}</span>` : ''}
      ${subProgress(t)}
    </div>
  </article>`;
}

const emptyMsg = '<p class="empty">Sin tareas</p>';

function boardDesktop(tasks) {
  return `<div class="board">${STATUSES.map((st) => {
    const items = tasks.filter((t) => t.status === st);
    return `<section class="col" data-drop="${st}">
      <header class="col-head" style="--c:${STATUS_VAR[st]}"><span class="dot"></span>${st}<span class="count">${items.length}</span></header>
      <div class="col-body">${items.map(card).join('') || emptyMsg}</div>
    </section>`;
  }).join('')}</div>`;
}

function boardMobile(tasks) {
  const tabs = STATUSES.map((st, i) => {
    const n = tasks.filter((t) => t.status === st).length;
    return `<button class="tab${i === S.boardTab ? ' on' : ''}" data-tab="${i}" style="--c:${STATUS_VAR[st]}">${st}<span class="count">${n}</span></button>`;
  }).join('');
  const cols = STATUSES.map((st) => {
    const items = tasks.filter((t) => t.status === st);
    return `<section class="swipe-col">${items.map(card).join('') || emptyMsg}</section>`;
  }).join('');
  return `<div class="tabs">${tabs}</div><div class="board-swipe">${cols}</div>`;
}

function listMobile(tasks) {
  return `<div class="groups">${STATUSES.map((st) => {
    const items = tasks.filter((t) => t.status === st);
    const closed = !!S.collapsed[st];
    return `<section class="group${closed ? ' closed' : ''}">
      <button class="group-head" data-group="${st}" style="--c:${STATUS_VAR[st]}">
        <span class="dot"></span>${st}<span class="count">${items.length}</span><span class="chev">${closed ? '▸' : '▾'}</span>
      </button>
      ${closed ? '' : `<div class="group-body">${items.map(card).join('') || emptyMsg}</div>`}
    </section>`;
  }).join('')}</div>`;
}

const LIST_COLS = [
  ['title', 'Título'], ['status', 'Estado'], ['subject', 'Tema'], ['assignee', 'Responsable'],
  ['dueDate', 'Vence'], ['priority', 'Prioridad'], ['subs', 'Subtareas']
];
function listDesktop(tasks) {
  const { key, dir } = S.listSort;
  if (key !== 'default') {
    const val = (t) => key === 'subject' ? (subjectById(t.subject)?.name || '')
      : key === 'status' ? STATUSES.indexOf(t.status)
      : key === 'subs' ? (t.subtasks || []).length
      : key === 'dueDate' ? (t.dueDate || '9999')
      : key === 'priority' ? (t.priority === 'Alta' ? 0 : 1)
      : String(t[key] || '').toLowerCase();
    tasks = [...tasks].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || defaultSort(a, b); });
  }
  const head = LIST_COLS.map(([k, label]) =>
    `<th><button data-sort="${k}" class="${key === k ? 'on' : ''}">${label}${key === k ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('');
  const rows = tasks.map((t) => {
    const od = isOverdue(t);
    const st = t.subtasks || [];
    return `<tr class="row${od ? ' overdue' : ''}${isNew(t) ? ' is-new' : ''}" data-id="${esc(t.id)}">
      <td class="t-title">${isNew(t) ? '<span class="new-dot" title="Nuevo para ti"></span>' : ''}${esc(t.title)}${t.status === 'En espera' && t.waitingOn ? `<div class="waiting">En espera de ${esc(t.waitingOn)}</div>` : ''}</td>
      <td>${statusChip(t)}</td>
      <td>${subjectChip(t)}</td>
      <td>${esc(t.assignee)}</td>
      <td class="${od ? 'due red' : 'due'}">${t.dueDate ? (od ? 'Vencida · ' : '') + esc(fmtShort(t.dueDate)) : '—'}</td>
      <td>${t.priority === 'Alta' ? '<span class="prio">▲ Alta</span>' : 'Normal'}</td>
      <td>${st.length ? `${st.filter((x) => x.done).length}/${st.length}` : '—'}</td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap"><div class="table-tools">${key !== 'default' ? '<button class="link" data-sort="default">Orden por defecto (vencidas primero)</button>' : '<span class="muted small">Vencidas primero, luego por fecha</span>'}</div>
    <table class="list"><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="7">${emptyMsg}</td></tr>`}</tbody></table></div>`;
}

// ---------------------------------------------------------------- eventos de la vista
const main = $('#main');
main.addEventListener('click', (e) => {
  const sb = e.target.closest('[data-status-btn]');
  if (sb) {
    e.stopPropagation();
    const id = sb.closest('[data-id]')?.dataset.id;
    if (id) openStatusPicker(id, sb);
    return;
  }
  const g = e.target.closest('[data-group]');
  if (g) { const st = g.dataset.group; S.collapsed[st] = !S.collapsed[st]; render(); return; }
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    S.boardTab = +tab.dataset.tab;
    const sw = $('.board-swipe'); sw.scrollTo({ left: S.boardTab * sw.clientWidth, behavior: 'smooth' });
    $$('.tabs .tab').forEach((b, i) => b.classList.toggle('on', i === S.boardTab));
    return;
  }
  const so = e.target.closest('[data-sort]');
  if (so) {
    const k = so.dataset.sort;
    S.listSort = k === 'default' ? { key: 'default', dir: 1 }
      : { key: k, dir: S.listSort.key === k ? -S.listSort.dir : 1 };
    render(); return;
  }
  const item = e.target.closest('[data-id]');
  if (item) openTask(item.dataset.id);
});

main.addEventListener('scroll', (e) => {
  const sw = e.target;
  if (!sw.classList?.contains('board-swipe')) return;
  const i = Math.round(sw.scrollLeft / sw.clientWidth);
  if (i !== S.boardTab) {
    S.boardTab = i;
    $$('.tabs .tab').forEach((b, j) => b.classList.toggle('on', j === i));
  }
}, true);

// Arrastrar y soltar (escritorio)
main.addEventListener('dragstart', (e) => {
  const c = e.target.closest('.card'); if (!c) return;
  S.dragging = true;
  e.dataTransfer.setData('text/plain', c.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  c.classList.add('dragging');
});
main.addEventListener('dragend', () => {
  S.dragging = false;
  $$('.col.drop-on').forEach((c) => c.classList.remove('drop-on'));
  if (S.pendingRender) { S.pendingRender = false; render(); } else render();
});
main.addEventListener('dragover', (e) => {
  const col = e.target.closest('[data-drop]'); if (!col) return;
  e.preventDefault();
  $$('.col.drop-on').forEach((c) => c !== col && c.classList.remove('drop-on'));
  col.classList.add('drop-on');
});
main.addEventListener('drop', (e) => {
  const col = e.target.closest('[data-drop]'); if (!col) return;
  e.preventDefault();
  const id = e.dataTransfer.getData('text/plain');
  const st = col.dataset.drop;
  const t = S.tasks.get(id);
  if (t && t.status !== st) {
    t.status = st; // optimista
    setStatus(id, st);
  }
});

// ---------------------------------------------------------------- selector de estado
function closePopover() { $('#popover-root').innerHTML = ''; }

function openStatusPicker(id, anchor) {
  const t = S.tasks.get(id); if (!t) return;
  const root = $('#popover-root');
  const opts = STATUSES.map((st) =>
    `<button data-pick="${st}" class="${t.status === st ? 'on' : ''}" style="--c:${STATUS_VAR[st]}"><span class="dot"></span>${st}</button>`).join('');
  root.innerHTML = `<div class="pop-backdrop"></div><div class="popover" role="menu"><div class="pop-title">Cambiar estado</div>${opts}</div>`;
  const pop = $('.popover', root);
  if (!isMobile()) {
    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.min(r.left, innerWidth - 240) + 'px';
    pop.style.top = Math.min(r.bottom + 6, innerHeight - 260) + 'px';
  } else pop.classList.add('sheet');
  $('.pop-backdrop', root).onclick = closePopover;
  pop.onclick = (e) => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    const st = b.dataset.pick;
    if (st === 'En espera') {
      pop.innerHTML = `<div class="pop-title">En espera de…</div>
        <input class="input" id="wait-input" placeholder="¿De quién o de qué?" value="${esc(t.waitingOn || '')}">
        <div class="row-end"><button class="btn" data-skip>Omitir</button><button class="btn btn-primary" data-ok>Guardar</button></div>`;
      const inp = $('#wait-input', pop); inp.focus();
      const done = (val) => { setStatus(id, 'En espera', val != null ? { waitingOn: val } : {}); closePopover(); };
      inp.onkeydown = (ev) => { if (ev.key === 'Enter') done(inp.value.trim()); };
      $('[data-ok]', pop).onclick = () => done(inp.value.trim());
      $('[data-skip]', pop).onclick = () => done(null);
      return;
    }
    setStatus(id, st);
    closePopover();
  };
}

// ---------------------------------------------------------------- modales
const overlay = $('#overlay');
function openModal(html, cls = '') {
  const m = document.createElement('div');
  m.className = 'modal ' + cls;
  m.innerHTML = html;
  overlay.appendChild(m);
  overlay.hidden = false;
  document.body.classList.add('noscroll');
  return m;
}
function closeModal(m) {
  if (!m) return;
  if (m.classList.contains('detail')) {
    S.detailId = null;
    if (location.hash.startsWith('#/task/')) history.replaceState(null, '', location.pathname + location.search + '#/');
  }
  m.remove();
  if (!overlay.children.length) { overlay.hidden = true; document.body.classList.remove('noscroll'); }
}
function closeAllModals() { [...overlay.children].forEach(closeModal); closePopover(); }
overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(overlay.lastElementChild); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#popover-root').innerHTML) closePopover();
  else if (!$('#menu').hidden) $('#menu').hidden = true;
  else closeModal(overlay.lastElementChild);
});

function confirmDialog(msg, okLabel = 'Eliminar') {
  return new Promise((resolve) => {
    const m = openModal(`<div class="dialog"><p>${esc(msg)}</p>
      <div class="row-end"><button class="btn" data-no>Cancelar</button><button class="btn btn-danger" data-yes>${esc(okLabel)}</button></div></div>`, 'small');
    $('[data-no]', m).onclick = () => { closeModal(m); resolve(false); };
    $('[data-yes]', m).onclick = () => { closeModal(m); resolve(true); };
  });
}

function refreshOpenModals() {
  if (S.detailId) fillDetail();
  const arch = $('.modal.archive');
  if (arch) renderArchiveList(arch);
  const subj = $('.modal.subjects');
  if (subj && !subj.contains(document.activeElement)) renderSubjectsList(subj);
}

// ---------------------------------------------------------------- alta rápida
$('#fab').addEventListener('click', openQuickAdd);
function openQuickAdd() {
  const subjOpts = S.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  const m = openModal(`<form class="sheet-form" autocomplete="off">
    <div class="modal-head"><h2>Nueva tarea</h2><button type="button" class="btn btn-icon" data-close aria-label="Cerrar">✕</button></div>
    <label class="field"><span>Título</span><input class="input input-lg" name="title" required placeholder="¿Qué hay que hacer?"></label>
    <div class="field"><span>Responsable</span>
      <div class="seg seg-full" data-assignee>${ASSIGNEES.map((a) => `<button type="button" data-a="${a}" class="${a === S.me ? 'on' : ''}">${a}</button>`).join('')}</div>
    </div>
    <label class="field"><span>Tema</span><select class="input" name="subject" required><option value="">Elige un tema</option>${subjOpts}</select></label>
    <p class="form-error" hidden></p>
    <button class="btn btn-primary btn-lg btn-block" type="submit">Guardar</button>
  </form>`, 'quick');
  const form = $('form', m);
  let assignee = S.me;
  if (S.filters.subject) form.elements.subject.value = S.filters.subject;
  $('[data-close]', m).onclick = () => closeModal(m);
  $('[data-assignee]', m).onclick = (e) => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    assignee = b.dataset.a;
    $$('[data-a]', m).forEach((x) => x.classList.toggle('on', x === b));
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const title = form.elements.title.value.trim();
    const subject = form.elements.subject.value;
    const err = $('.form-error', m);
    if (!title || !subject) { err.hidden = false; err.textContent = 'Título y tema son obligatorios.'; return; }
    form.querySelector('[type=submit]').disabled = true;
    try {
      await createTask({ title, assignee, subject });
      closeModal(m);
      toast('Tarea creada');
    } catch (ex) {
      console.error(ex);
      err.hidden = false; err.textContent = 'No se pudo guardar.';
      form.querySelector('[type=submit]').disabled = false;
    }
  };
  setTimeout(() => form.elements.title.focus(), 50);
}

// ---------------------------------------------------------------- detalle
function openTask(id) {
  if (location.hash !== '#/task/' + id) location.hash = '#/task/' + id;
  else openDetail(id);
}

function route() {
  const m = location.hash.match(/^#\/task\/(.+)$/);
  if (!m) { const d = $('.modal.detail'); if (d) closeModal(d); return; }
  if (!S.tasksLoaded) return;
  const id = decodeURIComponent(m[1]);
  if (S.detailId === id) return;
  if (!S.tasks.has(id)) { toast('La tarea no existe o fue eliminada'); history.replaceState(null, '', '#/'); return; }
  openDetail(id);
}
window.addEventListener('hashchange', route);

function opt(values, current, labels) {
  return values.map((v, i) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(labels ? labels[i] : v)}</option>`).join('');
}

function openDetail(id) {
  const old = $('.modal.detail'); if (old) closeModal(old);
  closePopover();
  S.detailId = id;
  if (!S.seenLocal.has(id)) { S.seenLocal.add(id); render(); }
  const m = openModal(`<div class="detail-wrap">
    <div class="modal-head">
      <div class="detail-flags"></div>
      <button type="button" class="btn btn-icon" data-close aria-label="Cerrar">✕</button>
    </div>
    <textarea class="title-input" data-field="title" rows="1" placeholder="Título"></textarea>
    <div class="archived-note" hidden>Esta tarea está archivada. <button class="link" data-restore>Restaurar</button></div>
    <div class="grid">
      <label class="field"><span>Estado</span><select class="input" data-field="status">${opt(STATUSES)}</select></label>
      <label class="field waiting-field"><span>En espera de…</span><input class="input" data-field="waitingOn" placeholder="¿De quién o de qué?"></label>
      <label class="field"><span>Responsable</span><select class="input" data-field="assignee">${opt(ASSIGNEES)}</select></label>
      <label class="field"><span>Tema</span><select class="input" data-field="subject"></select></label>
      <label class="field"><span>Prioridad</span><select class="input" data-field="priority">${opt(PRIORITIES)}</select></label>
      <label class="field"><span>Vence</span><input class="input" type="date" data-field="dueDate"><small class="due-label"></small></label>
      <label class="field"><span>Asignada el</span><input class="input" type="date" data-field="assignedAt"></label>
      <div class="field"><span>Asignada por</span><div class="static" data-static="assignedBy"></div></div>
      <div class="field completed-field"><span>Terminada el</span><div class="static" data-static="completedAt"></div></div>
    </div>
    <section class="subtasks">
      <h3>Subtareas <span class="muted" data-static="subprog"></span></h3>
      <div class="sub-list"></div>
      <form class="sub-add" autocomplete="off"><input class="input" name="text" placeholder="Añadir subtarea y Enter"><button class="btn" type="submit">Añadir</button></form>
    </section>
    <label class="field"><span>Notas</span><textarea class="input notes" data-field="notes" rows="5" placeholder="Notas…"></textarea></label>
    <div class="detail-actions">
      <button class="btn btn-wa" data-share>Compartir por WhatsApp</button>
      <button class="btn btn-danger-outline" data-delete>Eliminar</button>
    </div>
  </div>`, 'detail');

  $('[data-close]', m).onclick = () => closeModal(m);

  // Guardado de campos
  const save = (el) => {
    const t = S.tasks.get(id); if (!t) return;
    const f = el.dataset.field;
    let v = el.value;
    if (f === 'title') { v = v.trim(); if (!v || v === t.title) { if (!v) el.value = t.title; return; } }
    if (f === 'status') return setStatus(id, v);
    if (f === 'assignee') return v !== t.assignee && setAssignee(id, v);
    if (f === 'assignedAt') {
      if (!v) { el.value = toYMD(t.assignedAt); return; }
      return updateTask(id, { assignedAt: Timestamp.fromDate(ymdToDate(v)) });
    }
    if ((t[f] ?? '') === v) return;
    return updateTask(id, { [f]: v });
  };
  const timers = {};
  m.addEventListener('change', (e) => { if (e.target.dataset.field) save(e.target); });
  m.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.field === 'title') autoGrow(el);
    if (el.dataset.field === 'title' || el.dataset.field === 'notes' || el.dataset.field === 'waitingOn') {
      clearTimeout(timers[el.dataset.field]);
      timers[el.dataset.field] = setTimeout(() => save(el), 700);
    }
    if (el.dataset.field === 'status') toggleWaiting(m, el.value);
  });
  $('.title-input', m).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });

  // Subtareas
  const subs = () => (S.tasks.get(id)?.subtasks || []).map((x) => ({ ...x }));
  $('.sub-add', m).onsubmit = (e) => {
    e.preventDefault();
    const text = e.target.elements.text.value.trim(); if (!text) return;
    updateTask(id, { subtasks: [...subs(), { id: uid(), text, done: false, assignee: '', dueDate: '' }] });
    e.target.elements.text.value = '';
  };
  const subList = $('.sub-list', m);
  subList.addEventListener('change', (e) => {
    const row = e.target.closest('[data-sub]'); if (!row) return;
    const list = subs(); const s = list.find((x) => x.id === row.dataset.sub); if (!s) return;
    const k = e.target.dataset.sk;
    if (k === 'done') s.done = e.target.checked;
    else if (k === 'text') { const v = e.target.value.trim(); if (!v) { e.target.value = s.text; return; } s.text = v; }
    else s[k] = e.target.value;
    updateTask(id, { subtasks: list });
  });
  subList.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-sub-del]'); if (!del) return;
    const sid = del.closest('[data-sub]').dataset.sub;
    updateTask(id, { subtasks: subs().filter((x) => x.id !== sid) });
  });
  subList.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.sk === 'text') e.target.blur(); });

  $('[data-share]', m).onclick = () => shareWhatsApp(S.tasks.get(id));
  $('[data-restore]', m).onclick = () => restoreTask(id);
  $('[data-delete]', m).onclick = async () => {
    if (!(await confirmDialog('¿Eliminar esta tarea? Esta acción no se puede deshacer.'))) return;
    closeModal(m);
    await deleteDoc(doc(db, 'tasks', id)).then(() => toast('Tarea eliminada')).catch(() => toast('No se pudo eliminar'));
  };

  fillDetail(true);
}

function toggleWaiting(m, status) {
  $('.waiting-field', m).hidden = status !== 'En espera';
}
function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

function fillDetail(first = false) {
  const m = $('.modal.detail'); if (!m) return;
  const t = S.tasks.get(S.detailId);
  if (!t) { closeModal(m); toast('La tarea fue eliminada'); return; }
  const active = document.activeElement;
  $('[data-field=subject]', m).innerHTML = S.subjects.map((s) =>
    `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
  const vals = {
    title: t.title || '', status: t.status, waitingOn: t.waitingOn || '', assignee: t.assignee,
    subject: t.subject, priority: t.priority || 'Normal', dueDate: t.dueDate || '',
    assignedAt: toYMD(t.assignedAt), notes: t.notes || ''
  };
  for (const [k, v] of Object.entries(vals)) {
    const el = $(`[data-field=${k}]`, m);
    if (el && (first || el !== active)) el.value = v;
  }
  autoGrow($('.title-input', m));
  toggleWaiting(m, $('[data-field=status]', m).value);
  $('[data-static=assignedBy]', m).textContent = t.assignedBy || '—';
  $('.completed-field', m).hidden = !t.completedAt;
  $('[data-static=completedAt]', m).textContent = t.completedAt ? fmtShort(t.completedAt) : '';
  const od = isOverdue(t);
  m.classList.toggle('overdue', od);
  $('.due-label', m).textContent = od ? 'Vencida' : (t.dueDate ? fmtShort(t.dueDate) : '');
  $('.archived-note', m).hidden = !t.archived;
  $('.detail-flags', m).innerHTML = `${statusChip(t, false)}${t.priority === 'Alta' ? '<span class="prio">▲ Alta</span>' : ''}${od ? '<span class="overdue-tag">VENCIDA</span>' : ''}`;

  const st = t.subtasks || [];
  $('[data-static=subprog]', m).textContent = st.length ? `${st.filter((x) => x.done).length}/${st.length}` : '';
  const list = $('.sub-list', m);
  if (first || !list.contains(active)) {
    list.innerHTML = st.map((s) => `<div class="sub-row${s.done ? ' done' : ''}" data-sub="${esc(s.id)}">
      <input type="checkbox" data-sk="done" ${s.done ? 'checked' : ''} aria-label="Hecha">
      <input class="input sub-text" data-sk="text" value="${esc(s.text)}">
      <select class="input sub-who" data-sk="assignee" aria-label="Responsable">${opt(['', 'Julian', 'Matteo'], s.assignee || '', ['—', 'Julian', 'Matteo'])}</select>
      <input class="input sub-date" type="date" data-sk="dueDate" value="${esc(s.dueDate || '')}" aria-label="Vence">
      <button class="btn btn-icon sub-del" data-sub-del aria-label="Eliminar subtarea">✕</button>
    </div>`).join('');
  }
}

function shareWhatsApp(t) {
  if (!t) return;
  const link = location.origin + location.pathname + '#/task/' + t.id;
  const parts = [`Nueva tarea: ${t.title}`, t.assignee];
  if (t.dueDate) parts.push('vence ' + fmtShort(t.dueDate));
  const text = parts.join(' · ') + ' — ' + link;
  window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
}

function restoreTask(id) {
  return updateTask(id, { archived: false, restoredAt: serverTimestamp() }).then(() => toast('Tarea restaurada'));
}

// ---------------------------------------------------------------- menú
$('#btn-menu').addEventListener('click', (e) => { e.stopPropagation(); $('#menu').hidden = !$('#menu').hidden; });
document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) $('#menu').hidden = true; });
$('#menu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]'); if (!b) return;
  $('#menu').hidden = true;
  ({ subjects: openSubjects, archive: openArchive, export: exportAll, logout: () => { touchLastSeen(); logout(); } })[b.dataset.action]();
});

// ---------------------------------------------------------------- archivo
function openArchive() {
  const m = openModal(`<div class="modal-head"><h2>Archivo</h2><button class="btn btn-icon" data-close aria-label="Cerrar">✕</button></div>
    <input class="input" type="search" placeholder="Buscar por título o notas" data-search>
    <div class="arch-list"></div>`, 'archive');
  $('[data-close]', m).onclick = () => closeModal(m);
  $('[data-search]', m).oninput = () => renderArchiveList(m);
  $('.arch-list', m).onclick = (e) => {
    const r = e.target.closest('[data-restore-id]');
    if (r) { restoreTask(r.dataset.restoreId); return; }
    const o = e.target.closest('[data-open-id]');
    if (o) openTask(o.dataset.openId);
  };
  renderArchiveList(m);
  setTimeout(() => $('[data-search]', m).focus(), 50);
}
function renderArchiveList(m) {
  const q = ($('[data-search]', m).value || '').trim().toLowerCase();
  const items = [...S.tasks.values()].filter((t) => t.archived)
    .filter((t) => !q || (t.title || '').toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q))
    .sort((a, b) => (toDate(b.completedAt)?.getTime() || 0) - (toDate(a.completedAt)?.getTime() || 0));
  $('.arch-list', m).innerHTML = items.map((t) => `<div class="arch-row">
      <button class="arch-main" data-open-id="${esc(t.id)}">
        <span class="arch-title">${esc(t.title)}</span>
        <span class="arch-meta">${subjectChip(t)} <span class="muted small">${t.completedAt ? 'Terminada ' + esc(fmtShort(t.completedAt)) : ''}</span></span>
      </button>
      <button class="btn" data-restore-id="${esc(t.id)}">Restaurar</button>
    </div>`).join('') || `<p class="empty">${q ? 'Sin resultados' : 'El archivo está vacío'}</p>`;
}

// ---------------------------------------------------------------- temas
function openSubjects() {
  const m = openModal(`<div class="modal-head"><h2>Temas</h2><button class="btn btn-icon" data-close aria-label="Cerrar">✕</button></div>
    <div class="subj-list"></div>
    <form class="subj-add" autocomplete="off">
      <input type="color" name="color" value="#555555" aria-label="Color">
      <input class="input" name="name" placeholder="Nuevo tema">
      <button class="btn" type="submit">Añadir</button>
    </form>`, 'subjects');
  $('[data-close]', m).onclick = () => closeModal(m);
  renderSubjectsList(m);
  $('.subj-list', m).addEventListener('change', (e) => {
    const id = e.target.closest('[data-subj]')?.dataset.subj; if (!id) return;
    const k = e.target.name;
    const v = e.target.value.trim();
    if (k === 'name' && !v) { e.target.value = subjectById(id)?.name || ''; return; }
    updateDoc(doc(db, 'subjects', id), { [k]: v }).catch(() => toast('No se pudo guardar'));
  });
  $('.subj-add', m).onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.elements.name.value.trim(); if (!name) return;
    const order = Math.max(0, ...S.subjects.map((s) => s.order || 0)) + 1;
    addDoc(collection(db, 'subjects'), { name, color: e.target.elements.color.value, order });
    e.target.elements.name.value = '';
  };
}
function renderSubjectsList(m) {
  $('.subj-list', m).innerHTML = S.subjects.map((s) => `<div class="subj-row" data-subj="${esc(s.id)}">
    <input type="color" name="color" value="${esc(s.color || '#555555')}" aria-label="Color">
    <input class="input" name="name" value="${esc(s.name)}">
  </div>`).join('');
}

// ---------------------------------------------------------------- exportar
const iso = (v) => { const d = toDate(v); return d ? d.toISOString() : null; };

function exportAll() {
  const tasks = [...S.tasks.values()].sort(defaultSort);
  const subjName = (id) => subjectById(id)?.name || '';
  const header = ['tipo', 'tarea_id', 'tarea_titulo', 'subtarea_id', 'texto', 'hecha', 'estado', 'en_espera_de',
    'responsable', 'tema', 'prioridad', 'vence', 'asignada_el', 'asignada_por', 'terminada_el', 'archivada', 'notas'];
  const rows = [header];
  for (const t of tasks) {
    rows.push(['tarea', t.id, t.title, '', t.title, '', t.status, t.waitingOn || '', t.assignee, subjName(t.subject),
      t.priority || 'Normal', t.dueDate || '', toYMD(t.assignedAt), t.assignedBy || '', toYMD(t.completedAt),
      t.archived ? 'sí' : 'no', t.notes || '']);
    for (const s of t.subtasks || []) {
      rows.push(['subtarea', t.id, t.title, s.id, s.text, s.done ? 'sí' : 'no', '', '', s.assignee || '', subjName(t.subject),
        '', s.dueDate || '', '', '', '', '', '']);
    }
  }
  const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const json = JSON.stringify({
    exportedAt: new Date().toISOString(),
    subjects: S.subjects.map(({ id, name, color, order }) => ({ id, name, color, order })),
    tasks: tasks.map((t) => ({
      ...t,
      assignedAt: iso(t.assignedAt), completedAt: iso(t.completedAt), createdAt: iso(t.createdAt),
      updatedAt: iso(t.updatedAt), assignChangedAt: iso(t.assignChangedAt), restoredAt: iso(t.restoredAt),
      subjectName: subjName(t.subject)
    }))
  }, null, 2);
  const stamp = todayYMD();
  download(`tareas-${stamp}.csv`, csv, 'text/csv;charset=utf-8');
  setTimeout(() => download(`tareas-respaldo-${stamp}.json`, json, 'application/json'), 400);
  toast('Exportando CSV y JSON…');
}

// ---------------------------------------------------------------- PWA
if ('serviceWorker' in navigator && !EMULATOR) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Expuesto solo para pruebas
if (EMULATOR) window.__S = S;
