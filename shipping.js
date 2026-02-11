const SHIPPING_STORAGE_KEY = "power_shipping_selection_v1";
const USER_ORDERS_STORAGE_KEY = "power_user_orders";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const state = {
  productId: "",
  variationId: "",
  couponCode: "",
  discountRate: 0.3,
  returnUrl: "",
  product: null,
  variation: null,
  baseAmount: 0,
  shippingAmount: 0,
  quotes: [],
  selectedQuoteId: "",
  connected: false,
  readyForShipment: false,
  missingShipmentScopes: [],
};

const elements = {
  backToProductLink: document.getElementById("backToProductLink"),
  shippingForm: document.getElementById("shippingForm"),
  postalCodeInput: document.getElementById("postalCodeInput"),
  lookupCepBtn: document.getElementById("lookupCepBtn"),
  calculateShippingBtn: document.getElementById("calculateShippingBtn"),
  quoteList: document.getElementById("quoteList"),
  continueToPaymentBtn: document.getElementById("continueToPaymentBtn"),
  shippingMessage: document.getElementById("shippingMessage"),
  summaryProductTitle: document.getElementById("summaryProductTitle"),
  summaryProductAmount: document.getElementById("summaryProductAmount"),
  summaryShippingAmount: document.getElementById("summaryShippingAmount"),
  summaryTotalAmount: document.getElementById("summaryTotalAmount"),
};

function normalizeText(value) {
  return String(value || "").trim();
}

function formatMissingScopes(scopes) {
  const list = Array.isArray(scopes) ? scopes.filter(Boolean) : [];
  return list.length ? list.join(", ") : "cart-write, shipping-generate";
}

function normalizePostalCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function parsePositiveInteger(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const rawNumber = Number(text);
  if (Number.isFinite(rawNumber) && rawNumber > 0) return Math.floor(rawNumber);
  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function normalizePackageSnapshot(source = {}, fallbackInsurance = 1) {
  const insuranceFallback = Number.isFinite(Number(fallbackInsurance)) && Number(fallbackInsurance) > 0
    ? Number(fallbackInsurance)
    : 1;

  const widthRaw = Number(source.width);
  const heightRaw = Number(source.height);
  const lengthRaw = Number(source.length);
  const weightRaw = Number(source.weight);
  const insuranceRaw = Number(source.insuranceValue ?? source.insurance_value);

  const width = Number.isFinite(widthRaw) && widthRaw > 0 ? widthRaw : 16;
  const height = Number.isFinite(heightRaw) && heightRaw > 0 ? heightRaw : 4;
  const length = Number.isFinite(lengthRaw) && lengthRaw > 0 ? lengthRaw : 16;
  const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 0.3;
  const insuranceValue = Number.isFinite(insuranceRaw) && insuranceRaw > 0 ? insuranceRaw : insuranceFallback;

  return {
    width: Number(width.toFixed(1)),
    height: Number(height.toFixed(1)),
    length: Number(length.toFixed(1)),
    weight: Number(weight.toFixed(3)),
    insuranceValue: Number(insuranceValue.toFixed(2)),
  };
}

function parseParams() {
  const params = new URLSearchParams(window.location.search);
  state.productId = normalizeText(params.get("product") || params.get("id"));
  state.variationId = normalizeText(params.get("variation"));
  state.couponCode = normalizeText(params.get("cupom") || params.get("coupon")).toUpperCase();

  const discountRaw = Number(params.get("discount") || params.get("desconto") || 0);
  if (discountRaw > 0 && discountRaw < 100) {
    state.discountRate = discountRaw / 100;
  } else if (state.couponCode.includes("30")) {
    state.discountRate = 0.3;
  } else {
    state.discountRate = 0.3;
  }

  const returnParam = normalizeText(params.get("return"));
  if (returnParam.startsWith("/")) {
    state.returnUrl = returnParam;
  } else if (returnParam.startsWith(window.location.origin)) {
    state.returnUrl = returnParam.replace(window.location.origin, "");
  }
}

function getActiveVariation() {
  const list = Array.isArray(state.product?.variations) ? state.product.variations : [];
  if (!list.length) return null;
  return list.find((item) => item.id === state.variationId) || list[0];
}

function resolveBaseAmount() {
  const variation = state.variation;
  const normalPrice = Number(variation?.price || state.product?.price || 0);
  const promoPrice = Number(variation?.promoPrice || state.product?.promoPrice || 0);

  if (promoPrice > 0 && promoPrice < normalPrice) {
    return Number(promoPrice.toFixed(2));
  }

  const discounted = normalPrice * (1 - state.discountRate);
  return Number(discounted.toFixed(2));
}

function getProductTitle() {
  if (!state.product) return "Produto";
  if (state.variation?.title) return `${state.product.title} - ${state.variation.title}`;
  return state.product.title;
}

function updateSummary() {
  const total = Number((state.baseAmount + state.shippingAmount).toFixed(2));
  elements.summaryProductTitle.textContent = getProductTitle();
  elements.summaryProductAmount.textContent = currency.format(state.baseAmount || 0);
  elements.summaryShippingAmount.textContent = currency.format(state.shippingAmount || 0);
  elements.summaryTotalAmount.textContent = currency.format(total);
}

function setMessage(text, type = "") {
  elements.shippingMessage.textContent = text;
  elements.shippingMessage.className = `message ${type}`.trim();
}

function setLoading(button, loading, loadingText, defaultText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? loadingText : defaultText;
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
    const details = Array.isArray(parsed?.errors) && parsed.errors.length
      ? ` ${parsed.errors.map((item) => String(item || "").trim()).filter(Boolean).join("; ")}`
      : "";
    throw new Error(`${parsed?.message || "Falha na resposta do servidor."}${details}`.trim());
  }

  return parsed || {};
}

