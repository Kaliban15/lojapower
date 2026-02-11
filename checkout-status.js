function getParam(name) {
  const params = new URLSearchParams(window.location.search);
  return String(params.get(name) || "").trim();
}

function textMap(status) {
  if (status === "success" || status === "approved") {
    return {
      tag: "Pagamento aprovado",
      tagClass: "success",
      title: "Pedido confirmado com sucesso.",
      text: "Recebemos seu pagamento no Mercado Pago. Obrigado pela compra.",
    };
  }
  if (status === "failure" || status === "rejected") {
    return {
      tag: "Pagamento nao concluido",
      tagClass: "failure",
      title: "Nao foi possivel concluir o pagamento.",
      text: "Voce pode voltar ao checkout e tentar novamente com outro metodo no Mercado Pago.",
    };
  }
  return {
    tag: "Pagamento pendente",
    tagClass: "pending",
    title: "Pagamento em analise ou aguardando confirmacao.",
    text: "Quando o Mercado Pago confirmar, seu pedido sera atualizado automaticamente.",
  };
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
    throw new Error(parsed?.message || "Falha ao consultar status de envio.");
  }

  return parsed || {};
}

function appendMetaLine(lines, label, value) {
  const text = String(value || "").trim();
  if (!text) return;
  lines.push(`${label}: ${text}`);
}

async function syncShippingFromPayment(paymentId) {
  if (!paymentId) return null;
  const response = await fetch("/api/checkout/shipping/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentId }),
  });
  return readJsonResponse(response);
}

async function syncShippingFromReference(externalReference) {
  if (!externalReference) return null;
  const response = await fetch("/api/checkout/shipping/sync-reference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ externalReference }),
  });
  return readJsonResponse(response);
}

async function init() {
  const statusRaw = getParam("status").toLowerCase();
  const paymentId = getParam("payment_id");
  const merchantOrderId = getParam("merchant_order_id");
  const externalReference = getParam("external_reference");

  const ui = textMap(statusRaw);
  const tag = document.getElementById("statusTag");
  const title = document.getElementById("statusTitle");
  const text = document.getElementById("statusText");
  const meta = document.getElementById("statusMeta");

  tag.textContent = ui.tag;
  tag.classList.remove("success", "pending", "failure");
  tag.classList.add(ui.tagClass);

  title.textContent = ui.title;
  text.textContent = ui.text;

  const rows = [];
  if (paymentId) rows.push(`Pagamento: ${paymentId}`);
  if (merchantOrderId) rows.push(`Ordem Mercado Pago: ${merchantOrderId}`);
  if (externalReference) rows.push(`Referencia: ${externalReference}`);
  rows.push(`Status recebido: ${statusRaw || "pending"}`);

  if (paymentId) {
    try {
      const syncResult = await syncShippingFromPayment(paymentId);
      const shipping = syncResult?.shipping && typeof syncResult.shipping === "object"
        ? syncResult.shipping
        : {};
      const shippingStatus = String(shipping.status || syncResult?.reason || "").trim();
      if (shippingStatus) {
        rows.push(`Envio: ${shippingStatus}`);
      }
      appendMetaLine(rows, "Ordem Melhor Envio", shipping.melhorEnvioOrderId);
      appendMetaLine(rows, "Protocolo", shipping.protocol);
      appendMetaLine(rows, "Rastreio", shipping.tracking);
    } catch (error) {
      rows.push(`Envio: ${error?.message || "Falha ao sincronizar envio"}`);
    }
  } else if (externalReference) {
    try {
      const syncResult = await syncShippingFromReference(externalReference);
      const shipping = syncResult?.shipping && typeof syncResult.shipping === "object"
        ? syncResult.shipping
        : {};
      const shippingStatus = String(shipping.status || syncResult?.reason || "").trim();
      if (shippingStatus) {
        rows.push(`Envio: ${shippingStatus}`);
      }
      appendMetaLine(rows, "Pagamento detectado", syncResult?.approvedPaymentId || "");
      appendMetaLine(rows, "Ordem Melhor Envio", shipping.melhorEnvioOrderId);
      appendMetaLine(rows, "Protocolo", shipping.protocol);
      appendMetaLine(rows, "Rastreio", shipping.tracking);
    } catch (error) {
      rows.push(`Envio: ${error?.message || "Falha ao sincronizar envio por referencia"}`);
    }
  }

  meta.innerHTML = rows.map((line) => `<div>${line}</div>`).join("");
}

init();
