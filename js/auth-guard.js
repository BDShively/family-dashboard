// /js/auth-guard.js
import { auth, onAuthStateChanged } from './firebase-init.js';

export function requireAuth(redirect = '/family-dashboard/main/index.html') {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (u) => {
      if (!u) location.href = redirect;
      else resolve(u);
    });
  });
}