function renderQuotes() {
  if (!state.quotes.length) {
    elements.quoteList.innerHTML = '<p class="mini-note">Nenhuma opcao de frete disponivel para este CEP.</p>';
    state.selectedQuoteId = "";
    state.shippingAmount = 0;
    elements.continueToPaymentBtn.disabled = true;
    updateSummary();
    return;
  }

  elements.quoteList.innerHTML = state.quotes.map((quote) => {
    const checked = quote.id === state.selectedQuoteId ? "checked" : "";
    const company = quote.company?.name || "Transportadora";
    const days = Number(quote.deliveryTime || 0);
    const deliveryText = days > 0 ? `${days} dia(s)` : "Prazo indisponivel";

    return `
      <article class="quote-card">
        <label>
          <input type="radio" name="shippingQuote" value="${quote.id}" ${checked} />
          <span>
            <strong class="quote-name">${company} - ${quote.name}</strong>
            <span class="quote-meta">${deliveryText}</span>
          </span>
          <strong class="quote-price">${currency.format(quote.price || 0)}</strong>
        </label>
      </article>
    `;
  }).join("");

  const selected = state.quotes.find((item) => item.id === state.selectedQuoteId) || state.quotes[0];
  state.selectedQuoteId = selected.id;
  state.shippingAmount = Number(selected.price || 0);
  elements.continueToPaymentBtn.disabled = !state.readyForShipment;
  updateSummary();
}

function fillAddressFromCep(payload = {}) {
  const set = (name, value) => {
    const input = elements.shippingForm.querySelector(`[name="${name}"]`);
    if (!input) return;
    input.value = String(value || "");
  };
  set("street", payload.logradouro || "");
  set("district", payload.bairro || "");
  set("city", payload.localidade || "");
  set("state", payload.uf || "");
}

