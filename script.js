// ─── FIREBASE ────────────────────────────────────────────────────────────────
import { salvarPedido } from "./js/pedidos.js";
import { watchProdutos } from "./js/produtos.js";

// ─── ADICIONAIS DISPONÍVEIS ───────────────────────────────────────────────────
const EXTRAS_LIST = [
  { id: "ovo", label: "🥚 Ovo", price: 2.0 },
  { id: "salsicha", label: "🌭 Salsicha", price: 2.0 },
  { id: "hamburguer", label: "🍔 Hambúrguer", price: 3.0 },
  { id: "bacon", label: "🥓 Bacon", price: 3.0 },
  { id: "cebola", label: "🧅 Cebola", price: 2.0 },
  { id: "queijo", label: "🧀 Queijo", price: 2.0 },
  { id: "cheddar", label: "🧀 Cheddar", price: 2.0 },
  { id: "catupiry", label: "🍶 Catupiry", price: 3.0 },
  { id: "calabresa", label: "🌶️ Calabresa", price: 3.0 },
  { id: "presunto", label: "🥩 Presunto", price: 2.0 },
  { id: "maionese", label: "🥪 Maionese", price: 1.0 },
  { id: "Ketchup", label: "🍅 Ketchup", price: 1.0 },
];

// ─── CHAVE PIX ────────────────────────────────────────────────────────────────
const PIX_KEY = "63992019168";

// ─── VARIÁVEIS GLOBAIS ────────────────────────────────────────────────────────
const menu = document.getElementById("menu");
const cartModal = document.getElementById("cart-modal");
const cartBtn = document.getElementById("cart-btn");
const cartItemsContainer = document.getElementById("cart-items");
const cartTotal = document.getElementById("cart-total");
const checkoutBtn = document.getElementById("checkout-btn");
const closeModalBtn = document.getElementById("close-modal-btn");
const cartCounter = document.getElementById("cart-count");
const cartCounterModal = document.getElementById("cart-count-modal");
const addressInput = document.getElementById("address-input");
const addressWarn = document.getElementById("address-warn");
const addressSection = document.getElementById("address-section");
const changeArea = document.getElementById("change-area");
const changeValue = document.getElementById("change-value");
const changeInfo = document.getElementById("change-info");
const customerName = document.getElementById("customer-name");
const customerNameWarn = document.getElementById("customer-name-warn");
const customerPhone = document.getElementById("customer-phone");
const customerPhoneWarn = document.getElementById("customer-phone-warn");

// Extras modal
const extrasModal = document.getElementById("extras-modal");
const extrasProductName = document.getElementById("extras-product-name");
const extrasChipsContainer = document.getElementById("extras-chips");
const extrasObs = document.getElementById("extras-obs");
const extrasModalClose = document.getElementById("extras-modal-close");
const extrasCancelBtn = document.getElementById("extras-cancel-btn");
const extrasConfirmBtn = document.getElementById("extras-confirm-btn");
const secondFlavorSection = document.getElementById("second-flavor-section");
const secondFlavorSelect = document.getElementById("second-flavor-select");

// Pix modal - snapshot do pedido aguardando confirmação
let _pixOrderSnapshot = null;

// History modal
const historyModal = document.getElementById("history-modal");
const historyModalClose = document.getElementById("history-modal-close");
const historyList = document.getElementById("history-list");

let cart = [];
let orderType = "delivery";
let paymentType = "pix";
let pendingItem = null;
let pendingOrderData = null;
let qrInstance = null;

// ─── CATEGORY NAV SCROLL ──────────────────────────────────────────────────────
function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const offset = 60;
  const top = el.getBoundingClientRect().top + window.scrollY - offset;
  window.scrollTo({ top, behavior: "smooth" });
  document
    .querySelectorAll(".cat-tab")
    .forEach((tab) => tab.classList.remove("active"));
  event.currentTarget.classList.add("active");
}

// ─── MODAL CARRINHO ───────────────────────────────────────────────────────────
cartBtn.addEventListener("click", () => {
  updateCartModal();
  cartModal.classList.add("active");
});
closeModalBtn.addEventListener("click", () =>
  cartModal.classList.remove("active"),
);
cartModal.addEventListener("click", (e) => {
  if (e.target === cartModal) cartModal.classList.remove("active");
});

// ─── TIPO DO PEDIDO ───────────────────────────────────────────────────────────
function selectOrderType(type) {
  orderType = type;
  document
    .getElementById("btn-delivery")
    .classList.toggle("selected-order", type === "delivery");
  document
    .getElementById("btn-retirada")
    .classList.toggle("selected-order", type === "retirada");
  if (type === "retirada") {
    addressSection.style.display = "none";
    addressWarn.style.display = "none";
    addressInput.classList.remove("input-error");
  } else {
    addressSection.style.display = "flex";
  }
}

// ─── PAGAMENTO ────────────────────────────────────────────────────────────────
function selectPayment(type) {
  paymentType = type;
  ["pix", "cartao", "dinheiro"].forEach((p) => {
    document
      .getElementById("btn-" + p)
      .classList.toggle("selected-pay", p === type);
  });
  changeArea.style.display = type === "dinheiro" ? "flex" : "none";
  if (type !== "dinheiro") {
    changeValue.value = "";
    changeInfo.style.display = "none";
  }
}

