// /family-dashboard/barn/barn-stalls.js
import { onAuthStateChanged, auth, signOutUser, db } from "/family-dashboard/js/firebase-init.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

/* ---------- DOM helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

/* ---------- Stall rectangles (pixel coords captured from your image) ---------- */
const STALL_RECTS_PX = [
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

/* ---------- State ---------- */
const COLL = "barn_occupancies"; // {stallNumber, horse, owner, arrivalDate, departureDate?, income, notes, createdAt}
let ALL = [];               // all occupancy docs
let stallSel = null;        // number or null
let filterMode = "all";     // all | occupied | scheduled | empty
let imgSize = { w: 0, h: 0 };

/* ---------- Auth gate ---------- */
onAuthStateChanged(auth, (u)=>{
  if(!u){ location.href="/family-dashboard/main/index.html"; return; }
});

/* ---------- Init ---------- */
window.addEventListener('DOMContentLoaded', async ()=>{
  // default date = today
  $('#asOfDate').value = today();
  $('#asOfDate').addEventListener('input', refreshAll);

  // filter buttons
  $$('.filters .btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      $$('.filters .btn').forEach(x=>x.setAttribute('aria-pressed','false'));
      b.setAttribute('aria-pressed','true');
      filterMode = b.dataset.filter;
      paintOverlay(); // only visual change
    });
  });

  // map overlay after image loads
  const img = $('#barnImg');
  if (img.complete) setupOverlay();
  else img.addEventListener('load', setupOverlay);

  // form actions
  $('#saveRec').onclick = onSave;
  $('#updateRec').onclick = onUpdate;
  $('#deleteRec').onclick = onDelete;
  $('#clearSel').onclick = ()=>{ stallSel = null; $('#clearSel').style.display='none'; refreshList(); paintOverlay(); };

  await loadAll();
});

/* ---------- Dates ---------- */
function today(){
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}
function cmpDate(a,b){ // YYYY-MM-DD
  if(!a && !b) return 0; if(!a) return -1; if(!b) return 1;
  return a<b?-1:a>b?1:0;
}
function isOccupied(rec, asOf){ // arrival <= asOf < departure (or no departure)
  return (!!rec.arrivalDate && cmpDate(rec.arrivalDate, asOf) <= 0) &&
         (!rec.departureDate || cmpDate(asOf, rec.departureDate) < 0);
}
function isScheduled(rec, asOf){ // future arrival
  return !!rec.arrivalDate && cmpDate(rec.arrivalDate, asOf) > 0;
}

/* ---------- Firestore ---------- */
async function loadAll(){
  const snap = await getDocs(collection(db, COLL));
  ALL = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  refreshAll();
}
async function onSave(){
  const rec = readForm();
  if(!rec.stallNumber || !rec.arrivalDate){ alert('Stall and Arrival required.'); return; }
  await addDoc(collection(db, COLL), { ...rec, createdAt: serverTimestamp() });
  clearForm();
  await loadAll();
}
async function onUpdate(){
  const id = $('#updateRec').dataset.id;
  if(!id){ return; }
  const rec = readForm();
  await updateDoc(doc(db, COLL, id), rec);
  clearForm();
  await loadAll();
}
async function onDelete(){
  const id = $('#deleteRec').dataset.id;
  if(!id){ return; }
  if(!confirm('Delete this record?')) return;
  await deleteDoc(doc(db, COLL, id));
  clearForm();
  await loadAll();
}

/* ---------- Overlay ---------- */
function setupOverlay(){
  const img = $('#barnImg');
  imgSize = { w: img.naturalWidth, h: img.naturalHeight };
  renderOverlayButtons();
  paintOverlay();
}
function renderOverlayButtons(){
  const overlay = $('#overlay');
  overlay.innerHTML = '';
  const {w,h} = imgSize;
  STALL_RECTS_PX.forEach(r=>{
    const left = (r.x / w) * 100;
    const top  = (r.y / h) * 100;
    const ww   = (r.w / w) * 100;
    const hh   = (r.h / h) * 100;
    const b = document.createElement('button');
    b.className = 'stall-btn';
    b.style.left = `${left}%`; b.style.top = `${top}%`;
    b.style.width = `${ww}%`;  b.style.height = `${hh}%`;
    b.dataset.stall = String(r.number);
    b.innerHTML = `<span class="num">${r.number}</span>`;
    b.addEventListener('click', ()=>{ stallSel = r.number; $('#clearSel').style.display='inline-flex'; refreshList(); paintOverlay(); });
    overlay.appendChild(b);
  });
}

