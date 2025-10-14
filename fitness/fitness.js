// /family-dashboard/fitness/fitness.js
import { db } from "/family-dashboard/js/firebase-init.js";
import {
  collection, getDocs, addDoc, deleteDoc, doc, serverTimestamp,
  query, where
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export const $ = (s)=>document.querySelector(s);

export function today(){
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
}

/* Generic list wiring (CRUD + filter/search + simple sort) */
export function makeFSList(cfg){
  const { store,$thead,$tbody,$save,$update,$delete,$selInfo,$search,$filter,
          defaultSort='createdAt',filterFn,rowHTML,getForm,setForm,clearForm } = cfg;
  let ROWS=[], sel=null;

  async function load(){
    const snap = await getDocs(collection(db,store));
    ROWS = snap.docs.map(d=>({id:d.id, ...d.data()}));
    render();
  }
  function render(){
    const q = ($search?.value||'').toLowerCase();
    const flt = $filter?.value ?? '';
    const rows = ROWS.filter(r=> !q || JSON.stringify(r).toLowerCase().includes(q))
                     .filter(r=> !flt || (filterFn?filterFn(r,flt):true));
    $tbody.innerHTML = rows.map(rowHTML).join('');
    $tbody.querySelectorAll('tr').forEach(tr=> tr.onclick=()=>select(tr.dataset.id));
    const cntId = ($selInfo?.id||'').replace('sel','count'); const cnt = cntId && document.getElementById(cntId);
    if(cnt) cnt.textContent = `${rows.length} result(s)`;
  }
  function select(id){
    sel=id; const r=ROWS.find(x=>x.id===id); if(!r) return;
    setForm&&setForm(r); $update&&( $update.disabled=false ); $delete&&( $delete.disabled=false );
    $selInfo && ($selInfo.textContent = `Selected ${id}`);
  }
  async function onSave(){ const data=getForm(); await addDoc(collection(db,store),{...data,createdAt:serverTimestamp()}); reset(); await load(); }
  async function onUpdate(){ if(!sel) return; const data=getForm(); await updateDoc(doc(db,store,sel),data); reset(); await load(); }
  async function onDelete(){ if(!sel) return; if(!confirm('Delete?')) return; await deleteDoc(doc(db,store,sel)); reset(); await load(); }
  function reset(){ sel=null; $update&&($update.disabled=true); $delete&&($delete.disabled=true); $selInfo&&($selInfo.textContent=''); clearForm&&clearForm(); }
  $save && ($save.onclick = ()=>onSave().catch(e=>alert(e.message||e)));
  $update && ($update.onclick = ()=>onUpdate().catch(e=>alert(e.message||e)));
  $delete && ($delete.onclick = ()=>onDelete().catch(e=>alert(e.message||e)));
  $search && ($search.oninput = render);
  $filter && ($filter.oninput = render);
  $thead && ($thead.onclick = e=>{ const k=e.target?.dataset?.k; if(!k) return; cfg.defaultSort=k; load().catch(console.error); });
  load().catch(e=>alert(e.message||e));
}

/* Helpers for demo seeding */
export async function addMany(store, arr){
  for(const x of arr){ await addDoc(collection(db,store), { ...x, createdAt: serverTimestamp() }); }
}

/* Foods and Exercises lookup */
export async function loadFoods(){
  const snap = await getDocs(collection(db,'fitness_foods'));
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}
export async function loadExercises(){
  const snap = await getDocs(collection(db,'fitness_exercises'));
  return snap.docs.map(d=>({id:d.id, ...d.data()}));
}

/* Daily logs */
export async function addFoodLog(dateISO, foodId, servings){
  const foods = await loadFoods();
  const f = foods.find(x=>x.id===foodId); if(!f) throw new Error('Food not found');
  const cal = Math.round((f.cal||0) * servings);
  const pro = Number(((f.pro||0) * servings).toFixed(1));
  await addDoc(collection(db,'fitness_logs'), {
    date: dateISO, kind:'Food', refId: foodId, name: f.name,
    qty: servings, cal, pro, notes: f.serving,
    createdAt: serverTimestamp()
  });
}

export async function addExerciseLog(dateISO, exId, minutes, kg, note){
  const exs = await loadExercises();
  const x = exs.find(e=>e.id===exId); if(!x) throw new Error('Exercise not found');
  const cal = Math.round((x.met||0) * kg * (minutes/60));
  await addDoc(collection(db,'fitness_logs'), {
    date: dateISO, kind:'Exercise', refId: exId, name: x.name,
    qty: minutes, cal, notes: note||'',
    createdAt: serverTimestamp()
  });
}

export async function deleteLog(id){ await deleteDoc(doc(db,'fitness_logs',id)); }

export async function loadDaily(dateISO){
  // Removed orderBy to avoid needing a composite index
  const snap = await getDocs(
    query(collection(db,'fitness_logs'), where('date','==',dateISO))
  );
  const rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  // client-side sort by createdAt
  rows.sort((a,b)=>{
    const as=(a.createdAt?.seconds||0), bs=(b.createdAt?.seconds||0);
    return as-bs;
  });
  const totals = rows.reduce((acc,r)=>{
    if(r.kind==='Food'){ acc.in += (r.cal||0); acc.pro += (r.pro||0); }
    if(r.kind==='Exercise'){ acc.out += (r.cal||0); }
    return acc;
  }, {in:0,out:0,pro:0});
  return { rows, totals };
}
