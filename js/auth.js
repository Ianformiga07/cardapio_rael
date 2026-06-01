// ============================================================
// js/auth.js
// Autenticação Firebase — login / logout / controle de sessão
//
// Coleção Firestore usada: usuarios
// Campos: { id, nome, email, perfil }   perfil: "admin" | "cliente"
//
// IMPORTANTE: este módulo é usado tanto pelo index.html
// (para verificar se usuário está autenticado) quanto pelo
// admin.html (para proteger o painel administrativo).
// ============================================================

import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── BUSCAR PERFIL DO USUÁRIO ────────────────────────────────────────────────
// Retorna o documento da coleção "usuarios" para o uid fornecido.
// Retorna null se não existir.
export async function getUserProfile(uid) {
  try {
    const snap = await getDoc(doc(db, "usuarios", uid));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (err) {
    console.error("[auth] Erro ao buscar perfil:", err);
    return null;
  }
}

// ─── LOGIN COM EMAIL/SENHA ───────────────────────────────────────────────────
// Retorna { user, perfil } em caso de sucesso.
// Lança Error em caso de falha (credenciais inválidas, sem acesso, etc.).
export async function loginAdmin(email, password) {
  // 1. Autenticar no Firebase Auth
  const cred = await signInWithEmailAndPassword(auth, email, password);

  // 2. Buscar perfil no Firestore para verificar se é admin
  const perfil = await getUserProfile(cred.user.uid);

  if (!perfil || perfil.perfil !== "admin") {
    // Usuário autenticado mas sem perfil admin → deslogar imediatamente
    await signOut(auth);
    throw new Error("Acesso negado. Apenas administradores podem acessar este painel.");
  }

  return { user: cred.user, perfil };
}

// ─── LOGOUT ──────────────────────────────────────────────────────────────────
export async function logoutAdmin() {
  await signOut(auth);
}

// ─── OBSERVADOR DE ESTADO ────────────────────────────────────────────────────
// Chama onAuthed(user, perfil) quando há sessão válida com perfil admin.
// Chama onUnauthed() quando não há sessão ou perfil não é admin.
// Retorna a função "unsubscribe" para cancelar o listener quando necessário.
export function watchAuthState(onAuthed, onUnauthed) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      onUnauthed();
      return;
    }
    const perfil = await getUserProfile(user.uid);
    if (perfil && perfil.perfil === "admin") {
      onAuthed(user, perfil);
    } else {
      onUnauthed();
    }
  });
}
