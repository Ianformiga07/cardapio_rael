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

import { watchProdutos } from "./produtos.js";
import { db } from "./firebase.js";
import {
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── 1. ESCUTAR EVENTO DO script.js (módulo) ─────────────────────────────────
window.addEventListener("pizzaria:pedido_salvo", (e) => {
  const { firestoreId } = e.detail || {};
  if (firestoreId) {
    iniciarRastreamentoPedido(firestoreId);
    // Mostrar dot no botão Meus Pedidos
    const dot = document.getElementById("pedido-ativo-dot");
    if (dot) dot.style.display = "inline-block";
  }
});

// ─── 2. loadHistory() ────────────────────────────────────────────────────────
window.loadHistory = function () {
  try {
    return JSON.parse(localStorage.getItem("pizzaria_ra_orders_cache") || "[]");
  } catch {
    return [];
  }
};

// ─── 3. SISTEMA DE ESGOTADO VIA FIREBASE (onSnapshot) ────────────────────────
const _produtoMap = new Map();

function applyEsgotadoFirebase(produtos) {
  _produtoMap.clear();
  // Index by exact name AND by normalized name (lowercase, trimmed) for resilient matching
  produtos.forEach((p) => {
    _produtoMap.set(p.nome, p);
    _produtoMap.set((p.nome || "").toLowerCase().trim(), p);
  });

  document
    .querySelectorAll(".product-card[data-product-name]")
    .forEach((card) => {
      const nome = card.dataset.productName;
      // Try exact match first, then normalized
      const prod =
        _produtoMap.get(nome) ||
        _produtoMap.get((nome || "").toLowerCase().trim());

      // If product not found in Firestore, leave the card as-is (don't hide it)
      if (!prod) return;

      const isEsgotado = prod.esgotado === true;
      card.classList.toggle("esgotado", isEsgotado);

      // Disable ALL add-to-cart buttons (both class names used in the project)
      card
        .querySelectorAll(".add-td-cart-btn, .add-cart-btn")
        .forEach((btn) => {
          btn.disabled = isEsgotado;
        });
    });
}

// ─── 4. RASTREAMENTO DE PEDIDO EM TEMPO REAL ─────────────────────────────────

const STATUS_LABELS = {
  Pendente: {
    emoji: "⏳",
    texto: "Aguardando confirmação",
    subtexto: "Seu pedido foi recebido e será confirmado em breve",
    cor: "#f59e0b",
    progresso: 1,
  },
  Preparando: {
    emoji: "👨‍🍳",
    texto: "Em produção na cozinha!",
    subtexto: "Nossos cozinheiros já estão preparando seu pedido",
    cor: "#3b82f6",
    progresso: 2,
  },
  "Saiu para entrega": {
    emoji: "🛵",
    texto: "Saiu para entrega!",
    subtexto: "Seu pedido está a caminho. Fique de olho!",
    cor: "#8b5cf6",
    progresso: 3,
  },
  Entregue: {
    emoji: "🎉",
    texto: "Pedido entregue!",
    subtexto: "Bom apetite! Obrigado pela preferência 😊",
    cor: "#10b981",
    progresso: 4,
  },
  Cancelado: {
    emoji: "❌",
    texto: "Pedido cancelado",
    subtexto: "Entre em contato conosco para mais informações",
    cor: "#ef4444",
    progresso: 0,
  },
};

let _unsubTracking = null;

function iniciarRastreamentoPedido(pedidoId) {
  // Cancelar listener anterior se existir
  if (_unsubTracking) {
    _unsubTracking();
    _unsubTracking = null;
  }

  _unsubTracking = onSnapshot(
    doc(db, "pedidos", pedidoId),
    (snap) => {
      if (!snap.exists()) return;
      const pedido = snap.data();
      atualizarBannerStatus(pedido.status || "Pendente", pedido);
    },
    (err) => {
      console.error("[tracking] Erro ao rastrear pedido:", err);
    },
  );
}

function atualizarBannerStatus(status, pedido) {
  // Atualizar cache local com novo status
  try {
    const cache = JSON.parse(
      localStorage.getItem("pizzaria_ra_orders_cache") || "[]",
    );
    if (cache[0]) {
      cache[0].status = status;
      localStorage.setItem("pizzaria_ra_orders_cache", JSON.stringify(cache));
    }
  } catch (_) {}

  // Mostrar/esconder indicador no botão "Meus Pedidos"
  const dot = document.getElementById("pedido-ativo-dot");
  if (dot) {
    const isFinal = status === "Entregue" || status === "Cancelado";
    dot.style.display = isFinal ? "none" : "inline-block";
  }

  // Se o modal de pedidos estiver aberto, re-renderizar para mostrar novo status
  const historyModal = document.getElementById("history-modal");
  if (historyModal && historyModal.classList.contains("active")) {
    if (typeof window._renderHistoryList === "function") {
      window._renderHistoryList();
    }
  }

  // Notificação visual: mudar cor do botão brevemente quando status importante muda
  const btn = document.getElementById("btn-meus-pedidos");
  if (
    btn &&
    (status === "Preparando" ||
      status === "Saiu para entrega" ||
      status === "Entregue")
  ) {
    const info = STATUS_LABELS[status];
    btn.style.background = info ? info.cor : "";
    btn.style.color = "#fff";
    btn.style.transition = "all 0.3s";
    setTimeout(() => {
      btn.style.background = "";
      btn.style.color = "";
    }, 4000);
  }

  // Parar listener quando status é final
  if (status === "Entregue" || status === "Cancelado") {
    if (_unsubTracking) {
      _unsubTracking();
      _unsubTracking = null;
    }
  }
}

// ─── INICIAR ao carregar DOM ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Esgotado via Firebase
  watchProdutos((produtos) => {
    applyEsgotadoFirebase(produtos);
  });

  // Retomar rastreamento se há pedido recente em cache
  try {
    const lastId = localStorage.getItem("pizzaria_ra_last_order_id");
    const cache = JSON.parse(
      localStorage.getItem("pizzaria_ra_orders_cache") || "[]",
    );
    // Só retomar se o último pedido não está entregue/cancelado
    if (
      lastId &&
      cache[0] &&
      !["Entregue", "Cancelado"].includes(cache[0].status)
    ) {
      iniciarRastreamentoPedido(lastId);
      // Mostrar dot indicador no botão
      const dot = document.getElementById("pedido-ativo-dot");
      if (dot) dot.style.display = "inline-block";
    }
  } catch (_) {}
});

// ─── 5. NO-OP para applySoldOut legado ───────────────────────────────────────
window.applySoldOut = function () {
  // No-op: esgotado agora vem do Firebase via applyEsgotadoFirebase()
};
