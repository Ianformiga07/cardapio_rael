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
let _produtos     = [];   // cache dos produtos (atualizado pelo onSnapshot)
let _pedidosDia   = [];   // cache dos pedidos do dia selecionado
let _pedidosMes   = [];   // cache dos pedidos do mês selecionado

// Funções de cancelamento dos listeners ativos (evita memory leak ao trocar tabs)
let _unsubProdutos  = null;
let _unsubPedidos   = null;
let _unsubPedMes    = null;

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
    }
  );

  // Configurar formulário de login
  document.getElementById("login-pw")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doLogin();
  });
}

// ─── LOGIN / LOGOUT ──────────────────────────────────────────────────────────
export async function doLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pw    = document.getElementById("login-pw").value;
  const errEl = document.getElementById("login-err");
  const btn   = document.getElementById("login-btn");

  if (!email || !pw) {
    errEl.textContent = "Preencha e-mail e senha.";
    errEl.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Entrando...';
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
  document.getElementById("admin-app").style.display  = "none";
}

function showApp(user, perfil) {
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("admin-app").style.display  = "block";

  // Exibir nome do usuário no header
  const nameEl = document.getElementById("admin-user-name");
  if (nameEl) nameEl.textContent = perfil.nome || user.email;

  // Iniciar tab padrão: Dashboard
  showTab("tab-dashboard");
  startDashboard();
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
export function showTab(id) {
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));

  document.getElementById(id)?.classList.add("active");
  document.querySelector(`[data-tab="${id}"]`)?.classList.add("active");

  // Iniciar dados da tab selecionada
  if (id === "tab-dashboard")  startDashboard();
  if (id === "tab-produtos")   startProdutos();
  if (id === "tab-pedidos")    startPedidos();
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
    const esgotados = produtos.filter(p => p.esgotado).length;
    const el = document.getElementById("dash-esgotados");
    if (el) el.textContent = esgotados;
  });
}

