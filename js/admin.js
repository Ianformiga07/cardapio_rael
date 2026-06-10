// ============================================================
// js/admin.js
// Lógica completa do painel administrativo
//
// Módulos de UI cobertos:
//   • Dashboard (visão geral)
//   • Produtos (listar / cadastrar / editar / excluir / estoque / esgotado)
//   • Pedidos  (listar / detalhar / alterar status)
//   • Relatórios (faturamento diário + mensal + ranking)
//
// Este arquivo é importado APENAS pelo admin.html
// ============================================================

import { loginAdmin, logoutAdmin, watchAuthState } from "./auth.js";
import {
  watchProdutosAdmin,
  setEsgotado,
  setEstoque,
  addProduto,
  editProduto,
  deleteProduto,
  reativarProduto,
  desativarProduto,
} from "./produtos.js";
import {
  watchPedidosDia,
  watchPedidosMes,
  atualizarStatus,
  STATUS_PEDIDO,
} from "./pedidos.js";
import {
  calcularResumo,
  calcularRanking,
  calcularFaturamentoDiario,
  calcularQtdPorProduto,
  produtoMaisVendido,
} from "./relatorios.js";

// ─── ESTADO LOCAL ─────────────────────────────────────────────────────────────
let _produtos = []; // cache dos produtos (atualizado pelo onSnapshot)
let _pedidosDia = []; // cache dos pedidos do dia selecionado
let _pedidosMes = []; // cache dos pedidos do mês selecionado

// Funções de cancelamento dos listeners ativos (evita memory leak ao trocar tabs)
let _unsubProdutos = null;
let _unsubPedidos = null;
let _unsubPedMes = null;

// ─── BOOTSTRAP ───────────────────────────────────────────────────────────────
// Chamado quando admin.html carrega. Observa estado do auth e exibe tela
// de login ou o app conforme sessão.
export function initAdmin() {
  watchAuthState(
    (user, perfil) => {
      // Usuário autenticado com perfil admin → exibir painel
      showApp(user, perfil);
    },
    () => {
      // Sem sessão / sem permissão → exibir tela de login
      showLogin();
    },
  );

  // Configurar formulário de login
  document.getElementById("login-pw")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

// ─── LOGIN / LOGOUT ──────────────────────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pw = document.getElementById("login-pw").value;
  const errEl = document.getElementById("login-err");
  const btn = document.getElementById("login-btn");

  if (!email || !pw) {
    errEl.textContent = "Preencha e-mail e senha.";
    errEl.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
  errEl.style.display = "none";

  try {
    await loginAdmin(email, pw);
    // watchAuthState cuida de exibir o app após login bem-sucedido
  } catch (err) {
    errEl.textContent = err.message || "Erro ao fazer login.";
    errEl.style.display = "block";
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-lock"></i> Entrar';
  }
}

export async function doLogout() {
  // Cancelar listeners ativos antes de sair
  _unsubProdutos?.();
  _unsubPedidos?.();
  _unsubPedMes?.();
  await logoutAdmin();
  showLogin();
}

// ─── CONTROLE DE TELAS ───────────────────────────────────────────────────────
function showLogin() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("admin-app").style.display = "none";
}

function showApp(user, perfil) {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("admin-app").style.display = "block";

  // Exibir nome do usuário no header
  const nameEl = document.getElementById("admin-user-name");
  if (nameEl) nameEl.textContent = perfil.nome || user.email;

  // Iniciar tab padrão: Dashboard
  showTab("tab-dashboard");
  startDashboard();
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
export function showTab(id) {
  document
    .querySelectorAll(".tab-panel")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));

  document.getElementById(id)?.classList.add("active");
  document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");

  // Iniciar dados da tab selecionada
  if (id === "tab-dashboard") startDashboard();
  if (id === "tab-produtos") startProdutos();
  if (id === "tab-pedidos") startPedidos();
  if (id === "tab-relatorios") startRelatorios();
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════════
function startDashboard() {
  // Pedidos de hoje
  _unsubPedidos?.();
  _unsubPedidos = watchPedidosDia(new Date(), (pedidos) => {
    _pedidosDia = pedidos;
    renderDashboard(pedidos);
  });

  // Produtos (para contar esgotados)
  _unsubProdutos?.();
  _unsubProdutos = watchProdutosAdmin((produtos) => {
    _produtos = produtos;
    const esgotados = produtos.filter((p) => p.esgotado).length;
    const el = document.getElementById("dash-esgotados");
    if (el) el.textContent = esgotados;
  });
}