/* ---------- Coloring logic ---------- */
function statusForStall(n, asOf){
  const recs = ALL.filter(r=>Number(r.stallNumber)===Number(n));
  const occ = recs.find(r=>isOccupied(r, asOf));
  if(occ) return { state:'occupied', rec:occ };
  const future = recs.filter(r=>isScheduled(r, asOf)).sort((a,b)=>cmpDate(a.arrivalDate,b.arrivalDate))[0];
  if(future) return { state:'scheduled', rec:future };
  return { state:'empty', rec:null };
}
function paintOverlay(){
  const asOf = $('#asOfDate').value || today();
  $$('.stall-btn').forEach(btn=>{
    const n = Number(btn.dataset.stall);
    const {state} = statusForStall(n, asOf);
    // reset
    btn.style.background = 'transparent';
    btn.style.borderColor = 'rgba(255,255,255,.6)';
    btn.style.opacity = '1';
    // apply filter emphasis
    if(filterMode!=='all' && state!==filterMode){
      btn.style.background = 'transparent';
      btn.style.opacity = '.25'; // fade non-matching
    }else{
      if(state==='occupied')  btn.style.background = 'var(--occ)';
      if(state==='scheduled') btn.style.background = 'var(--sch)';
      if(state==='empty')     btn.style.background = 'var(--emp)';
      btn.style.opacity = '1';
    }
  });
}

/* ---------- Tables ---------- */
function refreshAll(){
  paintOverlay();
  refreshList();
}
function refreshList(){
  const asOf = $('#asOfDate').value || today();
  if(stallSel==null){
    $('#listTitle').textContent = `Occupancy on ${asOf}`;
    $('#listSub').textContent = `All stalls`;
    $('#occTbl tbody').innerHTML = renderAsOf(asOf);
  }else{
    $('#listTitle').textContent = `History · Stall ${stallSel}`;
    $('#listSub').textContent = `Newest first`;
    $('#occTbl tbody').innerHTML = renderHistory(stallSel);
  }
}

/* show one row per stall for the as-of date */
function renderAsOf(asOf){
  const rows = [];
  for(let n=1;n<=18;n++){
    const {state, rec} = statusForStall(n, asOf);
    if(rec){
      rows.push(rowHTML(rec));
    }else{
      rows.push(`<tr>
        <td>${n}</td><td colspan="5"><span class="muted">${state==='empty'?'Empty':'—'}</span></td>
        <td></td>
        <td class="actions">
          <button class="btn" onclick="window._new(${n})">Add</button>
        </td>
      </tr>`);
    }
  }
  return rows.join('');
}

/* show all records for a given stall, newest first by arrival */
function renderHistory(n){
  const items = ALL.filter(r=>Number(r.stallNumber)===Number(n))
    .sort((a,b)=>cmpDate(b.arrivalDate,a.arrivalDate));
  if(items.length===0){
    return `<tr><td>${n}</td><td colspan="7"><span class="muted">No history</span></td><td class="actions"><button class="btn" onclick="window._new(${n})">Add</button></td></tr>`;
  }
  return items.map(rowHTML).join('');
}

function rowHTML(r){
  const id = r.id;
  const dep = r.departureDate || '';
  return `<tr>
    <td>${r.stallNumber||''}</td>
    <td>${r.horse||''}</td>
    <td>${r.owner||''}</td>
    <td>${r.arrivalDate||''}</td>
    <td>${dep}</td>
    <td>${r.income!=null?Number(r.income).toFixed(2):''}</td>
    <td>${r.program||''}</td>
    <td>${r.notes||''}</td>
    <td class="actions">
      <button class="btn" onclick="window._edit('${id}')">Edit</button>
      <button class="btn" onclick="window._del('${id}')">Delete</button>
    </td>
  </tr>`;
}

/* ---------- Form helpers ---------- */
function readForm(){
  return {
    stallNumber: Number($('#f_stall').value),
    horse: $('#f_horse').value.trim(),
    owner: $('#f_owner').value.trim(),
    income: $('#f_income').value ? Number($('#f_income').value) : null,
    arrivalDate: $('#f_arrive').value || null,
    departureDate: $('#f_depart').value || null,
    program: $('#f_notes').value.trim() ? undefined : undefined, // deprecated field name kept blank
    notes: $('#f_notes').value.trim()
  };
}
function writeForm(r){
  $('#f_stall').value = r.stallNumber||'';
  $('#f_horse').value = r.horse||'';
  $('#f_owner').value = r.owner||'';
  $('#f_income').value = (r.income!=null?r.income:'');
  $('#f_arrive').value = r.arrivalDate||'';
  $('#f_depart').value = r.departureDate||'';
  $('#f_notes').value = r.notes||'';
}
function clearForm(){
  ['#f_stall','#f_horse','#f_owner','#f_income','#f_arrive','#f_depart','#f_notes'].forEach(s=>$(s).value='');
  $('#updateRec').disabled = true; $('#deleteRec').disabled = true;
  delete $('#updateRec').dataset.id; delete $('#deleteRec').dataset.id;
  $('#editInfo').textContent = '';
}

/* expose small actions for buttons inside table */
window._new = function(stall){
  clearForm();
  $('#f_stall').value = stall || '';
  $('#f_arrive').value = $('#asOfDate').value || today();
  $('#f_horse').focus();
};
window._edit = function(id){
  const r = ALL.find(x=>x.id===id); if(!r) return;
  writeForm(r);
  $('#updateRec').disabled = false; $('#deleteRec').disabled = false;
  $('#updateRec').dataset.id = id;  $('#deleteRec').dataset.id = id;
  $('#editInfo').textContent = `Editing ${id}`;
};
window._del = async function(id){
  if(!confirm('Delete this record?')) return;
  await deleteDoc(doc(db, COLL, id));
  await loadAll();
};

/* repaint when data changes externally */
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') loadAll(); });
