// ============================================================
// js/firebase.js
// Inicialização do Firebase — compartilhado por todos os módulos
//
// ⚠️  ANTES DE USAR: substitua os valores abaixo pelas suas
//     credenciais do Firebase Console
//     (Project Settings → Your apps → SDK setup)
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ─── SUAS CREDENCIAIS FIREBASE ────────────────────────────────────────────────
// Obtenha em: https://console.firebase.google.com
// → Configurações do projeto → Seus apps → Web → Configuração do SDK
const firebaseConfig = {
  apiKey: "AIzaSyBm9XjET1VETadadyq9MOSij1f4ND_4SI4",
  authDomain: "pizzaria-rael.firebaseapp.com",
  projectId: "pizzaria-rael",
  storageBucket: "pizzaria-rael.firebasestorage.app",
  messagingSenderId: "737517289116",
  appId: "1:737517289116:web:1a49ac56da1b21e25b3759",
  measurementId: "G-ZPVV5CCPWB"
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);

/** Instância do Firestore — use em todos os módulos */
export const db   = getFirestore(app);

/** Instância do Auth — use em todos os módulos */
export const auth = getAuth(app);
