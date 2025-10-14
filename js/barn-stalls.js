// /js/barn-stalls.js
import {
  collection, addDoc, getDocs, query, where, serverTimestamp,
  doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db, auth } from "/family-dashboard/js/firebase-init.js";

const SHOW_LABELS = false;

// your rectangles
const STALL_MAP_PX = [
  { id:"S01", number:1,  x:874, y:80,  w:113, h:100 },
  { id:"S02", number:2,  x:753, y:80,  w:118, h:100 },
  { id:"S03", number:3,  x:495, y:80,  w:133, h:100 },
  { id:"S04", number:4,  x:298, y:82,  w:128, h:98  },
  { id:"S05", number:5,  x:43,  y:80,  w:128, h:100 },
  { id:"S06", number:6,  x:43,  y:257, w:129, h:106 },
  { id:"S07", number:7,  x:172, y:257, w:142, h:106 },
  { id:"S08", number:8,  x:314, y:259, w:146, h:104 },
  { id:"S09", number:9,  x:460, y:257, w:138, h:106 },
  { id:"S10", number:10, x:522, y:364, w:104, h:117 },
  { id:"S11", number:11, x:538, y:481, w:117, h:122 },
  { id:"S12", number:12, x:540, y:603, w:113, h:122 },
  { id:"S13", number:13, x:540, y:725, w:113, h:113 },
  { id:"S14", number:14, x:540, y:838, w:113, h:67  },
  { id:"S15", number:15, x:753, y:483, w:129, h:166 },
  { id:"S16", number:16, x:828, y:364, w:113, h:115 },
  { id:"S17", number:17, x:753, y:257, w:120, h:106 },
  { id:"S18", number:18, x:874, y:259, w:115, h:104 },
];

const C_OCC  = '#2563eb';
const C_SCH  = '#f59e0b';
const C_EMP  = '#6b7280';
const C_STROKE = 'rgba(230,238,252,0.9)';

