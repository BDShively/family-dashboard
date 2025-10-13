// js/firebase-init.js
// Firebase v11 ESM via CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence,
  signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// Your config (already restricted by referrer)
const firebaseConfig = {
  apiKey: "AIzaSyDbFJAQsUTHOAuuSwD64JOW3addeNIaF3M",
  authDomain: "family-dashboard-5b09d.firebaseapp.com",
  projectId: "family-dashboard-5b09d",
  storageBucket: "family-dashboard-5b09d.firebasestorage.app",
  messagingSenderId: "254915402649",
  appId: "1:254915402649:web:7d918c8d58d4f01d35d108"
};

const app = initializeApp(firebaseConfig);

// Auth
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence);

// Firestore
export const db = getFirestore(app);

// Helpers for the page
export { onAuthStateChanged };

export async function signIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  return signOut(auth);
}

// Tiny test write
export async function testWrite() {
  const col = collection(db, "test_writes");
  return addDoc(col, { at: serverTimestamp(), by: auth.currentUser.email });
}
