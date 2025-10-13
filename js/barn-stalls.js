// /js/barn-stalls.js
import {
  getFirestore, collection, addDoc, getDocs, query, where, doc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db, auth } from "/family-dashboard/js/firebase-init.js";

/**
 * Configure your stall rectangles in PERCENT coordinates relative to the image.
 * x,y = top-left percent (0–100), w,h = size percent.
 * Fill these with your real positions for 18 stalls.
 */
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


export function initBarnStalls(selectors){
  const img = document.querySelector(selectors.imageSelector);
  const svg = document.querySelector(selectors.overlaySelector);
  const filterSel = document.querySelector(selectors.statusFilterSelector);
  const clearBtn = document.querySelector(selectors.clearSelector);
  const occBody = document.querySelector(selectors.occBodySelector);
  const selInfo = document.querySelector(selectors.selInfoSelector);
  const addBtn  = document.querySelector(selectors.addBtnSelector);
  const modal   = document.querySelector(selectors.modalSelector);
  const form    = document.querySelector(selectors.formSelector);

  let currentStall = null;
  let currentStatusFilter = 'all';

  // Render overlay rects
  function renderOverlay(){
    const vb = '0 0 100 100'; // percent space
    svg.setAttribute('viewBox', vb);
    svg.innerHTML = STALL_MAP.map(s => `
      <g class="stall" data-id="${s.id}" data-number="${s.number}">
        <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"
              fill="rgba(43,108,176,0.25)" stroke="rgba(230,238,252,0.8)" stroke-width="0.75"></rect>
        <text x="${s.x + s.w/2}" y="${s.y + s.h/2}" text-anchor="middle" dominant-baseline="central"
              fill="#e6eefc" font-size="3.6">${s.number}</text>
      </g>
    `).join('');
    // enable clicks
    svg.querySelectorAll('g.stall').forEach(g=>{
      g.style.cursor='pointer';
      g.style.pointerEvents='auto';
      g.addEventListener('click', ()=> {
        const id = g.getAttribute('data-id');
        const num = g.getAttribute('data-number');
        currentStall = { id, number: Number(num) };
        svg.querySelectorAll('rect').forEach(r=>r.setAttribute('stroke','rgba(230,238,252,0.8)'));
        g.querySelector('rect').setAttribute('stroke','#2b6cb0');
        loadOccupancies();
      });
    });
  }

  // Load occupancies for selection + filter
  async function loadOccupancies(){
    let qBase = collection(db, 'barn_occupancies');
    // Firestore structure: /barn/occupancies docs (flat)
    // Filter on stall when selected
    const qs = [];
    if (currentStall) qs.push(where('stallId', '==', currentStall.id));

    // We cannot add dynamic ORs easily; do simple get and filter in client for status.
    const snap = await getDocs(q(qBase)); // fallback query wrapper below
    const rows = [];
    snap.forEach(d=>{
      const x = d.data();
      // client filter by stall if not already done
      if (currentStall && x.stallId !== currentStall.id) return;

      const nowISO = new Date().toISOString().slice(0,10);
      const active = !x.end_date || x.end_date >= nowISO;
      const isScheduled = x.status === 'scheduled';
      const isActive = x.status === 'active' && active;
      const isEmpty = false; // empties shown when no rows and a stall is selected

      if (currentStatusFilter === 'active' && !isActive) return;
      if (currentStatusFilter === 'scheduled' && !isScheduled) return;
      if (currentStatusFilter === 'empty') return; // handled below by message

      rows.push({ id:d.id, ...x });
    });

    // Update selection info
    if (currentStall) {
      selInfo.textContent = `Stall ${currentStall.number} (${currentStall.id})`;
    } else {
      selInfo.textContent = 'All stalls';
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

    // If "Empty" filter and a stall selected with zero rows, show message
    if (currentStatusFilter === 'empty' && currentStall && rows.length===0){
      occBody.innerHTML = `<tr><td class="p-3 text-emerald-300" colspan="7">Stall ${currentStall.number} appears empty.</td></tr>`;
    }
  }

  // Add occupancy flow
  addBtn.onclick = ()=>{
    if (!currentStall) { alert('Select a stall first.'); return; }
    const mStall = document.getElementById('mStall');
    mStall.value = `${currentStall.number} (${currentStall.id})`;
    if (typeof modal.showModal === 'function') modal.showModal();
    else modal.setAttribute('open','');
    // defaults
    document.getElementById('mStart').value = new Date().toISOString().slice(0,10);
  };
  document.getElementById('mCancel').onclick = ()=> {
    if (typeof modal.close === 'function') modal.close();
    else modal.removeAttribute('open');
  };

  form.onsubmit = async (e)=>{
    e.preventDefault();
    if (!auth.currentUser) return alert('Sign in first.');
    if (!currentStall) return alert('Select a stall.');

    const payload = {
      stallId: currentStall.id,
      horse:  valueOf('mHorse'),
      owner:  valueOf('mOwner'),
      start_date: valueOf('mStart'),
      end_date: valueOf('mEnd') || null,
      board_rate_monthly: parseFloat(valueOf('mRate')||'0'),
      feed_program: valueOf('mFeed') || null,
      training_program: valueOf('mTrain') || null,
      status: 'active', // default
      createdAt: serverTimestamp(),
      by: auth.currentUser.email
    };
    // Basic checks
    if (!payload.horse || !payload.owner || !payload.start_date) { alert('Fill required fields.'); return; }

    await addDoc(collection(db, 'barn_occupancies'), payload);
    if (typeof modal.close === 'function') modal.close(); else modal.removeAttribute('open');
    await loadOccupancies();
  };

  // Controls
  filterSel.onchange = ()=>{ currentStatusFilter = filterSel.value; loadOccupancies(); };
  clearBtn.onclick = ()=>{ currentStall = null; // clear highlight
    svg.querySelectorAll('rect').forEach(r=>r.setAttribute('stroke','rgba(230,238,252,0.8)'));
    loadOccupancies();
  };

  // Kickoff
  img.addEventListener('load', renderOverlay);
  if (img.complete) renderOverlay();
  loadOccupancies();
}

// helpers
function valueOf(id){ return document.getElementById(id).value.trim(); }
function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// tiny query wrapper to allow plain getDocs(collection(...))
function q(col){ return query(col); }
