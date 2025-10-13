import {
  collection, addDoc, getDocs, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db, auth } from "/family-dashboard/js/firebase-init.js";

// Paste your percent entries here:
const PCT = [
  { id:"S01", number:1,  x:84.97, y:7.86, w:11.54, h:9.82 },
  { id:"S02", number:2,  x:73.42, y:7.86, w:11.54, h:9.82 },
  { id:"S03", number:3,  x:48.13, y:7.86, w:13.02, h:9.82 },
  { id:"S04", number:4,  x:28.98, y:7.86, w:12.28, h:10.07 },
  { id:"S05", number:5,  x:4.17,  y:7.61, w:12.52, h:10.07 },
  { id:"S06", number:6,  x:4.17,  y:25.29, w:12.52, h:10.31 },
  { id:"S07", number:7,  x:16.70, y:25.05, w:14.00, h:10.07 },
  { id:"S08", number:8,  x:30.70, y:24.80, w:14.24, h:10.31 },
  { id:"S09", number:9,  x:44.45, y:25.29, w:14.00, h:10.07 },
  { id:"S10", number:10, x:50.59, y:35.36, w:10.56, h:11.30 },
  { id:"S11", number:11, x:52.55, y:46.90, w:11.05, h:11.79 },
  { id:"S12", number:12, x:52.55, y:58.69, w:11.30, h:12.03 },
  { id:"S13", number:13, x:52.55, y:70.72, w:11.05, h:11.05 },
  { id:"S14", number:14, x:52.80, y:81.77, w:11.05, h:6.63  },
  { id:"S15", number:15, x:73.42, y:46.90, w:12.77, h:16.21 },
  { id:"S16", number:16, x:80.79, y:35.61, w:10.81, h:11.30 },
  { id:"S17", number:17, x:73.67, y:25.05, w:11.30, h:10.56 },
  { id:"S18", number:18, x:84.97, y:25.29, w:11.30, h:10.31 }
];
// Convert to pixels using the image's natural size
const img = document.querySelector('#floorImg');
const W = img.naturalWidth, H = img.naturalHeight;
const PX = PCT.map(s => ({
  id:s.id, number:s.number,
  x: Math.round(s.x/100*W),
  y: Math.round(s.y/100*H),
  w: Math.round(s.w/100*W),
  h: Math.round(s.h/100*H)
}));
console.log('Paste into STALL_MAP_PX:', PX);


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
