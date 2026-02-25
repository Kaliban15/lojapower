const state = {
  productId: "",
  variationId: "",
  product: null,
  variation: null,
  basePrice: 299.9,
  discountRate: 0,
  couponCode: "",
  selectedUpsells: new Map(),
  creatingCheckout: false,
  checkoutConfig: null,
};

const shippingTable = {
  none: 0,
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const labels = {
  magnet: "Suporte Magnetico Pro",
  charger: "Fonte Turbo 33W",
  case: "Case Blindada X",
};

const elements = {
  checkoutBtn: document.getElementById("checkoutBtn"),
  couponLabel: document.getElementById("couponLabel"),
  lineProductTitle: document.getElementById("lineProductTitle"),
  lineBasePrice: document.getElementById("lineBasePrice"),
  lineDiscount: document.getElementById("lineDiscount"),
  lineShipping: document.getElementById("lineShipping"),
  lineTotal: document.getElementById("lineTotal"),
  stickyTotal: document.getElementById("stickyTotal"),
  upsellLines: document.getElementById("upsellLines"),
  generatePix: document.getElementById("generatePix"),
  pixBox: document.getElementById("pixBox"),
  pixStatus: document.getElementById("pixStatus"),
  pixCode: document.getElementById("pixCode"),
  copyPix: document.getElementById("copyPix"),
  checkoutLink: document.getElementById("pixTicketLink"),
  checkoutForm: document.getElementById("checkoutForm"),
  toast: document.getElementById("toast"),
  stickyPayBtn: document.getElementById("stickyPayBtn"),
};

function normalizePrice(value) {
  const raw = String(value || "")
    .trim()
    .replace(/\s/g, "")
    .replace("R$", "")
    .replace(/[^\d,.-]/g, "");

  if (!raw) return Number.NaN;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandsSep = decimalSep === "," ? "." : ",";
    const normalized = raw
      .replace(new RegExp(`\\${thousandsSep}`, "g"), "")
      .replace(decimalSep, ".");
    return Number(normalized);
  }

  if (hasComma) {
    return Number(raw.replace(/\./g, "").replace(",", "."));
  }

  return Number(raw);
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function parseDiscountFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const coupon = (params.get("cupom") || params.get("coupon") || "").trim().toUpperCase();
  const rateParam = Number(params.get("desconto") || params.get("discount") || 0);

  state.productId = String(params.get("product") || params.get("id") || "").trim();
  state.variationId = String(params.get("variation") || "").trim();

  if (coupon) {
    if (coupon.includes("30")) {
      state.discountRate = 0.3;
    }
    state.couponCode = coupon;
  }

  if (!state.discountRate && rateParam > 0 && rateParam < 100) {
    state.discountRate = rateParam / 100;
    state.couponCode = state.couponCode || `QR${Math.round(rateParam)}`;
  }

  if (!state.discountRate) {
    state.discountRate = 0.3;
    state.couponCode = state.couponCode || "CLIENTE30";
  }
}

function getUpsellTotal() {
  let total = 0;
  for (const price of state.selectedUpsells.values()) {
    total += price;
  }
  return total;
}

function computeTotals() {
  const upsellTotal = getUpsellTotal();
  const subtotal = state.basePrice + upsellTotal;
  const discount = subtotal * state.discountRate;
  const shipping = shippingTable.none;
  const total = Math.max(subtotal - discount + shipping, 0);
  return {
    subtotal: round2(subtotal),
    discount: round2(discount),
    shipping: round2(shipping),
    total: round2(total),
  };
}

function renderUpsellLines() {
  elements.upsellLines.innerHTML = "";
  for (const [id, price] of state.selectedUpsells.entries()) {
    const line = document.createElement("div");
    line.className = "summary-line";
    const label = document.createElement("span");
    label.textContent = labels[id] || id;
    const value = document.createElement("strong");
    value.textContent = currency.format(price);
    line.append(label, value);
    elements.upsellLines.appendChild(line);
  }
}

