// ============================================================
// js/script-firebase-patch.js
// Patch de integração Firebase para o script.js original
//
// Este arquivo é carregado APÓS o script.js no index.html.
// Ele:
//   1. Sobrescreve saveOrderToHistory()  → salva no Firestore
//   2. Substitui o sistema de esgotado   → usa onSnapshot() do Firebase
//   3. Remove dependência de localStorage para dados principais
//   4. [NOVO] Rastreamento de pedido em tempo real para o cliente
// ============================================================

import { salvarPedido } from "./pedidos.js";
import { watchProdutos } from "./produtos.js";
import { db } from "./firebase.js";
import {
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── 1. SOBRESCREVER saveOrderToHistory() ────────────────────────────────────
window.saveOrderToHistory = async function (orderData) {
  const firestoreId = await salvarPedido(orderData);

  // Guardar o ID do Firestore para rastrear status depois
  if (firestoreId) {
    try {
      localStorage.setItem("pizzaria_ra_last_order_id", firestoreId);
      localStorage.setItem("pizzaria_ra_last_order_name", orderData.customerName || "");
    } catch (_) {}
    // Iniciar rastreamento automático
    iniciarRastreamentoPedido(firestoreId);
  }

  // Cache leve para histórico do cliente
  try {
    const CACHE_KEY = "pizzaria_ra_orders_cache";
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    cache.unshift({
      firestoreId:  firestoreId,
      id:           orderData.id || Date.now(),
      date:         orderData.date,
      customerName: orderData.customerName,
      customerPhone:orderData.customerPhone,
      items:        orderData.cartSnapshot,
      total:        orderData.total,
      orderType:    orderData.orderType,
      paymentType:  orderData.paymentType,
      address:      orderData.address,
      status:       "Pendente",
    });
    if (cache.length > 5) cache.splice(5);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (_) {}
};

// ─── 2. SUBSTITUIR loadHistory() ─────────────────────────────────────────────
window.loadHistory = function () {
  try {
    return JSON.parse(localStorage.getItem("pizzaria_ra_orders_cache") || "[]");
  } catch { return []; }
};

// ─── 3. SISTEMA DE ESGOTADO VIA FIREBASE (onSnapshot) ────────────────────────
const _produtoMap = new Map();

function applyEsgotadoFirebase(produtos) {
  _produtoMap.clear();
  produtos.forEach(p => _produtoMap.set(p.nome, p));

  document.querySelectorAll(".product-card[data-product-name]").forEach((card) => {
    const nome = card.dataset.productName;
    const prod = _produtoMap.get(nome);
    if (!prod) return;

    const isEsgotado = prod.esgotado === true;
    card.classList.toggle("esgotado", isEsgotado);

    const btn = card.querySelector(".add-td-cart-btn");
    if (btn) btn.disabled = isEsgotado;
  });
}

// ─── 4. RASTREAMENTO DE PEDIDO EM TEMPO REAL ─────────────────────────────────

const STATUS_LABELS = {
  "Pendente":          { emoji: "⏳", texto: "Aguardando confirmação", cor: "#f59e0b", progresso: 1 },
  "Preparando":        { emoji: "👨‍🍳", texto: "Sendo preparado",       cor: "#3b82f6", progresso: 2 },
  "Saiu para entrega": { emoji: "🛵", texto: "Saiu para entrega",      cor: "#8b5cf6", progresso: 3 },
  "Entregue":          { emoji: "✅", texto: "Entregue com sucesso!",  cor: "#10b981", progresso: 4 },
  "Cancelado":         { emoji: "❌", texto: "Pedido cancelado",       cor: "#ef4444", progresso: 0 },
};

let _unsubTracking = null;

function iniciarRastreamentoPedido(pedidoId) {
  // Cancelar listener anterior se existir
  if (_unsubTracking) {
    _unsubTracking();
    _unsubTracking = null;
  }

  _unsubTracking = onSnapshot(doc(db, "pedidos", pedidoId), (snap) => {
    if (!snap.exists()) return;
    const pedido = snap.data();
    atualizarBannerStatus(pedido.status || "Pendente", pedido);
  }, (err) => {
    console.error("[tracking] Erro ao rastrear pedido:", err);
  });
}

function atualizarBannerStatus(status, pedido) {
  const info = STATUS_LABELS[status] || STATUS_LABELS["Pendente"];

  // Criar ou reutilizar o banner flutuante
  let banner = document.getElementById("tracking-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "tracking-banner";
    banner.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      padding: 0;
      min-width: 300px;
      max-width: 92vw;
      overflow: hidden;
      font-family: inherit;
      cursor: pointer;
      transition: box-shadow 0.2s;
    `;
    banner.title = "Clique para ver detalhes";
    banner.onclick = () => abrirModalTracking();
    document.body.appendChild(banner);
  }

  const passos = [
    { label: "Recebido",  k: "Pendente" },
    { label: "Preparando", k: "Preparando" },
    { label: "Entrega",   k: "Saiu para entrega" },
    { label: "Entregue",  k: "Entregue" },
  ];

  // Determinar progresso
  const progressoAtual = info.progresso;
  const isCancelado = status === "Cancelado";

  const passosHtml = isCancelado
    ? `<div style="text-align:center;font-size:0.78rem;color:#ef4444;font-weight:600;padding-top:4px;">Pedido cancelado</div>`
    : passos.map((p, i) => {
        const idx = i + 1;
        const ativo = idx === progressoAtual;
        const feito = idx < progressoAtual;
        const cor = feito || ativo ? info.cor : "#d1d5db";
        return `
          <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1;">
            <div style="width:22px;height:22px;border-radius:50%;background:${cor};display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:#fff;font-weight:700;box-shadow:${ativo ? '0 0 0 3px '+info.cor+'44' : 'none'};transition:all 0.3s;">
              ${feito ? "✓" : idx}
            </div>
            <span style="font-size:0.62rem;color:${ativo ? info.cor : '#9ca3af'};font-weight:${ativo ? 700 : 400};text-align:center;line-height:1.2;">${p.label}</span>
          </div>`;
      }).join(`<div style="flex:1;height:2px;background:${progressoAtual > 1 ? info.cor : '#e5e7eb'};align-self:center;margin-bottom:14px;transition:background 0.3s;"></div>`);

  banner.innerHTML = `
    <div style="background:${info.cor};padding:10px 16px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:1.4rem;">${info.emoji}</span>
      <div>
        <div style="color:#fff;font-weight:700;font-size:0.9rem;">Seu Pedido</div>
        <div style="color:#ffffffcc;font-size:0.78rem;">${info.texto}</div>
      </div>
      <button onclick="event.stopPropagation();fecharTracking()" style="margin-left:auto;background:rgba(255,255,255,0.2);border:none;color:#fff;width:24px;height:24px;border-radius:50%;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;padding:0;line-height:1;">×</button>
    </div>
    <div style="padding:12px 16px;">
      <div style="display:flex;align-items:flex-start;gap:0;padding:0 4px;">
        ${passosHtml}
      </div>
    </div>
  `;

  // Salvar status atual no cache
  try {
    const cache = JSON.parse(localStorage.getItem("pizzaria_ra_orders_cache") || "[]");
    if (cache[0]) { cache[0].status = status; localStorage.setItem("pizzaria_ra_orders_cache", JSON.stringify(cache)); }
  } catch (_) {}

  // Notificação sonora/visual ao mudar de status
  if (status === "Saiu para entrega" || status === "Entregue") {
    banner.style.boxShadow = `0 8px 32px ${info.cor}66`;
    // Pulsação rápida
    banner.animate([
      { transform: "translateX(-50%) scale(1)" },
      { transform: "translateX(-50%) scale(1.04)" },
      { transform: "translateX(-50%) scale(1)" },
    ], { duration: 400, iterations: 2 });
  }
}

function abrirModalTracking() {
  const cache = window.loadHistory ? window.loadHistory() : [];
  const ultimo = cache[0];
  if (!ultimo) return;

  const info = STATUS_LABELS[ultimo.status] || STATUS_LABELS["Pendente"];
  const itensTxt = (ultimo.items || []).map(i => `${i.quantity || 1}× ${i.name || i.nome}`).join(", ");
  const totalFmt = (ultimo.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  let modal = document.getElementById("tracking-modal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "tracking-modal";
    modal.style.cssText = `
      position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);
      display:flex;align-items:flex-end;justify-content:center;
    `;
    modal.onclick = (e) => { if (e.target === modal) fecharModalTracking(); };
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div style="background:#fff;border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:480px;max-height:80vh;overflow-y:auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <h3 style="margin:0;font-size:1.1rem;font-weight:800;">🔍 Acompanhar Pedido</h3>
        <button onclick="fecharModalTracking()" style="background:#f3f4f6;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;">×</button>
      </div>
      <div style="background:${info.cor}15;border:1.5px solid ${info.cor}44;border-radius:12px;padding:14px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:2rem;">${info.emoji}</span>
        <div>
          <div style="font-weight:800;color:${info.cor};font-size:1rem;">${info.texto}</div>
          <div style="font-size:0.8rem;color:#6b7280;margin-top:2px;">Olá, ${ultimo.customerName || "Cliente"}!</div>
        </div>
      </div>
      <div style="background:#f9fafb;border-radius:10px;padding:12px 14px;font-size:0.83rem;color:#374151;">
        <div style="font-weight:700;margin-bottom:6px;">📋 Resumo do pedido:</div>
        <div>${itensTxt}</div>
        <div style="margin-top:8px;font-weight:700;color:#111;">${totalFmt}</div>
      </div>
      <p style="font-size:0.75rem;color:#9ca3af;margin:12px 0 0;text-align:center;">
        Esta página atualiza automaticamente quando o status mudar.
      </p>
    </div>
  `;
  modal.style.display = "flex";
}

window.fecharModalTracking = function() {
  const m = document.getElementById("tracking-modal");
  if (m) m.style.display = "none";
};
window.fecharTracking = function() {
  const b = document.getElementById("tracking-banner");
  if (b) b.remove();
  if (_unsubTracking) { _unsubTracking(); _unsubTracking = null; }
};

// ─── INICIAR ao carregar DOM ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Esgotado via Firebase
  watchProdutos((produtos) => {
    applyEsgotadoFirebase(produtos);
  });

  // Retomar rastreamento se há pedido recente em cache
  try {
    const lastId = localStorage.getItem("pizzaria_ra_last_order_id");
    const cache  = JSON.parse(localStorage.getItem("pizzaria_ra_orders_cache") || "[]");
    // Só retomar se o último pedido não está entregue/cancelado
    if (lastId && cache[0] && !["Entregue","Cancelado"].includes(cache[0].status)) {
      iniciarRastreamentoPedido(lastId);
    }
  } catch (_) {}
});

// ─── 5. NO-OP para applySoldOut legado ───────────────────────────────────────
window.applySoldOut = function () {
  // No-op: esgotado agora vem do Firebase via applyEsgotadoFirebase()
};
