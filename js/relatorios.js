// ============================================================
// js/relatorios.js
// Módulo de Relatórios — cálculos sobre arrays de pedidos
//
// Não faz queries diretas ao Firestore.
// Recebe arrays de pedidos já trazidos por pedidos.js
// e retorna objetos prontos para renderização no admin.
// ============================================================

// ─── RESUMO DO DIA / MÊS ─────────────────────────────────────────────────────
// Retorna estatísticas gerais a partir de um array de pedidos.
export function calcularResumo(pedidos) {
  const total      = pedidos.reduce((a, p) => a + (p.total || 0), 0);
  const quantidade = pedidos.length;
  const ticketMedio = quantidade > 0 ? total / quantidade : 0;

  // Faturamento por forma de pagamento
  const porPagamento = { pix: 0, cartao: 0, dinheiro: 0 };
  pedidos.forEach((p) => {
    const key = p.pagamento || "pix";
    porPagamento[key] = (porPagamento[key] || 0) + (p.total || 0);
  });

  // Pedidos por status
  const porStatus = {};
  pedidos.forEach((p) => {
    porStatus[p.status] = (porStatus[p.status] || 0) + 1;
  });

  return { total, quantidade, ticketMedio, porPagamento, porStatus };
}

// ─── RANKING DE PRODUTOS ──────────────────────────────────────────────────────
// Retorna array ordenado por quantidade vendida (desc), top N itens.
// Cada elemento: { nome, quantidade, faturamento }
export function calcularRanking(pedidos, top = 10) {
  const contagem    = {};
  const faturamento = {};

  pedidos.forEach((p) => {
    (p.itens || []).forEach((item) => {
      const nome = item.name || item.nome || "?";
      const qtd  = item.quantity || item.quantidade || 1;
      const valor = ((item.price || item.preco || 0) + (item.extrasTotal || 0)) * qtd;

      contagem[nome]    = (contagem[nome] || 0) + qtd;
      faturamento[nome] = (faturamento[nome] || 0) + valor;
    });
  });

  return Object.keys(contagem)
    .map((nome) => ({ nome, quantidade: contagem[nome], faturamento: faturamento[nome] }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, top);
}

// ─── FATURAMENTO DIÁRIO (para gráfico de barras) ─────────────────────────────
// Agrupa pedidos por dia dentro de um mês e retorna array de { dia, total }.
export function calcularFaturamentoDiario(pedidos) {
  const porDia = {};

  pedidos.forEach((p) => {
    // dataPedido pode ser um Timestamp do Firebase ou ISO string
    const ts = p.dataPedido?.toDate ? p.dataPedido.toDate() : new Date(p.dataPedido);
    const dia = ts.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    porDia[dia] = (porDia[dia] || 0) + (p.total || 0);
  });

  // Ordenar cronologicamente (dd/mm)
  return Object.entries(porDia)
    .map(([dia, total]) => ({ dia, total }))
    .sort((a, b) => {
      const [da, ma] = a.dia.split("/").map(Number);
      const [db2, mb] = b.dia.split("/").map(Number);
      return ma !== mb ? ma - mb : da - db2;
    });
}

// ─── QUANTIDADE POR PRODUTO ───────────────────────────────────────────────────
// Para a tabela "Quantidade vendida por produto" no relatório mensal.
export function calcularQtdPorProduto(pedidos) {
  const mapa = {};
  pedidos.forEach((p) => {
    (p.itens || []).forEach((item) => {
      const nome = item.name || item.nome || "?";
      const qtd  = item.quantity || item.quantidade || 1;
      mapa[nome] = (mapa[nome] || 0) + qtd;
    });
  });
  return Object.entries(mapa)
    .map(([nome, quantidade]) => ({ nome, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

// ─── PRODUTO MAIS VENDIDO ─────────────────────────────────────────────────────
// Retorna o nome do produto mais vendido ou "—" se não houver dados.
export function produtoMaisVendido(pedidos) {
  const ranking = calcularRanking(pedidos, 1);
  return ranking.length > 0 ? ranking[0].nome : "—";
}
