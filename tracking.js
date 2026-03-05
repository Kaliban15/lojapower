const POLL_INTERVAL_MS = 6000;
const MAX_POLL_ATTEMPTS = 20;

function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return String(params.get(name) || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
    throw new Error(parsed?.message || "Falha ao consultar rastreio.");
  }

  return parsed || {};
}

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("pt-BR");
}

function humanizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const map = {
    created: "Envio criado",
    created_without_label: "Envio criado",
    released: "Envio liberado",
    posted: "Enviado",
    shipped: "Em transporte",
    delivered: "Entregue",
    pending: "Pendente",
    waiting_payment: "Aguardando pagamento",
    payment_approved: "Pagamento aprovado",
    shipping_error: "Em atualizacao",
  };

  if (!normalized) return "";
  if (map[normalized]) return map[normalized];

  const text = normalized.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function mergeTrackingFromApi(state, payload) {
  const tracking = payload?.tracking && typeof payload.tracking === "object" ? payload.tracking : {};
  if (tracking.orderId) state.order = String(tracking.orderId);
  if (tracking.protocol) state.protocol = String(tracking.protocol);
  if (tracking.status) state.shippingStatus = String(tracking.status);
  if (tracking.tracking) state.tracking = String(tracking.tracking);
  if (tracking.melhorEnvioTracking) state.melhorEnvioTracking = String(tracking.melhorEnvioTracking);
  if (tracking.createdAt) state.createdAt = String(tracking.createdAt);
  if (tracking.paidAt) state.paidAt = String(tracking.paidAt);
  if (tracking.generatedAt) state.generatedAt = String(tracking.generatedAt);
  if (tracking.postedAt) state.postedAt = String(tracking.postedAt);
  if (tracking.deliveredAt) state.deliveredAt = String(tracking.deliveredAt);
}

function createInitialState() {
  return {
    order: getParam("order"),
    protocol: getParam("protocol"),
    tracking: getParam("tracking"),
    melhorEnvioTracking: getParam("me_tracking"),
    shippingStatus: getParam("shipping_status"),
    purchaseStatus: getParam("purchase_status"),
    service: getParam("service"),
    company: getParam("company"),
    externalReference: getParam("external_reference"),
    labelUrl: getParam("label_url"),
    createdAt: "",
    paidAt: "",
    generatedAt: "",
    postedAt: "",
    deliveredAt: "",
    pollAttempt: 0,
    lastSyncAt: "",
    syncError: "",
  };
}

function createSummaryItems(state) {
  const items = [];
  const shippingStatus = humanizeStatus(state.shippingStatus);
  const purchaseStatus = humanizeStatus(state.purchaseStatus);

  if (shippingStatus) items.push({ label: "Status do envio", value: shippingStatus });
  if (state.tracking) {
    items.push({ label: "Codigo de rastreio", value: state.tracking });
  } else if (state.melhorEnvioTracking) {
    items.push({ label: "Codigo de acompanhamento", value: state.melhorEnvioTracking });
  }
  if (state.company) items.push({ label: "Transportadora", value: state.company });
  if (state.service) items.push({ label: "Modalidade", value: state.service });
  if (purchaseStatus) items.push({ label: "Status da compra", value: purchaseStatus });
  if (state.externalReference) items.push({ label: "Numero do pedido", value: state.externalReference });
  if (state.deliveredAt) {
    items.push({ label: "Entregue em", value: formatDateTime(state.deliveredAt) });
  } else if (state.postedAt) {
    items.push({ label: "Postado em", value: formatDateTime(state.postedAt) });
  } else if (state.generatedAt) {
    items.push({ label: "Ultima atualizacao", value: formatDateTime(state.generatedAt) });
  } else if (state.lastSyncAt) {
    items.push({ label: "Ultima atualizacao", value: formatDateTime(state.lastSyncAt) });
  }

  return items.slice(0, 6);
}