function resolveBasePrice() {
  const variation = state.variation;
  if (variation?.price && Number(variation.price) > 0) {
    return Number(variation.price);
  }
  if (variation?.promoPrice && Number(variation.promoPrice) > 0) {
    return Number(variation.promoPrice);
  }
  if (state.product?.promoPrice && Number(state.product.promoPrice) > 0) {
    return Number(state.product.promoPrice);
  }
  if (state.product?.price && Number(state.product.price) > 0) {
    return Number(state.product.price);
  }
  return state.basePrice;
}

function getVariationLabel(variation) {
  const name = String(variation?.name || "").trim();
  const value = String(variation?.value || variation?.title || "").trim();
  if (name && value) return `${name}: ${value}`;
  return value || name || "";
}

function getProductDisplayTitle() {
  if (!state.product) return "Produto";
  const variationLabel = getVariationLabel(state.variation);
  if (variationLabel) return `${state.product.title} - ${variationLabel}`;
  return state.product.title;
}

function setProStatus(text, type = "pending") {
  elements.pixStatus.textContent = text;
  elements.pixStatus.classList.remove("pending", "approved", "rejected");
  elements.pixStatus.classList.add(type);
}

function render() {
  state.basePrice = resolveBasePrice();
  const totals = computeTotals();
  elements.lineProductTitle.textContent = getProductDisplayTitle();
  elements.lineBasePrice.textContent = currency.format(state.basePrice);
  elements.couponLabel.textContent = `Cupom ${state.couponCode}`;
  elements.lineDiscount.textContent = `-${currency.format(totals.discount)}`;
  elements.lineShipping.textContent = currency.format(totals.shipping);
  elements.lineTotal.textContent = currency.format(totals.total);
  elements.stickyTotal.textContent = currency.format(totals.total);
  renderUpsellLines();
}

function setLoadingState(loading) {
  state.creatingCheckout = loading;
  const controls = elements.checkoutForm.querySelectorAll("input, button");
  controls.forEach((input) => {
    input.disabled = loading;
  });
  elements.generatePix.disabled = loading;
  elements.stickyPayBtn.disabled = loading;
  elements.checkoutBtn.textContent = loading ? "Gerando Checkout Pro..." : "Ir para Checkout Pro";
}

async function readJsonResponse(response) {
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message = parsed?.message || "Falha ao gerar Checkout Pro no Mercado Pago.";
    throw new Error(message);
  }

  return parsed || {};
}

function collectPayerData() {
  const formData = new FormData(elements.checkoutForm);
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const phone = String(formData.get("phone") || "").trim();

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast("Informe um e-mail valido ou deixe em branco.");
    return null;
  }

  return { name, email, phone };
}

function buildCheckoutPayload() {
  const totals = computeTotals();
  const payer = collectPayerData();
  if (!payer) return null;

  const upsells = Array.from(state.selectedUpsells.entries()).map(([id, value]) => ({
    id,
    title: labels[id] || id,
    price: round2(value),
  }));

  const orderTitle = upsells.length
    ? `${getProductDisplayTitle()} + ${upsells.length} acessorio(s)`
    : getProductDisplayTitle();

  return {
    title: orderTitle,
    externalReference: `POWER-${Date.now()}`,
    items: [
      {
        id: `order-${state.productId || "main"}`,
        title: orderTitle,
        quantity: 1,
        unitPrice: totals.total,
        currencyId: "BRL",
      },
    ],
    payer,
    order: {
      productId: state.product?.id || "",
      variationId: state.variation?.id || "",
      variationName: String(state.variation?.name || "").trim(),
      variationValue: String(state.variation?.value || state.variation?.title || "").trim(),
      variationLabel: getVariationLabel(state.variation),
      quantity: 1,
      couponCode: state.couponCode,
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      total: totals.total,
      upsells,
    },
  };
}

function renderCheckoutLink(checkoutUrl, modeLabel = "") {
  elements.pixBox.hidden = false;
  elements.pixCode.value = checkoutUrl;
  elements.checkoutLink.href = checkoutUrl;
  elements.checkoutLink.hidden = false;
  setProStatus(modeLabel ? `Link gerado (${modeLabel}). Redirecionando...` : "Link gerado. Redirecionando...", "pending");
}