export function initBarnStalls(sel){
  const img   = document.querySelector(sel.imageSelector);
  const svg   = document.querySelector(sel.overlaySelector);
  const filterSel = document.querySelector(sel.statusFilterSelector);
  const clearBtn  = document.querySelector(sel.clearSelector);
  const occBody   = document.querySelector(sel.occBodySelector);
  const selInfo   = document.querySelector(sel.selInfoSelector);
  const addBtn    = document.querySelector(sel.addBtnSelector);
  const modal     = document.querySelector(sel.modalSelector);
  const form      = document.querySelector(sel.formSelector);

  const chipFilterBtns = document.querySelectorAll('button.chip[data-filter]');
  const clearSel2 = document.getElementById('clearSel2');

  let currentStall=null, currentStatusFilter='all';
  let occupancyByStall=new Map(); // stallId -> {state:'active'|'scheduled'|'empty'}

  function stallStateForId(id){
    const s = occupancyByStall.get(id);
    return s?.state || 'empty';
  }

  function renderOverlay(){
    const vbW=img.naturalWidth||img.clientWidth, vbH=img.naturalHeight||img.clientHeight;
    svg.setAttribute('viewBox',`0 0 ${vbW} ${vbH}`);
    svg.setAttribute('preserveAspectRatio','none');

    svg.innerHTML = STALL_MAP_PX.map(s=>`
      <g class="stall" data-id="${s.id}" data-number="${s.number}">
        <rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}"
          fill="${C_EMP}33" stroke="${C_STROKE}" stroke-width="2"></rect>
        ${SHOW_LABELS ? `<text x="${s.x+s.w/2}" y="${s.y+s.h/2}" text-anchor="middle" dominant-baseline="central"
            fill="#9db1d1" fill-opacity="0.25" font-size="${Math.max(12,Math.min(s.w,s.h)/2)}">${s.number}</text>` : ``}
      </g>`).join('');

    svg.querySelectorAll('g.stall').forEach(g=>{
      g.style.cursor='pointer';
      g.onclick=()=>{ selectStall(g.getAttribute('data-id')); };
    });

    paintOverlay();
  }

  function paintOverlay(){
    STALL_MAP_PX.forEach(s=>{
      const state = stallStateForId(s.id);
      const rect=svg.querySelector(`g.stall[data-id="${s.id}"] rect`);
      if(!rect) return;
      // base color by state
      if(state==='active') rect.setAttribute('fill', C_OCC+'55');
      else if(state==='scheduled') rect.setAttribute('fill', C_SCH+'55');
      else rect.setAttribute('fill', C_EMP+'33');

      // dim non-matching when a filter is active
      let dim = false;
      if (currentStatusFilter==='active') dim = state!=='active';
      else if (currentStatusFilter==='scheduled') dim = state!=='scheduled';
      else if (currentStatusFilter==='empty') dim = state!=='empty';
      rect.setAttribute('opacity', dim ? '0.28' : '1');
    });

    // selection stroke
    svg.querySelectorAll('g.stall rect').forEach(r=>r.setAttribute('stroke',C_STROKE));
    if(currentStall){
      const r=svg.querySelector(`g.stall[data-id="${currentStall.id}"] rect`);
      if (r) r.setAttribute('stroke','#2b6cb0');
    }

    // chip active states
    chipFilterBtns.forEach(b=>{
      b.classList.toggle('active', b.dataset.filter===currentStatusFilter);
    });
  }

  async function refreshOverlayStatus(){
    occupancyByStall=new Map();
    const base=collection(db,'barn_occupancies');
    const snap=await getDocs(query(base));
    const today=new Date().toISOString().slice(0,10);

    // start with all empty
    STALL_MAP_PX.forEach(s=>occupancyByStall.set(s.id,{state:'empty'}));

    snap.forEach(d=>{
      const x=d.data();
      const st = occupancyByStall.get(x.stallId) || {state:'empty'};
      const isActive = x.status==='active' && (!x.end_date || x.end_date >= today);
      const isSched  = x.status==='scheduled';
      if (isActive) st.state = 'active';
      else if (st.state!=='active' && isSched) st.state = 'scheduled';
      occupancyByStall.set(x.stallId, st);
    });

    paintOverlay();
  }

  async function loadOccupancies(){
    const base=collection(db,'barn_occupancies');
    const snap=currentStall
      ? await getDocs(query(base, where('stallId','==', currentStall.id)))
      : await getDocs(query(base));

    const today=new Date().toISOString().slice(0,10);
    const rows=[];
    snap.forEach(d=>{
      const x=d.data();
      const active=x.status==='active' && (!x.end_date || x.end_date>=today);
      const sch=x.status==='scheduled';
      if(currentStatusFilter==='active' && !active) return;
      if(currentStatusFilter==='scheduled' && !sch) return;
      if(currentStatusFilter==='empty') return;
      rows.push({id:d.id,...x});
    });

    selInfo.textContent=currentStall?`Stall ${currentStall.number} (${currentStall.id})`:'All stalls';

    occBody.innerHTML = rows.map(r=>`
      <tr class="hover:bg-black/20">
        <td class="p-3">${r.stallId||''}</td>
        <td class="p-3">${esc(r.horse)}</td>
        <td class="p-3">${esc(r.owner)}</td>
        <td class="p-3 capitalize">${r.status}</td>
        <td class="p-3">${r.start_date||''}</td>
        <td class="p-3">${r.end_date||''}</td>
        <td class="p-3">$${Number(r.board_rate_monthly||0).toFixed(2)}</td>
        <td class="p-3">
          <button class="px-2 py-1 text-xs rounded bg-black/30 border border-white/10 mr-2" data-edit="${r.id}">Edit</button>
          <button class="px-2 py-1 text-xs rounded bg-red-600/70 text-white" data-del="${r.id}">Delete</button>
        </td>
      </tr>`).join('') || `<tr><td class="p-3 text-brand-mute" colspan="8">No matching records.</td></tr>`;

    // wire actions
    occBody.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEdit(b.getAttribute('data-edit')));
    occBody.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>doDelete(b.getAttribute('data-del')));
  }

  function selectStall(stallId){
    const s = STALL_MAP_PX.find(x=>x.id===stallId);
    currentStall = s ? { id:s.id, number:s.number } : null;
    paintOverlay();
    loadOccupancies();
  }

  // modal helpers
  const hid = (id)=>document.getElementById(id);

  addBtn.onclick=()=>{
    if(!currentStall){ alert('Select a stall first.'); return; }
    hid('mDocId').value = '';
    hid('mTitle').textContent = 'New Occupancy';
    hid('mStall').value = `${currentStall.number} (${currentStall.id})`;
    hid('mStatus').value = 'active';
    hid('mHorse').value = '';
    hid('mOwner').value = '';
    hid('mStart').value = new Date().toISOString().slice(0,10);
    hid('mEnd').value = '';
    hid('mRate').value = '';
    hid('mFeed').value = '';
    hid('mTrain').value = '';
    hid('mDelete').classList.add('hidden');
    openDialog(modal);
  };
  document.getElementById('mCancel').onclick=()=>closeDialog(modal);
  document.getElementById('mDelete').onclick=async ()=>{
    const id = hid('mDocId').value;
    if (!id) return;
    if (!confirm('Delete this occupancy?')) return;
    await deleteDoc(doc(db,'barn_occupancies', id));
    closeDialog(modal);
    await loadOccupancies();
    await refreshOverlayStatus();
  };

  async function openEdit(docId){
    // fetch doc by reusing current table snapshot if desired; simplest is query again
    const base=collection(db,'barn_occupancies');
    const snap=await getDocs(query(base, where('__name__','==', docId)));
    if (snap.empty) return alert('Record not found.');
    const d = snap.docs[0]; const x = d.data();
    const stall = STALL_MAP_PX.find(s=>s.id===x.stallId) || {number:'?'};

    hid('mDocId').value = d.id;
    hid('mTitle').textContent = 'Edit Occupancy';
    hid('mStall').value = `${stall.number} (${x.stallId})`;
    hid('mStatus').value = x.status || 'active';
    hid('mHorse').value = x.horse || '';
    hid('mOwner').value = x.owner || '';
    hid('mStart').value = x.start_date || '';
    hid('mEnd').value = x.end_date || '';
    hid('mRate').value = Number(x.board_rate_monthly||0);
    hid('mFeed').value = x.feed_program || '';
    hid('mTrain').value = x.training_program || '';
    hid('mDelete').classList.remove('hidden');
    openDialog(modal);
  }

  form.onsubmit=async (e)=>{
    e.preventDefault();
    if(!auth.currentUser) return alert('Sign in first.');
    if(!currentStall && !hid('mDocId').value) return alert('Select a stall.');

    const payload={
      stallId: currentStall ? currentStall.id : (hid('mStall').value.match(/\((.+)\)$/)?.[1] || null),
      status: hid('mStatus').value,
      horse: val('mHorse'),
      owner: val('mOwner'),
      start_date: val('mStart'),
      end_date: val('mEnd') || null,
      board_rate_monthly: parseFloat(val('mRate')||'0'),
      feed_program: val('mFeed') || null,
      training_program: val('mTrain') || null,
      by: auth.currentUser.email
    };
    if (!payload.stallId || !payload.horse || !payload.owner || !payload.start_date){
      alert('Fill required fields.'); return;
    }

    const id = hid('mDocId').value;
    if (id){
      await updateDoc(doc(db,'barn_occupancies', id), payload);
    } else {
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db,'barn_occupancies'), payload);
    }
    closeDialog(modal);
    await loadOccupancies();
    await refreshOverlayStatus();
  };

  // filter events
  chipFilterBtns.forEach(b=>{
    b.onclick=()=>{ currentStatusFilter=b.dataset.filter; paintOverlay(); loadOccupancies(); };
  });
  clearSel2?.addEventListener('click', ()=>{ currentStall=null; currentStatusFilter='all'; filterSel.value='all'; paintOverlay(); loadOccupancies(); });
  filterSel.onchange = ()=>{ currentStatusFilter=filterSel.value; paintOverlay(); loadOccupancies(); };
  clearBtn.onclick = ()=>{ currentStall=null; currentStatusFilter='all'; filterSel.value='all'; paintOverlay(); loadOccupancies(); };

  // init
  img.addEventListener('load', async ()=>{ renderOverlay(); await refreshOverlayStatus(); });
  if (img.complete){ renderOverlay(); refreshOverlayStatus(); }
  loadOccupancies();
}

/* helpers */
function val(id){ return document.getElementById(id).value.trim(); }
function esc(s){ return String(s||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function openDialog(d){ if(d.showModal) d.showModal(); else d.setAttribute('open',''); }
function closeDialog(d){ if(d.close) d.close(); else d.removeAttribute('open'); }