changeValue.addEventListener("input", () => {
  const val = parseFloat(changeValue.value);
  const sum = cart.reduce(
    (a, i) => a + (i.price + i.extrasTotal) * i.quantity,
    0,
  );
  if (val > 0 && val >= sum) {
    const troco = val - sum;
    changeInfo.textContent =
      "💵 Troco a devolver: R$ " +
      troco.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    changeInfo.style.display = "block";
    changeInfo.style.color = "#16a34a";
  } else if (val > 0 && val < sum) {
    changeInfo.textContent = "⚠️ Valor menor que o total do pedido";
    changeInfo.style.display = "block";
    changeInfo.style.color = "#dc2626";
  } else {
    changeInfo.style.display = "none";
  }
});

// ─── MODAL ADICIONAIS ─────────────────────────────────────────────────────────
function openExtrasModal(name, price, isPizza, pizzaPrices) {
  pendingItem = {
    name,
    price,
    isPizza: !!isPizza,
    pizzaPrices: pizzaPrices || null,
    pizzaSize: null,
  };
  extrasProductName.textContent = name;
  extrasObs.value = "";

  // Seção de tamanho de pizza
  const pizzaSizeSection = document.getElementById("pizza-size-section");
  const extraChipsSection = document.getElementById("extras-chips-section");
  const sizeWarn = document.getElementById("pizza-size-warn");

  if (isPizza) {
    // Mostrar seleção de tamanho e segundo sabor, ocultar adicionais
    if (pizzaSizeSection) pizzaSizeSection.style.display = "block";
    if (extraChipsSection) extraChipsSection.style.display = "none";
    if (sizeWarn) sizeWarn.style.display = "none";

    // Limpar seleção de tamanho anterior
    document
      .querySelectorAll(".pizza-size-btn")
      .forEach((btn) => btn.classList.remove("selected-order"));

    // Atualizar preços nos botões de tamanho
    if (pizzaPrices) {
      const labelP = document.getElementById("price-label-P");
      const labelM = document.getElementById("price-label-M");
      const labelG = document.getElementById("price-label-G");
      if (labelP)
        labelP.textContent = pizzaPrices.P
          ? "R$ " + Number(pizzaPrices.P).toFixed(2).replace(".", ",")
          : "";
      if (labelM)
        labelM.textContent = pizzaPrices.M
          ? "R$ " + Number(pizzaPrices.M).toFixed(2).replace(".", ",")
          : "";
      if (labelG)
        labelG.textContent = pizzaPrices.G
          ? "R$ " + Number(pizzaPrices.G).toFixed(2).replace(".", ",")
          : "";
    }

    // Segundo sabor — começa oculto; só aparece se M ou G for selecionado
    secondFlavorSection.style.display = "none";
    secondFlavorSelect.value = "";
    window._pendingPizzaName = name; // usado por selectPizzaSize para filtrar o select
  } else {
    // Sanduíche/bebida: mostrar adicionais, ocultar pizza
    if (pizzaSizeSection) pizzaSizeSection.style.display = "none";
    if (extraChipsSection) extraChipsSection.style.display = "block";
    secondFlavorSection.style.display = "none";
    secondFlavorSelect.value = "";
  }

  extrasChipsContainer.innerHTML = "";
  EXTRAS_LIST.forEach((extra) => {
    const chip = document.createElement("label");
    chip.className = "extra-chip";
    chip.innerHTML =
      '<span class="extra-chip-check"><i class="fa fa-check" style="display:none;"></i></span>' +
      "<span>" +
      extra.label +
      "</span>" +
      '<span style="margin-left:auto;font-size:0.72rem;color:#9ca3af;">+R$' +
      extra.price.toFixed(2).replace(".", ",") +
      "</span>";
    chip.dataset.id = extra.id;
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      const checkIcon = chip.querySelector(".extra-chip-check i");
      checkIcon.style.display = chip.classList.contains("selected")
        ? "block"
        : "none";
    });
    extrasChipsContainer.appendChild(chip);
  });

  extrasModal.classList.add("active");
}

function closeExtrasModal() {
  extrasModal.classList.remove("active");
  pendingItem = null;
}

extrasModalClose.addEventListener("click", closeExtrasModal);
extrasCancelBtn.addEventListener("click", closeExtrasModal);
extrasModal.addEventListener("click", (e) => {
  if (e.target === extrasModal) closeExtrasModal();
});