let toastTimer;
function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
}

async function createCheckoutPro() {
  if (state.creatingCheckout) return;

  const payload = buildCheckoutPayload();
  if (!payload) return;

  setLoadingState(true);
  try {
    const response = await fetch("/api/checkout/pro/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await readJsonResponse(response);
    const checkoutUrl = String(result.checkoutUrl || result.initPoint || result.sandboxInitPoint || "").trim();

    if (!checkoutUrl) {
      throw new Error("O Mercado Pago nao retornou URL de Checkout Pro.");
    }

    const modeLabel = result.usedSandbox ? "modo teste" : "modo producao";
    renderCheckoutLink(checkoutUrl, modeLabel);
    showToast("Checkout Pro gerado. Abrindo Mercado Pago...");

    window.setTimeout(() => {
      window.location.href = checkoutUrl;
    }, 450);
  } catch (error) {
    elements.pixBox.hidden = false;
    elements.checkoutLink.hidden = true;
    setProStatus(error.message || "Falha ao gerar Checkout Pro.", "rejected");
    showToast(error.message || "Nao foi possivel iniciar o Checkout Pro.");
  } finally {
    setLoadingState(false);
  }
}

async function loadCheckoutConfig() {
  try {
    const response = await fetch("/api/checkout/config");
    const config = await readJsonResponse(response);
    state.checkoutConfig = config;
  } catch {
    state.checkoutConfig = null;
  }
}

async function loadProductContext() {
  try {
    let product = null;
    if (state.productId) {
      const response = await fetch(`/api/products/${encodeURIComponent(state.productId)}`);
      if (response.ok) {
        product = await response.json();
      }
    }

    if (!product) {
      const response = await fetch("/api/products");
      if (response.ok) {
        const products = await response.json();
        if (Array.isArray(products) && products.length) {
          product = products[0];
          state.productId = product.id;
        }
      }
    }

    if (!product) return;
    state.product = product;

    if (state.variationId && Array.isArray(product.variations)) {
      state.variation = product.variations.find((item) => item.id === state.variationId) || null;
    }
    if (!state.variation && Array.isArray(product.variations) && product.variations.length) {
      state.variation = product.variations[0];
      state.variationId = state.variation.id;
    }

    const params = new URLSearchParams(window.location.search);
    if (!params.get("product") && state.productId) {
      params.set("product", state.productId);
    }
    if (!params.get("variation") && state.variationId) {
      params.set("variation", state.variationId);
    }
    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState({}, "", nextUrl);

    const backLink = document.querySelector(".back-link");
    if (backLink && state.productId) {
      backLink.href = `produto.html?id=${encodeURIComponent(state.productId)}&cupom=${encodeURIComponent(state.couponCode)}`;
    }
  } catch {
    // silent fallback
  }
}

function wireEvents() {
  document.querySelectorAll("[data-upsell-id]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const input = event.currentTarget;
      const id = input.dataset.upsellId;
      const price = normalizePrice(input.dataset.upsellPrice || 0);
      if (input.checked) {
        state.selectedUpsells.set(id, price);
      } else {
        state.selectedUpsells.delete(id);
      }
      render();
    });
  });

  elements.generatePix.addEventListener("click", () => {
    createCheckoutPro();
  });

  elements.copyPix.addEventListener("click", async () => {
    const link = String(elements.pixCode.value || "").trim();
    if (!link) {
      showToast("Gere o link do checkout primeiro.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copiado.");
    } catch {
      showToast("Nao foi possivel copiar automaticamente.");
    }
  });

  elements.stickyPayBtn.addEventListener("click", () => {
    createCheckoutPro();
  });

  elements.checkoutForm.addEventListener("submit", (event) => {
    event.preventDefault();
    createCheckoutPro();
  });
}

async function init() {
  parseDiscountFromUrl();
  wireEvents();
  await Promise.all([loadCheckoutConfig(), loadProductContext()]);
  render();
}

init();
