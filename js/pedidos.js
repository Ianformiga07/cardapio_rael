// ============================================================
// js/pedidos.js
// Módulo de Pedidos — salvar e listar pedidos no Firestore
//
// Coleção Firestore: pedidos
// Campos:
//   id            (string, gerado pelo Firestore)
//   clienteNome   (string)
//   telefone      (string)
//   endereco      (string)
//   itens         (array de objetos do carrinho)
//   subtotal      (number)
//   taxaEntrega   (number, 0 por padrão)
//   total         (number)
//   status        (string) — ver STATUS_PEDIDO abaixo
//   tipoPedido    (string) "delivery" | "retirada"
//   pagamento     (string) "pix" | "cartao" | "dinheiro"
//   troco         (number)
//   dataPedido    (Timestamp)
//   printLink     (string, URL da comanda de impressão)
// ============================================================

import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
  orderBy,
  where,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Status possíveis de um pedido
export const STATUS_PEDIDO = {
  PENDENTE:   "Pendente",
  PREPARANDO: "Preparando",
  SAIU:       "Saiu para entrega",
  ENTREGUE:   "Entregue",
  CANCELADO:  "Cancelado",
};

const pedidosRef = collection(db, "pedidos");

// ─── SALVAR PEDIDO ───────────────────────────────────────────────────────────
// Chamado em sendOrderToWhatsApp() e confirmPIXPayment() do script.js
// Retorna o ID do documento criado no Firestore.
export async function salvarPedido(orderData) {
  try {
    const docRef = await addDoc(pedidosRef, {
      clienteNome:  orderData.customerName,
      telefone:     orderData.customerPhone,
      endereco:     orderData.address || "",
      itens:        orderData.cartSnapshot,
      subtotal:     orderData.total,
      taxaEntrega:  0,
      total:        orderData.total,
      status:       STATUS_PEDIDO.PENDENTE,
      tipoPedido:   orderData.orderType,
      pagamento:    orderData.paymentType,
      troco:        orderData.troco || 0,
      dataPedido:   Timestamp.now(),
      printLink:    orderData.printLink || "",
    });
    console.log("[pedidos] Pedido salvo:", docRef.id);
    return docRef.id;
  } catch (err) {
    console.error("[pedidos] Erro ao salvar pedido:", err);
    // Não bloqueia o fluxo do WhatsApp — falha silenciosa com log
    return null;
  }
}

// ─── ATUALIZAR STATUS ────────────────────────────────────────────────────────
// Chamado pelo admin para alterar o status de um pedido.
export async function atualizarStatus(id, novoStatus) {
  await updateDoc(doc(db, "pedidos", id), { status: novoStatus });
}

// ─── LISTENER PEDIDOS DO DIA (admin) ─────────────────────────────────────────
// Retorna onSnapshot para todos os pedidos do dia informado (Date JS).
// Chama callback com array de pedidos ordenados por dataPedido desc.
export function watchPedidosDia(date, callback) {
  // Início e fim do dia (UTC)
  const inicio = new Date(date);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(date);
  fim.setHours(23, 59, 59, 999);

  const q = query(
    pedidosRef,
    where("dataPedido", ">=", Timestamp.fromDate(inicio)),
    where("dataPedido", "<=", Timestamp.fromDate(fim)),
    orderBy("dataPedido", "desc")
  );

  return onSnapshot(q, (snap) => {
    const pedidos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(pedidos);
  }, (err) => {
    console.error("[pedidos] Erro no listener do dia:", err);
  });
}

// ─── LISTENER PEDIDOS DO MÊS (relatórios) ────────────────────────────────────
// Traz todos os pedidos de um mês/ano para o módulo de relatórios.
export function watchPedidosMes(year, month, callback) {
  const inicio = new Date(year, month, 1, 0, 0, 0);
  const fim    = new Date(year, month + 1, 0, 23, 59, 59);

  const q = query(
    pedidosRef,
    where("dataPedido", ">=", Timestamp.fromDate(inicio)),
    where("dataPedido", "<=", Timestamp.fromDate(fim)),
    orderBy("dataPedido", "desc")
  );

  return onSnapshot(q, (snap) => {
    const pedidos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(pedidos);
  }, (err) => {
    console.error("[pedidos] Erro no listener mensal:", err);
  });
}
