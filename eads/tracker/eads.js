/* /eads/tracker/eads.js */
export function gate(){
  import("/family-dashboard/js/firebase-init.js").then(m=>{
    m.onAuthStateChanged(m.auth, u=>{
      if(!u){ location.href="/family-dashboard/main/index.html"; return; }
      const c=document.getElementById('auth');
      c.innerHTML = `<div class="muted" style="display:flex;gap:8px;align-items:center">
        <span>${u.email}</span><a class="btn" href="#" id="signout">Sign out</a></div>`;
      document.getElementById('signout').onclick=(e)=>{e.preventDefault();m.signOutUser();};
    });
  }).catch(()=>{ /* allow offline */ });
}
export const $=s=>document.querySelector(s);
export const $$=s=>document.querySelectorAll(s);
export function setTitle(s){ const el=document.querySelector('h1'); if(el) el.textContent=s; }