async function lookupCep() {
  const cep = normalizePostalCode(elements.postalCodeInput.value);
  if (!cep) {
    setMessage("Informe um CEP valido para buscar endereco.", "error");
    return;
  }

  setLoading(elements.lookupCepBtn, true, "Buscando...", "Buscar CEP");
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep.replace("-", "")}/json/`);
    const payload = await readJsonResponse(response);
    if (payload.erro) {
      throw new Error("CEP nao encontrado.");
    }

    elements.postalCodeInput.value = cep;
    fillAddressFromCep(payload);
    setMessage("Endereco localizado pelo CEP.", "success");
  } catch (error) {
    setMessage(error.message || "Nao foi possivel buscar o CEP.", "error");
  } finally {
    setLoading(elements.lookupCepBtn, false, "Buscando...", "Buscar CEP");
  }
}

function collectFormData() {
  const formData = new FormData(elements.shippingForm);
  const name = normalizeText(formData.get("name"));
  const email = normalizeText(formData.get("email"));
  const phone = normalizeText(formData.get("phone"));
  const cpf = normalizeText(formData.get("cpf")).replace(/\D/g, "");
  const postalCode = normalizePostalCode(formData.get("postalCode"));
  const street = normalizeText(formData.get("street"));
  const number = normalizeText(formData.get("number"));
  const complement = normalizeText(formData.get("complement"));
  const district = normalizeText(formData.get("district"));
  const city = normalizeText(formData.get("city"));
  const region = normalizeText(formData.get("state")).toUpperCase().slice(0, 2);

  if (!name || !email || !phone || cpf.length !== 11 || !postalCode || !street || !number || !district || !city || region.length !== 2) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return {
    customer: { name, email, phone, cpf },
    address: {
      postalCode,
      street,
      number,
      complement,
      district,
      city,
      state: region,
    },
  };
}

function getSelectedQuote() {
  return state.quotes.find((item) => item.id === state.selectedQuoteId) || null;
}

function buildDefaultReturnUrl() {
  const params = new URLSearchParams();
  if (state.productId) params.set("id", state.productId);
  if (state.variationId) params.set("variation", state.variationId);
  if (state.couponCode) params.set("cupom", state.couponCode);
  params.set("autopay", "1");
  return `/produto.html?${params.toString()}`;
}

function getReturnUrl() {
  if (state.returnUrl.startsWith("/")) return state.returnUrl;
  return buildDefaultReturnUrl();
}

function buildCheckoutPreferencePayload(formPayload, quote) {
  const productAmount = Number((state.baseAmount || 0).toFixed(2));
  const shippingAmount = Number((Number(quote?.price || 0) || 0).toFixed(2));
  const total = Number((productAmount + shippingAmount).toFixed(2));
  const title = getProductTitle();
  const externalReference = `POWER-${Date.now()}`;
  const serviceId = parsePositiveInteger(quote?.id || quote?.serviceId || quote?.service);
  const rawAgency = quote?.raw?.agency_id ?? quote?.raw?.agency?.id ?? quote?.raw?.agency ?? "";
  const agencyId = parsePositiveInteger(rawAgency);
  const packageSnapshot = normalizePackageSnapshot(state.product?.shipping || {}, productAmount || 1);
  const volumeSnapshot = {
    width: packageSnapshot.width,
    height: packageSnapshot.height,
    length: packageSnapshot.length,
    weight: packageSnapshot.weight,
    insurance_value: packageSnapshot.insuranceValue,
  };

  return {
    title: shippingAmount > 0 ? `${title} + Frete` : title,
    externalReference,
    items: [
      {
        id: `order-${state.product?.id || state.productId || "main"}`,
        title,
        quantity: 1,
        unitPrice: productAmount,
        currencyId: "BRL",
      },
      {
        id: `shipping-${quote?.id || "service"}`,
        title: `Frete - ${quote?.company?.name || "Transportadora"}`,
        quantity: 1,
        unitPrice: shippingAmount,
        currencyId: "BRL",
      },
    ].filter((item) => Number(item?.unitPrice || 0) > 0),
    payer: {
      name: formPayload.customer.name,
      email: formPayload.customer.email,
      phone: formPayload.customer.phone,
      cpf: formPayload.customer.cpf,
    },
    order: {
      source: "shipping-page",
      productId: state.product?.id || state.productId || "",
      variationId: state.variation?.id || state.variationId || "",
      couponCode: state.couponCode || "CLIENTE30",
      productAmount,
      shippingAmount,
      total,
      shipping: {
        id: quote?.id || "",
        serviceId: serviceId || null,
        service: serviceId || null,
        rawServiceId: normalizeText(quote?.id || ""),
        agencyId: agencyId || null,
        agency: agencyId || null,
        rawAgencyId: normalizeText(rawAgency),
        serviceName: quote?.name || "",
        company: quote?.company || {},
        companyName: quote?.company?.name || "",
        deliveryTime: Number(quote?.deliveryTime || 0),
        price: shippingAmount,
        insuranceValue: packageSnapshot.insuranceValue,
        insurance_value: packageSnapshot.insuranceValue,
      },
      package: packageSnapshot,
      volumes: [volumeSnapshot],
      insurance_value: packageSnapshot.insuranceValue,
      customer: formPayload.customer,
      customerAddress: formPayload.address,
    },
  };
}

function buildTrackingRedirectUrl(shipment = {}, externalReference = "") {
  const params = new URLSearchParams();
  params.set("source", "direct-shipping");

  const reference = normalizeText(externalReference);
  if (reference) params.set("external_reference", reference);
  if (shipment.melhorEnvioOrderId) params.set("order", String(shipment.melhorEnvioOrderId));
  if (shipment.protocol) params.set("protocol", String(shipment.protocol));
  if (shipment.tracking) params.set("tracking", String(shipment.tracking));
  if (shipment.status) params.set("shipping_status", String(shipment.status));
  if (shipment.purchaseStatus) params.set("purchase_status", String(shipment.purchaseStatus));
  if (shipment.serviceName) params.set("service", String(shipment.serviceName));
  if (shipment.companyName) params.set("company", String(shipment.companyName));
  if (shipment.labelUrl) params.set("label_url", String(shipment.labelUrl));

  return `/tracking.html?${params.toString()}`;
}

function buildWaitingPaymentUrl(externalReference = "", checkoutUrl = "") {
  const params = new URLSearchParams();
  if (externalReference) params.set("ref", String(externalReference));
  if (checkoutUrl) params.set("checkout", String(checkoutUrl));
  return `/waiting-payment.html?${params.toString()}`;
}

function saveShippingSelection() {
  const formPayload = collectFormData();
  if (!formPayload) {
    setMessage("Preencha todos os dados obrigatorios antes de continuar.", "error");
    return false;
  }

  const quote = getSelectedQuote();
  if (!quote) {
    setMessage("Selecione uma opcao de frete para continuar.", "error");
    return false;
  }

  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    productId: state.product?.id || state.productId || "",
    variationId: state.variation?.id || state.variationId || "",
    couponCode: state.couponCode || "CLIENTE30",
    discountRate: state.discountRate,
    productTitle: getProductTitle(),
    productAmount: state.baseAmount,
    shipping: {
      id: quote.id,
      name: quote.name,
      company: quote.company,
      price: Number(quote.price || 0),
      deliveryTime: Number(quote.deliveryTime || 0),
      currency: quote.currency || "BRL",
    },
    customer: formPayload.customer,
    address: formPayload.address,
  };

  localStorage.setItem(SHIPPING_STORAGE_KEY, JSON.stringify(payload));
  return true;
}

function saveUserOrderEntry(payload = {}, shipment = {}, shippingRecord = {}) {
  const externalReference = normalizeText(
    payload.externalReference
    || shippingRecord.externalReference
    || "",
  );
  const orderId = normalizeText(shipment.melhorEnvioOrderId || shippingRecord.melhorEnvioOrderId || "");
  if (!externalReference && !orderId) return;

  const entry = {
    savedAt: new Date().toISOString(),
    externalReference,
    orderId,
    tracking: normalizeText(shipment.tracking || shippingRecord.tracking || ""),
    protocol: normalizeText(shipment.protocol || shippingRecord.protocol || ""),
    status: normalizeText(shipment.status || shippingRecord.status || "created"),
    serviceName: normalizeText(shipment.serviceName || shippingRecord.serviceName || ""),
    companyName: normalizeText(shipment.companyName || shippingRecord.companyName || ""),
    labelUrl: normalizeText(shipment.labelUrl || shippingRecord.labelUrl || ""),
    checkoutUrl: normalizeText(shippingRecord.checkoutUrl || payload.checkoutUrl || ""),
  };

  try {
    const raw = localStorage.getItem(USER_ORDERS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const normalizedList = Array.isArray(list) ? list : [];
    const filtered = normalizedList.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const sameReference = normalizeText(item.externalReference || "") === entry.externalReference;
      if (sameReference) return false;
      return true;
    });
    filtered.unshift(entry);
    localStorage.setItem(USER_ORDERS_STORAGE_KEY, JSON.stringify(filtered.slice(0, 100)));
  } catch {
    // ignore storage errors
  }
}

async function createShipmentDirectly() {
  // 1. TÉCNICA ANTI-BLOQUEIO (Pre-Open)
  // Abre a janela IMEDIATAMENTE após o clique.
  const mpWindow = window.open("", "_blank");

  if (mpWindow) {
    mpWindow.document.write(`
      <html>
        <head><title>Processando...</title></head>
        <body style="display:flex;justify-content:center;align-items:center;height:100vh;font-family:sans-serif;background:#f5f5f5;color:#333;margin:0;">
          <div style="text-align:center;">
            <div style="margin:0 auto 20px;width:50px;height:50px;border:5px solid #e0e0e0;border-top:5px solid #009ee3;border-radius:50%;animation:spin 1s linear infinite;"></div>
            <h2 style="color:#009ee3;margin-bottom:10px;">Calculando melhor frete...</h2>
            <p style="color:#666;">Estamos buscando a transportadora mais barata para você.</p>
            <style>@keyframes spin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>
          </div>
        </body>
      </html>
    `);
  }

  const defaultButtonText = "Finalizar Compra";
  setLoading(elements.continueToPaymentBtn, true, "Processando...", defaultButtonText);
  setMessage("Validando endereço e calculando frete...", "");

  try {
    // 2. Validações Iniciais
    if (!state.readyForShipment) {
        throw new Error("Sistema de frete indisponível no momento.");
    }

    const formPayload = collectFormData();
    if (!formPayload) {
      throw new Error("Preencha todos os dados de endereço corretamente.");
    }

    // 3. Cálculo de Frete "Silencioso" (Sem o usuário ver)
    console.info("[shipping] calculando frete internamente...");
    const quoteResponse = await fetch("/api/shipping/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: state.product?.id || state.productId,
        variationId: state.variation?.id || state.variationId,
        toPostalCode: formPayload.address.postalCode,
        quantity: 1,
      }),
    });
    
    const quoteData = await readJsonResponse(quoteResponse);
    const quotes = Array.isArray(quoteData.quotes) ? quoteData.quotes : [];

    if (!quotes.length) {
      throw new Error("Não encontramos opções de entrega para este CEP.");
    }

    // 4. Seleção Automática do Mais Barato
    // Ordena por preço (menor para maior) e pega o primeiro
    const cheapestQuote = quotes.sort((a, b) => Number(a.price) - Number(b.price))[0];
    console.info(`[shipping] frete escolhido: ${cheapestQuote.company.name} - R$ ${cheapestQuote.price}`);

    // Salva na memória para consistência
    state.quotes = quotes;
    state.selectedQuoteId = cheapestQuote.id;
    state.shippingAmount = Number(cheapestQuote.price || 0);
    saveShippingSelection();

    // 5. REGRA DE SUBSÍDIO (A Mágica dos R$ 20,00)
    const realShippingPrice = Number(cheapestQuote.price || 0);
    let customerShippingPrice = 0;

    if (realShippingPrice > 20) {
        customerShippingPrice = realShippingPrice - 20; // Cliente paga a diferença
    } else {
        customerShippingPrice = 0; // Frete Grátis
    }

    console.info(`[shipping] Subsídio aplicado. Real: R$${realShippingPrice} -> Cliente Paga: R$${customerShippingPrice}`);

    // 6. Montagem do Payload Híbrido
    // Gera o payload padrão...
    const payload = buildCheckoutPreferencePayload(formPayload, cheapestQuote);

    // ... E hackeia os valores para cobrar menos do cliente
    // Acha o item de frete no array e muda o preço visual
    const shippingItem = payload.items.find(item => item.id.startsWith("shipping-"));
    if (shippingItem) {
        shippingItem.unitPrice = Number(customerShippingPrice.toFixed(2));
        shippingItem.title = `${shippingItem.title} (Subsidiado)`;
    }

    // Recalcula o total do pedido (Produto + Frete Subsidiado)
    payload.order.productAmount = Number(payload.order.productAmount); // Garante número
    payload.order.shippingAmount = Number(customerShippingPrice.toFixed(2)); // Valor cobrado
    payload.order.total = Number((payload.order.productAmount + payload.order.shippingAmount).toFixed(2));
    
    // IMPORTANTE: Mantemos o `payload.order.shipping.price` com o valor REAL (`realShippingPrice`)
    // Se o backend usar `payload.order.shipping` para gerar etiqueta, ele vai receber o valor cheio correto.
    // Se precisar forçar, descomente abaixo:
    // payload.order.shipping.price = realShippingPrice; 

    console.info("[shipping] iniciando checkout", payload);

    // 7. Chamada ao Backend (A janela já está aberta esperando)
    const response = await fetch("/api/checkout/pro/preference", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await readJsonResponse(response);

    const externalReference = normalizeText(result.externalReference || payload.externalReference);
    const checkoutUrl = normalizeText(result.checkoutUrl || result.initPoint || result.sandboxInitPoint || "");
    
    if (!externalReference || !checkoutUrl) {
      throw new Error("Erro ao gerar link de pagamento.");
    }

    saveUserOrderEntry(
      { ...payload, externalReference, checkoutUrl },
      {},
      {
        externalReference,
        status: "payment_started",
        checkoutUrl,
      },
    );

    setMessage("Redirecionando para pagamento...", "success");

    // 8. Redirecionamento Final
    if (mpWindow) {
      mpWindow.location.href = checkoutUrl;
    } else {
      window.location.href = checkoutUrl;
      return; 
    }

    window.location.href = buildWaitingPaymentUrl(externalReference, checkoutUrl);

  } catch (error) {
    console.error("[shipping] erro one-click", error);
    if (mpWindow) mpWindow.close(); // Fecha a janela se deu erro (ex: CEP inválido)
    setMessage(error?.message || "Erro ao processar envio.", "error");
  } finally {
    setLoading(elements.continueToPaymentBtn, false, "Processando...", defaultButtonText);
  }
}

function preloadFromStorage() {
  try {
    const raw = localStorage.getItem(SHIPPING_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (!saved || saved.productId !== state.productId) return;

    const set = (name, value) => {
      const input = elements.shippingForm.querySelector(`[name="${name}"]`);
      if (!input) return;
      input.value = String(value || "");
    };

    set("name", saved.customer?.name || "");
    set("email", saved.customer?.email || "");
    set("phone", saved.customer?.phone || "");
    set("cpf", saved.customer?.cpf || "");
    set("postalCode", saved.address?.postalCode || "");
    set("street", saved.address?.street || "");
    set("number", saved.address?.number || "");
    set("complement", saved.address?.complement || "");
    set("district", saved.address?.district || "");
    set("city", saved.address?.city || "");
    set("state", saved.address?.state || "");
  } catch {
    // ignore storage errors
  }
}

async function calculateShipping() {
  if (!state.readyForShipment) {
    if (!state.connected) {
      setMessage("Melhor Envio ainda nao esta conectado no painel do vendedor.", "error");
      return;
    }
    setMessage(
      `Reconecte a Melhor Envio no painel do vendedor para liberar os escopos: ${formatMissingScopes(state.missingShipmentScopes)}.`,
      "error",
    );
    return;
  }

  const formPayload = collectFormData();
  if (!formPayload) {
    setMessage("Preencha os dados obrigatorios para calcular o frete.", "error");
    return;
  }

  setLoading(elements.calculateShippingBtn, true, "Calculando...", "Calcular frete");
  setMessage("");
  try {
    const response = await fetch("/api/shipping/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: state.product?.id || state.productId,
        variationId: state.variation?.id || state.variationId,
        toPostalCode: formPayload.address.postalCode,
        quantity: 1,
      }),
    });
    const data = await readJsonResponse(response);
    state.quotes = Array.isArray(data.quotes) ? data.quotes : [];
    state.selectedQuoteId = state.quotes[0]?.id || "";
    renderQuotes();

    if (!state.quotes.length) {
      setMessage("Nao encontramos opcoes de frete para este CEP no momento.", "error");
      return;
    }

    setMessage("Fretes calculados. Selecione a opcao para continuar.", "success");
  } catch (error) {
    state.quotes = [];
    renderQuotes();
    setMessage(error.message || "Falha ao calcular frete.", "error");
  } finally {
    setLoading(elements.calculateShippingBtn, false, "Calculando...", "Calcular frete");
  }
}

async function loadProductContext() {
  let product = null;

  if (state.productId) {
    const response = await fetch(`/api/products/${encodeURIComponent(state.productId)}`);
    if (response.ok) {
      product = await readJsonResponse(response);
    }
  }

  if (!product) {
    const response = await fetch("/api/products");
    const products = await readJsonResponse(response);
    if (Array.isArray(products) && products.length) {
      product = products[0];
      state.productId = product.id;
    }
  }

  if (!product) {
    throw new Error("Produto nao encontrado para envio.");
  }

  state.product = product;
  state.variation = getActiveVariation();
  if (state.variation) {
    state.variationId = state.variation.id;
  }

  state.baseAmount = resolveBaseAmount();
  updateSummary();

  const params = new URLSearchParams();
  params.set("id", state.productId);
  if (state.variationId) params.set("variation", state.variationId);
  if (state.couponCode) params.set("cupom", state.couponCode);
  elements.backToProductLink.href = `/produto.html?${params.toString()}`;
}

async function loadShippingStatus() {
  const response = await fetch("/api/shipping/config");
  const data = await readJsonResponse(response);
  state.connected = Boolean(data.connected);
  state.readyForShipment = Boolean(data.readyForShipment);
  state.missingShipmentScopes = Array.isArray(data.missingShipmentScopes) ? data.missingShipmentScopes : [];
  elements.calculateShippingBtn.disabled = !state.readyForShipment;
  elements.continueToPaymentBtn.disabled = !state.readyForShipment;

  if (!state.connected) {
    setMessage("Conecte a Melhor Envio no painel do vendedor antes de calcular frete.", "error");
    return;
  }

  if (!state.readyForShipment && state.missingShipmentScopes.length) {
    setMessage(
      `Reconecte a Melhor Envio no painel do vendedor para liberar os escopos: ${formatMissingScopes(state.missingShipmentScopes)}.`,
      "error",
    );
  }
}

function wireEvents() {
  elements.lookupCepBtn.addEventListener("click", lookupCep);
  elements.calculateShippingBtn.addEventListener("click", calculateShipping);
  elements.postalCodeInput.addEventListener("blur", () => {
    const cep = normalizePostalCode(elements.postalCodeInput.value);
    if (cep) {
      elements.postalCodeInput.value = cep;
    }
  });

  elements.quoteList.addEventListener("change", (event) => {
    const radio = event.target.closest('input[name="shippingQuote"]');
    if (!radio) return;
    state.selectedQuoteId = String(radio.value || "");
    const selected = getSelectedQuote();
    state.shippingAmount = Number(selected?.price || 0);
    updateSummary();
  });

  elements.continueToPaymentBtn.addEventListener("click", () => {
    createShipmentDirectly();
  });
}

async function init() {
  parseParams();
  wireEvents();
  elements.continueToPaymentBtn.textContent = "Finalizar Compra";
  await Promise.all([loadProductContext(), loadShippingStatus()]);
  preloadFromStorage();
}

init().catch((error) => {
  setMessage(error.message || "Falha ao iniciar etapa de envio.", "error");
});