function renderDashboard(pedidos) {
  const r = calcularResumo(pedidos);
  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  setEl("dash-total", fmt(r.total));
  setEl("dash-pedidos", r.quantidade);
  setEl("dash-ticket", fmt(r.ticketMedio));
  setEl("dash-mais-vendido", produtoMaisVendido(pedidos));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUTOS
// ═══════════════════════════════════════════════════════════════════════════════
function startProdutos() {
  _unsubProdutos?.();
  _unsubProdutos = watchProdutosAdmin((produtos) => {
    _produtos = produtos;
    renderTabelaProdutos(produtos);
  });
}

function renderTabelaProdutos(produtos) {
  const tbody = document.getElementById("produtos-tbody");
  if (!tbody) return;

  if (produtos.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:#9ca3af;">
      Nenhum produto cadastrado. Clique em "Novo Produto" para começar.
    </td></tr>`;
    return;
  }

  tbody.innerHTML = produtos
    .map((p) => {
      const statusBadge = p.esgotado
        ? `<span class="badge badge-red">Esgotado</span>`
        : p.ativo
          ? `<span class="badge badge-green">Disponível</span>`
          : `<span class="badge badge-gray">Inativo</span>`;

      const preco = (p.preco || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });

      return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:0.65rem;min-width:0;">
            <img src="${p.imagem || "assets/logo1.png"}" alt="${p.nome}" class="prod-thumb" style="flex-shrink:0;">
            <span class="prod-nome" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">${p.nome}</span>
          </div>
        </td>
        <td>${p.categoria || "—"}</td>
        <td>${preco}</td>
        <td>
          <input type="number" min="0" value="${p.estoque ?? 0}"
            class="estoque-input"
            onchange="window._adminSetEstoque('${p.id}', this.value)"
            title="Alterar estoque">
        </td>
        <td>${statusBadge}</td>
        <td class="td-actions">
          <button class="btn-icon" title="Editar" onclick="window._adminEditarProduto('${p.id}')">
            <i class="fa fa-pen"></i>
          </button>
          <button class="btn-icon btn-icon-red" title="${p.esgotado ? "Reativar" : "Marcar Esgotado"}"
            onclick="window._adminToggleEsgotado('${p.id}', ${p.esgotado})">
            <i class="fa fa-${p.esgotado ? "check" : "ban"}"></i>
          </button>
          <button class="btn-icon btn-icon-gray" title="${p.ativo ? "Desativar" : "Reativar"}"
            onclick="window._adminToggleAtivo('${p.id}', ${p.ativo})">
            <i class="fa fa-${p.ativo ? "eye-slash" : "eye"}"></i>
          </button>
          <button class="btn-icon btn-icon-danger" title="Excluir"
            onclick="window._adminExcluir('${p.id}', '${p.nome.replace(/'/g, "\\'")}')">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
    })
    .join("");
}

// Expor funções chamadas via onclick no HTML gerado
window._adminSetEstoque = async (id, val) => {
  await setEstoque(id, parseInt(val) || 0);
};
window._adminToggleEsgotado = async (id, atual) => {
  await setEsgotado(id, !atual);
};
window._adminToggleAtivo = async (id, atual) => {
  if (atual) await desativarProduto(id);
  else await reativarProduto(id);
};
window._adminExcluir = async (id, nome) => {
  if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
  await deleteProduto(id);
};
window._adminEditarProduto = (id) => {
  const p = _produtos.find((x) => x.id === id);
  if (!p) return;
  abrirModalProduto(p);
};

// Mostrar/ocultar campos específicos de pizza no modal
function toggleCampoPizza() {
  const cat = document.getElementById("prod-cat")?.value;
  const secPizza = document.getElementById("modal-pizza-precos");
  if (secPizza) secPizza.style.display = cat === "pizza" ? "" : "none";
}
window.toggleCampoPizza = toggleCampoPizza;

// ─── MODAL PRODUTO (cadastro / edição) ───────────────────────────────────────
export function abrirModalProduto(produto = null) {
  const modal = document.getElementById("modal-produto");
  if (!modal) return;

  const titulo = document.getElementById("modal-produto-titulo");
  titulo.textContent = produto ? "Editar Produto" : "Novo Produto";

  // Preencher campos
  document.getElementById("prod-id").value = produto?.id || "";
  document.getElementById("prod-nome").value = produto?.nome || "";
  document.getElementById("prod-desc").value = produto?.descricao || "";
  document.getElementById("prod-preco").value = produto?.preco || "";
  document.getElementById("prod-imagem").value = produto?.imagem || "";
  document.getElementById("prod-cat").value = produto?.categoria || "pizza";
  document.getElementById("prod-estoque").value = produto?.estoque ?? 99;
  document.getElementById("prod-ativo").checked = produto?.ativo ?? true;
  document.getElementById("prod-badge").value = produto?.badge || "";

  // Campos de preço por tamanho (pizza)
  const precos = produto?.precos || {};
  document.getElementById("prod-preco-p").value = precos.P || "";
  document.getElementById("prod-preco-m").value = precos.M || "";
  document.getElementById("prod-preco-g").value = precos.G || "";

  // Mostrar/ocultar campos de pizza
  toggleCampoPizza();

  modal.classList.add("active");
}

export function fecharModalProduto() {
  document.getElementById("modal-produto")?.classList.remove("active");
}

export async function salvarProduto() {
  const id = document.getElementById("prod-id").value;
  const categoria = document.getElementById("prod-cat").value;

  const dados = {
    nome: document.getElementById("prod-nome").value.trim(),
    descricao: document.getElementById("prod-desc").value.trim(),
    preco: parseFloat(document.getElementById("prod-preco").value) || 0,
    imagem: document.getElementById("prod-imagem").value.trim(),
    categoria,
    estoque: parseInt(document.getElementById("prod-estoque").value) || 0,
    ativo: document.getElementById("prod-ativo").checked,
    badge: document.getElementById("prod-badge").value.trim(),
  };

  // Preços por tamanho (só para pizza)
  if (categoria === "pizza") {
    const p = parseFloat(document.getElementById("prod-preco-p").value) || 0;
    const m = parseFloat(document.getElementById("prod-preco-m").value) || 0;
    const g = parseFloat(document.getElementById("prod-preco-g").value) || 0;
    if (p || m || g) {
      dados.precos = { P: p, M: m, G: g };
    }
  }

  if (!dados.nome) {
    alert("Informe o nome do produto.");
    return;
  }

  const btn = document.getElementById("btn-salvar-produto");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    if (id) await editProduto(id, dados);
    else await addProduto(dados);
    fecharModalProduto();
  } catch (err) {
    alert("Erro ao salvar: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Salvar";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PEDIDOS
// ═══════════════════════════════════════════════════════════════════════════════
function startPedidos() {
  const dateInput = document.getElementById("pedidos-date");
  if (!dateInput) return;

  // Iniciar com data de hoje
  if (!dateInput.value) dateInput.value = new Date().toISOString().slice(0, 10);

  carregarPedidosDia();
}

export function carregarPedidosDia() {
  const dateInput = document.getElementById("pedidos-date");
  const date = dateInput?.value
    ? new Date(dateInput.value + "T12:00:00")
    : new Date();

  _unsubPedidos?.();
  _unsubPedidos = watchPedidosDia(date, (pedidos) => {
    _pedidosDia = pedidos;
    renderTabelaPedidos(pedidos);
  });
}

function renderTabelaPedidos(pedidos) {
  const container = document.getElementById("pedidos-lista");
  if (!container) return;

  if (pedidos.length === 0) {
    container.innerHTML = `<div class="empty-state">
      <i class="fas fa-receipt"></i>
      <p>Nenhum pedido nesta data</p>
      <small>Os pedidos aparecerão aqui em tempo real</small>
    </div>`;
    return;
  }

  const payLabels = {
    pix: '<i class="fas fa-qrcode"></i> Pix',
    cartao: '<i class="fas fa-credit-card"></i> Cartão',
    dinheiro: '<i class="fas fa-money-bill-wave"></i> Dinheiro',
  };
  const typeLabels = {
    delivery: '<i class="fas fa-motorcycle"></i> Delivery',
    retirada: '<i class="fas fa-store"></i> Retirada',
  };

  container.innerHTML = pedidos
    .map((p) => {
      const ts = p.dataPedido?.toDate
        ? p.dataPedido.toDate()
        : new Date(p.dataPedido);
      const dataStr = ts.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      const itensHtml = (p.itens || [])
        .map((i) => `${i.quantity || 1}× ${i.name || i.nome}`)
        .join(", ");
      const payClass = p.pagamento || "pix";
      const typeClass = p.tipoPedido || "delivery";

      const statusOpts = Object.values(STATUS_PEDIDO)
        .map(
          (s) =>
            `<option value="${s}" ${p.status === s ? "selected" : ""}>${s}</option>`,
        )
        .join("");

      return `
      <div class="order-card">
        <div class="order-card-header">
          <div>
            <span class="order-customer">${p.clienteNome || "Cliente"}</span>
            <span style="font-size:0.75rem;color:#6b7280;margin-left:0.5rem;">${dataStr}</span>
          </div>
          <span class="order-total">${(p.total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
        </div>
        <div class="order-date">
          <i class="fas fa-phone-alt"></i> ${p.telefone || "—"}
          ${p.endereco ? `&nbsp;·&nbsp;<i class="fas fa-map-marker-alt"></i> ${p.endereco}` : ""}
        </div>
        <div class="order-items" style="margin:0.4rem 0;">${itensHtml}</div>
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-top:0.5rem;">
          <span class="badge-sm ${payClass}">${payLabels[payClass] || payClass}</span>
          <span class="badge-sm ${typeClass}">${typeLabels[typeClass] || typeClass}</span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:0.5rem;">
            <button class="btn-icon btn-icon-info" title="Ver Detalhes"
              onclick="window._adminVerDetalhes('${p.id}')">
              <i class="fa fa-list-alt"></i>
            </button>
            <button class="btn-icon" title="Imprimir Comanda"
              onclick="window._adminImprimirComanda('${p.id}')">
              <i class="fa fa-print"></i>
            </button>
            <label style="font-size:0.75rem;font-weight:700;">Status:</label>
            <select class="status-select" onchange="window._adminSetStatus('${p.id}', this.value)">
              ${statusOpts}
            </select>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
}

window._adminSetStatus = async (id, novoStatus) => {
  await atualizarStatus(id, novoStatus);
};

window._adminVerDetalhes = (id) => {
  const p = _pedidosDia.find((x) => x.id === id);
  if (!p) return;

  const sizeLabels = { P: "Pequena", M: "Média", G: "Grande" };
  const payLabels = { pix: "Pix", cartao: "Cartão", dinheiro: "Dinheiro" };
  const payIcons = {
    pix: "fa-qrcode",
    cartao: "fa-credit-card",
    dinheiro: "fa-money-bill-wave",
  };
  const typeLabels = { delivery: "Delivery", retirada: "Retirada" };
  const typeIcons = { delivery: "fa-motorcycle", retirada: "fa-store" };

  const ts = p.dataPedido?.toDate
    ? p.dataPedido.toDate()
    : new Date(p.dataPedido);
  const dataStr = ts.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const itensHTML = (p.itens || [])
    .map((item) => {
      const nome = item.name || item.nome || "Item";
      const qty = item.quantity || item.quantidade || 1;
      const size = item.pizzaSize || item.size || item.tamanho || "";
      const sizeLabel = sizeLabels[size] || size;
      const secondFlavor = item.secondFlavor || item.metade || "";
      const extras = item.extras || [];
      const obs = item.obs || "";
      const hasDetails = sizeLabel || secondFlavor || extras.length > 0 || obs;

      let inner = `
      <div class="dmt-item-head">
        <span class="dmt-qty">${qty}×</span>
        <span class="dmt-nome">${nome}</span>
        ${sizeLabel ? `<span class="dmt-size-badge">${sizeLabel}</span>` : ""}
      </div>`;

      if (secondFlavor) {
        inner += `<div class="dmt-detalhe dmt-metade"><i class="fa fa-pizza-slice"></i> Metade 2: <strong>${secondFlavor}</strong></div>`;
      }
      if (extras.length > 0) {
        extras.forEach((e) => {
          const label =
            typeof e === "object" ? e.label || e.name || "" : String(e);
          if (label.trim())
            inner += `<div class="dmt-detalhe dmt-extra"><i class="fa fa-plus-circle"></i> ${label}</div>`;
        });
      }
      if (obs) {
        inner += `<div class="dmt-detalhe dmt-obs"><i class="fa fa-exclamation-triangle"></i> ${obs.toUpperCase()}</div>`;
      }

      return `<div class="dmt-item ${hasDetails ? "dmt-item--details" : ""}">${inner}</div>`;
    })
    .join("");

  const endPart = p.endereco
    ? `<div class="dmt-info-row"><span class="dmt-label"><i class="fa fa-map-marker-alt"></i> Endereço</span><span class="dmt-value">${p.endereco}</span></div>`
    : "";
  const trocoPart =
    p.pagamento === "dinheiro" && p.troco && Number(p.troco) > 0
      ? (() => {
          const valorPago = Number(p.troco);
          const trocoDevolver = Math.max(0, valorPago - (p.total || 0));
          return `<div class="dmt-info-row"><span class="dmt-label"><i class="fa fa-coins"></i> Paga com</span><span class="dmt-value">R$ ${valorPago.toFixed(2)}</span></div>
          <div class="dmt-info-row"><span class="dmt-label"><i class="fa fa-hand-holding-usd"></i> Troco a devolver</span><span class="dmt-value" style="color:#16a34a;font-weight:800;">R$ ${trocoDevolver.toFixed(2)}</span></div>`;
        })()
      : "";

  const totalFmt = (p.total || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const pid = p.id;

  const modalHTML = `
  <div id="modal-detalhes" class="modal-overlay active" onclick="if(event.target===this) window._adminFecharDetalhes()">
    <div class="modal-box dmt-box">

      <!-- HEADER -->
      <div class="modal-head">
        <div>
          <div class="modal-title">Detalhes do Pedido</div>
          <div class="modal-subtitle">${p.clienteNome || "—"} · ${dataStr}</div>
        </div>
        <button class="modal-close" onclick="window._adminFecharDetalhes()"><i class="fa fa-times"></i></button>
      </div>

      <!-- BODY -->
      <div class="modal-body" style="padding-top:1.25rem;">

        <!-- INFO GRID -->
        <div class="dmt-info-grid">
          <div class="dmt-info-row">
            <span class="dmt-label"><i class="fa fa-user"></i> Cliente</span>
            <span class="dmt-value dmt-value--strong">${p.clienteNome || "—"}</span>
          </div>
          <div class="dmt-info-row">
            <span class="dmt-label"><i class="fa fa-phone-alt"></i> Telefone</span>
            <span class="dmt-value">${p.telefone || "—"}</span>
          </div>
          <div class="dmt-info-row">
            <span class="dmt-label"><i class="fa fa-clock"></i> Data/Hora</span>
            <span class="dmt-value">${dataStr}</span>
          </div>
          <div class="dmt-info-row">
            <span class="dmt-label"><i class="fa ${payIcons[p.pagamento] || "fa-money-bill"}"></i> Pagamento</span>
            <span class="dmt-value">
              <span class="badge-sm ${p.pagamento || "pix"}">${payLabels[p.pagamento] || p.pagamento || "—"}</span>
            </span>
          </div>
          <div class="dmt-info-row">
            <span class="dmt-label"><i class="fa ${typeIcons[p.tipoPedido] || "fa-box"}"></i> Tipo</span>
            <span class="dmt-value">
              <span class="badge-sm ${p.tipoPedido || "delivery"}">${typeLabels[p.tipoPedido] || p.tipoPedido || "—"}</span>
            </span>
          </div>
          ${endPart}
          ${trocoPart}
        </div>

        <!-- DIVIDER -->
        <div class="dmt-divider">
          <span>Itens do Pedido</span>
        </div>

        <!-- ITENS -->
        <div class="dmt-itens-list">
          ${itensHTML}
        </div>

        <!-- TOTAL -->
        <div class="dmt-total-row">
          <span>Total do Pedido</span>
          <span class="dmt-total-value">${totalFmt}</span>
        </div>

      </div>

      <!-- FOOTER -->
      <div class="modal-footer" style="justify-content:stretch;gap:0.65rem;">
        <button class="dmt-btn-print" onclick="window._adminImprimirComanda('${pid}'); window._adminFecharDetalhes();">
          <i class="fa fa-print"></i> Imprimir Comanda
        </button>
        <button class="dmt-btn-close" onclick="window._adminFecharDetalhes()">
          Fechar
        </button>
      </div>

    </div>
  </div>`;

  document.getElementById("modal-detalhes")?.remove();
  document.body.insertAdjacentHTML("beforeend", modalHTML);
};

window._adminFecharDetalhes = () => {
  document.getElementById("modal-detalhes")?.remove();
};

window._adminImprimirComanda = (id) => {
  const p = _pedidosDia.find((x) => x.id === id);
  if (!p) return;

  const payload = {
    id: p.id,
    date: p.dataPedido?.toDate
      ? p.dataPedido.toDate().toISOString()
      : new Date().toISOString(),
    customerName: p.clienteNome || "",
    customerPhone: p.telefone || "",
    items: (p.itens || []).map((i) => ({
      name: i.name || i.nome,
      quantity: i.quantity || i.quantidade || 1,
      price: i.price || i.preco || 0,
      pizzaSize: i.pizzaSize || i.size || i.tamanho || "",
      secondFlavor: i.secondFlavor || i.metade || "",
      extras: i.extras || [],
      obs: i.obs || "",
    })),
    total: p.total || 0,
    orderType: p.tipoPedido || "delivery",
    paymentType: p.pagamento || "pix",
    address: p.endereco || "",
    troco: p.troco || 0,
  };

  try {
    const encoded = btoa(encodeURIComponent(JSON.stringify(payload)));
    const base = window.location.href.replace(/\/[^/]*$/, "/");
    const url = base + "imprimir.html?d=" + encoded;
    window.open(url, "_blank");
  } catch (e) {
    alert("Erro ao gerar comanda: " + e.message);
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════════════════
function startRelatorios() {
  const today = new Date();
  const dateInput = document.getElementById("rel-date");
  const mesInput = document.getElementById("rel-mes");

  if (dateInput && !dateInput.value)
    dateInput.value = today.toISOString().slice(0, 10);
  if (mesInput && !mesInput.value)
    mesInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  carregarRelatorioDia();
  carregarRelatorioMes();
}

export function carregarRelatorioDia() {
  const dateInput = document.getElementById("rel-date");
  const date = dateInput?.value
    ? new Date(dateInput.value + "T12:00:00")
    : new Date();

  _unsubPedidos?.();
  _unsubPedidos = watchPedidosDia(date, (pedidos) => {
    const resumo = calcularResumo(pedidos);
    const ranking = calcularRanking(pedidos);
    renderStatsDia(resumo);
    renderRanking(ranking, "ranking-dia");
  });
}

export function carregarRelatorioMes() {
  const mesInput = document.getElementById("rel-mes");
  const val =
    mesInput?.value ||
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = val.split("-").map(Number);

  _unsubPedMes?.();
  _unsubPedMes = watchPedidosMes(y, m - 1, (pedidos) => {
    _pedidosMes = pedidos;
    const resumo = calcularResumo(pedidos);
    const diario = calcularFaturamentoDiario(pedidos);
    const qtdProd = calcularQtdPorProduto(pedidos);
    renderStatsMes(resumo);
    renderGraficoDiario(diario);
    renderQtdPorProduto(qtdProd);
  });
}

function renderStatsDia(r) {
  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  setEl("rel-dia-total", fmt(r.total));
  setEl("rel-dia-pedidos", r.quantidade);
  setEl("rel-dia-ticket", fmt(r.ticketMedio));
  setEl("rel-dia-pix", fmt(r.porPagamento.pix || 0));
  setEl("rel-dia-cartao", fmt(r.porPagamento.cartao || 0));
  setEl("rel-dia-dinheiro", fmt(r.porPagamento.dinheiro || 0));
}

function renderStatsMes(r) {
  const fmt = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  setEl("rel-mes-total", fmt(r.total));
  setEl("rel-mes-pedidos", r.quantidade);
  setEl("rel-mes-ticket", fmt(r.ticketMedio));
}

function renderRanking(ranking, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (ranking.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-trophy"></i><p>Sem dados</p></div>`;
    return;
  }
  const rows = ranking
    .map(
      (r, i) => `
    <tr>
      <td><span class="rank-num">${i + 1}</span></td>
      <td><span class="rank-name">${r.nome}</span></td>
      <td><span class="rank-count">${r.quantidade}×</span></td>
      <td><span class="rank-revenue">${r.faturamento.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span></td>
    </tr>
  `,
    )
    .join("");
  container.innerHTML = `
    <table class="ranking-table">
      <thead><tr><th>#</th><th>Item</th><th>Qtd</th><th>Arrecadado</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderGraficoDiario(diario) {
  const container = document.getElementById("grafico-diario");
  if (!container) return;
  if (diario.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-chart-bar"></i><p>Sem dados</p></div>`;
    return;
  }
  const maxVal = Math.max(...diario.map((d) => d.total));
  const bars = diario
    .map((d) => {
      const pct = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
      const label = d.total.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
      return `
      <div class="bar-item">
        <div class="bar-wrap" title="${label}">
          <div class="bar-fill" style="height:${pct}%"></div>
        </div>
        <div class="bar-label">${d.dia}</div>
        <div class="bar-value">${(d.total / 100).toFixed(0) === "0" ? label : label}</div>
      </div>`;
    })
    .join("");
  container.innerHTML = `<div class="bar-chart">${bars}</div>`;
}

function renderQtdPorProduto(lista) {
  const container = document.getElementById("qtd-por-produto");
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-box"></i><p>Sem dados</p></div>`;
    return;
  }
  const rows = lista
    .map(
      (r) => `
    <tr>
      <td class="rank-name">${r.nome}</td>
      <td><span class="rank-count">${r.quantidade}×</span></td>
    </tr>`,
    )
    .join("");
  container.innerHTML = `
    <table class="ranking-table">
      <thead><tr><th>Produto</th><th>Qtd Vendida</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ─── UTILITÁRIO ───────────────────────────────────────────────────────────────
function setEl(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
