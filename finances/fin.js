// /family-dashboard/finances/fin.js
import { db } from "/family-dashboard/js/firebase-init.js";
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

export const $  = (s)=>document.querySelector(s);
export const $$ = (s)=>document.querySelectorAll(s);

export function makeFSList(cfg){
  const {
    store,$thead,$tbody,$save,$update,$delete,$selInfo,$search,$filter,
    defaultSort='createdAt',filterFn,rowHTML,getForm,setForm,clearForm
  } = cfg;

  let ROWS=[], selId=null;

  function rowMatch(r){
    const q = ($search && $search.value.trim().toLowerCase()) || '';
    if(!q) return true;
    return Object.values(r).some(v=> String(v??'').toLowerCase().includes(q));
  }
  function passFilter(r){
    if(!$filter) return true;
    const v = typeof $filter.value!=='undefined' ? $filter.value : ($filter.get?.value ?? '');
    if(!v) return true;
    return cfg.filterFn ? cfg.filterFn(r,v) : true;
  }

  async function load(){
    const qy = query(collection(db, store), orderBy(defaultSort));
    const snap = await getDocs(qy);
    ROWS = snap.docs.map(d=>({ id:d.id, ...d.data() }));
    render();
  }
  function render(){
    const rows = ROWS.filter(rowMatch).filter(passFilter);
    $tbody.innerHTML = rows.map(rowHTML).join('');
    if(cfg.afterRender) cfg.afterRender({rows,$tbody,selectRow:onRowSelect,deleteRow:onDelete});
    const cnt = document.getElementById(($selInfo?.id||'')?.replace('sel','count')) || $('#count');
    if(cnt) cnt.textContent = `${rows.length} result(s)`;
    // wire row clicks
    $tbody.querySelectorAll('tr').forEach(tr=>{
      tr.onclick = ()=> onRowSelect(tr.getAttribute('data-id'));
    });
  }

  function onRowSelect(id){
    selId = id;
    const r = ROWS.find(x=>x.id===id); if(!r) return;
    setForm && setForm(r);
    if($update) $update.disabled=false;
    if($delete) $delete.disabled=false;
    if($selInfo) $selInfo.textContent=`Selected ${id}`;
  }

  async function onSave(){
    const data = getForm(); if(!data) return;
    await addDoc(collection(db,store), { ...data, createdAt: serverTimestamp() });
    clear();
    await load();
  }
  async function onUpdate(){
    if(!selId) return;
    const data = getForm(); if(!data) return;
    await updateDoc(doc(db,store,selId), data);
    clear();
    await load();
  }
  async function onDelete(){
    const id = selId; if(!id) return;
    if(!confirm('Delete this record?')) return;
    await deleteDoc(doc(db,store,id));
    clear();
    await load();
  }
  function clear(){
    selId=null;
    if($update) $update.disabled=true;
    if($delete) $delete.disabled=true;
    if($selInfo) $selInfo.textContent='';
    clearForm && clearForm();
  }

  // events
  $save && ($save.onclick = ()=>onSave().catch(err=>alert(err.message||err)));
  $update && ($update.onclick = ()=>onUpdate().catch(err=>alert(err.message||err)));
  $delete && ($delete.onclick = ()=>onDelete().catch(err=>alert(err.message||err)));
  $search && ($search.oninput = render);
  if($filter){
    if(typeof $filter.oninput==='function'){ $filter.oninput(render); }
    else { $filter.oninput = render; }
  }
  $thead && ($thead.onclick = (e)=>{ const k=e.target?.dataset?.k; if(!k) return;
    cfg.defaultSort=k; load().catch(console.error);
  });

  load().catch(err=>alert(err.message||err));
}