extrasConfirmBtn.addEventListener("click", () => {
  if (!pendingItem) return;

  // Para pizzas: validar e capturar tamanho selecionado
  if (pendingItem.isPizza) {
    const sizeWarn = document.getElementById("pizza-size-warn");
    const selectedSizeBtn = document.querySelector(
      ".pizza-size-btn.selected-order",
    );
    if (!selectedSizeBtn) {
      if (sizeWarn) sizeWarn.style.display = "block";
      return;
    }
    pendingItem.pizzaSize = selectedSizeBtn.dataset.size;
    if (
      pendingItem.pizzaPrices &&
      pendingItem.pizzaPrices[pendingItem.pizzaSize]
    ) {
      pendingItem.price = pendingItem.pizzaPrices[pendingItem.pizzaSize];
    }
    if (sizeWarn) sizeWarn.style.display = "none";
  }

  const selectedExtras = [];
  let extrasTotal = 0;
  extrasChipsContainer
    .querySelectorAll(".extra-chip.selected")
    .forEach((chip) => {
      const extra = EXTRAS_LIST.find((e) => e.id === chip.dataset.id);
      if (extra) {
        selectedExtras.push({ label: extra.label, price: extra.price });
        extrasTotal += extra.price;
      }
    });
  const obs = extrasObs.value.trim();
  const secondFlavor = pendingItem.isPizza
    ? secondFlavorSelect.value || ""
    : "";
  const pizzaSize = pendingItem.pizzaSize || "";
  const sizeLabels = { P: "Pequena", M: "Media", G: "Grande" };
  const displayName =
    pendingItem.isPizza && pizzaSize
      ? pendingItem.name + " (" + (sizeLabels[pizzaSize] || pizzaSize) + ")"
      : pendingItem.name;
  addToCart(
    displayName,
    pendingItem.price,
    selectedExtras,
    extrasTotal,
    obs,
    secondFlavor,
    pizzaSize,
  );
  closeExtrasModal();
});

// ─── CARRINHO ─────────────────────────────────────────────────────────────────
menu.addEventListener("click", (e) => {
  const btn = e.target.closest(".add-td-cart-btn");
  if (!btn) return;
  if (btn.disabled || btn.closest(".product-card.esgotado")) return;
  const name = btn.getAttribute("data-name");
  const price = parseFloat(btn.getAttribute("data-price"));
  const hasExtras = btn.getAttribute("data-has-extras") === "true";
  const isPizza = btn.getAttribute("data-is-pizza") === "true";
  if (hasExtras) {
    let pizzaPrices = null;
    try {
      pizzaPrices = btn.dataset.prices ? JSON.parse(btn.dataset.prices) : null;
    } catch (e) {}
    openExtrasModal(name, price, isPizza, pizzaPrices);
  } else {
    addToCart(name, price, [], 0, "", "", "");
  }
});

function addToCart(
  name,
  price,
  extras,
  extrasTotal,
  obs,
  secondFlavor,
  pizzaSize,
) {
  cart.push({
    name,
    price,
    extras,
    extrasTotal,
    obs,
    secondFlavor: secondFlavor || "",
    pizzaSize: pizzaSize || "",
    quantity: 1,
  });
  updateCartCounter();
  animateCartBtn();
}

function animateCartBtn() {
  cartBtn.classList.add("animate-bounce");
  setTimeout(() => cartBtn.classList.remove("animate-bounce"), 600);
}

function updateCartCounter() {
  const total = cart.reduce((a, i) => a + i.quantity, 0);
  cartCounter.textContent = total;
  if (cartCounterModal) cartCounterModal.textContent = total;
}

function updateCartModal() {
  cartItemsContainer.innerHTML = "";
  if (cart.length === 0) {
    cartItemsContainer.innerHTML =
      '<div class="empty-cart">' +
      '<i class="fa fa-shopping-cart"></i>' +
      '<p style="font-weight:800;color:#1a1a1a;margin-bottom:0.25rem;">Carrinho vazio</p>' +
      '<p style="font-size:0.8rem;">Adicione itens do menu para começar</p>' +
      "</div>";
    cartTotal.textContent = "R$ 0,00";
    updateCartCounter();
    return;
  }

  let total = 0;
  cart.forEach((item, index) => {
    const itemUnitTotal = item.price + item.extrasTotal;
    const subtotal = itemUnitTotal * item.quantity;
    total += subtotal;

    const extrasLine =
      item.extras && item.extras.length > 0
        ? '<div class="cart-item-extras">+' +
          item.extras
            .map((e) =>
              typeof e === "object"
                ? e.label +
                  " (R$ " +
                  e.price.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  }) +
                  ")"
                : e,
            )
            .join(", ") +
          "</div>"
        : "";
    const secondFlavorLine = item.secondFlavor
      ? '<div class="cart-item-extras" style="color:var(--red);">🍕 Metade: ' +
        item.secondFlavor +
        "</div>"
      : "";
    const obsLine = item.obs
      ? '<div class="cart-item-obs">💬 ' + item.obs + "</div>"
      : "";

    const el = document.createElement("div");
    el.className = "cart-item-card";
    el.innerHTML =
      '<div class="cart-item-info">' +
      '<p class="cart-item-name">' +
      item.name +
      "</p>" +
      '<p class="cart-item-unit">R$ ' +
      itemUnitTotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) +
      " cada</p>" +
      secondFlavorLine +
      extrasLine +
      obsLine +
      "</div>" +
      '<div class="cart-item-controls">' +
      '<button class="qty-btn" data-action="dec" data-index="' +
      index +
      '" title="Remover um">−</button>' +
      '<span class="qty-num">' +
      item.quantity +
      "</span>" +
      '<button class="qty-btn" data-action="inc" data-index="' +
      index +
      '" title="Adicionar um">+</button>' +
      "</div>" +
      '<div class="cart-item-price">R$ ' +
      subtotal.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) +
      "</div>";
    cartItemsContainer.appendChild(el);
  });

  cartTotal.textContent = total.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  updateCartCounter();
  if (paymentType === "dinheiro" && changeValue.value) {
    changeValue.dispatchEvent(new Event("input"));
  }
}

cartItemsContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".qty-btn");
  if (!btn) return;
  const index = parseInt(btn.getAttribute("data-index"));
  const action = btn.getAttribute("data-action");
  const item = cart[index];
  if (!item) return;
  if (action === "inc") {
    item.quantity += 1;
  } else if (action === "dec") {
    item.quantity -= 1;
    if (item.quantity === 0) cart.splice(index, 1);
  }
  updateCartModal();
});

// ─── MONTAR DADOS DO PEDIDO ────────────────────────────────────────────────────
function buildOrderData() {
  const total = cart.reduce(
    (a, i) => a + (i.price + i.extrasTotal) * i.quantity,
    0,
  );

  const cartLines = cart
    .map((item) => {
      const unitTotal = item.price + item.extrasTotal;
      const sub = unitTotal * item.quantity;
      let line =
        "▪️ *" +
        item.name +
        "*\n   Qtd: " +
        item.quantity +
        " × R$ " +
        unitTotal.toFixed(2) +
        " = R$ " +
        sub.toFixed(2);
      if (item.secondFlavor) line += "\n   🍕 Metade: " + item.secondFlavor;
      if (item.extras && item.extras.length > 0)
        line +=
          "\n   ➕ Adicionais: " +
          item.extras
            .map((e) =>
              typeof e === "object"
                ? e.label + " (R$ " + e.price.toFixed(2) + ")"
                : e,
            )
            .join(", ");
      if (item.obs) line += "\n   💬 Obs: " + item.obs;
      return line;
    })
    .join("\n\n");

  // Montar endereço completo com número e referência
  const addrNumEl = document.getElementById("address-number");
  const addrRefEl = document.getElementById("address-ref");
  let fullAddress = addressInput.value.trim();
  if (addrNumEl && addrNumEl.value.trim()) {
    const num = addrNumEl.value.trim();
    if (!fullAddress.includes(num)) fullAddress += ", Nº " + num;
  }
  if (addrRefEl && addrRefEl.value.trim()) {
    const ref = addrRefEl.value.trim();
    if (!fullAddress.includes(ref)) fullAddress += " — Ref: " + ref;
  }

  const tipoLabel =
    orderType === "delivery" ? "🛵 Delivery" : "🏪 Retirada no local";
  const enderecoLine =
    orderType === "delivery"
      ? "📍 *ENDEREÇO DE ENTREGA:*\n" + fullAddress + "\n\n"
      : "🏪 *RETIRADA NO LOCAL*\n\n";

  const paymentLabels = {
    pix: "💠 Pix",
    cartao: "💳 Cartão",
    dinheiro: "💵 Dinheiro",
  };
  const paymentLine = "💳 *PAGAMENTO:* " + paymentLabels[paymentType];

  let trocoLine = "";
  if (paymentType === "dinheiro") {
    const trocoVal = parseFloat(changeValue.value) - total;
    trocoLine =
      "\n💰 *TROCO PARA:* R$ " +
      parseFloat(changeValue.value).toFixed(2) +
      "\n💵 *TROCO A DEVOLVER:* R$ " +
      trocoVal.toFixed(2);
  }

  const orderId = Date.now();
  const orderDate = new Date().toISOString();

  // ── Montar objeto compacto para o link de impressão ──
  const printPayload = {
    id: orderId,
    date: orderDate,
    customerName: customerName.value.trim(),
    customerPhone: customerPhone.value.trim(),
    items: JSON.parse(JSON.stringify(cart)),
    total: total,
    orderType: orderType,
    paymentType: paymentType,
    address: orderType === "delivery" ? fullAddress : "",
    troco: paymentType === "dinheiro" ? parseFloat(changeValue.value) || 0 : 0,
  };

  // ── Codificar em base64 e gerar URL ──
  let printLink = "";
  try {
    const encoded = btoa(encodeURIComponent(JSON.stringify(printPayload)));
    const base = window.location.href.replace(/\/[^\/]*$/, "/");
    printLink = base + "imprimir.html?d=" + encoded;
  } catch (e) {
    console.warn("Erro ao gerar link de impressão:", e);
  }

  const whatsappText =
    "🍕 *NOVO PEDIDO - PIZZARIA RA* 🍕\n\n" +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    "👤 *CLIENTE:* " +
    customerName.value.trim() +
    "\n" +
    "📱 *CELULAR:* " +
    customerPhone.value.trim() +
    "\n\n" +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    "📋 *ITENS DO PEDIDO:*\n\n" +
    cartLines +
    "\n\n" +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    "💰 *VALOR TOTAL:* R$ " +
    total.toFixed(2) +
    "\n\n" +
    "🚀 *TIPO:* " +
    tipoLabel +
    "\n\n" +
    enderecoLine +
    paymentLine +
    trocoLine +
    "\n\n" +
    "━━━━━━━━━━━━━━━━━━━━\n\n" +
    "⏰ Pedido: " +
    new Date().toLocaleString("pt-BR");

  return {
    total,
    cartSnapshot: JSON.parse(JSON.stringify(cart)),
    whatsappText,
    customerName: customerName.value.trim(),
    customerPhone: customerPhone.value.trim(),
    orderType,
    paymentType,
    address: orderType === "delivery" ? fullAddress : "",
    date: orderDate,
    id: orderId,
    printLink,
    troco: paymentType === "dinheiro" ? parseFloat(changeValue.value) || 0 : 0,
  };
}