function renderDashboard(pedidos) {
  const r = calcularResumo(pedidos);
  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  setEl("dash-total",      fmt(r.total));
  setEl("dash-pedidos",    r.quantidade);
  setEl("dash-ticket",     fmt(r.ticketMedio));
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

  tbody.innerHTML = produtos.map((p) => {
    const statusBadge = p.esgotado
      ? `<span class="badge badge-red">Esgotado</span>`
      : p.ativo
        ? `<span class="badge badge-green">Disponível</span>`
        : `<span class="badge badge-gray">Inativo</span>`;

    const preco = (p.preco || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

    return `
      <tr>
        <td><img src="${p.imagem || 'assets/logo1.png'}" alt="${p.nome}" class="prod-thumb"></td>
        <td class="prod-nome">${p.nome}</td>
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
          <button class="btn-icon btn-icon-red" title="${p.esgotado ? 'Reativar' : 'Marcar Esgotado'}"
            onclick="window._adminToggleEsgotado('${p.id}', ${p.esgotado})">
            <i class="fa fa-${p.esgotado ? 'check' : 'ban'}"></i>
          </button>
          <button class="btn-icon btn-icon-gray" title="${p.ativo ? 'Desativar' : 'Reativar'}"
            onclick="window._adminToggleAtivo('${p.id}', ${p.ativo})">
            <i class="fa fa-${p.ativo ? 'eye-slash' : 'eye'}"></i>
          </button>
          <button class="btn-icon btn-icon-danger" title="Excluir"
            onclick="window._adminExcluir('${p.id}', '${p.nome.replace(/'/g,"\\'")}')">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join("");
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
  else        await reativarProduto(id);
};
window._adminExcluir = async (id, nome) => {
  if (!confirm(`Excluir "${nome}"? Esta ação não pode ser desfeita.`)) return;
  await deleteProduto(id);
};
window._adminEditarProduto = (id) => {
  const p = _produtos.find(x => x.id === id);
  if (!p) return;
  abrirModalProduto(p);
};

// ─── MODAL PRODUTO (cadastro / edição) ───────────────────────────────────────
export function abrirModalProduto(produto = null) {
  const modal = document.getElementById("modal-produto");
  if (!modal) return;

  const titulo = document.getElementById("modal-produto-titulo");
  titulo.textContent = produto ? "Editar Produto" : "Novo Produto";

  // Preencher campos
  document.getElementById("prod-id").value       = produto?.id        || "";
  document.getElementById("prod-nome").value      = produto?.nome      || "";
  document.getElementById("prod-desc").value      = produto?.descricao || "";
  document.getElementById("prod-preco").value     = produto?.preco     || "";
  document.getElementById("prod-imagem").value    = produto?.imagem    || "";
  document.getElementById("prod-cat").value       = produto?.categoria || "pizza";
  document.getElementById("prod-estoque").value   = produto?.estoque   ?? 1;
  document.getElementById("prod-ativo").checked   = produto?.ativo     ?? true;

  modal.classList.add("active");
}

export function fecharModalProduto() {
  document.getElementById("modal-produto")?.classList.remove("active");
}

export async function salvarProduto() {
  const id      = document.getElementById("prod-id").value;
  const dados   = {
    nome:      document.getElementById("prod-nome").value.trim(),
    descricao: document.getElementById("prod-desc").value.trim(),
    preco:     parseFloat(document.getElementById("prod-preco").value) || 0,
    imagem:    document.getElementById("prod-imagem").value.trim(),
    categoria: document.getElementById("prod-cat").value,
    estoque:   parseInt(document.getElementById("prod-estoque").value) || 0,
    ativo:     document.getElementById("prod-ativo").checked,
  };

  if (!dados.nome) { alert("Informe o nome do produto."); return; }

  const btn = document.getElementById("btn-salvar-produto");
  btn.disabled = true;
  btn.textContent = "Salvando...";

  try {
    if (id) await editProduto(id, dados);
    else    await addProduto(dados);
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
  const date = dateInput?.value ? new Date(dateInput.value + "T12:00:00") : new Date();

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
      <i class="fa fa-receipt"></i>
      <p>Nenhum pedido nesta data</p>
      <small>Os pedidos aparecerão aqui em tempo real</small>
    </div>`;
    return;
  }

  const payLabels  = { pix: "💠 Pix", cartao: "💳 Cartão", dinheiro: "💵 Dinheiro" };
  const typeLabels = { delivery: "🛵 Delivery", retirada: "🏪 Retirada" };

  container.innerHTML = pedidos.map((p) => {
    const ts = p.dataPedido?.toDate ? p.dataPedido.toDate() : new Date(p.dataPedido);
    const dataStr = ts.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
    const itensHtml = (p.itens || []).map(i => `${i.quantity || 1}× ${i.name || i.nome}`).join(", ");
    const payClass  = p.pagamento || "pix";
    const typeClass = p.tipoPedido || "delivery";

    const statusOpts = Object.values(STATUS_PEDIDO).map((s) =>
      `<option value="${s}" ${p.status === s ? "selected" : ""}>${s}</option>`
    ).join("");

    return `
      <div class="order-card">
        <div class="order-card-header">
          <div>
            <span class="order-customer">${p.clienteNome || "Cliente"}</span>
            <span style="font-size:0.75rem;color:#6b7280;margin-left:0.5rem;">${dataStr}</span>
          </div>
          <span class="order-total">${(p.total || 0).toLocaleString("pt-BR", { style:"currency", currency:"BRL" })}</span>
        </div>
        <div class="order-date">
          <i class="fa fa-phone-alt"></i> ${p.telefone || "—"}
          ${p.endereco ? `&nbsp;·&nbsp;<i class="fa fa-map-marker-alt"></i> ${p.endereco}` : ""}
        </div>
        <div class="order-items" style="margin:0.4rem 0;">${itensHtml}</div>
        <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-top:0.5rem;">
          <span class="badge-sm ${payClass}">${payLabels[payClass] || payClass}</span>
          <span class="badge-sm ${typeClass}">${typeLabels[typeClass] || typeClass}</span>
          <div style="margin-left:auto;display:flex;align-items:center;gap:0.5rem;">
            <label style="font-size:0.75rem;font-weight:700;">Status:</label>
            <select class="status-select" onchange="window._adminSetStatus('${p.id}', this.value)">
              ${statusOpts}
            </select>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

window._adminSetStatus = async (id, novoStatus) => {
  await atualizarStatus(id, novoStatus);
};

// ═══════════════════════════════════════════════════════════════════════════════
// RELATÓRIOS
// ═══════════════════════════════════════════════════════════════════════════════
function startRelatorios() {
  const today = new Date();
  const dateInput = document.getElementById("rel-date");
  const mesInput  = document.getElementById("rel-mes");

  if (dateInput && !dateInput.value) dateInput.value = today.toISOString().slice(0, 10);
  if (mesInput  && !mesInput.value)  mesInput.value  = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  carregarRelatorioDia();
  carregarRelatorioMes();
}

export function carregarRelatorioDia() {
  const dateInput = document.getElementById("rel-date");
  const date = dateInput?.value ? new Date(dateInput.value + "T12:00:00") : new Date();

  _unsubPedidos?.();
  _unsubPedidos = watchPedidosDia(date, (pedidos) => {
    const resumo  = calcularResumo(pedidos);
    const ranking = calcularRanking(pedidos);
    renderStatsDia(resumo);
    renderRanking(ranking, "ranking-dia");
  });
}

export function carregarRelatorioMes() {
  const mesInput = document.getElementById("rel-mes");
  const val = mesInput?.value || `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const [y, m] = val.split("-").map(Number);

  _unsubPedMes?.();
  _unsubPedMes = watchPedidosMes(y, m - 1, (pedidos) => {
    _pedidosMes = pedidos;
    const resumo  = calcularResumo(pedidos);
    const diario  = calcularFaturamentoDiario(pedidos);
    const qtdProd = calcularQtdPorProduto(pedidos);
    renderStatsMes(resumo);
    renderGraficoDiario(diario);
    renderQtdPorProduto(qtdProd);
  });
}

function renderStatsDia(r) {
  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  setEl("rel-dia-total",    fmt(r.total));
  setEl("rel-dia-pedidos",  r.quantidade);
  setEl("rel-dia-ticket",   fmt(r.ticketMedio));
  setEl("rel-dia-pix",      fmt(r.porPagamento.pix || 0));
  setEl("rel-dia-cartao",   fmt(r.porPagamento.cartao || 0));
  setEl("rel-dia-dinheiro", fmt(r.porPagamento.dinheiro || 0));
}

function renderStatsMes(r) {
  const fmt = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  setEl("rel-mes-total",    fmt(r.total));
  setEl("rel-mes-pedidos",  r.quantidade);
  setEl("rel-mes-ticket",   fmt(r.ticketMedio));
}

function renderRanking(ranking, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (ranking.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-trophy"></i><p>Sem dados</p></div>`;
    return;
  }
  const rows = ranking.map((r, i) => `
    <tr>
      <td><span class="rank-num">${i + 1}</span></td>
      <td><span class="rank-name">${r.nome}</span></td>
      <td><span class="rank-count">${r.quantidade}×</span></td>
      <td><span class="rank-revenue">${r.faturamento.toLocaleString("pt-BR", { style:"currency", currency:"BRL" })}</span></td>
    </tr>
  `).join("");
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
    container.innerHTML = `<div class="empty-state"><i class="fa fa-chart-bar"></i><p>Sem dados</p></div>`;
    return;
  }
  const maxVal = Math.max(...diario.map(d => d.total));
  const bars = diario.map(d => {
    const pct = maxVal > 0 ? (d.total / maxVal) * 100 : 0;
    const label = d.total.toLocaleString("pt-BR", { style:"currency", currency:"BRL" });
    return `
      <div class="bar-item">
        <div class="bar-wrap" title="${label}">
          <div class="bar-fill" style="height:${pct}%"></div>
        </div>
        <div class="bar-label">${d.dia}</div>
        <div class="bar-value">${(d.total/100).toFixed(0) === "0" ? label : label}</div>
      </div>`;
  }).join("");
  container.innerHTML = `<div class="bar-chart">${bars}</div>`;
}

function renderQtdPorProduto(lista) {
  const container = document.getElementById("qtd-por-produto");
  if (!container) return;
  if (lista.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fa fa-box"></i><p>Sem dados</p></div>`;
    return;
  }
  const rows = lista.map(r => `
    <tr>
      <td class="rank-name">${r.nome}</td>
      <td><span class="rank-count">${r.quantidade}×</span></td>
    </tr>`).join("");
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
