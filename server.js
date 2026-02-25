require('dotenv').config();
console.log("DEBUG - URI do MongoDB carregada:", process.env.MONGO_URI ? "Sim (Ok)" : "Não (Vazia)");
const express = require("express");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const multer = require("multer");
const connectDB = require("./database"); // <--- ADICIONE ISSO

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");

// Removidos os caminhos de arquivos JSON (agora usamos MongoDB)

const MERCADO_PAGO_PUBLIC_KEY = process.env.MP_PUBLIC_KEY;
const MERCADO_PAGO_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

const MERCADO_PAGO_PAYMENTS_API = "https://api.mercadopago.com/v1/payments";
const MERCADO_PAGO_PAYMENTS_SEARCH_API = "https://api.mercadopago.com/v1/payments/search";
const MERCADO_PAGO_PREFERENCES_API = "https://api.mercadopago.com/checkout/preferences";
const MERCADO_PAGO_MERCHANT_ORDERS_API = "https://api.mercadopago.com/merchant_orders";

const CHECKOUT_PRO_SUCCESS_URL = String(process.env.CHECKOUT_PRO_SUCCESS_URL || "").trim();
const CHECKOUT_PRO_PENDING_URL = String(process.env.CHECKOUT_PRO_PENDING_URL || "").trim();
const CHECKOUT_PRO_FAILURE_URL = String(process.env.CHECKOUT_PRO_FAILURE_URL || "").trim();
const CHECKOUT_PRO_NOTIFICATION_URL = String(process.env.CHECKOUT_PRO_NOTIFICATION_URL || "").trim();

// Credenciais OFICIAIS da Loja PowerTech (Produção)
const MELHOR_ENVIO_CLIENT_ID = String(process.env.ME_CLIENT_ID || "22294").trim();

const MELHOR_ENVIO_CLIENT_SECRET = String(process.env.ME_CLIENT_SECRET || "RVpcgst4wnhEMz3wmKipZU85WbHv9CnG7qzcAVAf").trim();

// Mudamos o padrão de "sandbox" para "production"
// IMPORTANTE: Mantivemos o operador ternário (? :) para retornar TEXTO, não booleano.
const MELHOR_ENVIO_ENVIRONMENT = String(process.env.ME_ENV || "production").trim().toLowerCase() === "production"
  ? "production"
  : "sandbox";
const MELHOR_ENVIO_DEFAULT_AUTH_SCOPES = [
  "shipping-calculate",
  "orders-read",
  "cart-read",
  "cart-write",
  "shipping-checkout",
  "shipping-generate",
  "shipping-tracking",
  "users-read",
];
const MELHOR_ENVIO_SCOPES = String(
  process.env.ME_SCOPES
  || MELHOR_ENVIO_DEFAULT_AUTH_SCOPES.join(" "),
).trim() || MELHOR_ENVIO_DEFAULT_AUTH_SCOPES.join(" ");
const MELHOR_ENVIO_REDIRECT_PATH = (() => {
  const raw = String(process.env.ME_REDIRECT_PATH || "/callback/melhorenvio").trim() || "/callback/melhorenvio";
  return raw.startsWith("/") ? raw : `/${raw}`;
})();
const MELHOR_ENVIO_REDIRECT_URI = String(
  process.env.ME_REDIRECT_URI
  || "https://d690h71m-3000.brs.devtunnels.ms/callback/melhorenvio",
).trim();
const MELHOR_ENVIO_ENDPOINTS = {
  production: "https://melhorenvio.com.br",
  sandbox: "https://sandbox.melhorenvio.com.br",
};
const MELHOR_ENVIO_REFRESH_MARGIN_MS = 60 * 1000;
const MELHOR_ENVIO_REQUIRED_SHIPMENT_SCOPES = [
  "shipping-calculate",
  "orders-read",
  "cart-read",
  "cart-write",
  "shipping-checkout",
  "shipping-generate",
  "users-read",
];
const CORREIOS_SERVICE_IDS = new Set([1, 2, 17, 31, 32, 33]);
const CHECKOUT_STORE_LIMIT = 2000;
const shippingProcessLocks = new Map();
const paymentWatchByReference = new Map();
const PAYMENT_WATCH_INTERVAL_MS = Math.max(5000, Math.floor(Number(process.env.PAYMENT_WATCH_INTERVAL_MS || 15000) || 15000));
const PAYMENT_WATCH_MAX_ATTEMPTS = Math.max(1, Math.floor(Number(process.env.PAYMENT_WATCH_MAX_ATTEMPTS || 240) || 240));

const CATEGORIES = [
  "Fones de ouvido",
  "Carregadores",
  "Eletronicos",
  "Casa",
  "Carro",
];

const DEFAULT_BULLETS = [
  "Garantia oficial de 3 anos",
  "Rastreamento em tempo real no celular",
  "Despacho prioritario para entrega agil",
];

const DEFAULT_TRUST_CARDS = [
  {
    title: "Entrega no mesmo dia*",
    description: "Em regioes elegiveis, pedido aprovado vai para expedicao expressa.",
  },
  {
    title: "Checkout sem senha",
    description: "Compra de convidado em uma pagina, com menos friccao.",
  },
  {
    title: "Compra protegida",
    description: "Pagamento via PIX copia e cola com validacao simplificada.",
  },
];

const DEFAULT_PRODUCT_SHIPPING = {
  width: 16,
  height: 4,
  length: 16,
  weight: 0.3,
  insuranceValue: 0,
};

const DEFAULT_SHIPPING_CONFIG = {
  originPostalCode: "01010-000",
  services: [1, 2, 17],
  options: {
    receipt: false,
    ownHand: false,
    collect: false,
  },
  sender: {
    name: "",
    email: "",
    phone: "",
    document: "",
    companyDocument: "",
    postalCode: "",
    address: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
  },
};
// 1. Configuração do Cloudinary
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configuração do Armazenamento (Storage)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'produtos_powertech',
    resource_type: "auto",
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp', 'mp4', 'webm', 'mov'],
    public_id: (req, file) => `prod-${Date.now()}`
  },
});

// 3. O middleware final (Com os limites que você já usava)
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // Mantém o limite de 5MB
  fileFilter: (_req, file, cb) => {
    const mimeType = String(file.mimetype || "").toLowerCase();
    if (mimeType.startsWith("image/") || mimeType.startsWith("video/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Apenas arquivos de midia (imagem ou video) sao permitidos."));
  },
});

function normalizePrice(input) {
  if (typeof input === "number") return input;

  const raw = String(input || "")
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

function normalizePostalCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function isValidPostalCode(value) {
  return normalizePostalCode(value).length === 8;
}

function normalizePositiveNumber(value, fallback = 0, { min = 0.0001, max = 999999 } = {}) {
  const raw = typeof value === "number" ? value : normalizePrice(value);
  if (!Number.isFinite(raw)) return Number(fallback);
  const bounded = Math.max(min, Math.min(max, Number(raw)));
  return Number(bounded.toFixed(3));
}

function normalizeServiceList(input) {
  const source = Array.isArray(input)
    ? input
    : String(input || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const parsed = source
    .map((item) => Number(String(item).replace(/\D/g, "")))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));

  const unique = Array.from(new Set(parsed));
  return unique.slice(0, 20);
}

function normalizeShippingOptions(input = {}) {
  return {
    receipt: Boolean(input.receipt),
    ownHand: Boolean(input.ownHand || input.own_hand),
    collect: Boolean(input.collect),
  };
}

function normalizeShippingSender(input = {}) {
  const postalCodeRaw = normalizePostalCode(input.postalCode || input.postal_code || input.cep);

  return {
    name: firstNonEmptyString(input.name),
    email: firstNonEmptyString(input.email),
    phone: normalizePhone(firstNonEmptyString(input.phone)),
    document: normalizeCpf(firstNonEmptyString(input.document, input.cpf)),
    companyDocument: normalizeCnpj(firstNonEmptyString(input.companyDocument, input.company_document, input.cnpj)),
    postalCode: postalCodeRaw.length === 8
      ? `${postalCodeRaw.slice(0, 5)}-${postalCodeRaw.slice(5)}`
      : "",
    address: firstNonEmptyString(input.address, input.street),
    number: String(input.number || "").trim(),
    complement: String(input.complement || "").trim(),
    district: firstNonEmptyString(input.district),
    city: firstNonEmptyString(input.city),
    state: normalizeStateAbbr(firstNonEmptyString(input.state, input.state_abbr)),
  };
}

function normalizeShippingConfig(input = {}) {
  const originPostalCodeRaw = normalizePostalCode(input.originPostalCode || input.origin_postal_code);
  const sender = normalizeShippingSender(input.sender && typeof input.sender === "object" ? input.sender : {});
  const senderPostalCodeRaw = normalizePostalCode(sender.postalCode);
  const services = normalizeServiceList(input.services);
  const resolvedOriginPostalCodeRaw = originPostalCodeRaw.length === 8
    ? originPostalCodeRaw
    : (senderPostalCodeRaw.length === 8 ? senderPostalCodeRaw : "");

  return {
    originPostalCode: resolvedOriginPostalCodeRaw.length === 8
      ? `${resolvedOriginPostalCodeRaw.slice(0, 5)}-${resolvedOriginPostalCodeRaw.slice(5)}`
      : DEFAULT_SHIPPING_CONFIG.originPostalCode,
    services: services.length ? services : [...DEFAULT_SHIPPING_CONFIG.services],
    options: normalizeShippingOptions(input.options || {}),
    sender,
  };
}








// ==========================================================
// MÓDULO MONGODB (Nova Lógica)
// ==========================================================

// 1. Configurações de Frete
async function readShippingConfig() {
  try {
    const db = await connectDB();
    const config = await db.collection("settings").findOne({ _id: "shipping_default" });
    return normalizeShippingConfig(config || DEFAULT_SHIPPING_CONFIG);
  } catch (error) {
    console.error("Erro Mongo (readShippingConfig):", error);
    return normalizeShippingConfig(DEFAULT_SHIPPING_CONFIG);
  }
}

async function writeShippingConfig(config) {
  try {
    const db = await connectDB();
    const data = normalizeShippingConfig(config);
    await db.collection("settings").updateOne(
      { _id: "shipping_default" },
      { $set: data },
      { upsert: true }
    );
  } catch (error) {
    console.error("Erro Mongo (writeShippingConfig):", error);
  }
}

// Helpers de normalização (Mantivemos os seus originais pois são úteis)
function normalizeStorageMap(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    output[normalizedKey] = value;
  }
  return output;
}

// 2. Intenções de Checkout (Carrinhos/Pedidos Iniciados)
async function readCheckoutIntents() {
  try {
    const db = await connectDB();
    // Busca tudo para manter compatibilidade com lógica antiga que espera um Map
    const docs = await db.collection("checkout_intents").find({}).toArray();
    const map = {};
    docs.forEach(doc => {
      if (doc.externalReference) map[doc.externalReference] = doc;
    });
    return map;
  } catch (error) {
    console.error("Erro Mongo (readCheckoutIntents):", error);
    return {};
  }
}

async function writeCheckoutIntents(payload = {}) {
  // Função obsoleta no Mongo (salvamos item a item), mantida vazia para não quebrar chamadas.
  return payload;
}

async function getCheckoutIntentByExternalReference(externalReference) {
  const key = String(externalReference || "").trim();
  if (!key) return null;
  try {
    const db = await connectDB();
    return await db.collection("checkout_intents").findOne({ externalReference: key });
  } catch (error) {
    return null;
  }
}

async function upsertCheckoutIntent(externalReference, patch = {}) {
  const key = String(externalReference || "").trim().slice(0, 64);
  if (!key) return null;

  try {
    const db = await connectDB();
    const collection = db.collection("checkout_intents");

    // Busca apenas o atual
    const current = (await collection.findOne({ externalReference: key })) || {};
    
    // Aplica sua lógica original de normalização
    const normalizedPatch = normalizeCheckoutIntentPatch(key, patch);
    const now = new Date().toISOString();

    const next = {
      ...current,
      externalReference: key,
      title: normalizedPatch.title || String(current.title || "").trim(),
      payer: {
        ...(current.payer && typeof current.payer === "object" ? current.payer : {}),
        ...(normalizedPatch.payer ? normalizedPatch.payer : {}),
      },
      order: normalizedPatch.order
        ? normalizedPatch.order
        : (current.order && typeof current.order === "object" ? current.order : {}),
      items: normalizedPatch.items.length
        ? normalizedPatch.items
        : (Array.isArray(current.items) ? current.items : []),
      preferenceId: normalizedPatch.preferenceId || String(current.preferenceId || ""),
      checkoutUrl: normalizedPatch.checkoutUrl || String(current.checkoutUrl || ""),
      payment: {
        ...(current.payment && typeof current.payment === "object" ? current.payment : {}),
        ...(normalizedPatch.payment ? normalizedPatch.payment : {}),
      },
      shipping: {
        ...(current.shipping && typeof current.shipping === "object" ? current.shipping : {}),
        ...(normalizedPatch.shipping ? normalizedPatch.shipping : {}),
      },
      createdAt: String(current.createdAt || now),
      updatedAt: now,
    };

    // Salva no banco
    await collection.updateOne(
      { externalReference: key },
      { $set: next },
      { upsert: true }
    );

    return next;
  } catch (error) {
    console.error("Erro Mongo (upsertCheckoutIntent):", error);
    return null;
  }
}

// 3. Pedidos de Envio (Shipping Orders)
async function readShippingOrders() {
  try {
    const db = await connectDB();
    const docs = await db.collection("shipping_orders").find({}).toArray();
    const map = {};
    docs.forEach(doc => {
      if (doc.paymentId) map[doc.paymentId] = doc;
    });
    return map;
  } catch (error) {
    return {};
  }
}

async function writeShippingOrders(payload = {}) {
  // Obsoleto no Mongo
  return payload;
}

function getShippingReferenceKey(externalReference) {
  const ref = normalizeExternalReference(externalReference);
  if (!ref) return "";
  return `ref-${ref}`;
}

async function getShippingOrderRecordByPaymentId(paymentId) {
  const key = String(paymentId || "").trim();
  if (!key) return null;
  try {
    const db = await connectDB();
    return await db.collection("shipping_orders").findOne({ paymentId: key });
  } catch (error) {
    return null;
  }
}

async function upsertShippingOrderRecord(paymentId, patch = {}) {
  const key = String(paymentId || "").trim();
  if (!key) return null;

  try {
    const db = await connectDB();
    const collection = db.collection("shipping_orders");

    const current = (await collection.findOne({ paymentId: key })) || {};
    const now = new Date().toISOString();

    // Lógica original de Timeline e Normalização
    const timelineCurrent = Array.isArray(current.timeline)
      ? current.timeline.filter((item) => item && typeof item === "object")
      : [];
      
    const timelinePatch = Array.isArray(patch.timeline)
      ? patch.timeline
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          at: String(item.at || now),
          stage: String(item.stage || "").trim().slice(0, 120),
          message: String(item.message || "").trim().slice(0, 240),
          source: String(item.source || patch.source || "").trim().slice(0, 64),
        }))
        .filter((item) => item.stage || item.message)
      : [];

    if (patch.auditEvent) {
      timelinePatch.push({
        at: now,
        stage: String(patch.status || "").trim().slice(0, 120),
        message: String(patch.auditEvent || "").trim().slice(0, 240),
        source: String(patch.source || "").trim().slice(0, 64),
      });
    }

    if (patch.status && String(patch.status).trim() !== String(current.status || "").trim()) {
      timelinePatch.push({
        at: now,
        stage: String(patch.status).trim().slice(0, 120),
        message: `Status atualizado para ${String(patch.status).trim()}.`,
        source: String(patch.source || "").trim().slice(0, 64),
      });
    }

    if (patch.paymentStatus && String(patch.paymentStatus).trim() !== String(current.paymentStatus || "").trim()) {
      timelinePatch.push({
        at: now,
        stage: "payment_status",
        message: `Pagamento: ${String(patch.paymentStatus).trim()}.`,
        source: String(patch.source || "").trim().slice(0, 64),
      });
    }

    const next = {
      ...current,
      paymentId: key,
      externalReference: String(patch.externalReference || current.externalReference || "").trim(),
      linkedPaymentId: String(patch.linkedPaymentId || current.linkedPaymentId || "").trim(),
      source: String(patch.source || current.source || "").trim(),
      customerCpf: normalizeCpf(patch.customerCpf || patch.cpf || current.customerCpf || ""),
      customerName: String(patch.customerName || current.customerName || "").trim(),
      status: String(patch.status || current.status || "pending").trim(),
      paymentStatus: String(patch.paymentStatus || current.paymentStatus || "").trim(),
      paymentStatusDetail: String(patch.paymentStatusDetail || current.paymentStatusDetail || "").trim(),
      melhorEnvioOrderId: String(patch.melhorEnvioOrderId || current.melhorEnvioOrderId || "").trim(),
      purchaseId: String(patch.purchaseId || current.purchaseId || "").trim(),
      protocol: String(patch.protocol || current.protocol || "").trim(),
      tracking: String(patch.tracking || current.tracking || "").trim(),
      labelUrl: String(patch.labelUrl || current.labelUrl || "").trim(),
      labelGenerated: Boolean(patch.labelGenerated !== undefined ? patch.labelGenerated : current.labelGenerated),
      serviceId: Number.isFinite(Number(patch.serviceId)) ? Number(patch.serviceId) : (Number.isFinite(Number(current.serviceId)) ? Number(current.serviceId) : null),
      serviceName: String(patch.serviceName || current.serviceName || "").trim(),
      companyName: String(patch.companyName || current.companyName || "").trim(),
      errors: Array.isArray(patch.errors) ? patch.errors.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20) : (Array.isArray(current.errors) ? current.errors : []),
      attempts: Math.max(0, Math.floor(Number(patch.attempts ?? current.attempts ?? 0) || 0)),
      createdAt: String(current.createdAt || now),
      updatedAt: now,
      lastAttemptAt: String(patch.lastAttemptAt || current.lastAttemptAt || now),
      timeline: [...timelineCurrent, ...timelinePatch].slice(-200),
    };

    await collection.updateOne(
      { paymentId: key },
      { $set: next },
      { upsert: true }
    );

    return next;
  } catch (error) {
    console.error("Erro Mongo (upsertShippingOrderRecord):", error);
    return null;
  }
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function normalizeCnpj(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 14);
}

