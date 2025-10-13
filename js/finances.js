// js/finances.js
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { db, auth } from "./firebase-init.js";

// Your categories
const INCOME = ["Brandy","Beau","Other"];
const EXPENSE = ["Vehicle Expenses","Groceries","Mortgage","Utilities","Subscriptions","Fuel","Insurance","Home/Barn MX","Kids/Activities"];

// State
let currentMonth = new Date().toISOString().slice(0,7); // "YYYY-MM"
const $ = (sel) => document.querySelector(sel);

export function renderFinances(container) {
  container.innerHTML = `
    <h2 class="text-xl font-semibold mb-3">Finances · Transactions</h2>

    <form id="txForm" class="grid md:grid-cols-6 gap-2 items-end mb-4">
      <div class="md:col-span-2">
        <label class="block text-sm">Date</label>
        <input id="txDate" type="date" class="border p-2 rounded w-full" required />
      </div>

      <div>
        <label class="block text-sm">Type</label>
        <select id="txType" class="border p-2 rounded w-full">
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
      </div>

      <div>
        <label class="block text-sm">Category</label>
        <select id="txCat" class="border p-2 rounded w-full"></select>
      </div>

      <div>
        <label class="block text-sm">Amount</label>
        <input id="txAmt" type="number" step="0.01" class="border p-2 rounded w-full" placeholder="0.00" required />
      </div>

      <div class="md:col-span-2">
        <label class="block text-sm">Notes</label>
        <input id="txNotes" type="text" class="border p-2 rounded w-full" placeholder="optional" />
      </div>

      <div>
        <button class="px-3 py-2 bg-blue-600 text-white rounded w-full">Add</button>
      </div>
    </form>

    <div class="flex items-center justify-between mb-2">
      <div class="flex items-center gap-2">
        <label class="text-sm">Month</label>
        <input id="monthPick" type="month" class="border p-2 rounded" />
      </div>
      <div class="text-sm" id="totals"></div>
    </div>

    <div class="overflow-auto">
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left border-b">
            <th class="p-2">Date</th>
            <th class="p-2">Type</th>
            <th class="p-2">Category</th>
            <th class="p-2">Amount</th>
            <th class="p-2">Notes</th>
            <th class="p-2">Actions</th>
          </tr>
        </thead>
        <tbody id="txBody"></tbody>
      </table>
    </div>
  `;

  // defaults
  $("#txDate").value = new Date().toISOString().slice(0,10);
  $("#monthPick").value = currentMonth;

  // populate category list based on type
  const updateCats = () => {
    const type = $("#txType").value;
    const cats = type === "income" ? INCOME : EXPENSE;
    $("#txCat").innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join("");
  };
  $("#txType").onchange = updateCats;
  updateCats();

  // add handler
  $("#txForm").onsubmit = async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return alert("Sign in first.");

    const date = $("#txDate").value; // "YYYY-MM-DD"
    const type = $("#txType").value;
    const cat  = $("#txCat").value;
    const amt  = parseFloat($("#txAmt").value);
    const notes = $("#txNotes").value.trim();

    if (!date || !cat || isNaN(amt)) return;

    // Store positive for income, negative for expense
    const signedAmt = type === "income" ? Math.abs(amt) : -Math.abs(amt);

    await addDoc(collection(db, "transactions"), {
      date,                 // string for filtering
      month: date.slice(0,7), // "YYYY-MM" for quick month filter
      category: cat,
      type,                 // "income" | "expense"
      amount: signedAmt,    // number
      notes,
      source: "manual",
      createdAt: serverTimestamp(),
      by: auth.currentUser.email
    });

    // reset quick
    $("#txAmt").value = "";
    $("#txNotes").value = "";
    await loadTx();
  };

  // month filter
  $("#monthPick").onchange = async (e) => {
    currentMonth = e.target.value || new Date().toISOString().slice(0,7);
    await loadTx();
  };

  // initial load
  loadTx();

  async function loadTx() {
    // simple: fetch latest 500 ordered by date, then filter by month client-side
    const q = query(collection(db, "transactions"), orderBy("date", "desc"));
    const snap = await getDocs(q);

    const rows = [];
    let income = 0, expense = 0;

    snap.forEach((d) => {
      const x = d.data();
      if (x.month !== currentMonth) return;

      if (x.amount > 0) income += x.amount;
      else expense += Math.abs(x.amount);

      rows.push({ id: d.id, ...x });
    });

    // render
    $("#txBody").innerHTML = rows.map(r => `
      <tr class="border-b">
        <td class="p-2">${r.date}</td>
        <td class="p-2">${r.type}</td>
        <td class="p-2">${r.category}</td>
        <td class="p-2 ${r.amount < 0 ? 'text-red-600' : 'text-green-700'}">
          ${r.amount.toFixed(2)}
        </td>
        <td class="p-2">${r.notes ? escapeHtml(r.notes) : ""}</td>
        <td class="p-2">
          <button data-id="${r.id}" class="del px-2 py-1 text-xs bg-slate-200 rounded">Delete</button>
        </td>
      </tr>
    `).join("");

    // totals
    const net = income - expense;
    $("#totals").textContent = `Income: $${income.toFixed(2)} · Expenses: $${expense.toFixed(2)} · Net: $${net.toFixed(2)}`;

    // delete handlers
    document.querySelectorAll("button.del").forEach(btn => {
      btn.onclick = async () => {
        if (!confirm("Delete this transaction?")) return;
        await deleteDoc(doc(getFirestore(), "transactions", btn.dataset.id));
        await loadTx();
      };
    });
  }
}

// simple HTML escaper
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
