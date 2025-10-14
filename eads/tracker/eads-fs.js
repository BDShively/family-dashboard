// /eads/tracker/eads-fs.js
import {
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db } from "/family-dashboard/js/firebase-init.js";

/**
 * Generic Firestore table binder.
 * cfg = {
 *   store,           // collection name
 *   $thead, $tbody,  // table parts
 *   $save, $update, $delete, $selInfo,
 *   $search,         // optional
 *   $filter,         // optional (value or '')
 *   filterFn,        // optional (row, filterValue) => boolean
 *   defaultSort,     // optional key
 *   rowHTML,         // (row) => <tr data-id="...">...</tr>
 *   getForm, setForm, clearForm
 * }
 */
export function makeFSList(cfg){
  const st = { rows:[], sel:null, sortKey: cfg.defaultSort||'createdAt', asc:false };

  async function fetchAll(){
    const snap = await getDocs(collection(db, cfg.store));
    st.rows = snap.docs.map(d=>({ id:d.id, ...d.data() }));
  }
  function render(){
    const q = (cfg.$search?.value || '').toLowerCase();
    const f = cfg.$filter?.value || '';

    let v = st.rows.slice();
    if (f && cfg.filterFn) v = v.filter(r=>cfg.filterFn(r, f));
    if (q) v = v.filter(r => JSON.stringify(r).toLowerCase().includes(q));
    v.sort((a,b)=>{
      const A=a[st.sortKey]??'', B=b[st.sortKey]??'';
      return (A>B?1:A<B?-1:0) * (st.asc?1:-1);
    });

    cfg.$tbody.innerHTML = v.map(cfg.rowHTML).join('') || `<tr><td colspan="10" style="opacity:.7">No records</td></tr>`;
  }

  cfg.$thead?.addEventListener('click', e=>{
    const th = e.target.closest('[data-k]'); if(!th) return;
    const k = th.getAttribute('data-k');
    if (st.sortKey===k) st.asc=!st.asc; else { st.sortKey=k; st.asc=true; }
    render();
  });

  cfg.$tbody.addEventListener('click', e=>{
    const tr = e.target.closest('tr[data-id]'); if(!tr) return;
    const id = tr.getAttribute('data-id');
    st.sel = st.rows.find(r=>r.id===id) || null;
    cfg.setForm(st.sel);
    if(cfg.$selInfo) cfg.$selInfo.textContent = `Editing #${id}`;
    cfg.$update.disabled=false; cfg.$delete.disabled=false;
  });

  cfg.$save.onclick = async ()=>{
    const rec = { ...cfg.getForm(), createdAt: serverTimestamp() };
    const ref = await addDoc(collection(db, cfg.store), rec);
    st.sel = null; cfg.clearForm();
    await fetchAll(); render();
    if(cfg.$selInfo) cfg.$selInfo.textContent='';
  };
  cfg.$update.onclick = async ()=>{
    if(!st.sel) return;
    const upd = { ...cfg.getForm() };
    await updateDoc(doc(db, cfg.store, st.sel.id), upd);
    st.sel = null; cfg.clearForm();
    await fetchAll(); render();
    if(cfg.$selInfo) cfg.$selInfo.textContent='';
  };
  cfg.$delete.onclick = async ()=>{
    if(!st.sel) return;
    await deleteDoc(doc(db, cfg.store, st.sel.id));
    st.sel = null; cfg.clearForm();
    await fetchAll(); render();
    if(cfg.$selInfo) cfg.$selInfo.textContent='';
  };

  cfg.$search && (cfg.$search.oninput = render);
  cfg.$filter && (cfg.$filter.oninput = render);

  (async ()=>{ await fetchAll(); render(); })();

  return { state:st, refresh: async()=>{ await fetchAll(); render(); } };
}
