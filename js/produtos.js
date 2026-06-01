// ============================================================
// js/produtos.js
// Módulo de Produtos — leitura em tempo real via onSnapshot()
//
// Coleção Firestore: produtos
// Campos:
//   id          (string, gerado pelo Firestore)
//   nome        (string)
//   descricao   (string)
//   preco       (number)
//   imagem      (string, caminho relativo ex: "assets/moda.jpeg")
//   categoria   (string, ex: "pizza" | "hamburguer" | "bebida")
//   estoque     (number)   — 0 → esgotado = true automaticamente
//   esgotado    (boolean)
//   ativo       (boolean)  — false = produto oculto no cardápio
//   criadoEm    (Timestamp)
// ============================================================

import { db } from "./firebase.js";
import {
  collection,
  doc,
  onSnapshot,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Referência à coleção
const produtosRef = collection(db, "produtos");

// ─── LISTENER EM TEMPO REAL (index.html) ─────────────────────────────────────
// Dispara callback sempre que qualquer produto mudar no Firestore.
// Retorna função unsubscribe — chame para parar de ouvir.
//
// CORREÇÃO: removido orderBy composto (requer índice). Ordenação feita no JS.
export function watchProdutos(callback) {
  const q = query(
    produtosRef,
    where("ativo", "==", true)
  );

  return onSnapshot(q, (snap) => {
    const produtos = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const catA = (a.categoria || "").localeCompare(b.categoria || "", "pt-BR");
        if (catA !== 0) return catA;
        return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
      });
    callback(produtos);
  }, (err) => {
    console.error("[produtos] Erro no listener:", err);
  });
}

// ─── LISTENER EM TEMPO REAL (admin.html) ─────────────────────────────────────
// Traz TODOS os produtos (ativos e inativos) para o admin gerenciar.
// CORREÇÃO: removido orderBy composto (requer índice). Ordenação feita no JS.
export function watchProdutosAdmin(callback) {
  return onSnapshot(produtosRef, (snap) => {
    const produtos = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const catA = (a.categoria || "").localeCompare(b.categoria || "", "pt-BR");
        if (catA !== 0) return catA;
        return (a.nome || "").localeCompare(b.nome || "", "pt-BR");
      });
    callback(produtos);
  }, (err) => {
    console.error("[produtos] Erro no listener admin:", err);
  });
}

// ─── MARCAR / DESMARCAR ESGOTADO ─────────────────────────────────────────────
export async function setEsgotado(id, esgotado) {
  await updateDoc(doc(db, "produtos", id), { esgotado });
}

// ─── ALTERAR ESTOQUE ─────────────────────────────────────────────────────────
export async function setEstoque(id, estoque) {
  const novoEstoque = Math.max(0, estoque);
  await updateDoc(doc(db, "produtos", id), {
    estoque: novoEstoque,
    esgotado: novoEstoque === 0,
  });
}

// ─── CADASTRAR PRODUTO ───────────────────────────────────────────────────────
export async function addProduto(dados) {
  await addDoc(produtosRef, {
    ...dados,
    esgotado: (dados.estoque ?? 1) === 0,
    ativo: dados.ativo ?? true,
    criadoEm: serverTimestamp(),
  });
}

// ─── EDITAR PRODUTO ──────────────────────────────────────────────────────────
export async function editProduto(id, dados) {
  const update = { ...dados };
  if (typeof dados.estoque === "number") {
    update.esgotado = dados.estoque === 0;
  }
  await updateDoc(doc(db, "produtos", id), update);
}

// ─── EXCLUIR PRODUTO ─────────────────────────────────────────────────────────
export async function deleteProduto(id) {
  await deleteDoc(doc(db, "produtos", id));
}

// ─── REATIVAR PRODUTO ────────────────────────────────────────────────────────
export async function reativarProduto(id) {
  await updateDoc(doc(db, "produtos", id), { ativo: true });
}

// ─── DESATIVAR PRODUTO ───────────────────────────────────────────────────────
export async function desativarProduto(id) {
  await updateDoc(doc(db, "produtos", id), { ativo: false });
}
