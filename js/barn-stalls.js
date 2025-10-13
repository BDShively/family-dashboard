// /js/barn-stalls.js
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db, auth } from "/family-dashboard/js/firebase-init.js";

/** Replace with your final rectangles (percent coords). */
const STALL_MAP = [
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

/** Public initializer used by stalls.html */
export function initBarnStalls(sel) {
  const img = document.querySelector(sel.imageSelector);
  const svg = document.querySelector(sel.overlaySelector);
  const filterSel = document.querySelector(sel.statusFilterSelector);
  const clearBtn = document.querySelector(sel.clearSelector);
  const occBody = document.querySelector(sel.occBodySelector);
  const selInfo = document.querySelector(sel.selInfoSelector);
  const addBtn  = document.querySelector(sel.addBtnSelector);
  const modal   = document.querySelector(sel.modalSelector);
  const form    = document.querySelector(sel.formSelector);

  let currentStall = null;
  let currentStatusFilter = 'all';

  // Draw interactive rectangles
  function renderOverlay(){
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.innerHTML = STALL_MAP.map(s => `
      <g class="stall" data-id="${s.id}" data-number="${s.number}">
        <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"
              fill="rgba(43,108,176,0.25)" stroke="rgba(230,238,252,0.8)" stroke-width="0.75"></rect>
        <text x="${s.x + s.w/2}" y="${s.y + s.h/2}" text-anchor="middle" dominant-baseline="central"
              fill="#e6eefc" font-size="3.6">${s.number}</text>
      </g>
    `).join('');

    svg.querySelectorAll('g.stall').forEach(g=>{
      g.style.cursor='pointer';
      g.addEventListener('click', ()=>{
        const id = g.getAttribute('data-id');
        const num = Number(g.getAttribute('data-number'));
        currentStall = { id, number: num };
        svg.querySelectorAll('rect').forEach(r=>r.setAttribute('stroke','rgba(230,238,252,0.8)'));
        g.querySelector('rect').setAttribute('stroke','#2b6cb0');
        loadOccupancies();
      });
    });
  }

  // Load occupancies from Firestore (top-level collection)
  async function loadOccupancies(){
    const base = collection(db, 'barn_occupancies');
    let snap;
    if (currentStall) {
      snap = await getDocs(query(base, where('stallId','==', currentStall.id)));
    } else {
      snap = await getDocs(query(base));
    }

    const rows = [];
    const today = new Date().toISOString().slice(0,10);

    snap.forEach(d=>{
      const x = d.data();
      const active = x.status === 'active' && (!x.end_date || x.end_date >= today);
      const scheduled = x.status === 'scheduled';
      if (currentStatusFilter === 'active' && !active) return;
      if (currentStatusFilter === 'scheduled' && !scheduled) return;
      if (currentStatusFilter === 'empty') return; // empty handled separately
      rows.push({ id:d.id, ...x });
    });

    // Selection label
    selInfo.textContent = currentStall ? `Stall ${currentStall.number} (${currentStall.id})` : 'All stalls';

    // If "Empty" filter and a stall selected with zero rows, show hint
    if (currentStatusFilter === 'empty' && currentStall && rows.length===0){
      occBody.innerHTML = `<tr><td class="p-3 text-emerald-300" colspan="7">Stall ${currentStall.number} appears empty.</td></tr>`;
      return;
    }

    // Render table
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

  // Add occupancy modal
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
    loadOccupancies();
  };

  // Controls
  filterSel.onchange = ()=>{ currentStatusFilter = filterSel.value; loadOccupancies(); };
  clearBtn.onclick = ()=>{
    currentStall = null;
    svg.querySelectorAll('rect').forEach(r=>r.setAttribute('stroke','rgba(230,238,252,0.8)'));
    loadOccupancies();
  };

  // Init
  img.addEventListener('load', renderOverlay);
  if (img.complete) renderOverlay();
  loadOccupancies();
}

/* ----------------- helpers ----------------- */
function val(id){ return document.getElementById(id).value.trim(); }
function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function openDialog(d){ if (typeof d.showModal==='function') d.showModal(); else d.setAttribute('open',''); }
function closeDialog(d){ if (typeof d.close==='function') d.close(); else d.removeAttribute('open'); }