function renderState(state, elements) {
  const {
    badge,
    title,
    text,
    summary,
    helper,
  } = elements;

  const hasIdentity = Boolean(state.order || state.protocol || state.externalReference);
  const hasTracking = Boolean(state.tracking);
  const hasMeTracking = Boolean(state.melhorEnvioTracking);
  const shippingStatus = String(state.shippingStatus || "").trim().toLowerCase();
  const delivered = shippingStatus === "delivered" || Boolean(state.deliveredAt);

  if (!hasIdentity && !hasTracking && !hasMeTracking) {
    badge.textContent = "Pedido em processamento";
    title.textContent = "Estamos preparando os detalhes do seu pedido.";
    text.textContent = "Se a compra acabou de ser concluida, aguarde alguns instantes enquanto sincronizamos as informacoes.";
    helper.textContent = "Assim que o sistema localizar o envio, esta tela sera atualizada automaticamente.";
  } else if (delivered) {
    badge.textContent = "Pedido entregue";
    title.textContent = "Seu pedido foi entregue.";
    text.textContent = "Obrigado pela compra. Se precisar consultar novamente, a area Minhas Compras continua disponivel.";
    helper.textContent = "Guarde este pedido em Minhas Compras para consultar o historico sempre que quiser.";
  } else if (hasTracking) {
    badge.textContent = "Rastreio disponivel";
    title.textContent = "Seu pedido ja esta em rota.";
    text.textContent = "O codigo de rastreio final ja esta disponivel e seguiremos atualizando este acompanhamento automaticamente.";
    helper.textContent = "Voce tambem pode consultar esse pedido a qualquer momento pela area Minhas Compras.";
  } else if (hasMeTracking || state.order) {
    badge.textContent = "Envio em preparacao";
    title.textContent = "Seu envio ja foi criado.";
    text.textContent = "Seu pedido esta seguindo para as proximas etapas. O codigo final da transportadora pode aparecer em alguns minutos.";
    helper.textContent = "Assim que o rastreio final estiver disponivel, ele aparecera aqui automaticamente.";
  } else {
    badge.textContent = "Pagamento aprovado";
    title.textContent = "Recebemos seu pedido com sucesso.";
    text.textContent = "Agora estamos organizando o envio para que voce acompanhe tudo de forma simples e segura.";
    helper.textContent = "Esta pagina atualiza sozinha enquanto o envio e preparado.";
  }

  const summaryItems = createSummaryItems(state);
  if (!summaryItems.length) {
    summary.hidden = true;
    summary.innerHTML = "";
  } else {
    summary.hidden = false;
    summary.innerHTML = summaryItems.map((item) => `
      <article class="summary-card">
        <p class="summary-label">${escapeHtml(item.label)}</p>
        <p class="summary-value">${escapeHtml(item.value)}</p>
      </article>
    `).join("");
  }
}

async function fetchTrackingByOrder(orderId) {
  const response = await fetch(`/api/shipping/tracking/${encodeURIComponent(orderId)}`);
  return readJsonResponse(response);
}

async function pollTracking(state, elements) {
  if (!state.order) return;

  for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt += 1) {
    state.pollAttempt = attempt;
    try {
      const payload = await fetchTrackingByOrder(state.order);
      mergeTrackingFromApi(state, payload);
      state.syncError = "";
    } catch (error) {
      state.syncError = error?.message || "Falha ao atualizar rastreio.";
    }

    state.lastSyncAt = new Date().toISOString();
    renderState(state, elements);

    if (state.tracking) return;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

function init() {
  const elements = {
    badge: document.getElementById("trackingBadge"),
    title: document.getElementById("trackingTitle"),
    text: document.getElementById("trackingText"),
    summary: document.getElementById("trackingSummary"),
    helper: document.getElementById("trackingHelper"),
  };

  const state = createInitialState();
  renderState(state, elements);

  void pollTracking(state, elements);
}

init();
