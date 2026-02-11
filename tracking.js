const POLL_INTERVAL_MS = 6000;
const MAX_POLL_ATTEMPTS = 20;

function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return String(params.get(name) || "").trim();
}

function appendMetaLine(container, label, value) {
  const text = String(value || "").trim();
  if (!text) return;
  const row = document.createElement("div");
  row.textContent = `${label}: ${text}`;
  container.appendChild(row);
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

async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("pt-BR");
}

function resolvePrimaryTrackingCode(state) {
  return String(state.tracking || state.melhorEnvioTracking || "").trim();
}

function getCopyButtonLabel(state) {
  if (state.tracking) return "Copiar codigo de rastreio";
  if (state.melhorEnvioTracking) return "Copiar codigo Melhor Envio";
  return "Codigo de rastreio indisponivel";
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

function renderState(state, elements) {
  const {
    title,
    text,
    meta,
    copyTrackingBtn,
    labelLink,
  } = elements;

  const hasIdentity = Boolean(state.order || state.protocol || state.externalReference);
  const hasTracking = Boolean(state.tracking);
  const hasMeTracking = Boolean(state.melhorEnvioTracking);

  if (!hasIdentity && !hasTracking && !hasMeTracking) {
    title.textContent = "Nao encontramos os dados de rastreio.";
    text.textContent = "Tente voltar e gerar o envio novamente.";
  } else if (hasTracking) {
    title.textContent = "Seu envio foi criado com sucesso.";
    text.textContent = "Seu codigo de rastreio final ja esta disponivel.";
  } else if (hasMeTracking) {
    title.textContent = "Seu envio foi criado com sucesso.";
    text.textContent = "A etiqueta foi criada. O codigo final da transportadora pode aparecer em alguns minutos.";
  } else {
    title.textContent = "Seu envio foi criado com sucesso.";
    text.textContent = "Estamos buscando atualizacoes de rastreio em tempo real.";
  }

  meta.innerHTML = "";
  appendMetaLine(meta, "Ordem Melhor Envio", state.order);
  appendMetaLine(meta, "Protocolo", state.protocol);
  appendMetaLine(meta, "Status do envio", state.shippingStatus);
  appendMetaLine(meta, "Rastreio (transportadora)", state.tracking);
  appendMetaLine(meta, "Codigo Melhor Envio", state.melhorEnvioTracking);
  appendMetaLine(meta, "Transportadora", state.company);
  appendMetaLine(meta, "Servico", state.service);
  appendMetaLine(meta, "Status da compra", state.purchaseStatus);
  appendMetaLine(meta, "Etiqueta gerada em", formatDateTime(state.generatedAt));
  appendMetaLine(meta, "Postado em", formatDateTime(state.postedAt));
  appendMetaLine(meta, "Entregue em", formatDateTime(state.deliveredAt));
  appendMetaLine(meta, "Referencia", state.externalReference);

  if (state.lastSyncAt) {
    appendMetaLine(meta, "Ultima atualizacao", formatDateTime(state.lastSyncAt));
  }
  if (state.pollAttempt > 0 && !state.tracking) {
    appendMetaLine(meta, "Atualizacao automatica", `${state.pollAttempt}/${MAX_POLL_ATTEMPTS}`);
  }
  if (state.syncError) {
    appendMetaLine(meta, "Aviso", state.syncError);
  }

  if (state.labelUrl && /^https?:\/\//.test(state.labelUrl)) {
    labelLink.hidden = false;
    labelLink.href = state.labelUrl;
  }

  const codeToCopy = resolvePrimaryTrackingCode(state);
  copyTrackingBtn.dataset.code = codeToCopy;
  copyTrackingBtn.disabled = !codeToCopy;
  copyTrackingBtn.textContent = getCopyButtonLabel(state);
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
    title: document.getElementById("trackingTitle"),
    text: document.getElementById("trackingText"),
    meta: document.getElementById("trackingMeta"),
    copyTrackingBtn: document.getElementById("copyTrackingBtn"),
    labelLink: document.getElementById("labelLink"),
  };

  const state = createInitialState();
  renderState(state, elements);

  elements.copyTrackingBtn.addEventListener("click", async () => {
    const code = String(elements.copyTrackingBtn.dataset.code || "").trim();
    if (!code) return;

    const copied = await copyText(code);
    if (copied) {
      elements.copyTrackingBtn.textContent = "Codigo copiado";
      setTimeout(() => {
        renderState(state, elements);
      }, 1600);
      return;
    }

    elements.copyTrackingBtn.textContent = "Nao foi possivel copiar";
    setTimeout(() => {
      renderState(state, elements);
    }, 1600);
  });

  void pollTracking(state, elements);
}

init();
