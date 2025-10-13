import {
  collection, addDoc, getDocs, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db, auth } from "/family-dashboard/js/firebase-init.js";

/** Fill with your pixel rectangles */
const STALL_MAP_PX = [ /* { id:"S01", number:1, x:..., y:..., w:..., h:... }, ... */ ];

/** Colors */
const C_OCC  = '#2563eb';  // occupied
const C_SCH  = '#f59e0b';  // scheduled
const C_EMP  = '#6b7280';  // empty
const C_STROKE = 'rgba(230,238,252,0.9)';

export function initBarnStalls(sel) {
  const img   = document.querySelector(sel.imageSelector);
  const svg   = document.querySelector(sel.overlaySelector);
  const filterSel = document.querySelector(sel.statusFilterSelector);
  const clearBtn  = document.querySelector(sel.clearSelector);
  const occBody   = document.querySelector(sel.occBodySelector);
  const selInfo   = document.querySelector(sel.selInfoSelector);
  const addBtn    = document.querySelector(sel.addBtnSelector);
  const modal     = document.querySelector(sel.modalSelector);
  const form      = document.querySelector(sel.formSelector);
  const summaryEl = document.getElementById('stallSummary');

  let currentStall = null;
  let currentStatusFilter = 'all';
  let occupancyByStall = new Map(); // stallId -> {occupied:boolean, scheduled:boolean}

  function renderOverlay(){
    const vbW = img.naturalWidth || img.clientWidth;
    const vbH = img.naturalHeight || img.clientHeight;
    svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    svg.innerHTML = STALL_MAP_PX.map(s => `
      <g class="stall" data-id="${s.id}" data-number="${s.number}">
        <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"
              fill="${C_EMP}33" stroke="${C_STROKE}" stroke-width="2"></rect>
        <text x="${s.x + s.w/2}" y="${s.y + s.h/2}" text-anchor="middle" dominant-baseline="central"
              fill="#e6eefc" font-size="${Math.max(12, Math.min(s.w,s.h)/2)}">${s.number}</text>
      </g>
    `).join('');

    svg.querySelectorAll('g.stall').forEach(g=>{
      g.style.cursor='pointer';
      g.addEventListener('click', ()=>{
        const id = g.getAttribute('data-id');
        const num = Number(g.getAttribute('data-number'));
        currentStall = { id, number:num };
        svg.querySelectorAll('g.stall rect').forEach(r=>r.setAttribute('stroke', C_STROKE));
        g.querySelector('rect').setAttribute('stroke', '#2b6cb0');
        loadOccupancies(); // table reload for selection
      });
    });

    paintOverlay(); // colorize after drawing
  }

  function paintOverlay(){
    // compute summary
    let occ=0, sch=0, emp=0;
    STALL_MAP_PX.forEach(s=>{
      const st = occupancyByStall.get(s.id) || {occupied:false, scheduled:false};
      const rect = svg.querySelector(`g.stall[data-id="${s.id}"] rect`);
      if (!rect) return;
      if (st.occupied) { rect.setAttribute('fill', C_OCC+'55'); occ++; }
      else if (st.scheduled) { rect.setAttribute('fill', C_SCH+'55'); sch++; }
      else { rect.setAttribute('fill', C_EMP+'33'); emp++; }
    });
    if (summaryEl) summaryEl.textContent = `Occupied ${occ} · Scheduled ${sch} · Empty ${emp} / ${STALL_MAP_PX.length}`;
  }

  async function refreshOverlayStatus(){
    // build map from Firestore
    occupancyByStall = new Map();
    const base = collection(db, 'barn_occupancies');
    const snap = await getDocs(query(base));
    const today = new Date().toISOString().slice(0,10);

    snap.forEach(d=>{
      const x = d.data();
      const st = occupancyByStall.get(x.stallId) || {occupied:false, scheduled:false};
      const isActive = x.status === 'active' && (!x.end_date || x.end_date >= today);
      const isSch    = x.status === 'scheduled';
      st.occupied = st.occupied || isActive;
      st.scheduled = st.scheduled || isSch;
      occupancyByStall.set(x.stallId, st);
    });

    paintOverlay();
  }

  async function loadOccupancies(){
    const base = collection(db, 'barn_occupancies');
    let snap;
    if (currentStall) snap = await getDocs(query(base, where('stallId','==', currentStall.id)));
    else snap = await getDocs(query(base));

    const rows = [];
    const today = new Date().toISOString().slice(0,10);
    snap.forEach(d=>{
      const x = d.data();
      const active = x.status === 'active' && (!x.end_date || x.end_date >= today);
      const scheduled = x.status === 'scheduled';
      if (currentStatusFilter === 'active' && !active) return;
      if (currentStatusFilter === 'scheduled' && !scheduled) return;
      if (currentStatusFilter === 'empty') return;
      rows.push({ id:d.id, ...x });
    });

    selInfo.textContent = currentStall ? `Stall ${currentStall.number} (${currentStall.id})` : 'All stalls';

    if (currentStatusFilter === 'empty' && currentStall && rows.length===0){
      occBody.innerHTML = `<tr><td class="p-3 text-emerald-300" colspan="7">Stall ${currentStall.number} appears empty.</td></tr>`;
      return;
    }

    occBody.innerHTML = rows.map(r=>`
      <tr class="hover:bg-black/20">
        <td class="p-3">${r.stallId || ''}</td>
        <td class="p-3">${esc(r.horse)}</td>
        <td class="p-3">${esc(r.owner)}</td>
        <td class="p-3 capitalize">${r.status}</td>
        <td class="p-3">${r.start_date||''}</td>
        <td class="p-3">${r.end_date||''}</td>
        <td class="p-3">$${Number(r.board_rate_monthly||0).toFixed(2)}</td>
      </tr>
    `).join('') || `<tr><td class="p-3 text-brand-mute" colspan="7">No matching records.</td></tr>`;
  }

  // Add occupancy
  addBtn.onclick = ()=>{
    if (!currentStall) { alert('Select a stall first.'); return; }
    document.getElementById('mStall').value = `${currentStall.number} (${currentStall.id})`;
    document.getElementById('mStart').value = new Date().toISOString().slice(0,10);
    openDialog(modal);
  };
  document.getElementById('mCancel').onclick = ()=> closeDialog(modal);

  form.onsubmit = async (e)=>{
    e.preventDefault();
    if (!auth.currentUser) return alert('Sign in first.');
    if (!currentStall) return alert('Select a stall.');

    const payload = {
      stallId: currentStall.id,
      horse:  val('mHorse'),
      owner:  val('mOwner'),
      start_date: val('mStart'),
      end_date: val('mEnd') || null,
      board_rate_monthly: parseFloat(val('mRate')||'0'),
      feed_program: val('mFeed') || null,
      training_program: val('mTrain') || null,
      status: 'active',
      createdAt: serverTimestamp(),
      by: auth.currentUser.email
    };
    if (!payload.horse || !payload.owner || !payload.start_date) { alert('Fill required fields.'); return; }

    await addDoc(collection(db, 'barn_occupancies'), payload);
    closeDialog(modal);
    await loadOccupancies();
    await refreshOverlayStatus();
  };

  filterSel.onchange = ()=>{ currentStatusFilter = filterSel.value; loadOccupancies(); };
  clearBtn.onclick = ()=>{
    currentStall = null;
    svg.querySelectorAll('g.stall rect').forEach(r=>r.setAttribute('stroke', C_STROKE));
    loadOccupancies();
  };

  img.addEventListener('load', async ()=>{
    renderOverlay();
    await refreshOverlayStatus();
  });
  if (img.complete) { renderOverlay(); refreshOverlayStatus(); }
  loadOccupancies();
}

/* helpers */
function val(id){ return document.getElementById(id).value.trim(); }
function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function openDialog(d){ if (typeof d.showModal==='function') d.showModal(); else d.setAttribute('open',''); }
function closeDialog(d){ if (typeof d.close==='function') d.close(); else d.removeAttribute('open'); }