// ─── FINALIZAR PEDIDO ─────────────────────────────────────────────────────────
checkoutBtn.addEventListener("click", () => {
  if (cart.length === 0) {
    alert("Adicione itens ao carrinho antes de finalizar.");
    return;
  }

  if (orderType === "delivery" && addressInput.value.trim() === "") {
    addressWarn.style.display = "block";
    addressInput.classList.add("input-error");
    addressInput.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  if (paymentType === "dinheiro") {
    const total = cart.reduce(
      (a, i) => a + (i.price + i.extrasTotal) * i.quantity,
      0,
    );
    const troco = parseFloat(changeValue.value);
    if (!troco || troco < total) {
      changeValue.classList.add("input-error");
      changeValue.focus();
      return;
    }
  }

  if (customerName.value.trim() === "") {
    customerNameWarn.style.display = "block";
    customerName.classList.add("input-error");
    customerName.scrollIntoView({ behavior: "smooth", block: "center" });
    customerName.focus();
    return;
  }

  if (customerPhone.value.trim() === "") {
    customerPhoneWarn.style.display = "block";
    customerPhone.classList.add("input-error");
    customerPhone.scrollIntoView({ behavior: "smooth", block: "center" });
    customerPhone.focus();
    return;
  }

  pendingOrderData = buildOrderData();

  if (paymentType === "pix") {
    cartModal.classList.remove("active");
    openPIXModal(pendingOrderData);
    return;
  }

  sendOrderToWhatsApp(pendingOrderData);
});

// ─── PIX MODAL ────────────────────────────────────────────────────────────────
function openPIXModal(snapshot) {
  _pixOrderSnapshot = snapshot;
  const total = snapshot.total;
  document.getElementById("pix-total-value").textContent =
    `R$ ${total.toFixed(2)}`;
  document.getElementById("pix-total-instruction").textContent =
    `R$ ${total.toFixed(2)}`;
  document.getElementById("pix-pending-warn").style.display = "none";

  const copyBtn = document.getElementById("pix-copy-btn");
  copyBtn.innerHTML = '<i class="fa fa-copy"></i> Copiar';
  copyBtn.style.background = "#00b377";

  const pixModal = document.getElementById("pix-modal");
  pixModal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closePIXModal() {
  const pixModal = document.getElementById("pix-modal");
  document.getElementById("pix-pending-warn").style.display = "block";
  setTimeout(() => {
    pixModal.style.display = "none";
    document.body.style.overflow = "";
    document.getElementById("pix-pending-warn").style.display = "none";
  }, 2500);
}

function copyPIXKey() {
  navigator.clipboard
    .writeText(PIX_KEY)
    .then(() => {
      const btn = document.getElementById("pix-copy-btn");
      btn.innerHTML = '<i class="fa fa-check"></i> Copiado!';
      btn.style.background = "#00875a";
      setTimeout(() => {
        btn.innerHTML = '<i class="fa fa-copy"></i> Copiar';
        btn.style.background = "#00b377";
      }, 2500);
    })
    .catch(() => {
      const el = document.createElement("textarea");
      el.value = PIX_KEY;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      const btn = document.getElementById("pix-copy-btn");
      btn.innerHTML = '<i class="fa fa-check"></i> Copiado!';
      btn.style.background = "#00875a";
      setTimeout(() => {
        btn.innerHTML = '<i class="fa fa-copy"></i> Copiar';
        btn.style.background = "#00b377";
      }, 2500);
    });
}

async function confirmPIXPayment() {
  if (!_pixOrderSnapshot) return;

  const btn = document.getElementById("pix-confirm-btn");
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Salvando pedido...';
  btn.disabled = true;

  // 1. Salvar no Firestore primeiro
  const firestoreId = await salvarPedido(_pixOrderSnapshot);

  if (firestoreId) {
    try {
      localStorage.setItem("pizzaria_ra_last_order_id", firestoreId);
      localStorage.setItem(
        "pizzaria_ra_last_order_name",
        _pixOrderSnapshot.customerName || "",
      );
    } catch (_) {}
    window.dispatchEvent(
      new CustomEvent("pizzaria:pedido_salvo", { detail: { firestoreId } }),
    );
  }
  try {
    const CACHE_KEY = "pizzaria_ra_orders_cache";
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    cache.unshift({
      firestoreId,
      id: _pixOrderSnapshot.id || Date.now(),
      date: _pixOrderSnapshot.date,
      customerName: _pixOrderSnapshot.customerName,
      customerPhone: _pixOrderSnapshot.customerPhone,
      items: _pixOrderSnapshot.cartSnapshot,
      total: _pixOrderSnapshot.total,
      orderType: _pixOrderSnapshot.orderType,
      paymentType: _pixOrderSnapshot.paymentType,
      address: _pixOrderSnapshot.address,
      status: "Pendente",
    });
    if (cache.length > 5) cache.splice(5);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (_) {}

  // 2. Gerar link de acompanhamento
  let trackingLine = "";
  if (firestoreId) {
    const base = window.location.href.replace(/\/[^\/]*$/, "/");
    const trackingUrl = base + "acompanhar.html?id=" + firestoreId;
    trackingLine =
      "\n\n━━━━━━━━━━━━━━━━━━━━\n\n🔍 *Acompanhe seu pedido em tempo real:*\n" +
      trackingUrl;
  }

  // 3. Abrir WhatsApp
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Abrindo WhatsApp...';
  const baseText = _pixOrderSnapshot.whatsappText;
  const pixNote =
    "\n\n━━━━━━━━━━━━━━━━━━━━\n\n📎 *Por favor, envie o comprovante do PIX nesta conversa para confirmarmos seu pedido!* ✅";
  const message = encodeURIComponent(baseText + pixNote + trackingLine);
  window.open(`https://wa.me/63992019168?text=${message}`, "_blank");

  setTimeout(() => {
    document.getElementById("pix-modal").style.display = "none";
    document.body.style.overflow = "";
    btn.innerHTML =
      '<i class="fab fa-whatsapp" style="font-size:1.2rem;"></i> Já paguei! Enviar pedido';
    btn.disabled = false;
    _pixOrderSnapshot = null;
    cart.length = 0;
    changeValue.value = "";
    changeInfo.style.display = "none";
    updateCartModal();
    cartModal.classList.remove("active");
  }, 800);
}

// ─── ENVIAR PEDIDO ─────────────────────────────────────────────────────────────
async function sendOrderToWhatsApp(orderData) {
  // 1. Salvar no Firestore primeiro para obter o ID
  const firestoreId = await salvarPedido(orderData);

  // 2. Guardar no localStorage
  if (firestoreId) {
    try {
      localStorage.setItem("pizzaria_ra_last_order_id", firestoreId);
      localStorage.setItem(
        "pizzaria_ra_last_order_name",
        orderData.customerName || "",
      );
    } catch (_) {}
    window.dispatchEvent(
      new CustomEvent("pizzaria:pedido_salvo", { detail: { firestoreId } }),
    );
  }
  try {
    const CACHE_KEY = "pizzaria_ra_orders_cache";
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    cache.unshift({
      firestoreId,
      id: orderData.id || Date.now(),
      date: orderData.date,
      customerName: orderData.customerName,
      customerPhone: orderData.customerPhone,
      items: orderData.cartSnapshot,
      total: orderData.total,
      orderType: orderData.orderType,
      paymentType: orderData.paymentType,
      address: orderData.address,
      status: "Pendente",
    });
    if (cache.length > 5) cache.splice(5);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (_) {}

  // 3. Gerar link de acompanhamento se tiver ID no Firestore
  let trackingLine = "";
  if (firestoreId) {
    const base = window.location.href.replace(/\/[^\/]*$/, "/");
    const trackingUrl = base + "acompanhar.html?id=" + firestoreId;
    trackingLine =
      "\n\n━━━━━━━━━━━━━━━━━━━━\n\n🔍 *Acompanhe seu pedido em tempo real:*\n" +
      trackingUrl;
  }

  // 4. Abrir WhatsApp com o link de acompanhamento
  const message = encodeURIComponent(orderData.whatsappText + trackingLine);
  window.open("https://wa.me/63992019168?text=" + message, "_blank");

  // 5. Limpar estado
  cart.length = 0;
  changeValue.value = "";
  changeInfo.style.display = "none";
  customerName.value = "";
  customerPhone.value = "";
  customerNameWarn.style.display = "none";
  customerPhoneWarn.style.display = "none";
  customerName.classList.remove("input-error");
  customerPhone.classList.remove("input-error");
  pendingOrderData = null;
  updateCartModal();
  cartModal.classList.remove("active");
}

// ─── HISTÓRICO (localStorage) ─────────────────────────────────────────────────
const HISTORY_KEY = "pizzaria_ra_orders";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function openHistoryModal() {
  renderHistoryList();
  historyModal.classList.add("active");
}

// Expor para o patch poder re-renderizar quando status mudar
window._renderHistoryList = null; // será sobrescrito abaixo

const STATUS_COLORS = {
  Pendente: { cor: "#f59e0b", emoji: "⏳" },
  Preparando: { cor: "#3b82f6", emoji: "👨‍🍳" },
  "Saiu para entrega": { cor: "#8b5cf6", emoji: "🛵" },
  Entregue: { cor: "#10b981", emoji: "✅" },
  Cancelado: { cor: "#ef4444", emoji: "❌" },
};

function renderHistoryList() {
  // Usar o cache que tem o status atualizado
  let history;
  try {
    history = JSON.parse(
      localStorage.getItem("pizzaria_ra_orders_cache") || "[]",
    );
  } catch {
    history = [];
  }
  historyList.innerHTML = "";

  if (history.length === 0) {
    historyList.innerHTML =
      '<div class="history-empty">' +
      '<i class="fa fa-receipt"></i>' +
      '<p style="font-weight:800;color:#1a1a1a;">Nenhum pedido ainda</p>' +
      '<p style="font-size:0.82rem;">Seus pedidos aparecerão aqui após a confirmação</p>' +
      "</div>";
    return;
  }

  const payLabels = {
    pix: "💠 Pix",
    cartao: "💳 Cartão",
    dinheiro: "💵 Dinheiro",
  };
  const orderLabels = { delivery: "🛵 Delivery", retirada: "🏪 Retirada" };

  history.forEach((order, idx) => {
    const dateObj = new Date(order.date);
    const dateStr = dateObj.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const itemsHTML = (order.items || [])
      .map((item) => {
        let txt = (item.quantity || 1) + "× " + (item.name || item.nome);
        if (item.secondFlavor) txt += " | Metade: " + item.secondFlavor;
        if (item.extras && item.extras.length > 0)
          txt +=
            " + " +
            item.extras
              .map((e) =>
                typeof e === "object"
                  ? e.label + " (R$ " + e.price.toFixed(2) + ")"
                  : e,
              )
              .join(", ");
        if (item.obs) txt += " — " + item.obs;
        return (
          '<div class="history-item-line"><i class="fa fa-circle"></i><span>' +
          txt +
          "</span></div>"
        );
      })
      .join("");

    const payClass = order.paymentType || "pix";
    const addressHTML = order.address
      ? '<span style="color:var(--text-muted);font-weight:600;margin-left:0.5rem;"><i class="fa fa-map-marker-alt"></i> ' +
        order.address +
        "</span>"
      : "";

    // Status badge com cor dinâmica
    const statusInfo = STATUS_COLORS[order.status] || STATUS_COLORS["Pendente"];
    const isUltimo = idx === 0;
    const statusBadge = `
      <div style="display:flex;align-items:center;gap:6px;padding:8px 10px;background:${statusInfo.cor}15;border:1.5px solid ${statusInfo.cor}44;border-radius:8px;margin-top:8px;">
        <span style="font-size:1rem;">${statusInfo.emoji}</span>
        <div style="flex:1;">
          <div style="font-weight:800;color:${statusInfo.cor};font-size:0.82rem;">${order.status || "Pendente"}</div>
          ${isUltimo ? '<div style="font-size:0.72rem;color:#6b7280;">Atualiza automaticamente</div>' : ""}
        </div>
        ${isUltimo && order.status !== "Entregue" && order.status !== "Cancelado" ? `<span style="width:8px;height:8px;border-radius:50%;background:${statusInfo.cor};display:inline-block;animation:pulse 1.5s infinite;"></span>` : ""}
      </div>`;

    const card = document.createElement("div");
    card.className = "history-card";
    if (isUltimo) card.id = "history-card-ultimo";
    card.innerHTML =
      '<div class="history-card-header">' +
      "<div>" +
      '<div style="font-size:0.8rem;font-weight:800;">' +
      (order.customerName || "") +
      "</div>" +
      '<div class="history-card-date">' +
      dateStr +
      "</div>" +
      "</div>" +
      '<div class="history-card-total">' +
      (order.total || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }) +
      "</div>" +
      "</div>" +
      '<div class="history-card-body">' +
      '<div class="history-customer-line">' +
      '<i class="fa fa-phone-alt" style="color:var(--text-muted);font-size:0.75rem;"></i>' +
      (order.customerPhone || "") +
      addressHTML +
      "</div>" +
      itemsHTML +
      statusBadge +
      '<div class="history-badge-row" style="margin-top:8px;">' +
      '<span class="history-badge ' +
      payClass +
      '">' +
      (payLabels[order.paymentType] || order.paymentType) +
      "</span>" +
      '<span class="history-badge">' +
      (orderLabels[order.orderType] || order.orderType) +
      "</span>" +
      "</div>" +
      "</div>";
    historyList.appendChild(card);
  });
}

// Disponibilizar para o patch re-renderizar ao atualizar status
window._renderHistoryList = renderHistoryList;

function clearHistory() {
  if (!confirm("Tem certeza que deseja limpar todo o histórico de pedidos?"))
    return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistoryList();
}

historyModalClose.addEventListener("click", () =>
  historyModal.classList.remove("active"),
);
historyModal.addEventListener("click", (e) => {
  if (e.target === historyModal) historyModal.classList.remove("active");
});

// ─── VALIDAÇÕES EM TEMPO REAL ─────────────────────────────────────────────────
addressInput.addEventListener("input", () => {
  if (addressInput.value.trim() !== "") {
    addressWarn.style.display = "none";
    addressInput.classList.remove("input-error");
  } else {
    addressWarn.style.display = "block";
    addressInput.classList.add("input-error");
  }
});
customerName.addEventListener("input", () => {
  if (customerName.value.trim() !== "") {
    customerNameWarn.style.display = "none";
    customerName.classList.remove("input-error");
  }
});
customerPhone.addEventListener("input", () => {
  if (customerPhone.value.trim() !== "") {
    customerPhoneWarn.style.display = "none";
    customerPhone.classList.remove("input-error");
  }
});

// ─── HORÁRIO ──────────────────────────────────────────────────────────────────
const spanItem = document.getElementById("date-span");
const _agora = new Date();
const _totalMin = _agora.getHours() * 60 + _agora.getMinutes();
const isOpen = _totalMin >= 18 * 60 + 40 && _totalMin < 23 * 60;
if (isOpen) {
  spanItem.classList.add("open");
  spanItem.classList.remove("closed");
} else {
  spanItem.classList.remove("open");
  spanItem.classList.add("closed");
}

// ─── MENU DINÂMICO — FIREBASE ─────────────────────────────────────────────────
// Gera os cards do cardápio em tempo real a partir do Firestore.
// Quando o admin marca um produto como esgotado, o site atualiza automaticamente.

// O menu usa event delegation em #menu → botões dinâmicos funcionam automaticamente
function bindCartButtons() {
  /* event delegation já ativo em #menu */
}

function buildProductCard(p) {
  const esgotado = p.esgotado ? "esgotado" : "";
  const isPizza = p.categoria === "pizza";
  const pricesAttr =
    isPizza && p.precos ? `data-prices='${JSON.stringify(p.precos)}'` : "";
  const hasExtras = isPizza || p.categoria === "hamburguer" ? "true" : "false";
  const badgeHtml = p.badge ? `<span class="badge-new">${p.badge}</span>` : "";
  const priceDisplay = isPizza
    ? "A partir R$ " + (p.preco || 30).toFixed(2).replace(".", ",")
    : "R$ " + (p.preco || 0).toFixed(2).replace(".", ",");

  return `
    <div class="product-card ${esgotado}" data-product-name="${p.nome}">
      <div class="product-img-wrap">
        <div class="esgotado-overlay">
          <i class="fa fa-ban"></i><span>Esgotado</span>
        </div>
        <img src="${p.imagem || "assets/img-01.jpg"}" alt="${p.nome}" class="product-img" />
      </div>
      <div class="product-body">
        <p class="product-name">
          ${p.nome} ${badgeHtml}
          <span class="esgotado-badge">Esgotado</span>
        </p>
        <p class="product-desc">${p.descricao || ""}</p>
        <div class="product-footer">
          <span class="product-price">${priceDisplay}</span>
          <button
            class="add-cart-btn add-td-cart-btn"
            data-name="${p.nome}"
            data-price="${p.preco || 0}"
            data-has-extras="${hasExtras}"
            data-is-pizza="${isPizza}"
            ${pricesAttr}
            ${esgotado ? "disabled" : ""}
            title="Adicionar"
          >
            <i class="fa fa-cart-plus"></i>
          </button>
        </div>
      </div>
    </div>`;
}

function populateSecondFlavorSelect(pizzas) {
  const sel = document.getElementById("second-flavor-select");
  if (!sel) return;
  // Manter só a primeira opção "inteira"
  sel.innerHTML = '<option value="">— Apenas um sabor (inteira) —</option>';
  pizzas
    .filter((p) => !p.esgotado)
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.nome;
      opt.textContent = "🍕 " + p.nome.replace(/^Pizza\s+/i, "");
      sel.appendChild(opt);
    });
}

function renderMenuFirebase(produtos) {
  const loading = document.getElementById("menu-loading");
  if (loading) loading.style.display = "none";

  const categorias = {
    pizza: { grid: "grid-pizzas", section: "section-pizzas" },
    hamburguer: { grid: "grid-lanches", section: "section-lanches" },
    bebida: { grid: "grid-bebidas", section: "section-bebidas" },
  };

  // Limpar grids
  Object.values(categorias).forEach(({ grid, section }) => {
    const g = document.getElementById(grid);
    if (g) g.innerHTML = "";
    const s = document.getElementById(section);
    if (s) s.style.display = "none";
  });

  // Preencher cada categoria
  produtos.forEach((p) => {
    const cat = categorias[p.categoria];
    if (!cat) return;
    const grid = document.getElementById(cat.grid);
    if (!grid) return;
    grid.insertAdjacentHTML("beforeend", buildProductCard(p));
    // Mostrar seção
    const sec = document.getElementById(cat.section);
    if (sec) sec.style.display = "";
  });

  // Atualizar select de segundo sabor
  const pizzas = produtos.filter((p) => p.categoria === "pizza");
  populateSecondFlavorSelect(pizzas);

  // Re-vincular eventos dos botões de carrinho
  bindCartButtons();
}

// Iniciar listener Firebase para o cardápio
watchProdutos(renderMenuFirebase);

// ─── EXPOR FUNÇÕES GLOBAIS (necessário com type="module") ─────────────────────
window.scrollToSection = scrollToSection;
window.selectOrderType = selectOrderType;
window.selectPayment = selectPayment;
window.openHistoryModal = openHistoryModal;
window.clearHistory = clearHistory;
window.closePIXModal = closePIXModal;
window.confirmPIXPayment = confirmPIXPayment;
window.copyPIXKey = copyPIXKey;