function getMelhorEnvioBaseEndpoint() {
  return MELHOR_ENVIO_ENDPOINTS[MELHOR_ENVIO_ENVIRONMENT];
}

function normalizeScopes(input) {
  const source = Array.isArray(input)
    ? input.join(" ")
    : String(input || MELHOR_ENVIO_SCOPES);
  return source
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean)
    .join(" ");
}

function resolveMelhorEnvioAuthScopes(input = MELHOR_ENVIO_SCOPES) {
  const configuredScopes = normalizeScopes(input);
  const merged = [
    ...(configuredScopes ? configuredScopes.split(/\s+/) : []),
    ...MELHOR_ENVIO_DEFAULT_AUTH_SCOPES,
  ];
  const aliases = {
    "shipping-orders": "orders-read",
  };
  const unique = [];
  const seen = new Set();
  for (const scope of merged) {
    const raw = String(scope || "").trim().toLowerCase();
    const normalized = aliases[raw] || raw;
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique.join(" ");
}

function getScopeSet(input) {
  const normalized = normalizeScopes(input);
  if (!normalized) return new Set();
  return new Set(
    normalized
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

function getMissingScopes(currentScopes, requiredScopes = []) {
  const set = getScopeSet(currentScopes);
  const required = requiredScopes
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  if (!required.length) return [];
  if (!set.size) return Array.from(new Set(required));
  return required.filter((scope) => !set.has(scope));
}

function getShippingIntegrationReadiness(token = null) {
  const connected = Boolean(
    token?.accessToken
    && String(token?.environment || MELHOR_ENVIO_ENVIRONMENT) === MELHOR_ENVIO_ENVIRONMENT,
  );
  const tokenScopes = token?.scope ? normalizeScopes(token.scope) : "";
  const missingShipmentScopes = connected
    ? getMissingScopes(tokenScopes, MELHOR_ENVIO_REQUIRED_SHIPMENT_SCOPES)
    : [...MELHOR_ENVIO_REQUIRED_SHIPMENT_SCOPES];
  const readyForShipment = connected && missingShipmentScopes.length === 0;
  return {
    connected,
    tokenScopes,
    missingShipmentScopes,
    readyForShipment,
  };
}

function normalizeExternalReference(value) {
  return String(value || "").trim().slice(0, 64);
}

function listCheckoutIntentsSorted(payload = {}, limit = 50) {
  const normalized = normalizeStorageMap(payload);
  return Object.values(normalized)
    .map((item) => (item && typeof item === "object" ? item : {}))
    .filter((item) => String(item.externalReference || "").trim())
    .sort((a, b) => {
      const timeA = Date.parse(String(a.updatedAt || a.createdAt || "")) || 0;
      const timeB = Date.parse(String(b.updatedAt || b.createdAt || "")) || 0;
      return timeB - timeA;
    })
    .slice(0, Math.max(1, Math.min(200, Math.floor(Number(limit) || 50))));
}

function normalizeShippingPackage(input = {}, fallbackInsurance = 0) {
  const insuranceFallback = Number.isFinite(Number(fallbackInsurance)) && Number(fallbackInsurance) > 0
    ? Number(fallbackInsurance)
    : 1;

  const width = normalizePositiveNumber(input.width, DEFAULT_PRODUCT_SHIPPING.width, { min: 1, max: 200 });
  const height = normalizePositiveNumber(input.height, DEFAULT_PRODUCT_SHIPPING.height, { min: 1, max: 200 });
  const length = normalizePositiveNumber(input.length, DEFAULT_PRODUCT_SHIPPING.length, { min: 1, max: 200 });
  const weight = normalizePositiveNumber(input.weight, DEFAULT_PRODUCT_SHIPPING.weight, { min: 0.01, max: 1000 });
  const insuranceValue = normalizePositiveNumber(input.insuranceValue || input.insurance_value, insuranceFallback, { min: 0.01, max: 1000000 });

  return {
    width: Number(width.toFixed(1)),
    height: Number(height.toFixed(1)),
    length: Number(length.toFixed(1)),
    weight: Number(weight.toFixed(3)),
    insuranceValue: Number(insuranceValue.toFixed(2)),
  };
}

function resolveRequestBaseUrl(req) {
  const forwardedHost = String(req.headers["x-forwarded-host"] || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(req.get("host") || "").trim();
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  if (!host) return "";
  return `${protocol}://${host}`;
}

function resolveMelhorEnvioRedirectUri(req) {
  if (MELHOR_ENVIO_REDIRECT_URI) return MELHOR_ENVIO_REDIRECT_URI;

  const base = resolveRequestBaseUrl(req);
  if (!base) return "";

  const pathname = MELHOR_ENVIO_REDIRECT_PATH.startsWith("/")
    ? MELHOR_ENVIO_REDIRECT_PATH
    : `/${MELHOR_ENVIO_REDIRECT_PATH}`;

  return `${base}${pathname}`;
}






async function readMelhorEnvioToken() {
  try {
    const db = await connectDB();
    const doc = await db.collection("integrations").findOne({ _id: "melhor_envio_token" });
    return doc ? doc.token : null;
  } catch { return null; }
}

async function writeMelhorEnvioToken(token = null) {
  const db = await connectDB();
  if (!token) {
    await db.collection("integrations").deleteOne({ _id: "melhor_envio_token" });
    return;
  }
  await db.collection("integrations").updateOne(
    { _id: "melhor_envio_token" },
    { $set: { token } },
    { upsert: true }
  );
}

async function readMelhorEnvioOAuthState() {
  try {
    const db = await connectDB();
    const doc = await db.collection("integrations").findOne({ _id: "melhor_envio_oauth_state" });
    return doc ? doc.state : null;
  } catch { return null; }
}

async function writeMelhorEnvioOAuthState(state = null) {
  const db = await connectDB();
  if (!state) {
    await db.collection("integrations").deleteOne({ _id: "melhor_envio_oauth_state" });
    return;
  }
  await db.collection("integrations").updateOne(
    { _id: "melhor_envio_oauth_state" },
    { $set: { state } },
    { upsert: true }
  );
}








function normalizeMelhorEnvioTokenPayload(payload = {}, current = null) {
  const now = Date.now();
  const expiresInSec = Number(payload.expires_in || payload.expiresIn || current?.expiresIn || 0);
  const expiresAt = expiresInSec > 0
    ? new Date(now + (expiresInSec * 1000)).toISOString()
    : String(current?.expiresAt || "");

  return {
    tokenType: String(payload.token_type || payload.tokenType || current?.tokenType || "Bearer"),
    accessToken: String(payload.access_token || payload.accessToken || current?.accessToken || ""),
    refreshToken: String(payload.refresh_token || payload.refreshToken || current?.refreshToken || ""),
    scope: String(payload.scope || current?.scope || resolveMelhorEnvioAuthScopes()),
    expiresIn: Number.isFinite(expiresInSec) ? Math.max(0, Math.floor(expiresInSec)) : 0,
    createdAt: new Date(now).toISOString(),
    expiresAt,
    environment: MELHOR_ENVIO_ENVIRONMENT,
  };
}

async function melhorEnvioTokenRequest(formData = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(formData)) {
    body.set(key, String(value || "").trim());
  }

  const response = await fetch(`${getMelhorEnvioBaseEndpoint()}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const detail = parsed?.message || parsed?.error_description || parsed?.error || "Falha ao autenticar no Melhor Envio.";
    const error = new Error(String(detail));
    error.statusCode = response.status;
    throw error;
  }

  return parsed || {};
}

async function refreshMelhorEnvioTokenIfNeeded(token = null) {
  const current = token || await readMelhorEnvioToken();
  if (!current?.accessToken) return null;
  if (String(current.environment || MELHOR_ENVIO_ENVIRONMENT) !== MELHOR_ENVIO_ENVIRONMENT) return null;

  const expiresAtMs = Date.parse(String(current.expiresAt || ""));
  const shouldRefresh = Number.isFinite(expiresAtMs) && (Date.now() >= (expiresAtMs - MELHOR_ENVIO_REFRESH_MARGIN_MS));
  if (!shouldRefresh) return current;

  if (!current.refreshToken) return current;

  const refreshedRaw = await melhorEnvioTokenRequest({
    grant_type: "refresh_token",
    client_id: MELHOR_ENVIO_CLIENT_ID,
    client_secret: MELHOR_ENVIO_CLIENT_SECRET,
    refresh_token: current.refreshToken,
  });

  const refreshed = normalizeMelhorEnvioTokenPayload(refreshedRaw, current);
  await writeMelhorEnvioToken(refreshed);
  return refreshed;
}

async function getMelhorEnvioAccessToken() {
  let token = await readMelhorEnvioToken();
  if (!token?.accessToken) {
    const error = new Error("Melhor Envio nao conectado. Autorize o app no painel do vendedor.");
    error.statusCode = 401;
    throw error;
  }

  try {
    token = await refreshMelhorEnvioTokenIfNeeded(token);
  } catch {
    const error = new Error("Nao foi possivel renovar o token da Melhor Envio. Reconecte o app.");
    error.statusCode = 401;
    throw error;
  }

  if (!token?.accessToken) {
    const error = new Error("Token da Melhor Envio invalido. Reconecte o app.");
    error.statusCode = 401;
    throw error;
  }

  return token.accessToken;
}

async function melhorEnvioApiRequest(pathname = "", options = {}) {
  const accessToken = await getMelhorEnvioAccessToken();
  const url = `${getMelhorEnvioBaseEndpoint()}/api/v2/${String(pathname || "").replace(/^\/+/, "")}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return { response, parsed };
}

function extractMelhorEnvioError(payload) {
  if (!payload) return "Falha na integracao com Melhor Envio.";
  if (typeof payload === "string" && payload.trim()) return payload.trim();
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  if (Array.isArray(payload?.errors) && payload.errors.length) {
    const first = payload.errors[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (typeof first?.message === "string" && first.message.trim()) return first.message.trim();
  }
  return "Falha na integracao com Melhor Envio.";
}

function normalizeMelhorEnvioTrackingEntry(payload = {}, requestedOrderId = "") {
  const source = payload && typeof payload === "object" ? payload : {};
  const direct = source[requestedOrderId];
  const entry = direct && typeof direct === "object"
    ? direct
    : (Object.values(source).find((item) => item && typeof item === "object") || {});

  const orderId = firstNonEmptyString(entry?.id, requestedOrderId);
  const protocol = firstNonEmptyString(entry?.protocol);
  const status = firstNonEmptyString(entry?.status);
  const tracking = firstNonEmptyString(entry?.tracking);
  const melhorEnvioTracking = firstNonEmptyString(entry?.melhorenvio_tracking);
  const trackingCode = firstNonEmptyString(tracking, melhorEnvioTracking);

  return {
    found: Boolean(orderId || protocol || status || trackingCode),
    orderId,
    protocol,
    status,
    tracking,
    melhorEnvioTracking,
    trackingCode,
    createdAt: firstNonEmptyString(entry?.created_at),
    paidAt: firstNonEmptyString(entry?.paid_at),
    generatedAt: firstNonEmptyString(entry?.generated_at),
    postedAt: firstNonEmptyString(entry?.posted_at),
    deliveredAt: firstNonEmptyString(entry?.delivered_at),
    canceledAt: firstNonEmptyString(entry?.canceled_at),
    expiredAt: firstNonEmptyString(entry?.expired_at),
  };
}

function parseMelhorEnvioQuoteList(payload) {
  if (!Array.isArray(payload)) return [];
  return payload
    .map((item, index) => {
      const priceValue = Number(item?.custom_price ?? item?.price ?? 0);
      const price = Number.isFinite(priceValue) ? Number(priceValue.toFixed(2)) : 0;
      return {
        id: String(item?.id ?? `service-${index + 1}`),
        name: String(item?.name || item?.service || "Servico"),
        company: {
          id: String(item?.company?.id || ""),
          name: String(item?.company?.name || item?.company?.slug || "Transportadora"),
          picture: String(item?.company?.picture || ""),
        },
        price,
        currency: String(item?.currency || "BRL"),
        deliveryTime: Number(item?.delivery_time || item?.custom_delivery_time || 0),
        customPrice: Number(item?.custom_price || 0) || null,
        error: String(item?.error || "").trim(),
        raw: item,
      };
    })
    .sort((a, b) => a.price - b.price);
}

function normalizeCategoryList(input) {
  if (Array.isArray(input)) {
    const valid = input.map((item) => String(item || "").trim()).filter((item) => CATEGORIES.includes(item));
    return Array.from(new Set(valid));
  }

  const single = String(input || "").trim();
  if (CATEGORIES.includes(single)) return [single];
  return [];
}

function normalizeBullets(input) {
  const source = Array.isArray(input) ? input : DEFAULT_BULLETS;
  const cleaned = source
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  return cleaned.length ? cleaned : [...DEFAULT_BULLETS];
}

function normalizeTrustCards(input) {
  const source = Array.isArray(input) ? input : DEFAULT_TRUST_CARDS;
  const cleaned = source
    .map((item) => ({
      title: String(item?.title || "").trim(),
      description: String(item?.description || "").trim(),
    }))
    .filter((item) => item.title || item.description)
    .slice(0, 10);

  return cleaned.length ? cleaned : [...DEFAULT_TRUST_CARDS];
}

function normalizeImages(product = {}) {
  if (Array.isArray(product.images) && product.images.length) {
    return product.images.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 10);
  }

  const legacy = String(product.image || "").trim();
  return legacy ? [legacy] : [];
}

function normalizeVariationStock(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.max(0, Math.floor(Number(fallback) || 0));
  return Math.max(0, Math.floor(parsed));
}

function getVariationDisplayLabel(variation = {}) {
  const name = String(variation?.name || "").trim();
  const value = String(variation?.value || variation?.title || "").trim();
  if (name && value) return `${name}: ${value}`;
  return value || name || "";
}

function sanitizeProduct(product = {}) {
  const categories = normalizeCategoryList(product.categories || product.category);
  const images = normalizeImages(product);

  const price = Number(normalizePrice(product.price) || 0);
  const rawPromo = product.promoPrice === null || product.promoPrice === undefined || product.promoPrice === ""
    ? null
    : Number(normalizePrice(product.promoPrice));

  let promoPrice = Number.isFinite(rawPromo) && rawPromo > 0 ? rawPromo : null;
  if (promoPrice && price > 0 && promoPrice >= price) {
    promoPrice = null;
  }

  const variations = normalizeVariations(product.variations);
  const insuranceBase = promoPrice || price || 1;
  const shipping = normalizeShippingPackage(product.shipping || {}, insuranceBase);

  return {
    id: String(product.id || `p-${Date.now()}`),
    title: String(product.title || "Produto sem titulo").trim(),
    description: String(product.description || "").trim(),
    price: Number.isFinite(price) ? Number(price.toFixed(2)) : 0,
    promoPrice: promoPrice ? Number(promoPrice.toFixed(2)) : null,
    images,
    category: categories[0] || "Eletronicos",
    categories: categories.length ? categories : ["Eletronicos"],
    bullets: normalizeBullets(product.bullets),
    trustCards: normalizeTrustCards(product.trustCards),
    variations,
    shipping,
    createdAt: String(product.createdAt || new Date().toISOString()),
  };
}

// ==========================================================
// PRODUTOS, CONTEÚDO E LOGS (Conexão MongoDB)
// ==========================================================

async function readProducts() {
  try {
    const db = await connectDB();
    const products = await db.collection("products").find({}).toArray();
    return products.map(sanitizeProduct);
  } catch (error) {
    console.error("Erro ao ler produtos:", error);
    return [];
  }
}

async function writeProducts(products) {
  try {
    const db = await connectDB();
    await db.collection("products").deleteMany({});
    if (products.length > 0) {
      await db.collection("products").insertMany(products.map(sanitizeProduct));
    }
  } catch (error) {
    console.error("Erro ao salvar produtos:", error);
  }
}

function sanitizeSlide(slide = {}) {
  return {
    id: String(slide.id || `s-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`),
    kicker: String(slide.kicker || "").trim(),
    title: String(slide.title || "").trim(),
    highlight: String(slide.highlight || "").trim(),
    description: String(slide.description || "").trim(),
    buttonText: String(slide.buttonText || "Ver produto").trim() || "Ver produto",
    buttonLink: String(slide.buttonLink || "produto.html?cupom=CLIENTE30").trim() || "produto.html?cupom=CLIENTE30",
    image: String(slide.image || "").trim(),
  };
}

async function readSiteContent() {
  const fallback = {
    benefitText: "Frete Rapido e garantia de 3 anos",
    featuredProductId: "",
    carousel: [],
  };
  try {
    const db = await connectDB();
    const content = await db.collection("settings").findOne({ _id: "site_content" });
    if (!content) return fallback;
    return {
      benefitText: String(content.benefitText || fallback.benefitText),
      featuredProductId: String(content.featuredProductId || ""),
      carousel: Array.isArray(content.carousel) ? content.carousel.map(sanitizeSlide) : [],
    };
  } catch (error) { return fallback; }
}

async function writeSiteContent(content) {
  try {
    const db = await connectDB();
    const data = {
      benefitText: String(content.benefitText || "Frete Rapido e garantia de 3 anos").trim(),
      featuredProductId: String(content.featuredProductId || "").trim(),
      carousel: Array.isArray(content.carousel) ? content.carousel.map(sanitizeSlide) : [],
    };
    await db.collection("settings").updateOne({ _id: "site_content" }, { $set: data }, { upsert: true });
  } catch (error) { console.error("Erro ao salvar conteúdo:", error); }
}

async function readSearchLog() {
  try {
    const db = await connectDB();
    return await db.collection("search_logs").find({}).sort({ at: -1 }).limit(100).toArray();
  } catch (error) { return []; }
}

async function appendSearchLog(entry = {}) {
  try {
    const db = await connectDB();
    await db.collection("search_logs").insertOne({
      query: String(entry.query || "").trim(),
      normalizedQuery: String(entry.normalizedQuery || "").trim(),
      resultCount: Number.isFinite(Number(entry.resultCount)) ? Number(entry.resultCount) : 0,
      page: String(entry.page || "").trim() || "home",
      at: String(entry.at || new Date().toISOString()),
    });
  } catch (error) { console.error("Erro ao salvar log de busca:", error); }
}

function parseJsonField(value, fallback) {
  try {
    if (Array.isArray(value)) return value;
    if (typeof value === "string") return JSON.parse(value);
    return fallback;
  } catch {
    return fallback;
  }
}

function mapProductInput(body = {}) {
  const categories = normalizeCategoryList(body.categories || body.category);
  const shippingInput = body.shipping && typeof body.shipping === "object" ? body.shipping : {};

  return {
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    price: normalizePrice(body.price),
    promoPrice: body.promoPrice,
    categories: categories.length ? categories : ["Eletronicos"],
    images: Array.isArray(body.images) ? body.images : normalizeImages(body),
    bullets: normalizeBullets(body.bullets),
    trustCards: normalizeTrustCards(body.trustCards),
    variations: normalizeVariations(body.variations),
    shipping: normalizeShippingPackage(shippingInput, normalizePrice(body.promoPrice || body.price)),
  };
}

function normalizeVariations(input) {
  if (!Array.isArray(input)) return [];

  return input
    .map((item) => {
      const fallbackLabel = String(item?.title || "").trim();
      const name = String(item?.name || "").trim() || (fallbackLabel ? "Opcao" : "");
      const value = String(item?.value || "").trim() || fallbackLabel;
      const priceRaw = normalizePrice(item?.price);
      const promoRaw = item?.promoPrice === "" || item?.promoPrice === null || item?.promoPrice === undefined
        ? Number.NaN
        : normalizePrice(item?.promoPrice);
      const images = Array.isArray(item?.images)
        ? item.images.map((img) => String(img || "").trim()).filter(Boolean).slice(0, 10)
        : [];
      const stock = normalizeVariationStock(item?.stock, 0);

      let resolvedPrice = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : null;
      if (!resolvedPrice && Number.isFinite(promoRaw) && promoRaw > 0) {
        resolvedPrice = promoRaw;
      }

      return {
        id: String(item?.id || `v-${Date.now()}-${Math.round(Math.random() * 1e5)}`),
        name,
        value,
        price: resolvedPrice ? Number(resolvedPrice.toFixed(2)) : null,
        stock,
        images,
      };
    })
    .filter((v) => v.value && Number.isFinite(v.stock));
}

function resolveProductVariation(product = {}, variationId = "") {
  const variations = Array.isArray(product.variations) ? product.variations : [];
  if (!variations.length) return null;
  const byId = variations.find((variation) => variation.id === variationId);
  return byId || variations[0];
}

function resolveProductEffectivePrice(product = {}, variation = null) {
  if (variation?.price && Number(variation.price) > 0) {
    return Number(variation.price);
  }
  if (variation?.promoPrice && Number(variation.promoPrice) > 0) {
    return Number(variation.promoPrice);
  }
  if (product?.promoPrice && Number(product.promoPrice) > 0) {
    return Number(product.promoPrice);
  }
  if (product?.price && Number(product.price) > 0) {
    return Number(product.price);
  }
  return 0;
}

function normalizeCpf(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function splitName(fullName = "") {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "Cliente", lastName: "Power" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "Power" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

function isHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveCheckoutProBackUrls(req) {
  if (isHttpsUrl(CHECKOUT_PRO_SUCCESS_URL) && isHttpsUrl(CHECKOUT_PRO_PENDING_URL) && isHttpsUrl(CHECKOUT_PRO_FAILURE_URL)) {
    return {
      success: CHECKOUT_PRO_SUCCESS_URL,
      pending: CHECKOUT_PRO_PENDING_URL,
      failure: CHECKOUT_PRO_FAILURE_URL,
    };
  }

  const host = String(req.get("host") || "").trim();
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "").trim();
  const baseUrl = host ? `${protocol || "http"}://${host}` : "";

  if (!baseUrl) return null;
  if (!isHttpsUrl(baseUrl)) return null;

  return {
    success: `${baseUrl}/checkout-status.html?status=success`,
    pending: `${baseUrl}/checkout-status.html?status=pending`,
    failure: `${baseUrl}/checkout-status.html?status=failure`,
  };
}

function resolveCheckoutNotificationUrl(req) {
  if (isHttpsUrl(CHECKOUT_PRO_NOTIFICATION_URL)) {
    return CHECKOUT_PRO_NOTIFICATION_URL;
  }
  const baseUrl = resolveRequestBaseUrl(req);
  if (!isHttpsUrl(baseUrl)) return "";
  return `${baseUrl}/api/checkout/notifications`;
}

function extractMercadoPagoError(payload) {
  if (!payload || typeof payload !== "object") {
    return "Falha ao criar pagamento no Mercado Pago.";
  }
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }
  if (Array.isArray(payload.cause) && payload.cause.length) {
    const detail = payload.cause[0];
    if (typeof detail?.description === "string" && detail.description.trim()) {
      return detail.description.trim();
    }
    if (typeof detail?.code === "string" && detail.code.trim()) {
      return detail.code.trim();
    }
  }
  return "Falha ao criar pagamento no Mercado Pago.";
}

async function mercadoPagoRequest(pathname = "", options = {}, baseUrl = MERCADO_PAGO_PAYMENTS_API) {
  const url = pathname ? `${baseUrl}/${pathname}` : baseUrl;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  return { response, parsed };
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeStateAbbr(value) {
  return String(value || "")
    .replace(/[^a-z]/gi, "")
    .toUpperCase()
    .slice(0, 2);
}

function parsePositiveInteger(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const rawNumber = Number(text);
  if (Number.isFinite(rawNumber) && rawNumber > 0) {
    return Math.floor(rawNumber);
  }

  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function parseShippingServiceId(value) {
  return parsePositiveInteger(value);
}

function safeJsonDebugValue(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function isCorreiosService(serviceId, companyName = "") {
  if (Number.isFinite(Number(serviceId)) && CORREIOS_SERVICE_IDS.has(Number(serviceId))) {
    return true;
  }
  return /correios/i.test(String(companyName || ""));
}

function extractNotificationEvent(req) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const query = req.query && typeof req.query === "object" ? req.query : {};
  const topic = String(body.type || body.topic || query.type || query.topic || "").trim().toLowerCase();
  const action = String(body.action || "").trim().toLowerCase();
  const dataId = String(body?.data?.id || query["data.id"] || body.id || query.id || "").trim();

  const isPaymentTopic = topic.includes("payment") || action.startsWith("payment.");
  const isMerchantOrderTopic = topic.includes("merchant_order") || action.startsWith("merchant_order.");

  return {
    topic,
    action,
    paymentId: isPaymentTopic ? dataId : "",
    merchantOrderId: isMerchantOrderTopic ? dataId : "",
  };
}

function extractPaymentIdsFromMerchantOrder(payload) {
  const payments = Array.isArray(payload?.payments) ? payload.payments : [];
  const ids = payments
    .map((item) => String(item?.id || "").trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

async function fetchMercadoPagoPaymentById(paymentId) {
  const id = String(paymentId || "").trim();
  if (!id) {
    throw new Error("Identificador de pagamento invalido.");
  }

  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Access Token do Mercado Pago nao configurado.");
  }

  const { response, parsed } = await mercadoPagoRequest(id, { method: "GET" });
  if (!response.ok) {
    throw new Error(extractMercadoPagoError(parsed));
  }
  return parsed || {};
}

async function searchMercadoPagoPaymentsByExternalReference(externalReference) {
  const reference = normalizeExternalReference(externalReference);
  if (!reference) {
    throw new Error("externalReference invalida para buscar pagamentos.");
  }

  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Access Token do Mercado Pago nao configurado.");
  }

  const params = new URLSearchParams({
    external_reference: reference,
    sort: "date_created",
    criteria: "desc",
    limit: "20",
  });

  const response = await fetch(`${MERCADO_PAGO_PAYMENTS_SEARCH_API}?${params.toString()}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${MERCADO_PAGO_ACCESS_TOKEN}`,
    },
  });

  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(extractMercadoPagoError(parsed));
  }

  const results = Array.isArray(parsed?.results) ? parsed.results : [];
  return results.map((item) => ({
    id: String(item?.id || "").trim(),
    status: String(item?.status || "").trim().toLowerCase(),
    statusDetail: String(item?.status_detail || "").trim(),
    externalReference: String(item?.external_reference || "").trim(),
    dateCreated: String(item?.date_created || "").trim(),
    dateApproved: String(item?.date_approved || "").trim(),
    raw: item,
  }));
}

function pickApprovedPaymentFromSearch(payments = []) {
  if (!Array.isArray(payments) || !payments.length) return null;
  return payments.find((payment) => String(payment?.status || "").trim().toLowerCase() === "approved") || null;
}

async function processShippingFromExternalReference(externalReference, source = "manual-sync-reference") {
  const reference = normalizeExternalReference(externalReference);
  if (!reference) {
    throw new Error("externalReference invalida para processar envio.");
  }

  const payments = await searchMercadoPagoPaymentsByExternalReference(reference);
  const approvedPayment = pickApprovedPaymentFromSearch(payments);
  const latestPayment = payments[0] || null;

  if (!approvedPayment?.id) {
    const latestStatus = String(latestPayment?.status || "").trim().toLowerCase() || "not_found";
    const latestStatusDetail = String(latestPayment?.statusDetail || "").trim();

    await upsertCheckoutIntent(reference, {
      payment: {
        id: String(latestPayment?.id || "").trim(),
        status: latestStatus,
        statusDetail: latestStatusDetail,
      },
      shipping: {
        status: "waiting_payment",
        paymentStatus: latestStatus,
        paymentStatusDetail: latestStatusDetail,
        updatedAt: new Date().toISOString(),
      },
    });

    return {
      ok: false,
      externalReference: reference,
      reason: "payment_not_approved",
      payment: latestPayment,
      paymentsFound: payments.length,
    };
  }

  const result = await processShippingFromPaymentId(String(approvedPayment.id), source);
  return {
    ...result,
    paymentsFound: payments.length,
    approvedPaymentId: String(approvedPayment.id),
  };
}

function getPaymentWatchStateSnapshot() {
  return Array.from(paymentWatchByReference.values())
    .map((item) => ({
      externalReference: item.externalReference,
      attempts: item.attempts,
      startedAt: item.startedAt,
      updatedAt: item.updatedAt,
      lastTrigger: item.lastTrigger,
      status: item.status,
      lastResult: item.lastResult || null,
      lastError: item.lastError || "",
    }))
    .sort((a, b) => {
      const timeA = Date.parse(String(a.updatedAt || a.startedAt || "")) || 0;
      const timeB = Date.parse(String(b.updatedAt || b.startedAt || "")) || 0;
      return timeB - timeA;
    });
}

function clearPaymentWatchByReference(externalReference) {
  const reference = normalizeExternalReference(externalReference);
  if (!reference) return;
  const current = paymentWatchByReference.get(reference);
  if (current?.timer) {
    clearTimeout(current.timer);
  }
  paymentWatchByReference.delete(reference);
}

async function runPaymentWatchCycle(externalReference) {
  const reference = normalizeExternalReference(externalReference);
  if (!reference) return;

  const state = paymentWatchByReference.get(reference);
  if (!state) return;

  state.attempts += 1;
  state.updatedAt = new Date().toISOString();
  state.status = "running";
  paymentWatchByReference.set(reference, state);

  let shouldRetry = false;
  try {
    const result = await processShippingFromExternalReference(reference, "payment-polling");
    state.lastResult = result;
    state.updatedAt = new Date().toISOString();

    if (result?.ok) {
      state.status = "completed";
      clearPaymentWatchByReference(reference);
      return;
    }

    const reason = String(result?.reason || "").trim().toLowerCase();
    if (reason === "payment_not_approved") {
      shouldRetry = true;
      state.status = "waiting_payment";
    } else {
      shouldRetry = false;
      state.status = reason || "stopped";
    }
  } catch (error) {
    state.lastError = error?.message || "Falha ao verificar pagamento por referencia.";
    state.updatedAt = new Date().toISOString();
    state.status = "error";
    shouldRetry = true;
  }

  if (!shouldRetry) {
    clearPaymentWatchByReference(reference);
    return;
  }

  if (state.attempts >= PAYMENT_WATCH_MAX_ATTEMPTS) {
    state.status = "timeout";
    clearPaymentWatchByReference(reference);
    return;
  }

  state.timer = setTimeout(() => {
    void runPaymentWatchCycle(reference);
  }, PAYMENT_WATCH_INTERVAL_MS);

  paymentWatchByReference.set(reference, state);
}

function schedulePaymentWatchByReference(externalReference, trigger = "system") {
  const reference = normalizeExternalReference(externalReference);
  if (!reference) return;

  const current = paymentWatchByReference.get(reference);
  if (current) {
    current.lastTrigger = trigger;
    current.updatedAt = new Date().toISOString();
    paymentWatchByReference.set(reference, current);
    return;
  }

  const state = {
    externalReference: reference,
    attempts: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastTrigger: trigger,
    status: "scheduled",
    lastResult: null,
    lastError: "",
    timer: setTimeout(() => {
      void runPaymentWatchCycle(reference);
    }, 1500),
  };

  paymentWatchByReference.set(reference, state);
}

async function bootstrapPaymentWatchers() {
  const allIntents = await readCheckoutIntents();
  const recent = listCheckoutIntentsSorted(allIntents, 80);
  const now = Date.now();

  for (const intent of recent) {
    const reference = normalizeExternalReference(intent?.externalReference);
    if (!reference) continue;

    const shippingStatus = String(intent?.shipping?.status || "").trim().toLowerCase();
    if (
      shippingStatus === "created"
      || shippingStatus === "created_without_label"
      || shippingStatus === "shipping_error"
      || shippingStatus === "failed_shipping"
      || shippingStatus === "failed_context"
      || shippingStatus === "failed_missing_shipping"
    ) {
      continue;
    }

    const updatedAt = Date.parse(String(intent?.updatedAt || intent?.createdAt || "")) || 0;
    if (!updatedAt || (now - updatedAt) > (48 * 60 * 60 * 1000)) {
      continue;
    }

    schedulePaymentWatchByReference(reference, "bootstrap");
  }
}

async function fetchMercadoPagoMerchantOrderById(merchantOrderId) {
  const id = String(merchantOrderId || "").trim();
  if (!id) {
    throw new Error("Identificador de merchant order invalido.");
  }

  if (!MERCADO_PAGO_ACCESS_TOKEN) {
    throw new Error("Access Token do Mercado Pago nao configurado.");
  }

  const { response, parsed } = await mercadoPagoRequest(id, { method: "GET" }, MERCADO_PAGO_MERCHANT_ORDERS_API);
  if (!response.ok) {
    throw new Error(extractMercadoPagoError(parsed));
  }
  return parsed || {};
}

function mergeOrderDataFromIntentAndPayment(intent = null, payment = {}) {
  const intentOrder = intent?.order && typeof intent.order === "object" ? intent.order : {};
  const paymentOrder = payment?.metadata?.order && typeof payment.metadata.order === "object"
    ? payment.metadata.order
    : {};

  const mergedShipping = {
    ...(intentOrder.shipping && typeof intentOrder.shipping === "object" ? intentOrder.shipping : {}),
    ...(paymentOrder.shipping && typeof paymentOrder.shipping === "object" ? paymentOrder.shipping : {}),
  };

  const mergedAddress = {
    ...(intentOrder.customerAddress && typeof intentOrder.customerAddress === "object" ? intentOrder.customerAddress : {}),
    ...(paymentOrder.customerAddress && typeof paymentOrder.customerAddress === "object" ? paymentOrder.customerAddress : {}),
  };
  const mergedShippingAddress = {
    ...(intentOrder.shippingAddress && typeof intentOrder.shippingAddress === "object" ? intentOrder.shippingAddress : {}),
    ...(paymentOrder.shippingAddress && typeof paymentOrder.shippingAddress === "object" ? paymentOrder.shippingAddress : {}),
  };
  const mergedCustomer = {
    ...(intentOrder.customer && typeof intentOrder.customer === "object" ? intentOrder.customer : {}),
    ...(paymentOrder.customer && typeof paymentOrder.customer === "object" ? paymentOrder.customer : {}),
  };

  return {
    ...intentOrder,
    ...paymentOrder,
    customer: mergedCustomer,
    shipping: mergedShipping,
    customerAddress: mergedAddress,
    shippingAddress: mergedShippingAddress,
  };
}

function normalizeOrderAddressPayload(addressPayload = {}) {
  const raw = addressPayload && typeof addressPayload === "object" ? addressPayload : {};
  const postalCode = normalizePostalCode(firstNonEmptyString(
    raw.postalCode,
    raw.postal_code,
    raw.zip_code,
    raw.zipCode,
    raw.cep,
  ));
  const street = firstNonEmptyString(
    raw.street,
    raw.address,
    raw.logradouro,
    raw.street_name,
    raw.address_line,
  );
  const number = firstNonEmptyString(raw.number, raw.numero, raw.street_number);
  const complement = firstNonEmptyString(raw.complement, raw.complemento, raw.line2);
  const district = firstNonEmptyString(raw.district, raw.bairro, raw.neighborhood, "N/I");
  const city = firstNonEmptyString(raw.city, raw.city_name, raw.localidade);
  const stateAbbr = normalizeStateAbbr(firstNonEmptyString(
    raw.state,
    raw.state_abbr,
    raw.uf,
    raw.federal_unit,
  ));

  return {
    address: street,
    street,
    number,
    complement,
    district,
    city,
    state: stateAbbr,
    state_abbr: stateAbbr,
    postalCode,
    postal_code: postalCode,
    cep: postalCode,
  };
}

function normalizeOrderCustomerPayload(customerPayload = {}) {
  const raw = customerPayload && typeof customerPayload === "object" ? customerPayload : {};
  const cpf = normalizeCpf(firstNonEmptyString(raw.cpf, raw.document, raw.cpf_number));
  return {
    name: firstNonEmptyString(raw.name, raw.full_name),
    email: firstNonEmptyString(raw.email),
    phone: normalizePhone(firstNonEmptyString(raw.phone, raw.phone_number, raw.mobile)),
    cpf,
    document: cpf,
  };
}

function extractAddressFromMercadoPagoPayment(payment = {}) {
  const receiverAddress = payment?.additional_info?.shipments?.receiver_address
    || payment?.shipments?.receiver_address
    || payment?.metadata?.receiver_address
    || {};
  return normalizeOrderAddressPayload(receiverAddress);
}

function normalizeOrderPayloadForShipping(orderPayload = {}) {
  const order = orderPayload && typeof orderPayload === "object" ? orderPayload : {};
  const shipping = order.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const serviceId = parseShippingServiceId(
    shipping.id
    || shipping.serviceId
    || shipping.service
    || order.serviceId
    || order.service,
  );
  const agencyId = parsePositiveInteger(
    shipping.agencyId
    || shipping.agency
    || order.agencyId
    || order.agency,
  );

  const fallbackInsuranceRaw = Number(
    order.productAmount
    || order.total
    || shipping.price
    || order.shippingAmount
    || 1,
  );
  const fallbackInsurance = Number.isFinite(fallbackInsuranceRaw) && fallbackInsuranceRaw > 0
    ? Number(fallbackInsuranceRaw.toFixed(2))
    : 1;

  const packageFromOrder = order.package && typeof order.package === "object" ? order.package : {};
  const volumesRaw = Array.isArray(order.volumes) ? order.volumes : [];
  const firstVolume = volumesRaw.find((item) => item && typeof item === "object") || {};
  const customerPayload = order.customer && typeof order.customer === "object" ? order.customer : {};
  const rawCustomerAddress = order.customerAddress && typeof order.customerAddress === "object"
    ? order.customerAddress
    : (order.shippingAddress && typeof order.shippingAddress === "object"
      ? order.shippingAddress
      : (order.address && typeof order.address === "object" ? order.address : {}));
  const insuranceCandidateRaw = Number(firstNonEmptyString(
    shipping.insuranceValue,
    shipping.insurance_value,
    order.insuranceValue,
    order.insurance_value,
    packageFromOrder.insuranceValue,
    packageFromOrder.insurance_value,
    firstVolume.insuranceValue,
    firstVolume.insurance_value,
  ));
  const insuranceValue = Number.isFinite(insuranceCandidateRaw) && insuranceCandidateRaw > 0
    ? Number(insuranceCandidateRaw.toFixed(2))
    : fallbackInsurance;

  const packageData = normalizeShippingPackage({
    ...firstVolume,
    ...packageFromOrder,
    insuranceValue,
  }, insuranceValue);

  const rawServiceId = firstNonEmptyString(
    shipping.rawServiceId,
    shipping.id,
    shipping.serviceId,
    shipping.service,
    order.serviceId,
    order.service,
  );
  const rawAgencyId = firstNonEmptyString(
    shipping.rawAgencyId,
    shipping.agencyId,
    shipping.agency,
    order.agencyId,
    order.agency,
  );
  const customer = normalizeOrderCustomerPayload(customerPayload);
  const customerAddress = normalizeOrderAddressPayload(rawCustomerAddress);

  return {
    ...order,
    customer,
    shipping: {
      ...shipping,
      id: serviceId || rawServiceId,
      serviceId: serviceId || null,
      service: serviceId || null,
      rawServiceId,
      agencyId: agencyId || null,
      agency: agencyId || null,
      rawAgencyId,
      insuranceValue: Number(packageData.insuranceValue.toFixed(2)),
      insurance_value: Number(packageData.insuranceValue.toFixed(2)),
    },
    customerAddress,
    shippingAddress: customerAddress,
    address: customerAddress,
    package: packageData,
    volumes: [
      {
        width: packageData.width,
        height: packageData.height,
        length: packageData.length,
        weight: packageData.weight,
        insurance_value: Number(packageData.insuranceValue.toFixed(2)),
      },
    ],
  };
}

function validateOrderPayloadForShipping(orderPayload = {}, payerPayload = {}) {
  const errors = [];
  const order = normalizeOrderPayloadForShipping(orderPayload);
  const payer = payerPayload && typeof payerPayload === "object" ? payerPayload : {};

  const shipping = order.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const serviceId = parseShippingServiceId(shipping.id || shipping.serviceId || shipping.service);
  if (!serviceId) {
    errors.push("servico de frete");
  }

  const customer = order.customer && typeof order.customer === "object" ? order.customer : {};
  const customerName = firstNonEmptyString(customer.name, payer.name);
  const customerEmail = firstNonEmptyString(customer.email, payer.email);
  const customerPhone = normalizePhone(firstNonEmptyString(customer.phone, payer.phone));
  const customerCpf = normalizeCpf(firstNonEmptyString(customer.cpf, customer.document, payer.cpf, payer.document));

  if (!customerName) errors.push("nome do destinatario");
  if (!customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) errors.push("e-mail do destinatario");
  if (!customerPhone) errors.push("telefone do destinatario");
  if (customerCpf.length !== 11) errors.push("CPF do destinatario");

  const address = order.customerAddress && typeof order.customerAddress === "object" ? order.customerAddress : {};
  const postalCode = normalizePostalCode(address.postalCode || address.postal_code);
  const street = String(address.street || address.address || "").trim();
  const number = String(address.number || "").trim();
  const city = String(address.city || "").trim();
  const state = normalizeStateAbbr(address.state || address.state_abbr);

  if (postalCode.length !== 8) errors.push("CEP do destinatario");
  if (!street) errors.push("rua do destinatario");
  if (!number) errors.push("numero do destinatario");
  if (!city) errors.push("cidade do destinatario");
  if (state.length !== 2) errors.push("estado do destinatario");

  return errors;
}

async function resolveShipmentOrderContext(payment = {}, intent = null) {
  const externalReference = firstNonEmptyString(
    payment?.external_reference,
    intent?.externalReference,
  ).slice(0, 64);
  const order = normalizeOrderPayloadForShipping(mergeOrderDataFromIntentAndPayment(intent, payment));

  const paymentPayer = payment?.payer && typeof payment.payer === "object" ? payment.payer : {};
  const paymentPayerName = firstNonEmptyString(
    `${String(paymentPayer.first_name || "").trim()} ${String(paymentPayer.last_name || "").trim()}`.trim(),
    paymentPayer.nickname,
    paymentPayer.name,
  );

  const intentPayer = intent?.payer && typeof intent.payer === "object" ? intent.payer : {};
  const orderCustomer = order?.customer && typeof order.customer === "object" ? order.customer : {};

  const customer = {
    name: firstNonEmptyString(intentPayer.name, orderCustomer.name, paymentPayerName),
    email: firstNonEmptyString(intentPayer.email, orderCustomer.email, paymentPayer.email),
    phone: normalizePhone(firstNonEmptyString(
      intentPayer.phone,
      orderCustomer.phone,
      paymentPayer?.phone?.number,
      paymentPayer?.phone,
    )),
    cpf: normalizeCpf(firstNonEmptyString(
      intentPayer.cpf,
      orderCustomer.cpf,
      paymentPayer?.identification?.number,
    )),
  };

  const shipping = order?.shipping && typeof order.shipping === "object" ? order.shipping : {};
  const companyName = firstNonEmptyString(shipping?.company?.name, shipping.companyName, shipping.company);
  const serviceId = parseShippingServiceId(shipping?.id || shipping?.serviceId || shipping?.service);
  const agencyId = parsePositiveInteger(shipping?.agencyId || shipping?.agency);

  const products = await readProducts();
  const productId = firstNonEmptyString(order?.productId, intent?.order?.productId);
  const variationId = firstNonEmptyString(order?.variationId, intent?.order?.variationId);
  const product = productId ? products.find((item) => item.id === productId) : null;
  const variation = resolveProductVariation(product || {}, variationId);
  const variationLabel = getVariationDisplayLabel(variation);
  const quantity = Math.max(1, Math.floor(Number(order?.quantity || 1) || 1));
  const productAmountFromOrder = Number(order?.productAmount || 0);
  const productAmount = productAmountFromOrder > 0
    ? Number(productAmountFromOrder.toFixed(2))
    : Number(resolveProductEffectivePrice(product || {}, variation).toFixed(2));
  const fallbackInsurance = productAmount > 0 ? productAmount : 1;
  const packageData = normalizeShippingPackage(
    order?.package && typeof order.package === "object"
      ? order.package
      : (product?.shipping || {}),
    fallbackInsurance,
  );

  const productTitle = firstNonEmptyString(
    variationLabel ? `${product?.title || "Produto"} - ${variationLabel}` : "",
    product?.title,
    order?.productTitle,
    intent?.title,
    "Pedido Power Tech",
  );

  const rawAddress = order?.customerAddress && typeof order.customerAddress === "object" ? order.customerAddress : {};
  const customerAddress = {
    postalCode: normalizePostalCode(rawAddress.postalCode || rawAddress.postal_code),
    street: firstNonEmptyString(rawAddress.street, rawAddress.address),
    number: String(rawAddress.number || "").trim(),
    complement: String(rawAddress.complement || "").trim(),
    district: firstNonEmptyString(rawAddress.district, "N/I"),
    city: String(rawAddress.city || "").trim(),
    state: normalizeStateAbbr(rawAddress.state || rawAddress.state_abbr),
  };

  return {
    externalReference,
    order,
    customer,
    customerAddress,
    productId: product?.id || productId,
    variationId: variation?.id || variationId,
    variationName: firstNonEmptyString(order?.variationName, variation?.name),
    variationValue: firstNonEmptyString(order?.variationValue, variation?.value),
    variationLabel: firstNonEmptyString(order?.variationLabel, variationLabel),
    quantity,
    productTitle,
    productAmount: Number.isFinite(productAmount) && productAmount > 0 ? productAmount : 1,
    shippingAmount: Number(shipping?.price || order?.shippingAmount || 0) || 0,
    shipping: {
      serviceId,
      rawServiceId: String(shipping?.rawServiceId || shipping?.id || shipping?.serviceId || shipping?.service || "").trim(),
      agencyId: agencyId || null,
      rawAgencyId: String(shipping?.rawAgencyId || shipping?.agencyId || shipping?.agency || "").trim(),
      serviceName: firstNonEmptyString(shipping?.serviceName, shipping?.name),
      companyName,
    },
    package: packageData,
  };
}

async function decrementProductVariationStock(orderContext = {}) {
  const productId = String(orderContext?.productId || "").trim();
  const variationId = String(orderContext?.variationId || "").trim();
  const quantity = Math.max(1, Math.floor(Number(orderContext?.quantity || orderContext?.order?.quantity || 1) || 1));

  if (!productId || !variationId) {
    return {
      applied: false,
      reason: "missing_product_or_variation",
      productId,
      variationId,
      quantity,
    };
  }

  const products = await readProducts();
  const productIndex = products.findIndex((item) => item.id === productId);
  if (productIndex < 0) {
    return {
      applied: false,
      reason: "product_not_found",
      productId,
      variationId,
      quantity,
    };
  }

  const product = products[productIndex];
  const variations = Array.isArray(product.variations) ? product.variations : [];
  const variationIndex = variations.findIndex((item) => String(item?.id || "") === variationId);
  if (variationIndex < 0) {
    return {
      applied: false,
      reason: "variation_not_found",
      productId,
      variationId,
      quantity,
    };
  }

  const currentStock = normalizeVariationStock(variations[variationIndex]?.stock, 0);
  const nextStock = Math.max(0, currentStock - quantity);
  products[productIndex] = {
    ...product,
    variations: variations.map((item, index) => {
      if (index !== variationIndex) return item;
      return {
        ...item,
        stock: nextStock,
      };
    }),
  };

  await writeProducts(products);
  return {
    applied: true,
    productId,
    variationId,
    quantity,
    previousStock: currentStock,
    stock: nextStock,
  };
}

function validateShipmentParty(party = {}, isCorreios, label) {
  const missing = [];
  if (!party.name) missing.push(`nome do ${label}`);
  if (!party.address) missing.push(`endereco do ${label}`);
  if (!party.number) missing.push(`numero do ${label}`);
  if (!party.city) missing.push(`cidade do ${label}`);
  if (!party.state_abbr) missing.push(`estado do ${label}`);
  if (!party.postal_code || normalizePostalCode(party.postal_code).length !== 8) {
    missing.push(`CEP do ${label}`);
  }
  if (!isCorreios) {
    if (!party.phone) missing.push(`telefone do ${label}`);
    if (!party.email) missing.push(`e-mail do ${label}`);
    if (!party.document && !party.company_document) {
      missing.push(`documento do ${label}`);
    }
  }
  return missing;
}

async function resolveMelhorEnvioSenderData(shippingConfig = DEFAULT_SHIPPING_CONFIG, isCorreios = false) {
  const token = await readMelhorEnvioToken();
  const missingScopes = getMissingScopes(token?.scope, MELHOR_ENVIO_REQUIRED_SHIPMENT_SCOPES);
  if (missingScopes.length) {
    const error = new Error(
      `Escopos insuficientes na Melhor Envio (${missingScopes.join(", ")}). Reconecte o app no painel do vendedor.`,
    );
    error.statusCode = 403;
    throw error;
  }

  const { response, parsed } = await melhorEnvioApiRequest("", { method: "GET" });
  if (!response.ok) {
    const error = new Error(extractMelhorEnvioError(parsed));
    error.statusCode = response.status;
    throw error;
  }

  const address = parsed?.address && typeof parsed.address === "object" ? parsed.address : {};
  const city = address?.city && typeof address.city === "object" ? address.city : {};
  const state = city?.state && typeof city.state === "object" ? city.state : {};
  const senderConfig = normalizeShippingSender(
    shippingConfig?.sender && typeof shippingConfig.sender === "object"
      ? shippingConfig.sender
      : {},
  );
  const normalizedPostalCode = normalizePostalCode(
    firstNonEmptyString(senderConfig.postalCode, shippingConfig?.originPostalCode, address?.postal_code),
  );

  const sender = {
    name: firstNonEmptyString(
      senderConfig.name,
      parsed?.name,
      `${String(parsed?.firstname || "").trim()} ${String(parsed?.lastname || "").trim()}`.trim(),
    ),
    phone: normalizePhone(firstNonEmptyString(senderConfig.phone, parsed?.phone?.phone, parsed?.phone?.number, parsed?.phone)),
    email: firstNonEmptyString(senderConfig.email, parsed?.email),
    document: normalizeCpf(firstNonEmptyString(senderConfig.document, parsed?.document)),
    company_document: normalizeCnpj(
      firstNonEmptyString(senderConfig.companyDocument, parsed?.company_document, parsed?.company?.document),
    ),
    state_register: null,
    address: firstNonEmptyString(senderConfig.address, address?.address),
    complement: firstNonEmptyString(senderConfig.complement, address?.complement),
    number: firstNonEmptyString(senderConfig.number, address?.number),
    district: firstNonEmptyString(senderConfig.district, address?.district, "N/I"),
    city: firstNonEmptyString(senderConfig.city, city?.city, address?.city),
    state_abbr: normalizeStateAbbr(firstNonEmptyString(senderConfig.state, state?.state_abbr, address?.state_abbr)),
    country_id: "BR",
    postal_code: normalizedPostalCode,
  };

  const missing = validateShipmentParty(sender, isCorreios, "remetente");
  if (missing.length) {
    const error = new Error(
      `Dados incompletos do remetente: ${missing.join(", ")}. Preencha no box "Frete (Melhor Envio Sandbox)" do vendedor ou atualize os dados da conta na Melhor Envio.`,
    );
    error.statusCode = 400;
    throw error;
  }

  return sender;
}

function buildRecipientFromOrderContext(context = {}, isCorreios = false) {
  const address = context?.customerAddress && typeof context.customerAddress === "object"
    ? context.customerAddress
    : {};
  const customer = context?.customer && typeof context.customer === "object"
    ? context.customer
    : {};

  const recipient = {
    name: firstNonEmptyString(customer?.name),
    phone: normalizePhone(firstNonEmptyString(customer?.phone)),
    email: firstNonEmptyString(customer?.email),
    document: normalizeCpf(customer?.cpf),
    state_register: null,
    address: firstNonEmptyString(address?.street, address?.address),
    complement: String(address?.complement || "").trim(),
    number: String(address?.number || "").trim(),
    district: firstNonEmptyString(address?.district, "N/I"),
    city: firstNonEmptyString(address?.city),
    state_abbr: normalizeStateAbbr(address?.state || address?.state_abbr),
    country_id: "BR",
    postal_code: normalizePostalCode(address?.postalCode || address?.postal_code),
  };

  const missing = validateShipmentParty(recipient, isCorreios, "destinatario");
  if (missing.length) {
    const error = new Error(`Dados incompletos do destinatario: ${missing.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }

  return recipient;
}

async function createMelhorEnvioShipment(orderContext = {}) {
  const serviceId = parseShippingServiceId(
    orderContext?.shipping?.serviceId
    || orderContext?.shipping?.service
    || orderContext?.shipping?.rawServiceId,
  );
  const agencyId = parsePositiveInteger(
    orderContext?.shipping?.agencyId
    || orderContext?.shipping?.agency
    || orderContext?.shipping?.rawAgencyId,
  );
  if (!serviceId) {
    const error = new Error("Servico de frete invalido para criar o envio no Melhor Envio.");
    error.statusCode = 400;
    throw error;
  }

  const isCorreios = isCorreiosService(serviceId, orderContext?.shipping?.companyName);
  const shippingConfig = await readShippingConfig();
  const recipientPromise = Promise.resolve().then(() => buildRecipientFromOrderContext(orderContext, isCorreios));
  const [sender, recipient] = await Promise.all([
    resolveMelhorEnvioSenderData(shippingConfig, isCorreios),
    recipientPromise,
  ]);

  const packageData = normalizeShippingPackage(orderContext?.package || {}, orderContext?.productAmount || 1);
  const volume = {
    width: packageData.width,
    height: packageData.height,
    length: packageData.length,
    weight: packageData.weight,
  };
  const insuranceValue = Number(packageData.insuranceValue || orderContext?.productAmount || 1);
  const quantity = Math.max(1, Math.floor(Number(orderContext?.order?.quantity || 1) || 1));
  const unitaryValue = Number(orderContext?.productAmount || 0) > 0
    ? Number(orderContext.productAmount)
    : Number(orderContext?.order?.total || 1);

  const payload = {
    from: sender,
    to: recipient,
    service: serviceId,
    products: [
      {
        id: String(orderContext?.variationId || orderContext?.productId || `p-${Date.now()}`).slice(0, 64),
        name: String(orderContext?.productTitle || "Produto").slice(0, 120),
        quantity,
        unitary_value: Number(Number(unitaryValue || 1).toFixed(2)),
        weight: packageData.weight,
        width: packageData.width,
        height: packageData.height,
        length: packageData.length,
      },
    ],
    volumes: isCorreios ? volume : [volume],
    options: {
      insurance_value: Number(Number(insuranceValue).toFixed(2)),
      receipt: Boolean(shippingConfig?.options?.receipt),
      own_hand: Boolean(shippingConfig?.options?.ownHand),
      collect: Boolean(shippingConfig?.options?.collect),
      reverse: false,
      non_commercial: true,
      invoice: { key: null },
      platform: "Power Produtos",
      reminder: null,
    },
  };
  if (agencyId) {
    payload.agency = agencyId;
  }

  const cartResult = await melhorEnvioApiRequest("me/cart", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!cartResult.response.ok) {
    const error = new Error(extractMelhorEnvioError(cartResult.parsed));
    error.statusCode = cartResult.response.status;
    error.meStep = "cart_create";
    error.mePayload = safeJsonDebugValue(cartResult.parsed, null);
    error.meRequest = safeJsonDebugValue(payload, null);
    throw error;
  }

  const melhorEnvioOrderId = String(cartResult.parsed?.id || "").trim();
  if (!melhorEnvioOrderId) {
    const error = new Error("A Melhor Envio nao retornou o ID da ordem apos adicionar ao carrinho.");
    error.statusCode = 500;
    error.meStep = "cart_missing_order_id";
    error.mePayload = safeJsonDebugValue(cartResult.parsed, null);
    error.meRequest = safeJsonDebugValue(payload, null);
    throw error;
  }

  let wallet = Number(cartResult.parsed?.price || 0);
  if (!(wallet > 0)) {
    try {
      const cartInfo = await melhorEnvioApiRequest(`me/cart/${encodeURIComponent(melhorEnvioOrderId)}`, { method: "GET" });
      if (cartInfo.response.ok) {
        wallet = Number(cartInfo.parsed?.price || 0);
      }
    } catch {
      wallet = Number(cartResult.parsed?.price || 0);
    }
  }
  if (!(wallet > 0)) {
    wallet = Number(orderContext?.shippingAmount || 0);
  }

  const checkoutPayload = {
    orders: [melhorEnvioOrderId],
  };
  if (wallet > 0) {
    checkoutPayload.wallet = Number(wallet.toFixed(2));
  }

  const checkoutResult = await melhorEnvioApiRequest("me/shipment/checkout", {
    method: "POST",
    body: JSON.stringify(checkoutPayload),
  });
  if (!checkoutResult.response.ok) {
    const error = new Error(extractMelhorEnvioError(checkoutResult.parsed));
    error.statusCode = checkoutResult.response.status;
    error.meStep = "shipment_checkout";
    error.mePayload = safeJsonDebugValue(checkoutResult.parsed, null);
    error.meRequest = safeJsonDebugValue(checkoutPayload, null);
    throw error;
  }

  const purchase = checkoutResult.parsed?.purchase && typeof checkoutResult.parsed.purchase === "object"
    ? checkoutResult.parsed.purchase
    : {};
  const purchaseOrders = Array.isArray(purchase.orders) ? purchase.orders : [];
  const selectedOrder = purchaseOrders.find((item) => String(item?.id || "").trim() === melhorEnvioOrderId)
    || purchaseOrders[0]
    || {};

  const warnings = [];
  let labelGenerated = false;
  let labelUrl = "";

  try {
    const generateResult = await melhorEnvioApiRequest("me/shipment/generate", {
      method: "POST",
      body: JSON.stringify({
        orders: [melhorEnvioOrderId],
        mode: "public",
      }),
    });
    if (generateResult.response.ok) {
      labelGenerated = true;
      try {
        const printResult = await melhorEnvioApiRequest("me/shipment/print", {
          method: "POST",
          body: JSON.stringify({ orders: [melhorEnvioOrderId] }),
        });
        if (printResult.response.ok) {
          labelUrl = String(printResult.parsed?.url || "").trim();
        }
      } catch {
        // keep label generation success even if print URL fails
      }
    } else {
      warnings.push(extractMelhorEnvioError(generateResult.parsed));
    }
  } catch (error) {
    warnings.push(error?.message || "Falha ao gerar etiqueta no Melhor Envio.");
  }

  return {
    status: labelGenerated ? "created" : "created_without_label",
    melhorEnvioOrderId,
    purchaseId: String(purchase?.id || "").trim(),
    purchaseStatus: String(purchase?.status || "").trim(),
    protocol: String(selectedOrder?.protocol || cartResult.parsed?.protocol || "").trim(),
    tracking: String(selectedOrder?.self_tracking || cartResult.parsed?.self_tracking || "").trim(),
    labelGenerated,
    labelUrl,
    serviceId,
    agencyId: agencyId || null,
    serviceName: firstNonEmptyString(orderContext?.shipping?.serviceName),
    companyName: firstNonEmptyString(orderContext?.shipping?.companyName),
    warnings,
  };
}

async function buildDirectShipmentContext(payload = {}) {
  const products = await readProducts();
  const productId = normalizeExternalReference(payload.productId || payload.product || "");
  const variationId = normalizeExternalReference(payload.variationId || payload.variation || "");
  const product = productId
    ? products.find((item) => item.id === productId)
    : products[0];

  if (!product) {
    throw new Error("Produto nao encontrado para teste de envio.");
  }

  const variation = resolveProductVariation(product, variationId);
  const variationLabel = getVariationDisplayLabel(variation);
  const quantity = Math.max(1, Math.floor(Number(payload.quantity || 1) || 1));
  const productAmountRaw = Number(payload.productAmount || payload.amount || resolveProductEffectivePrice(product, variation));
  const productAmount = Number.isFinite(productAmountRaw) && productAmountRaw > 0
    ? Number(productAmountRaw.toFixed(2))
    : Number(resolveProductEffectivePrice(product, variation).toFixed(2)) || 1;

  const shippingPayload = payload.shipping && typeof payload.shipping === "object" ? payload.shipping : {};
  const serviceId = parseShippingServiceId(
    payload.serviceId || payload.shippingServiceId || shippingPayload.id || shippingPayload.serviceId,
  );
  if (!serviceId) {
    throw new Error("serviceId do frete e obrigatorio para teste de envio.");
  }

  const customerPayload = payload.customer && typeof payload.customer === "object" ? payload.customer : {};
  const addressPayload = payload.address && typeof payload.address === "object"
    ? payload.address
    : (payload.customerAddress && typeof payload.customerAddress === "object" ? payload.customerAddress : {});

  const packageData = normalizeShippingPackage(
    payload.package && typeof payload.package === "object" ? payload.package : product.shipping,
    productAmount,
  );

  return {
    externalReference: normalizeExternalReference(payload.externalReference || `DIRECT-${Date.now()}`),
    productId: product.id,
    variationId: variation?.id || "",
    variationName: String(variation?.name || "").trim(),
    variationValue: String(variation?.value || "").trim(),
    variationLabel,
    quantity,
    productTitle: firstNonEmptyString(
      payload.productTitle,
      variationLabel ? `${product.title} - ${variationLabel}` : "",
      product.title,
      "Produto",
    ),
    productAmount,
    shippingAmount: Number(payload.shippingAmount || shippingPayload.price || 0) || 0,
    order: {
      productId: product.id,
      variationId: variation?.id || "",
      variationName: String(variation?.name || "").trim(),
      variationValue: String(variation?.value || "").trim(),
      variationLabel,
      quantity,
      total: Number((productAmount + (Number(payload.shippingAmount || shippingPayload.price || 0) || 0)).toFixed(2)),
    },
    customer: {
      name: firstNonEmptyString(customerPayload.name, payload.customerName, "Cliente Teste"),
      email: firstNonEmptyString(customerPayload.email, payload.customerEmail),
      phone: normalizePhone(firstNonEmptyString(customerPayload.phone, payload.customerPhone)),
      cpf: normalizeCpf(firstNonEmptyString(customerPayload.cpf, customerPayload.document, payload.customerCpf)),
    },
    customerAddress: {
      postalCode: normalizePostalCode(addressPayload.postalCode || addressPayload.postal_code || addressPayload.cep),
      street: firstNonEmptyString(addressPayload.street, addressPayload.address),
      number: String(addressPayload.number || "").trim(),
      complement: String(addressPayload.complement || "").trim(),
      district: firstNonEmptyString(addressPayload.district, "N/I"),
      city: String(addressPayload.city || "").trim(),
      state: normalizeStateAbbr(addressPayload.state || addressPayload.state_abbr),
    },
    shipping: {
      serviceId,
      rawServiceId: String(serviceId),
      serviceName: firstNonEmptyString(shippingPayload.serviceName, shippingPayload.name, payload.serviceName),
      companyName: firstNonEmptyString(
        shippingPayload?.company?.name,
        shippingPayload.companyName,
        payload.companyName,
      ),
    },
    package: packageData,
  };
}

async function processShippingFromPaymentIdUnlocked(paymentId, source = "system") {
  const id = String(paymentId || "").trim();
  if (!id) {
    throw new Error("paymentId invalido para processar envio.");
  }

  const existing = await getShippingOrderRecordByPaymentId(id);
  if (existing?.status === "created" || existing?.status === "created_without_label") {
    return {
      ok: true,
      reused: true,
      paymentId: id,
      shipping: existing,
    };
  }

  const attempts = Math.max(0, Math.floor(Number(existing?.attempts || 0))) + 1;
  await upsertShippingOrderRecord(id, {
    source,
    status: "processing",
    attempts,
    lastAttemptAt: new Date().toISOString(),
  });

  const payment = await fetchMercadoPagoPaymentById(id);
  const paymentStatus = String(payment?.status || "").trim().toLowerCase();
  const paymentStatusDetail = String(payment?.status_detail || "").trim();
  const externalReference = String(payment?.external_reference || "").trim();
  const approvedAt = String(payment?.date_approved || payment?.date_last_updated || "").trim();
  const referenceKey = getShippingReferenceKey(externalReference);

  const intent = externalReference
    ? await getCheckoutIntentByExternalReference(externalReference)
    : null;

  if (externalReference) {
    await upsertCheckoutIntent(externalReference, {
      payment: {
        id,
        status: paymentStatus,
        statusDetail: paymentStatusDetail,
        approvedAt,
      },
    });
  }

  if (paymentStatus !== "approved") {
    const waitingRecord = await upsertShippingOrderRecord(id, {
      externalReference,
      source,
      status: "waiting_payment",
      paymentStatus,
      paymentStatusDetail,
      attempts,
      auditEvent: "Pagamento ainda nao aprovado.",
      lastAttemptAt: new Date().toISOString(),
    });

    if (referenceKey) {
      await upsertShippingOrderRecord(referenceKey, {
        externalReference,
        linkedPaymentId: id,
        source,
        status: "waiting_payment",
        paymentStatus,
        paymentStatusDetail,
        attempts,
        auditEvent: "Pagamento ainda nao aprovado.",
        lastAttemptAt: new Date().toISOString(),
      });
    }

    if (externalReference) {
      await upsertCheckoutIntent(externalReference, {
        shipping: {
          status: "waiting_payment",
          paymentStatus,
          paymentStatusDetail,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return {
      ok: false,
      paymentId: id,
      externalReference,
      paymentStatus,
      reason: "payment_not_approved",
      shipping: waitingRecord,
    };
  }

  await upsertShippingOrderRecord(id, {
    externalReference,
    source,
    status: "payment_approved",
    paymentStatus,
    paymentStatusDetail,
    attempts,
    auditEvent: "Pagamento aprovado no Mercado Pago.",
    lastAttemptAt: new Date().toISOString(),
  });

  if (referenceKey) {
    await upsertShippingOrderRecord(referenceKey, {
      externalReference,
      linkedPaymentId: id,
      source,
      status: "payment_approved",
      paymentStatus,
      paymentStatusDetail,
      attempts,
      auditEvent: "Pagamento aprovado no Mercado Pago.",
      lastAttemptAt: new Date().toISOString(),
    });
  }

  let orderContext = null;
  try {
    orderContext = await resolveShipmentOrderContext(payment, intent);
  } catch (error) {
    const contextErrorMessage = error?.message || "Nao foi possivel resolver os dados do pedido para envio.";
    const failedRecord = await upsertShippingOrderRecord(id, {
      externalReference,
      source,
      status: "failed_context",
      paymentStatus,
      paymentStatusDetail,
      attempts,
      errors: [contextErrorMessage],
      lastAttemptAt: new Date().toISOString(),
    });

    if (referenceKey) {
      await upsertShippingOrderRecord(referenceKey, {
        externalReference,
        linkedPaymentId: id,
        source,
        status: "failed_context",
        paymentStatus,
        paymentStatusDetail,
        attempts,
        errors: [contextErrorMessage],
        lastAttemptAt: new Date().toISOString(),
      });
    }

    if (externalReference) {
      await upsertCheckoutIntent(externalReference, {
        shipping: {
          status: "failed_context",
          error: contextErrorMessage,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return {
      ok: false,
      paymentId: id,
      externalReference,
      paymentStatus,
      reason: "invalid_order_context",
      shipping: failedRecord,
    };
  }

  if (!existing?.stockUpdatedAt) {
    let stockPatch = null;
    try {
      const stockResult = await decrementProductVariationStock(orderContext);
      stockPatch = {
        stockUpdatedAt: new Date().toISOString(),
        stockUpdateApplied: Boolean(stockResult?.applied),
        stockUpdateResult: stockResult || null,
      };
    } catch (error) {
      stockPatch = {
        stockUpdatedAt: new Date().toISOString(),
        stockUpdateApplied: false,
        stockUpdateResult: {
          applied: false,
          reason: "stock_update_error",
          message: error?.message || "Falha ao atualizar estoque da variacao.",
          productId: String(orderContext?.productId || ""),
          variationId: String(orderContext?.variationId || ""),
          quantity: Math.max(1, Math.floor(Number(orderContext?.quantity || 1) || 1)),
        },
      };
    }

    await upsertShippingOrderRecord(id, stockPatch);
    if (referenceKey) {
      await upsertShippingOrderRecord(referenceKey, {
        externalReference,
        linkedPaymentId: id,
        ...stockPatch,
      });
    }
    if (externalReference) {
      await upsertCheckoutIntent(externalReference, {
        order: {
          ...(intent?.order && typeof intent.order === "object" ? intent.order : {}),
          stockUpdate: stockPatch.stockUpdateResult || {},
        },
      });
    }
  }

  if (!orderContext?.shipping?.serviceId) {
    const missingServiceMessage = "Servico de frete nao encontrado no pedido.";
    const failedRecord = await upsertShippingOrderRecord(id, {
      externalReference,
      source,
      status: "failed_missing_shipping",
      paymentStatus,
      paymentStatusDetail,
      attempts,
      errors: [missingServiceMessage],
      lastAttemptAt: new Date().toISOString(),
    });

    if (referenceKey) {
      await upsertShippingOrderRecord(referenceKey, {
        externalReference,
        linkedPaymentId: id,
        source,
        status: "failed_missing_shipping",
        paymentStatus,
        paymentStatusDetail,
        attempts,
        errors: [missingServiceMessage],
        lastAttemptAt: new Date().toISOString(),
      });
    }

    if (externalReference) {
      await upsertCheckoutIntent(externalReference, {
        shipping: {
          status: "failed_missing_shipping",
          error: missingServiceMessage,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return {
      ok: false,
      paymentId: id,
      externalReference,
      paymentStatus,
      reason: "missing_shipping_service",
      shipping: failedRecord,
    };
  }

  let shipment;
  try {
    shipment = await createMelhorEnvioShipment(orderContext);
  } catch (error) {
    const shippingErrorMessage = error?.message || "Falha ao criar envio no Melhor Envio.";
    const shippingErrorStep = String(error?.meStep || "").trim();
    const shippingErrorPayload = safeJsonDebugValue(error?.mePayload, null);
    const shippingErrorRequest = safeJsonDebugValue(error?.meRequest, null);
    const shippingErrorLog = {
      at: new Date().toISOString(),
      paymentId: id,
      externalReference,
      source,
      attempts,
      statusCode: Number(error?.statusCode || 0) || null,
      step: shippingErrorStep || null,
      message: shippingErrorMessage,
      melhorEnvioError: shippingErrorPayload,
      melhorEnvioRequest: shippingErrorRequest,
      orderContext: safeJsonDebugValue({
        serviceId: orderContext?.shipping?.serviceId || orderContext?.shipping?.service || orderContext?.shipping?.rawServiceId || null,
        agencyId: orderContext?.shipping?.agencyId || orderContext?.shipping?.agency || orderContext?.shipping?.rawAgencyId || null,
        destinationPostalCode: orderContext?.customerAddress?.postalCode || "",
        package: orderContext?.package || {},
      }, null),
    };
    console.error("[shipping-watcher] shipment generation failed", JSON.stringify(shippingErrorLog, null, 2));

    const shippingErrors = [shippingErrorMessage];
    if (shippingErrorStep) {
      shippingErrors.push(`step:${shippingErrorStep}`);
    }

    const failedRecord = await upsertShippingOrderRecord(id, {
      externalReference,
      source,
      status: "shipping_error",
      paymentStatus,
      paymentStatusDetail,
      attempts,
      errors: shippingErrors,
      lastAttemptAt: new Date().toISOString(),
    });

    if (referenceKey) {
      await upsertShippingOrderRecord(referenceKey, {
        externalReference,
        linkedPaymentId: id,
        source,
        status: "shipping_error",
        paymentStatus,
        paymentStatusDetail,
        attempts,
        errors: shippingErrors,
        lastAttemptAt: new Date().toISOString(),
      });
    }

    if (externalReference) {
      await upsertCheckoutIntent(externalReference, {
        shipping: {
          status: "shipping_error",
          error: shippingErrorMessage,
          errorStep: shippingErrorStep,
          errorPayload: shippingErrorPayload,
          lastRequest: shippingErrorRequest,
          updatedAt: new Date().toISOString(),
        },
      });
    }

    return {
      ok: false,
      paymentId: id,
      externalReference,
      paymentStatus,
      reason: "shipment_creation_failed",
      shipping: failedRecord,
    };
  }
  const status = shipment.status === "created_without_label" ? "created_without_label" : "created";

  const shippingRecord = await upsertShippingOrderRecord(id, {
    externalReference,
    source,
    customerCpf: orderContext?.customer?.cpf || "",
    customerName: orderContext?.customer?.name || "",
    status,
    paymentStatus,
    paymentStatusDetail,
    attempts,
    melhorEnvioOrderId: shipment.melhorEnvioOrderId,
    purchaseId: shipment.purchaseId,
    protocol: shipment.protocol,
    tracking: shipment.tracking,
    labelGenerated: shipment.labelGenerated,
    labelUrl: shipment.labelUrl,
    serviceId: shipment.serviceId,
    serviceName: shipment.serviceName,
    companyName: shipment.companyName,
    errors: shipment.warnings || [],
    auditEvent: "Envio criado no Melhor Envio.",
    lastAttemptAt: new Date().toISOString(),
  });

  if (referenceKey) {
    await upsertShippingOrderRecord(referenceKey, {
      externalReference,
      linkedPaymentId: id,
      source,
      customerCpf: orderContext?.customer?.cpf || "",
      customerName: orderContext?.customer?.name || "",
      status,
      paymentStatus,
      paymentStatusDetail,
      attempts,
      melhorEnvioOrderId: shipment.melhorEnvioOrderId,
      purchaseId: shipment.purchaseId,
      protocol: shipment.protocol,
      tracking: shipment.tracking,
      labelGenerated: shipment.labelGenerated,
      labelUrl: shipment.labelUrl,
      serviceId: shipment.serviceId,
      serviceName: shipment.serviceName,
      companyName: shipment.companyName,
      errors: shipment.warnings || [],
      auditEvent: "Envio criado no Melhor Envio.",
      lastAttemptAt: new Date().toISOString(),
    });
  }

  if (externalReference) {
    await upsertCheckoutIntent(externalReference, {
      shipping: {
        status,
        melhorEnvioOrderId: shipment.melhorEnvioOrderId,
        purchaseId: shipment.purchaseId,
        protocol: shipment.protocol,
        tracking: shipment.tracking,
        labelGenerated: shipment.labelGenerated,
        labelUrl: shipment.labelUrl,
        warnings: shipment.warnings || [],
        updatedAt: new Date().toISOString(),
      },
      payment: {
        id,
        status: paymentStatus,
        statusDetail: paymentStatusDetail,
        approvedAt,
      },
    });
  }

  return {
    ok: true,
    paymentId: id,
    externalReference,
    paymentStatus,
    shipping: shippingRecord,
  };
}

function processShippingFromPaymentId(paymentId, source = "system") {
  const id = String(paymentId || "").trim();
  if (!id) {
    return Promise.reject(new Error("paymentId invalido para processar envio."));
  }

  if (shippingProcessLocks.has(id)) {
    return shippingProcessLocks.get(id);
  }

  const task = processShippingFromPaymentIdUnlocked(id, source)
    .catch(async (error) => {
      const existing = await getShippingOrderRecordByPaymentId(id);
      const attempts = Math.max(1, Math.floor(Number(existing?.attempts || 0)));
      await upsertShippingOrderRecord(id, {
        source,
        status: "failed",
        attempts,
        errors: [error?.message || "Falha ao criar envio automaticamente."],
        lastAttemptAt: new Date().toISOString(),
      });
      throw error;
    })
    .finally(() => {
      shippingProcessLocks.delete(id);
    });

  shippingProcessLocks.set(id, task);
  return task;
}

async function handleMercadoPagoNotification(event = {}) {
  if (event.paymentId) {
    return processShippingFromPaymentId(event.paymentId, "mercadopago-webhook");
  }

  if (!event.merchantOrderId) {
    return null;
  }

  const merchantOrder = await fetchMercadoPagoMerchantOrderById(event.merchantOrderId);
  const paymentIds = extractPaymentIdsFromMerchantOrder(merchantOrder);
  if (!paymentIds.length) {
    return null;
  }

  const results = [];
  for (const paymentId of paymentIds) {
    try {
      const result = await processShippingFromPaymentId(paymentId, "mercadopago-webhook-merchant-order");
      results.push(result);
    } catch (error) {
      results.push({
        ok: false,
        paymentId,
        error: error?.message || "Falha ao processar pagamento de merchant order.",
      });
    }
  }

  return {
    merchantOrderId: String(event.merchantOrderId),
    paymentsProcessed: results,
  };
}

function createApp() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(express.static(ROOT_DIR));
  app.use("/vendedor", express.static(path.join(ROOT_DIR, "vendedor")));
  app.use("/uploads", express.static(UPLOAD_DIR));

  app.get("/vendedor", (_req, res) => {
    res.sendFile(path.join(ROOT_DIR, "vendedor", "index.html"));
  });

  app.get("/api/categories", (_req, res) => {
    res.json(CATEGORIES);
  });

  app.get("/api/melhorenvio/status", async (req, res) => {
    try {
      const [token, shippingConfig] = await Promise.all([
        readMelhorEnvioToken(),
        readShippingConfig(),
      ]);
      const redirectUri = resolveMelhorEnvioRedirectUri(req);
      const scopes = resolveMelhorEnvioAuthScopes();
      const readiness = getShippingIntegrationReadiness(token);

      return res.json({
        configured: Boolean(MELHOR_ENVIO_CLIENT_ID && MELHOR_ENVIO_CLIENT_SECRET),
        connected: readiness.connected,
        environment: MELHOR_ENVIO_ENVIRONMENT,
        scopes,
        tokenScopes: readiness.tokenScopes,
        missingShipmentScopes: readiness.missingShipmentScopes,
        readyForShipment: readiness.readyForShipment,
        redirectUri,
        tokenExpiresAt: readiness.connected ? String(token?.expiresAt || "") : "",
        shippingConfig,
      });
    } catch {
      return res.status(500).json({ message: "Erro ao consultar status da Melhor Envio." });
    }
  });

  app.get("/api/melhorenvio/connect-url", async (req, res) => {
    if (!MELHOR_ENVIO_CLIENT_ID || !MELHOR_ENVIO_CLIENT_SECRET) {
      return res.status(500).json({ message: "Client ID/Secret da Melhor Envio nao configurados." });
    }

    const redirectUri = resolveMelhorEnvioRedirectUri(req);
    if (!redirectUri || !/^https?:\/\//.test(redirectUri)) {
      return res.status(400).json({ message: "Nao foi possivel resolver a URL de callback da Melhor Envio." });
    }

    const state = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + (15 * 60 * 1000)).toISOString();
    await writeMelhorEnvioOAuthState({ state, expiresAt });

    const query = new URLSearchParams({
      response_type: "code",
      client_id: MELHOR_ENVIO_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: resolveMelhorEnvioAuthScopes(),
      state,
    });

    return res.json({
      environment: MELHOR_ENVIO_ENVIRONMENT,
      authUrl: `${getMelhorEnvioBaseEndpoint()}/oauth/authorize?${query.toString()}`,
      redirectUri,
      stateExpiresAt: expiresAt,
    });
  });

  app.post("/api/melhorenvio/disconnect", async (_req, res) => {
    try {
      await writeMelhorEnvioToken(null);
      await writeMelhorEnvioOAuthState(null);
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Nao foi possivel desconectar a Melhor Envio." });
    }
  });

  app.get(MELHOR_ENVIO_REDIRECT_PATH, async (req, res) => {
    const errorCode = String(req.query.error || "").trim();
    const errorDescription = String(req.query.error_description || "").trim();
    const code = String(req.query.code || "").trim();
    const state = String(req.query.state || "").trim();

    const html = (title, message, success = false) => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body{font-family:Manrope,Segoe UI,Arial,sans-serif;margin:0;padding:24px;background:#f4f7ff;color:#1a2440}
    .card{max-width:640px;margin:36px auto;background:#fff;border:1px solid #d6def2;border-radius:12px;padding:18px 20px;box-shadow:0 12px 28px rgba(8,27,74,.08)}
    h1{margin:0 0 8px;font-size:1.2rem}
    p{margin:8px 0;line-height:1.45}
    a{display:inline-block;margin-top:12px;background:${success ? "#0d9f5c" : "#0f4df3"};color:#fff;text-decoration:none;font-weight:700;border-radius:8px;padding:10px 14px}
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="/vendedor">Voltar para o painel do vendedor</a>
  </div>
  <script>
    setTimeout(function(){ window.location.href = "/vendedor${success ? "?melhorenvio=connected" : "?melhorenvio=error"}"; }, 1600);
  </script>
</body>
</html>`;

    if (errorCode) {
      return res.status(400).send(html(
        "Falha na autorizacao",
        `A autorizacao foi negada no Melhor Envio. ${errorDescription || errorCode}`,
      ));
    }

    if (!code) {
      return res.status(400).send(html("Falha na autorizacao", "O codigo de autorizacao nao foi recebido."));
    }

    try {
      const savedState = await readMelhorEnvioOAuthState();
      await writeMelhorEnvioOAuthState(null);

      const stateExpired = savedState?.expiresAt ? Date.parse(String(savedState.expiresAt)) < Date.now() : false;
      if (!savedState?.state || stateExpired || state !== String(savedState.state)) {
        return res.status(400).send(html("Falha na autorizacao", "State invalido ou expirado. Tente conectar novamente."));
      }

      const redirectUri = resolveMelhorEnvioRedirectUri(req);
      const tokenRaw = await melhorEnvioTokenRequest({
        grant_type: "authorization_code",
        client_id: MELHOR_ENVIO_CLIENT_ID,
        client_secret: MELHOR_ENVIO_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code,
      });

      const token = normalizeMelhorEnvioTokenPayload(tokenRaw, null);
      await writeMelhorEnvioToken(token);

      return res.send(html("Conexao concluida", "Aplicativo conectado com sucesso ao Melhor Envio Sandbox.", true));
    } catch (error) {
      const message = error?.message || "Nao foi possivel concluir a conexao com a Melhor Envio.";
      return res.status(error?.statusCode || 500).send(html("Falha na conexao", message));
    }
  });

  app.get("/api/shipping/config", async (_req, res) => {
    try {
      const [config, token] = await Promise.all([readShippingConfig(), readMelhorEnvioToken()]);
      const readiness = getShippingIntegrationReadiness(token);
      return res.json({
        environment: MELHOR_ENVIO_ENVIRONMENT,
        connected: readiness.connected,
        tokenScopes: readiness.tokenScopes,
        missingShipmentScopes: readiness.missingShipmentScopes,
        readyForShipment: readiness.readyForShipment,
        config,
      });
    } catch {
      return res.status(500).json({ message: "Erro ao carregar configuracao de frete." });
    }
  });

  app.put("/api/shipping/config", async (req, res) => {
    const payload = req.body || {};
    const nextConfig = normalizeShippingConfig(payload);

    if (!isValidPostalCode(nextConfig.originPostalCode)) {
      return res.status(400).json({ message: "CEP de origem invalido." });
    }

    try {
      await writeShippingConfig(nextConfig);
      return res.json(nextConfig);
    } catch {
      return res.status(500).json({ message: "Erro ao salvar configuracao de frete." });
    }
  });

  app.post("/api/shipping/quote", async (req, res) => {
    const payload = req.body || {};
    const productId = String(payload.productId || payload.product || "").trim();
    const variationId = String(payload.variationId || payload.variation || "").trim();
    const toPostalCode = normalizePostalCode(payload.toPostalCode || payload.postalCode || payload.cep);
    const quantity = Math.max(1, Math.min(50, Math.floor(Number(payload.quantity || 1) || 1)));

    if (!isValidPostalCode(toPostalCode)) {
      return res.status(400).json({ message: "CEP de destino invalido." });
    }

    try {
      const [products, shippingConfig] = await Promise.all([
        readProducts(),
        readShippingConfig(),
      ]);
      const product = productId
        ? products.find((item) => item.id === productId)
        : products[0];

      if (!product) {
        return res.status(404).json({ message: "Produto nao encontrado para cotacao." });
      }

      const variation = resolveProductVariation(product, variationId);
      const basePrice = resolveProductEffectivePrice(product, variation);
      const shipping = normalizeShippingPackage(product.shipping || {}, basePrice || 1);
      const fromPostalCode = normalizePostalCode(shippingConfig.originPostalCode);

      if (!isValidPostalCode(fromPostalCode)) {
        return res.status(400).json({ message: "Configure um CEP de origem valido no painel do vendedor." });
      }

      const requestPayload = {
        from: { postal_code: fromPostalCode },
        to: { postal_code: toPostalCode },
        products: [
          {
            id: String(variation?.id || product.id || `p-${Date.now()}`).slice(0, 64),
            width: shipping.width,
            height: shipping.height,
            length: shipping.length,
            weight: shipping.weight,
            insurance_value: shipping.insuranceValue,
            quantity,
          },
        ],
        options: normalizeShippingOptions(shippingConfig.options),
      };

      if (Array.isArray(shippingConfig.services) && shippingConfig.services.length) {
        requestPayload.services = shippingConfig.services.join(",");
      }

      const { response, parsed } = await melhorEnvioApiRequest("me/shipment/calculate", {
        method: "POST",
        body: JSON.stringify(requestPayload),
      });

      if (!response.ok) {
        const message = extractMelhorEnvioError(parsed);
        return res.status(response.status).json({ message });
      }

      const quotes = parseMelhorEnvioQuoteList(parsed).filter((quote) => quote.price > 0 && !quote.error);
      return res.json({
        productId: product.id,
        variationId: variation?.id || "",
        fromPostalCode,
        toPostalCode,
        quantity,
        quotes,
        hasErrorQuotes: Array.isArray(parsed) && parsed.some((item) => String(item?.error || "").trim()),
      });
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Falha ao calcular frete no Melhor Envio.",
      });
    }
  });

  app.get("/api/shipping/tracking/:orderId", async (req, res) => {
    const orderId = String(req.params?.orderId || req.query?.orderId || req.query?.order || "").trim().slice(0, 120);
    if (!orderId) {
      return res.status(400).json({ message: "orderId obrigatorio para consultar rastreio." });
    }

    try {
      const token = await readMelhorEnvioToken();
      const readiness = getShippingIntegrationReadiness(token);
      if (!readiness.connected) {
        return res.status(409).json({
          message: "Melhor Envio nao conectada. Conecte o app no painel do vendedor.",
          code: "SHIPPING_NOT_CONNECTED",
        });
      }

      const missingTrackingScopes = getMissingScopes(readiness.tokenScopes, ["shipping-tracking"]);
      if (missingTrackingScopes.length) {
        return res.status(409).json({
          message: `Reconecte a Melhor Envio para liberar os escopos de rastreio: ${missingTrackingScopes.join(", ")}.`,
          code: "SHIPPING_TRACKING_SCOPES_MISSING",
          missingScopes: missingTrackingScopes,
        });
      }

      const { response, parsed } = await melhorEnvioApiRequest("me/shipment/tracking", {
        method: "POST",
        body: JSON.stringify({ orders: [orderId] }),
      });

      if (!response.ok) {
        return res.status(response.status).json({
          message: extractMelhorEnvioError(parsed),
        });
      }

      const tracking = normalizeMelhorEnvioTrackingEntry(parsed, orderId);
      if (!tracking.found) {
        return res.status(404).json({
          message: "Nao encontramos dados de rastreio para esta ordem na Melhor Envio.",
          orderId,
        });
      }

      return res.json({
        ok: true,
        orderId,
        tracking,
      });
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Falha ao consultar rastreio na Melhor Envio.",
      });
    }
  });

  app.post("/api/checkout/notifications", (req, res) => {
    const event = extractNotificationEvent(req);
    res.status(200).json({ ok: true });

    void handleMercadoPagoNotification(event).catch((error) => {
      console.error("[checkout-notifications] erro:", error?.message || error);
    });
  });

  app.get("/api/checkout/notifications", (req, res) => {
    const event = extractNotificationEvent(req);
    res.status(200).json({ ok: true });

    void handleMercadoPagoNotification(event).catch((error) => {
      console.error("[checkout-notifications] erro:", error?.message || error);
    });
  });

  app.post("/api/checkout/shipping/sync", async (req, res) => {
    const paymentId = String(req.body?.paymentId || req.body?.id || req.query?.paymentId || "").trim();
    if (!paymentId) {
      return res.status(400).json({ message: "paymentId obrigatorio para sincronizar envio." });
    }

    try {
      const result = await processShippingFromPaymentId(paymentId, "manual-sync");
      return res.json(result);
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Falha ao sincronizar envio pelo pagamento.",
      });
    }
  });

  app.post("/api/checkout/shipping/sync-reference", async (req, res) => {
    const externalReference = normalizeExternalReference(
      req.body?.externalReference || req.body?.reference || req.query?.externalReference || req.query?.reference,
    );
    if (!externalReference) {
      return res.status(400).json({ message: "externalReference obrigatoria para sincronizar envio." });
    }

    try {
      const result = await processShippingFromExternalReference(externalReference, "manual-sync-reference");
      return res.json(result);
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Falha ao sincronizar envio pela referencia.",
      });
    }
  });

  app.get("/api/checkout/payments/search", async (req, res) => {
    const externalReference = normalizeExternalReference(
      req.query?.externalReference || req.query?.reference,
    );
    if (!externalReference) {
      return res.status(400).json({ message: "externalReference obrigatoria para buscar pagamentos." });
    }

    try {
      const payments = await searchMercadoPagoPaymentsByExternalReference(externalReference);
      return res.json({
        externalReference,
        count: payments.length,
        payments: payments.map((payment) => ({
          id: payment.id,
          status: payment.status,
          statusDetail: payment.statusDetail,
          externalReference: payment.externalReference,
          dateCreated: payment.dateCreated,
          dateApproved: payment.dateApproved,
        })),
      });
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        message: error?.message || "Falha ao buscar pagamentos por externalReference.",
      });
    }
  });

  app.get("/api/checkout/intents", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, Math.floor(Number(req.query?.limit || 30) || 30)));
      const all = await readCheckoutIntents();
      const intents = listCheckoutIntentsSorted(all, limit).map((item) => ({
        externalReference: String(item.externalReference || ""),
        title: String(item.title || ""),
        createdAt: String(item.createdAt || ""),
        updatedAt: String(item.updatedAt || ""),
        preferenceId: String(item.preferenceId || ""),
        payment: item.payment || {},
        shipping: item.shipping || {},
        order: {
          productId: String(item?.order?.productId || ""),
          variationId: String(item?.order?.variationId || ""),
          total: Number(item?.order?.total || 0) || 0,
          shippingAmount: Number(item?.order?.shippingAmount || 0) || 0,
        },
      }));
      return res.json({
        count: intents.length,
        intents,
      });
    } catch {
      return res.status(500).json({ message: "Falha ao carregar intents de checkout." });
    }
  });

  app.get("/api/checkout/intents/:externalReference", async (req, res) => {
    try {
      const externalReference = normalizeExternalReference(req.params.externalReference);
      if (!externalReference) {
        return res.status(400).json({ message: "externalReference invalida." });
      }
      const intent = await getCheckoutIntentByExternalReference(externalReference);
      if (!intent) {
        return res.status(404).json({ message: "Intent nao encontrada para esta externalReference." });
      }
      return res.json(intent);
    } catch {
      return res.status(500).json({ message: "Falha ao carregar intent de checkout." });
    }
  });

  app.get("/api/checkout/shipping/orders", async (req, res) => {
    try {
      const limit = Math.max(1, Math.min(200, Math.floor(Number(req.query?.limit || 50) || 50)));
      const all = await readShippingOrders();
      const orders = Object.values(all)
        .filter((item) => item && typeof item === "object")
        .sort((a, b) => {
          const timeA = Date.parse(String(a.updatedAt || a.createdAt || "")) || 0;
          const timeB = Date.parse(String(b.updatedAt || b.createdAt || "")) || 0;
          return timeB - timeA;
        })
        .slice(0, limit);
      return res.json({
        count: orders.length,
        orders,
      });
    } catch {
      return res.status(500).json({ message: "Falha ao carregar registros de envio." });
    }
  });

  app.get("/api/checkout/shipping/orders/:paymentId", async (req, res) => {
    try {
      const paymentId = String(req.params.paymentId || "").trim();
      if (!paymentId) {
        return res.status(400).json({ message: "paymentId invalido." });
      }
      const shipping = await getShippingOrderRecordByPaymentId(paymentId);
      if (!shipping) {
        return res.status(404).json({ message: "Registro de envio nao encontrado para este paymentId." });
      }
      return res.json(shipping);
    } catch {
      return res.status(500).json({ message: "Falha ao carregar registro de envio." });
    }
  });

  app.get("/api/orders/by-cpf/:cpf", async (req, res) => {
    try {
      const cpf = normalizeCpf(req.params.cpf || "");
      if (cpf.length !== 11) {
        return res.status(400).json({ message: "CPF invalido. Informe 11 digitos." });
      }

      const all = await readShippingOrders();
      const orders = Object.values(all)
        .filter((item) => item && typeof item === "object")
        .filter((item) => normalizeCpf(item.customerCpf || item.cpf) === cpf)
        .sort((a, b) => {
          const timeA = Date.parse(String(a.updatedAt || a.createdAt || "")) || 0;
          const timeB = Date.parse(String(b.updatedAt || b.createdAt || "")) || 0;
          return timeB - timeA;
        })
        .map((item) => ({
          paymentId: String(item.paymentId || "").trim(),
          externalReference: String(item.externalReference || "").trim(),
          status: String(item.status || "").trim(),
          trackingId: String(item.tracking || "").trim(),
          orderId: String(item.melhorEnvioOrderId || "").trim(),
          protocol: String(item.protocol || "").trim(),
          updatedAt: String(item.updatedAt || item.createdAt || ""),
        }));

      return res.json({
        cpf,
        count: orders.length,
        orders,
      });
    } catch {
      return res.status(500).json({ message: "Falha ao buscar pedidos por CPF." });
    }
  });

  app.get("/api/checkout/watchers", (_req, res) => {
    return res.json({
      count: paymentWatchByReference.size,
      intervalMs: PAYMENT_WATCH_INTERVAL_MS,
      maxAttempts: PAYMENT_WATCH_MAX_ATTEMPTS,
      watchers: getPaymentWatchStateSnapshot(),
    });
  });

  app.post("/api/checkout/watchers/start", (req, res) => {
    const externalReference = normalizeExternalReference(
      req.body?.externalReference || req.body?.reference || req.query?.externalReference || req.query?.reference,
    );
    if (!externalReference) {
      return res.status(400).json({ message: "externalReference obrigatoria para iniciar watcher." });
    }
    schedulePaymentWatchByReference(externalReference, "manual-start");
    return res.json({
      ok: true,
      externalReference,
      count: paymentWatchByReference.size,
    });
  });

  app.post("/api/shipping/test-direct", async (req, res) => {
    return res.status(409).json({
      ok: false,
      code: "DIRECT_SHIPPING_DISABLED",
      message: "Fluxo direto de envio desativado. Gere o envio apenas apos pagamento aprovado.",
    });

    try {
      const token = await readMelhorEnvioToken();
      const readiness = getShippingIntegrationReadiness(token);
      if (!readiness.connected) {
        return res.status(409).json({
          message: "Melhor Envio nao conectada. Conecte o app no painel do vendedor.",
          code: "SHIPPING_NOT_CONNECTED",
        });
      }
      if (!readiness.readyForShipment) {
        return res.status(409).json({
          message: `Reconecte a Melhor Envio para liberar os escopos de envio: ${readiness.missingShipmentScopes.join(", ")}.`,
          code: "SHIPPING_SCOPES_MISSING",
          missingScopes: readiness.missingShipmentScopes,
        });
      }

      const context = await buildDirectShipmentContext(req.body || {});
      const shipment = await createMelhorEnvioShipment(context);
      const status = shipment.status === "created_without_label" ? "created_without_label" : "created";
      const directRecordId = `direct-${normalizeExternalReference(context.externalReference || `${Date.now()}`)}`;
      const shippingRecord = await upsertShippingOrderRecord(directRecordId, {
        externalReference: context.externalReference,
        source: "direct-shipping",
        customerCpf: context?.customer?.cpf || "",
        customerName: context?.customer?.name || "",
        status,
        paymentStatus: "direct",
        paymentStatusDetail: "bypass",
        melhorEnvioOrderId: shipment.melhorEnvioOrderId,
        purchaseId: shipment.purchaseId,
        protocol: shipment.protocol,
        tracking: shipment.tracking,
        labelGenerated: shipment.labelGenerated,
        labelUrl: shipment.labelUrl,
        serviceId: shipment.serviceId,
        serviceName: shipment.serviceName,
        companyName: shipment.companyName,
        errors: shipment.warnings || [],
        lastAttemptAt: new Date().toISOString(),
      });

      return res.status(201).json({
        ok: true,
        context: {
          externalReference: context.externalReference,
          productId: context.productId,
          variationId: context.variationId,
          productTitle: context.productTitle,
          serviceId: context.shipping.serviceId,
          serviceName: context.shipping.serviceName,
          companyName: context.shipping.companyName,
          destination: context.customerAddress,
        },
        shipment,
        shipping: shippingRecord,
      });
    } catch (error) {
      return res.status(error?.statusCode || 500).json({
        ok: false,
        message: error?.message || "Falha no teste direto de criacao de envio.",
      });
    }
  });

  app.get("/api/checkout/config", (_req, res) => {
    res.json({
      provider: "mercadopago",
      mode: MERCADO_PAGO_PUBLIC_KEY.startsWith("TEST-") ? "test" : "production",
      checkoutType: "pro",
      publicKey: MERCADO_PAGO_PUBLIC_KEY,
    });
  });

  app.post("/api/checkout/pro/preference", async (req, res) => {
    const payload = req.body || {};
    const title = String(payload.title || "Pedido Power Tech").trim();
    const externalReference = String(payload.externalReference || `POWER-${Date.now()}`).trim().slice(0, 64);
    const payer = payload.payer || {};
    const payerName = String(payer.name || "").trim();
    const payerEmail = String(payer.email || "").trim();
    const payerPhone = normalizePhone(payer.phone || payer.phone_number || "");
    const payerCpf = normalizeCpf(payer.cpf || payer.document || payload?.order?.customer?.cpf || "");
    const { firstName, lastName } = splitName(payerName);

    const sourceItems = Array.isArray(payload.items) ? payload.items : [];
    const items = sourceItems
      .map((item) => {
        const unitPrice = Number(item?.unitPrice || item?.unit_price || 0);
        const quantity = Number(item?.quantity || 1);
        return {
          id: String(item?.id || "").trim().slice(0, 64),
          title: String(item?.title || title || "Pedido Power Tech").trim().slice(0, 120),
          quantity: Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1,
          unit_price: Number.isFinite(unitPrice) && unitPrice > 0 ? Number(unitPrice.toFixed(2)) : 0,
          currency_id: "BRL",
        };
      })
      .filter((item) => item.title && item.unit_price > 0 && item.quantity > 0);

    const totalFromItems = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);
    if (!items.length || totalFromItems <= 0) {
      return res.status(400).json({ message: "Itens invalidos para gerar Checkout Pro." });
    }

    if (payerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      return res.status(400).json({ message: "E-mail do comprador invalido." });
    }

    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({ message: "Access Token do Mercado Pago nao configurado." });
    }

    const rawOrderPayload = payload.order && typeof payload.order === "object" ? payload.order : {};
    const orderPayload = normalizeOrderPayloadForShipping(rawOrderPayload);
    const requiresShippingIntegration = Boolean(
      orderPayload?.shipping?.id
      || orderPayload?.shipping?.serviceId
      || orderPayload?.shipping?.service
      || Number(orderPayload?.shippingAmount || 0) > 0
      || orderPayload?.customerAddress?.postalCode,
    );

    if (requiresShippingIntegration) {
      const orderValidationErrors = validateOrderPayloadForShipping(orderPayload, payer);
      if (orderValidationErrors.length) {
        return res.status(422).json({
          message: `Dados obrigatorios de envio incompletos: ${orderValidationErrors.join(", ")}.`,
          code: "SHIPPING_ORDER_INVALID",
          errors: orderValidationErrors,
        });
      }

      const token = await readMelhorEnvioToken();
      const readiness = getShippingIntegrationReadiness(token);
      if (!readiness.connected) {
        return res.status(409).json({
          message: "Integracao de frete indisponivel. Conecte a Melhor Envio no painel do vendedor.",
          code: "SHIPPING_NOT_CONNECTED",
        });
      }
      if (!readiness.readyForShipment) {
        return res.status(409).json({
          message: `Reconecte a Melhor Envio para liberar os escopos de envio: ${readiness.missingShipmentScopes.join(", ")}.`,
          code: "SHIPPING_SCOPES_MISSING",
          missingScopes: readiness.missingShipmentScopes,
        });
      }
    }

    const backUrls = resolveCheckoutProBackUrls(req);
    const notificationUrl = resolveCheckoutNotificationUrl(req);
    const mpPayload = {
      items,
      external_reference: externalReference,
      metadata: {
        externalReference,
        order: orderPayload,
      },
    };

    if (backUrls) {
      mpPayload.back_urls = backUrls;
      mpPayload.auto_return = "approved";
    }

    if (notificationUrl) {
      mpPayload.notification_url = notificationUrl;
    }

    if (payerName || payerEmail) {
      mpPayload.payer = {};
      if (payerEmail) {
        mpPayload.payer.email = payerEmail;
      }
      if (payerName) {
        mpPayload.payer.name = firstName;
        mpPayload.payer.surname = lastName;
      }
    }

    try {
      const idempotencyKey = crypto.randomUUID();
      const { response, parsed } = await mercadoPagoRequest("", {
        method: "POST",
        headers: {
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(mpPayload),
      }, MERCADO_PAGO_PREFERENCES_API);

      if (!response.ok) {
        return res.status(response.status).json({ message: extractMercadoPagoError(parsed) });
      }

      const initPoint = String(parsed?.init_point || "").trim();
      const sandboxInitPoint = String(parsed?.sandbox_init_point || "").trim();
      const checkoutUrl = initPoint || sandboxInitPoint;

      await upsertCheckoutIntent(externalReference, {
        title,
        payer: {
          name: payerName,
          email: payerEmail,
          phone: payerPhone,
          cpf: payerCpf,
        },
        order: orderPayload,
        items: items.map((item) => ({
          id: item.id,
          title: item.title,
          quantity: item.quantity,
          unitPrice: item.unit_price,
        })),
        preferenceId: String(parsed?.id || "").trim(),
        checkoutUrl,
      });

      const orderCustomer = orderPayload?.customer && typeof orderPayload.customer === "object"
        ? orderPayload.customer
        : {};
      const orderShipping = orderPayload?.shipping && typeof orderPayload.shipping === "object"
        ? orderPayload.shipping
        : {};
      const referenceKey = getShippingReferenceKey(externalReference);
      if (referenceKey) {
        await upsertShippingOrderRecord(referenceKey, {
          externalReference,
          source: "checkout-preference",
          status: "payment_started",
          paymentStatus: "initiated",
          paymentStatusDetail: "",
          customerCpf: firstNonEmptyString(orderCustomer.cpf, payerCpf),
          customerName: firstNonEmptyString(orderCustomer.name, payerName),
          serviceId: parseShippingServiceId(orderShipping.id || orderShipping.serviceId || orderShipping.service),
          serviceName: firstNonEmptyString(orderShipping.serviceName, orderShipping.name),
          companyName: firstNonEmptyString(orderShipping?.company?.name, orderShipping.companyName),
          auditEvent: "Pagamento iniciado no Mercado Pago.",
          lastAttemptAt: new Date().toISOString(),
        });
      }

      schedulePaymentWatchByReference(externalReference, "preference-created");

      return res.status(201).json({
        externalReference,
        preferenceId: parsed?.id || "",
        initPoint,
        sandboxInitPoint,
        checkoutUrl,
        waitingUrl: `/waiting-payment.html?ref=${encodeURIComponent(externalReference)}&checkout=${encodeURIComponent(checkoutUrl)}`,
        usedSandbox: Boolean(checkoutUrl && checkoutUrl === sandboxInitPoint),
        hasBackUrls: Boolean(backUrls),
        notificationUrlConfigured: Boolean(notificationUrl),
      });
    } catch {
      return res.status(500).json({ message: "Erro ao criar preferencia de Checkout Pro no Mercado Pago." });
    }
  });

  app.post("/api/checkout/pix", async (req, res) => {
    const payload = req.body || {};
    const amount = Number(payload.amount || 0);
    const description = String(payload.description || "Pedido Power Tech").trim();
    const payer = payload.payer || {};
    const name = String(payer.name || "").trim();
    const email = String(payer.email || "").trim();
    const cpf = normalizeCpf(payer.cpf || "");
    const { firstName, lastName } = splitName(payer.name || "");

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Valor total invalido para pagamento." });
    }
    if (!name || name.length < 3) {
      return res.status(400).json({ message: "Nome do pagador invalido." });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "E-mail do pagador invalido." });
    }
    if (cpf.length !== 11) {
      return res.status(400).json({ message: "CPF invalido." });
    }

    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({ message: "Access Token do Mercado Pago nao configurado." });
    }

    const mpPayload = {
      transaction_amount: Number(amount.toFixed(2)),
      description: description.slice(0, 120),
      payment_method_id: "pix",
      external_reference: String(payload.externalReference || `POWER-${Date.now()}`).slice(0, 64),
      payer: {
        email,
        first_name: String(payer.firstName || firstName).slice(0, 40),
        last_name: String(payer.lastName || lastName).slice(0, 60),
        identification: {
          type: "CPF",
          number: cpf,
        },
      },
      metadata: {
        order: payload.order || {},
      },
    };

    try {
      const idempotencyKey = crypto.randomUUID();
      const { response, parsed } = await mercadoPagoRequest("", {
        method: "POST",
        headers: {
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(mpPayload),
      });

      if (!response.ok) {
        return res.status(response.status).json({ message: extractMercadoPagoError(parsed) });
      }

      const transactionData = parsed?.point_of_interaction?.transaction_data || {};
      return res.status(201).json({
        id: parsed?.id,
        status: parsed?.status,
        statusDetail: parsed?.status_detail,
        qrCode: transactionData?.qr_code || "",
        qrCodeBase64: transactionData?.qr_code_base64 || "",
        ticketUrl: transactionData?.ticket_url || "",
        expirationDate: parsed?.date_of_expiration || "",
      });
    } catch (error) {
      return res.status(500).json({ message: "Erro ao criar pagamento PIX no Mercado Pago." });
    }
  });

  app.get("/api/checkout/pix/:id", async (req, res) => {
    const paymentId = String(req.params.id || "").trim();
    if (!paymentId) {
      return res.status(400).json({ message: "Identificador de pagamento invalido." });
    }

    if (!MERCADO_PAGO_ACCESS_TOKEN) {
      return res.status(500).json({ message: "Access Token do Mercado Pago nao configurado." });
    }

    try {
      const { response, parsed } = await mercadoPagoRequest(paymentId, { method: "GET" });
      if (!response.ok) {
        return res.status(response.status).json({ message: extractMercadoPagoError(parsed) });
      }

      const transactionData = parsed?.point_of_interaction?.transaction_data || {};
      return res.json({
        id: parsed?.id,
        status: parsed?.status,
        statusDetail: parsed?.status_detail,
        qrCode: transactionData?.qr_code || "",
        qrCodeBase64: transactionData?.qr_code_base64 || "",
        ticketUrl: transactionData?.ticket_url || "",
        expirationDate: parsed?.date_of_expiration || "",
      });
    } catch {
      return res.status(500).json({ message: "Erro ao consultar pagamento PIX no Mercado Pago." });
    }
  });

  app.post("/api/upload-images", upload.array("images", 10), (req, res) => {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ message: "Arquivos de midia nao enviados." });
    }

    // O Cloudinary já entrega a URL completa em file.path
    const images = files.map((file) => file.path); 
    return res.status(201).json({ images });
});

  app.get("/api/products", async (_req, res) => {
    try {
      const products = await readProducts();
      res.json(products);
    } catch (error) {
      res.status(500).json({ message: "Erro ao carregar produtos." });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const products = await readProducts();
      const product = products.find((p) => p.id === req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Produto nao encontrado." });
      }
      return res.json(product);
    } catch (error) {
      return res.status(500).json({ message: "Erro ao carregar produto." });
    }
  });

  app.post("/api/products", upload.array("images", 10), async (req, res) => {
    // 1. Aqui pegamos as URLs que o Cloudinary gerou (https://...)
    const cloudImages = req.files ? req.files.map(f => f.path) : [];
    
    const input = mapProductInput(req.body || {});

    if (!input.title || !input.description) {
      return res.status(400).json({ message: "Titulo e descricao sao obrigatorios." });
    }

    if (!Number.isFinite(input.price) || input.price <= 0) {
      return res.status(400).json({ message: "Valor invalido." });
    }

    const promo = input.promoPrice === null || input.promoPrice === undefined || input.promoPrice === ""
      ? null
      : normalizePrice(input.promoPrice);

    if (promo !== null && (!Number.isFinite(promo) || promo <= 0 || promo >= input.price)) {
      return res.status(400).json({ message: "Valor promocional invalido." });
    }

    if (!input.categories.length) {
      return res.status(400).json({ message: "Selecione pelo menos uma categoria." });
    }

    try {
      const product = sanitizeProduct({
        id: `p-${Date.now()}`,
        title: input.title,
        description: input.description,
        price: Number(input.price.toFixed(2)),
        promoPrice: promo === null ? null : Number(promo.toFixed(2)),
        categories: input.categories,
        // 2. AQUI A MUDANÇA: Se houver upload novo, usa os links do Cloudinary.
        // Se não, usa as imagens que já estavam no corpo (se houver).
        images: cloudImages.length > 0 ? cloudImages : (input.images || []),
        bullets: input.bullets,
        trustCards: input.trustCards,
        variations: input.variations,
        shipping: input.shipping,
        createdAt: new Date().toISOString(),
      });

      const products = await readProducts();
      products.unshift(product);
      await writeProducts(products);

      return res.status(201).json(product);
    } catch (error) {
      console.error("Erro no cadastro:", error);
      return res.status(500).json({ message: "Erro ao salvar produto." });
    }
});
app.put("/api/products/:id", upload.array("images", 10), async (req, res) => {
    const { id } = req.params;
    
    // 1. Captura novas imagens enviadas via Cloudinary
    const newCloudImages = req.files ? req.files.map(f => f.path) : [];
    
    const input = mapProductInput(req.body || {});

    if (!input.title || !input.description) {
      return res.status(400).json({ message: "Titulo e descricao sao obrigatorios." });
    }

    if (!Number.isFinite(input.price) || input.price <= 0) {
      return res.status(400).json({ message: "Valor invalido." });
    }

    const promo = input.promoPrice === null || input.promoPrice === undefined || input.promoPrice === ""
      ? null
      : normalizePrice(input.promoPrice);

    if (promo !== null && (!Number.isFinite(promo) || promo <= 0 || promo >= input.price)) {
      return res.status(400).json({ message: "Valor promocional invalido." });
    }

    if (!input.categories.length) {
      return res.status(400).json({ message: "Selecione pelo menos uma categoria." });
    }

    try {
      const products = await readProducts();
      const idx = products.findIndex((p) => p.id === id);

      if (idx < 0) {
        return res.status(404).json({ message: "Produto nao encontrado." });
      }

      // 2. Se subiu fotos novas, usa elas. Se não, mantém as fotos antigas que vieram no input.images
      const finalImages = newCloudImages.length > 0 ? newCloudImages : (input.images || []);

      products[idx] = sanitizeProduct({
        ...products[idx],
        title: input.title,
        description: input.description,
        price: Number(input.price.toFixed(2)),
        promoPrice: promo === null ? null : Number(promo.toFixed(2)),
        categories: input.categories,
        images: finalImages, // Agora com link HTTPS eterno
        bullets: input.bullets,
        trustCards: input.trustCards,
        variations: input.variations,
        shipping: input.shipping,
      });

      await writeProducts(products);
      return res.json(products[idx]);
    } catch (error) {
      console.error("Erro na edição:", error);
      return res.status(500).json({ message: "Erro ao atualizar produto." });
    }
});

  app.delete("/api/products/:id", async (req, res) => {
    const { id } = req.params;

    try {
      const products = await readProducts();
      const next = products.filter((p) => p.id !== id);

      if (next.length === products.length) {
        return res.status(404).json({ message: "Produto nao encontrado." });
      }

      await writeProducts(next);

      const content = await readSiteContent();
      if (content.featuredProductId === id) {
        content.featuredProductId = next[0]?.id || "";
        await writeSiteContent(content);
      }

      return res.status(204).end();
    } catch (error) {
      return res.status(500).json({ message: "Erro ao excluir produto." });
    }
  });

  app.get("/api/site-content", async (_req, res) => {
    try {
      const content = await readSiteContent();
      res.json(content);
    } catch (error) {
      res.status(500).json({ message: "Erro ao carregar conteudo do site." });
    }
  });

  app.put("/api/site-content", async (req, res) => {
    const payload = req.body || {};

    try {
      const nextContent = {
        benefitText: String(payload.benefitText || "Frete Rapido e garantia de 3 anos").trim(),
        featuredProductId: String(payload.featuredProductId || "").trim(),
        carousel: Array.isArray(payload.carousel) ? payload.carousel.map(sanitizeSlide) : [],
      };

      await writeSiteContent(nextContent);
      res.json(nextContent);
    } catch (error) {
      res.status(500).json({ message: "Erro ao salvar conteudo do site." });
    }
  });

  app.post("/api/search-log", async (req, res) => {
    const payload = req.body || {};
    const query = String(payload.query || "").trim();
    const normalizedQuery = String(payload.normalizedQuery || "").trim();

    if (!query || query.length < 3) {
      return res.status(400).json({ message: "Consulta de busca invalida." });
    }

    try {
      await appendSearchLog({
        query: query.slice(0, 120),
        normalizedQuery: normalizedQuery.slice(0, 120),
        resultCount: Number(payload.resultCount || 0),
        page: String(payload.page || "home").slice(0, 24),
        at: payload.at,
      });
      return res.status(201).json({ ok: true });
    } catch {
      return res.status(500).json({ message: "Erro ao salvar log de busca." });
    }
  });

  app.get("/api/search-log", async (_req, res) => {
    try {
      const log = await readSearchLog();
      return res.json(log);
    } catch {
      return res.status(500).json({ message: "Erro ao carregar logs de busca." });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({ message: "Falha no upload da midia." });
    }
    if (error) {
      return res.status(400).json({ message: error.message || "Erro na requisicao." });
    }
    return res.status(500).json({ message: "Erro interno." });
  });

  void bootstrapPaymentWatchers().catch((error) => {
    console.error("[payment-watch-bootstrap] erro:", error?.message || error);
  });

  return app;
}

function startServer(port = process.env.PORT || 3000) {
  const app = createApp();
  return app.listen(port, () => {
    console.log(`Servidor iniciado em http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { createApp, startServer, CATEGORIES };
