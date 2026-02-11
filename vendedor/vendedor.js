const productForm = document.getElementById("productForm");
const productList = document.getElementById("productList");
const formMessage = document.getElementById("formMessage");
const refreshBtn = document.getElementById("refreshBtn");

const contentForm = document.getElementById("contentForm");
const contentMessage = document.getElementById("contentMessage");
const benefitInput = document.getElementById("benefitInput");
const featuredProductSelect = document.getElementById("featuredProductSelect");
const slidesEditor = document.getElementById("slidesEditor");
const addSlideBtn = document.getElementById("addSlideBtn");
const createCategories = document.getElementById("createCategories");
const createImageOrder = document.getElementById("createImageOrder");
const shippingConfigForm = document.getElementById("shippingConfigForm");
const shippingMessage = document.getElementById("shippingMessage");
const meStatusText = document.getElementById("meStatusText");
const meEnvironment = document.getElementById("meEnvironment");
const meCallbackPath = document.getElementById("meCallbackPath");
const connectMelhorEnvioBtn = document.getElementById("connectMelhorEnvioBtn");
const disconnectMelhorEnvioBtn = document.getElementById("disconnectMelhorEnvioBtn");
const originPostalCodeInput = document.getElementById("originPostalCodeInput");
const serviceIdsInput = document.getElementById("serviceIdsInput");
const optReceipt = document.getElementById("optReceipt");
const optOwnHand = document.getElementById("optOwnHand");
const optCollect = document.getElementById("optCollect");
const senderNameInput = document.getElementById("senderNameInput");
const senderEmailInput = document.getElementById("senderEmailInput");
const senderPhoneInput = document.getElementById("senderPhoneInput");
const senderDocumentInput = document.getElementById("senderDocumentInput");
const senderCompanyDocumentInput = document.getElementById("senderCompanyDocumentInput");
const senderPostalCodeInput = document.getElementById("senderPostalCodeInput");
const senderAddressInput = document.getElementById("senderAddressInput");
const senderNumberInput = document.getElementById("senderNumberInput");
const senderComplementInput = document.getElementById("senderComplementInput");
const senderDistrictInput = document.getElementById("senderDistrictInput");
const senderCityInput = document.getElementById("senderCityInput");
const senderStateInput = document.getElementById("senderStateInput");

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const state = {
  categories: [],
  products: [],
  content: {
    benefitText: "Frete Rapido e garantia de 3 anos",
    featuredProductId: "",
    carousel: [],
  },
  shippingConfig: null,
  melhorEnvioStatus: null,
  createDraftImages: [],
};

function showMessage(target, text, type) {
  target.textContent = text;
  target.className = `form-message ${type}`;
}

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

function normalizePostalCode(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return "";
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function normalizeStateInput(value) {
  return String(value || "")
    .replace(/[^a-z]/gi, "")
    .toUpperCase()
    .slice(0, 2);
}

function parseServiceIds(value) {
  return String(value || "")
    .split(",")
    .map((item) => Number(String(item).replace(/\D/g, "")))
    .filter((item) => Number.isFinite(item) && item > 0)
    .map((item) => Math.floor(item));
}

function collectSenderPayload() {
  return {
    name: String(senderNameInput?.value || "").trim(),
    email: String(senderEmailInput?.value || "").trim(),
    phone: String(senderPhoneInput?.value || "").trim(),
    document: String(senderDocumentInput?.value || "").trim(),
    companyDocument: String(senderCompanyDocumentInput?.value || "").trim(),
    postalCode: normalizePostalCode(senderPostalCodeInput?.value || ""),
    address: String(senderAddressInput?.value || "").trim(),
    number: String(senderNumberInput?.value || "").trim(),
    complement: String(senderComplementInput?.value || "").trim(),
    district: String(senderDistrictInput?.value || "").trim(),
    city: String(senderCityInput?.value || "").trim(),
    state: normalizeStateInput(senderStateInput?.value || ""),
  };
}

function getSenderRequiredFieldErrors(sender = {}) {
  const hasAnyValue = Object.values(sender).some((value) => String(value || "").trim());
  if (!hasAnyValue) return [];

  const errors = [];
  if (!sender.name) errors.push("nome do remetente");
  if (!sender.email) errors.push("e-mail do remetente");
  if (!sender.phone) errors.push("telefone do remetente");
  if (!sender.document && !sender.companyDocument) errors.push("CPF ou CNPJ do remetente");
  if (!sender.postalCode) errors.push("CEP do remetente");
  if (!sender.address) errors.push("rua do remetente");
  if (!sender.number) errors.push("numero do remetente");
  if (!sender.district) errors.push("bairro do remetente");
  if (!sender.city) errors.push("cidade do remetente");
  if (!sender.state || sender.state.length !== 2) errors.push("estado (UF) do remetente");
  return errors;
}

function parseShippingPackageFromForm(formData, fallbackInsurance = 0) {
  const insuranceRaw = String(formData.get("shippingInsurance") || "").trim();
  const fallback = Number.isFinite(Number(fallbackInsurance)) && Number(fallbackInsurance) > 0
    ? Number(fallbackInsurance)
    : 1;
  const insuranceValue = insuranceRaw ? normalizePrice(insuranceRaw) : fallback;

  return {
    width: Number(formData.get("shippingWidth") || 16),
    height: Number(formData.get("shippingHeight") || 4),
    length: Number(formData.get("shippingLength") || 16),
    weight: Number(formData.get("shippingWeight") || 0.3),
    insuranceValue: Number.isFinite(insuranceValue) && insuranceValue > 0 ? insuranceValue : fallback,
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseBullets(text) {
  const lines = String(text || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
  return lines.slice(0, 10);
}

function parseTrustCards(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title, ...rest] = line.split("|");
      return { title: (title || "").trim(), description: rest.join("|").trim() };
    })
    .filter((card) => card.title || card.description)
    .slice(0, 10);
}

function trustCardsToText(cards) {
  if (!Array.isArray(cards)) return "";
  return cards.map((card) => `${card.title || ""}|${card.description || ""}`.trim()).join("\n");
}

function parseVariations(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = "", price = "", promoPrice = "", images = ""] = line.split("|");
      const imageList = images
        .split(",")
        .map((img) => img.trim())
        .filter(Boolean)
        .slice(0, 10);
      return {
        title: title.trim(),
        price: normalizePrice(price),
        promoPrice: promoPrice.trim() ? normalizePrice(promoPrice) : "",
        images: imageList,
      };
    })
    .filter((v) => v.title && Number.isFinite(v.price) && v.price > 0);
}

function variationsToText(variations) {
  if (!Array.isArray(variations)) return "";
  return variations
    .map((v) => {
      const price = Number(v.price || 0);
      const promo = v.promoPrice ? Number(v.promoPrice) : null;
      const images = Array.isArray(v.images) ? v.images.join(",") : "";
      return `${v.title || ""}|${price || ""}|${promo || ""}|${images}`.trim();
    })
    .join("\n");
}

function renderCategoryChecks(container, selected = []) {
  container.innerHTML = state.categories
    .map((category) => {
      const checked = selected.includes(category) ? "checked" : "";
      return `<label class="check-item"><input type="checkbox" data-category-check value="${escapeHtml(category)}" ${checked} />${escapeHtml(category)}</label>`;
    })
    .join("");
}

function getCheckedCategories(scope) {
  return Array.from(scope.querySelectorAll("[data-category-check]:checked")).map((el) => el.value);
}

async function readJsonResponse(response) {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";

  let parsed = null;
  if (raw) {
    if (contentType.includes("application/json")) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Resposta JSON invalida do servidor.");
      }
    } else {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
    }
  }

  if (!response.ok) {
    const message = parsed?.message || (raw && !raw.startsWith("<!DOCTYPE") ? raw : "Falha na resposta do servidor.");
    throw new Error(message);
  }

  if (parsed !== null) return parsed;
  if (!raw) return {};

  throw new Error("Resposta inesperada do servidor.");
}

async function fetchCategories() {
  const response = await fetch("/api/categories");
  return readJsonResponse(response);
}

async function fetchProducts() {
  const response = await fetch("/api/products");
  return readJsonResponse(response);
}

async function fetchContent() {
  const response = await fetch("/api/site-content");
  return readJsonResponse(response);
}

async function fetchShippingConfig() {
  const response = await fetch("/api/shipping/config");
  return readJsonResponse(response);
}

async function fetchMelhorEnvioStatus() {
  const response = await fetch("/api/melhorenvio/status");
  return readJsonResponse(response);
}

async function uploadImages(fileList) {
  const files = Array.from(fileList || []).filter(Boolean);
  if (!files.length) return [];

  const formData = new FormData();
  for (const file of files.slice(0, 10)) {
    formData.append("images", file);
  }

  const response = await fetch("/api/upload-images", {
    method: "POST",
    body: formData,
  });

  const result = await readJsonResponse(response);
  return Array.isArray(result.images) ? result.images : [];
}

function setPanelState(panel, expanded) {
  panel.classList.toggle("collapsed", !expanded);
  const icon = panel.querySelector(".collapse-icon");
  if (icon) icon.textContent = expanded ? "-" : "+";
}

function initCollapsibles() {
  document.querySelectorAll("[data-collapsible]").forEach((panel) => {
    setPanelState(panel, false);
  });

  document.querySelectorAll("[data-collapse-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = btn.closest("[data-collapsible]");
      if (!panel) return;
      const willExpand = panel.classList.contains("collapsed");
      setPanelState(panel, willExpand);
    });
  });
}

function renderFeaturedSelect() {
  featuredProductSelect.innerHTML = "";

  if (!state.products.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sem produtos cadastrados";
    featuredProductSelect.appendChild(opt);
    return;
  }

  for (const product of state.products) {
    const opt = document.createElement("option");
    opt.value = product.id;
    opt.textContent = `${product.title} (${currency.format(product.promoPrice || product.price || 0)})`;
    featuredProductSelect.appendChild(opt);
  }

  const selected = state.products.some((p) => p.id === state.content.featuredProductId)
    ? state.content.featuredProductId
    : state.products[0].id;

  state.content.featuredProductId = selected;
  featuredProductSelect.value = selected;
}

function slideItemTemplate(slide = {}) {
  const id = slide.id || `s-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

  return `
    <article class="slide-item" data-slide-id="${id}">
      <div class="slide-grid">
        <label>
          Kicker
          <input type="text" data-field="kicker" value="${escapeHtml(slide.kicker || "")}" />
        </label>
        <label>
          Titulo
          <input type="text" data-field="title" value="${escapeHtml(slide.title || "")}" />
        </label>
        <label>
          Destaque (ex.: 30% OFF)
          <input type="text" data-field="highlight" value="${escapeHtml(slide.highlight || "")}" />
        </label>
        <label>
          Descricao
          <input type="text" data-field="description" value="${escapeHtml(slide.description || "")}" />
        </label>
        <label>
          Texto do botao
          <input type="text" data-field="buttonText" value="${escapeHtml(slide.buttonText || "Ver produto")}" />
        </label>
        <label>
          Link do botao
          <input type="text" data-field="buttonLink" value="${escapeHtml(slide.buttonLink || "produto.html?cupom=CLIENTE30")}" />
        </label>
        <label>
          URL da imagem (opcional)
          <input type="url" data-field="image" value="${escapeHtml(slide.image || "")}" />
        </label>
      </div>
      <div class="slide-actions">
        <button type="button" class="btn btn-danger" data-remove-slide="${id}">Remover card</button>
      </div>
    </article>
  `;
}

function renderSlidesEditor() {
  if (!state.content.carousel.length) {
    slidesEditor.innerHTML = '<p class="empty">Nenhum card no carrossel.</p>';
    return;
  }

  slidesEditor.innerHTML = state.content.carousel.map(slideItemTemplate).join("");
}

function readSlidesFromEditor() {
  const items = slidesEditor.querySelectorAll(".slide-item");
  const slides = [];

  for (const item of items) {
    const get = (field) => String(item.querySelector(`[data-field="${field}"]`)?.value || "").trim();
    slides.push({
      id: item.dataset.slideId,
      kicker: get("kicker"),
      title: get("title"),
      highlight: get("highlight"),
      description: get("description"),
      buttonText: get("buttonText"),
      buttonLink: get("buttonLink"),
      image: get("image"),
    });
  }

  return slides;
}

function imageOrderEditorHtml(images) {
  if (!images.length) return '<p class="mini-note">Sem imagens cadastradas.</p>';

  return `
    <div class="img-order-grid">
      ${images.map((url, index) => `
        <div class="img-order-item">
          <img src="${escapeHtml(url)}" alt="Imagem ${index + 1}" />
          <div class="img-order-actions">
            <button type="button" class="img-btn" data-img-action="left" data-img-index="${index}" title="Mover para esquerda">◀</button>
            <button type="button" class="img-btn" data-img-action="right" data-img-index="${index}" title="Mover para direita">▶</button>
            <button type="button" class="img-btn" data-img-action="remove" data-img-index="${index}" title="Remover">✕</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function createDraftImageEditorHtml(items) {
  if (!items.length) return '<p class="mini-note">Nenhuma imagem selecionada.</p>';

  return `
    <div class="img-order-grid">
      ${items.map((item, index) => `
        <div class="img-order-item">
          <img src="${escapeHtml(item.previewUrl)}" alt="Nova imagem ${index + 1}" />
          <div class="img-order-actions">
            <button type="button" class="img-btn" data-draft-action="left" data-draft-index="${index}" title="Mover para esquerda">◀</button>
            <button type="button" class="img-btn" data-draft-action="right" data-draft-index="${index}" title="Mover para direita">▶</button>
            <button type="button" class="img-btn" data-draft-action="remove" data-draft-index="${index}" title="Remover">✕</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCreateDraftImages() {
  createImageOrder.innerHTML = createDraftImageEditorHtml(state.createDraftImages);
}

function clearCreateDraftImages() {
  for (const item of state.createDraftImages) {
    if (item.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
  state.createDraftImages = [];
  renderCreateDraftImages();
}

function productItemTemplate(product) {
  const images = Array.isArray(product.images) ? product.images : [];

  return `
    <article class="product-item" data-product-id="${product.id}" data-images='${escapeHtml(JSON.stringify(images))}'>
      <form class="form-grid product-edit-form">
        <label>
          Titulo
          <input type="text" name="title" value="${escapeHtml(product.title)}" required />
        </label>

        <div>
          <label>Categorias</label>
          <div class="check-grid" data-edit-categories>
            ${state.categories.map((category) => {
              const checked = Array.isArray(product.categories) && product.categories.includes(category) ? "checked" : "";
              return `<label class="check-item"><input type="checkbox" data-category-check value="${escapeHtml(category)}" ${checked} />${escapeHtml(category)}</label>`;
            }).join("")}
          </div>
        </div>

        <label>
          Adicionar imagens (ate completar 10)
          <input type="file" name="imageFiles" accept="image/*" multiple />
        </label>
        <p class="mini-note">Use os controles abaixo para ordenar/remover imagens atuais.</p>
        <div data-image-order>${imageOrderEditorHtml(images)}</div>

        <label>
          Valor
          <input type="text" name="price" value="${String(product.price).replace(".", ",")}" required />
        </label>

        <label>
          Valor promocional (opcional)
          <input type="text" name="promoPrice" value="${product.promoPrice ? String(product.promoPrice).replace(".", ",") : ""}" />
        </label>

        <label>
          Descricao
          <textarea name="description" rows="3" required>${escapeHtml(product.description)}</textarea>
        </label>

        <label>
          Bullets (1 por linha)
          <textarea name="bulletsText" rows="4">${escapeHtml((product.bullets || []).join("\n"))}</textarea>
        </label>

        <label>
          Cards (1 por linha: Titulo|Descricao)
          <textarea name="trustCardsText" rows="5">${escapeHtml(trustCardsToText(product.trustCards))}</textarea>
        </label>

        <label>
          Variacoes (1 por linha: Titulo|Preco|PrecoPromocional|img1,img2)
          <textarea name="variationsText" rows="5">${escapeHtml(variationsToText(product.variations))}</textarea>
        </label>

        <div class="shipping-box">
          <strong>Pacote para frete</strong>
          <div class="shipping-grid">
            <label>
              Largura (cm)
              <input type="number" name="shippingWidth" inputmode="decimal" min="1" step="0.1" value="${escapeHtml(product.shipping?.width || 16)}" />
            </label>
            <label>
              Altura (cm)
              <input type="number" name="shippingHeight" inputmode="decimal" min="1" step="0.1" value="${escapeHtml(product.shipping?.height || 4)}" />
            </label>
            <label>
              Comprimento (cm)
              <input type="number" name="shippingLength" inputmode="decimal" min="1" step="0.1" value="${escapeHtml(product.shipping?.length || 16)}" />
            </label>
            <label>
              Peso (kg)
              <input type="number" name="shippingWeight" inputmode="decimal" min="0.01" step="0.001" value="${escapeHtml(product.shipping?.weight || 0.3)}" />
            </label>
            <label>
              Valor segurado (R$)
              <input type="text" name="shippingInsurance" inputmode="decimal" value="${escapeHtml(product.shipping?.insuranceValue || product.promoPrice || product.price || "")}" />
            </label>
          </div>
        </div>

        <div class="product-row-actions">
          <button type="button" class="btn btn-primary" data-save-product="${product.id}">Salvar alteracoes</button>
          <button type="button" class="btn btn-danger" data-delete-product="${product.id}">Excluir</button>
        </div>
        <a class="btn btn-light" href="/produto.html?id=${encodeURIComponent(product.id)}" target="_blank" rel="noopener noreferrer">Ir para pagina do produto</a>
      </form>
    </article>
  `;
}

function renderProductsList() {
  if (!state.products.length) {
    productList.innerHTML = '<p class="empty">Nenhum produto cadastrado ainda.</p>';
    return;
  }

  productList.innerHTML = state.products.map(productItemTemplate).join("");
}

function updateProductCardImages(card, images) {
  card.dataset.images = JSON.stringify(images);
  const container = card.querySelector("[data-image-order]");
  if (container) {
    container.innerHTML = imageOrderEditorHtml(images);
  }
}

function moveImage(images, index, direction) {
  const next = [...images];
  if (direction === "left" && index > 0) {
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
  }
  if (direction === "right" && index < next.length - 1) {
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
  }
  return next;
}

function renderShippingPanel() {
  const status = state.melhorEnvioStatus || {};
  const config = state.shippingConfig || {};
  const connected = Boolean(status.connected);
  const missingScopes = Array.isArray(status.missingShipmentScopes) ? status.missingShipmentScopes : [];

  meStatusText.textContent = connected ? "Conectado" : "Nao conectado";
  meEnvironment.textContent = String(status.environment || "sandbox");
  meCallbackPath.textContent = String(status.redirectUri || "/callback/melhorenvio");

  const cfg = config.config || config || {};
  const sender = cfg.sender && typeof cfg.sender === "object" ? cfg.sender : {};
  originPostalCodeInput.value = String(cfg.originPostalCode || sender.postalCode || "");
  serviceIdsInput.value = Array.isArray(cfg.services) ? cfg.services.join(",") : "";
  optReceipt.checked = Boolean(cfg.options?.receipt);
  optOwnHand.checked = Boolean(cfg.options?.ownHand || cfg.options?.own_hand);
  optCollect.checked = Boolean(cfg.options?.collect);
  senderNameInput.value = String(sender.name || "");
  senderEmailInput.value = String(sender.email || "");
  senderPhoneInput.value = String(sender.phone || "");
  senderDocumentInput.value = String(sender.document || "");
  senderCompanyDocumentInput.value = String(sender.companyDocument || sender.company_document || "");
  senderPostalCodeInput.value = String(sender.postalCode || sender.postal_code || "");
  senderAddressInput.value = String(sender.address || "");
  senderNumberInput.value = String(sender.number || "");
  senderComplementInput.value = String(sender.complement || "");
  senderDistrictInput.value = String(sender.district || "");
  senderCityInput.value = String(sender.city || "");
  senderStateInput.value = String(sender.state || sender.state_abbr || "");

  if (connected && missingScopes.length) {
    showMessage(
      shippingMessage,
      `Reconecte o app da Melhor Envio para liberar os escopos: ${missingScopes.join(", ")}.`,
      "error",
    );
  }
}

async function reloadAll() {
  const [categories, products, content, shippingConfig, melhorEnvioStatus] = await Promise.all([
    fetchCategories(),
    fetchProducts(),
    fetchContent(),
    fetchShippingConfig(),
    fetchMelhorEnvioStatus(),
  ]);

  state.categories = Array.isArray(categories) ? categories : [];
  state.products = Array.isArray(products) ? products : [];
  state.content = {
    benefitText: String(content?.benefitText || "Frete Rapido e garantia de 3 anos"),
    featuredProductId: String(content?.featuredProductId || ""),
    carousel: Array.isArray(content?.carousel) ? content.carousel : [],
  };
  state.shippingConfig = shippingConfig || {};
  state.melhorEnvioStatus = melhorEnvioStatus || {};

  benefitInput.value = state.content.benefitText;
  renderCategoryChecks(createCategories, []);
  renderFeaturedSelect();
  renderSlidesEditor();
  renderProductsList();
  renderCreateDraftImages();
  renderShippingPanel();
}

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(formMessage, "", "");

  const formData = new FormData(productForm);
  const files = state.createDraftImages.map((item) => item.file).filter(Boolean);

  let uploadedImages = [];
  try {
    uploadedImages = await uploadImages(files);
  } catch (error) {
    showMessage(formMessage, error.message, "error");
    return;
  }

  const promoRaw = String(formData.get("promoPrice") || "").trim();
  const payload = {
    title: String(formData.get("title") || "").trim(),
    categories: getCheckedCategories(productForm),
    images: uploadedImages,
    price: normalizePrice(formData.get("price")),
    promoPrice: promoRaw ? normalizePrice(promoRaw) : "",
    description: String(formData.get("description") || "").trim(),
    bullets: parseBullets(formData.get("bulletsText")),
    trustCards: parseTrustCards(formData.get("trustCardsText")),
    variations: parseVariations(formData.get("variationsText")),
    shipping: parseShippingPackageFromForm(
      formData,
      normalizePrice(formData.get("promoPrice")) || normalizePrice(formData.get("price")),
    ),
  };

  if (!payload.title || !payload.price || !payload.description || !payload.categories.length) {
    showMessage(formMessage, "Preencha titulo, categorias, valor e descricao.", "error");
    return;
  }

  try {
    const response = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await readJsonResponse(response);

    productForm.reset();
    clearCreateDraftImages();
    renderCategoryChecks(createCategories, []);
    showMessage(formMessage, "Produto salvo com sucesso.", "success");
    await reloadAll();
  } catch (error) {
    showMessage(formMessage, error.message || "Erro de conexao ao salvar produto.", "error");
  }
});

contentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(contentMessage, "", "");

  const payload = {
    benefitText: String(benefitInput.value || "").trim(),
    featuredProductId: String(featuredProductSelect.value || "").trim(),
    carousel: readSlidesFromEditor(),
  };

  try {
    const response = await fetch("/api/site-content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    await readJsonResponse(response);

    showMessage(contentMessage, "Conteudo da Home salvo com sucesso.", "success");
    await reloadAll();
  } catch (error) {
    showMessage(contentMessage, error.message || "Erro de conexao ao salvar conteudo.", "error");
  }
});

addSlideBtn.addEventListener("click", () => {
  state.content.carousel.push({
    id: `s-${Date.now()}`,
    kicker: "NOVO CARD",
    title: "Titulo do card",
    highlight: "",
    description: "Descricao do card",
    buttonText: "Ver produto",
    buttonLink: "produto.html?cupom=CLIENTE30",
    image: "",
  });
  renderSlidesEditor();
});

slidesEditor.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-remove-slide]");
  if (!btn) return;

  const id = btn.getAttribute("data-remove-slide");
  state.content.carousel = state.content.carousel.filter((slide) => slide.id !== id);
  renderSlidesEditor();
});

productList.addEventListener("click", async (event) => {
  const imgBtn = event.target.closest("[data-img-action]");
  if (imgBtn) {
    const card = imgBtn.closest(".product-item");
    const index = Number(imgBtn.getAttribute("data-img-index"));
    const action = imgBtn.getAttribute("data-img-action");
    const currentImages = JSON.parse(card.dataset.images || "[]");

    if (action === "remove") {
      const next = currentImages.filter((_, i) => i !== index);
      updateProductCardImages(card, next);
      return;
    }

    const next = moveImage(currentImages, index, action);
    updateProductCardImages(card, next);
    return;
  }

  const saveBtn = event.target.closest("[data-save-product]");
  const deleteBtn = event.target.closest("[data-delete-product]");

  if (saveBtn) {
    const id = saveBtn.getAttribute("data-save-product");
    const card = saveBtn.closest(".product-item");
    const form = card.querySelector(".product-edit-form");
    const formData = new FormData(form);

    const currentImages = JSON.parse(card.dataset.images || "[]");
    const files = formData.getAll("imageFiles").filter((item) => item && item.size > 0);

    let uploaded = [];
    try {
      uploaded = await uploadImages(files);
    } catch (error) {
      showMessage(formMessage, error.message, "error");
      return;
    }

    const mergedImages = [...currentImages, ...uploaded].slice(0, 10);
    const promoRaw = String(formData.get("promoPrice") || "").trim();

    const payload = {
      title: String(formData.get("title") || "").trim(),
      categories: getCheckedCategories(form),
      images: mergedImages,
      price: normalizePrice(formData.get("price")),
      promoPrice: promoRaw ? normalizePrice(promoRaw) : "",
      description: String(formData.get("description") || "").trim(),
      bullets: parseBullets(formData.get("bulletsText")),
      trustCards: parseTrustCards(formData.get("trustCardsText")),
      variations: parseVariations(formData.get("variationsText")),
      shipping: parseShippingPackageFromForm(
        formData,
        normalizePrice(formData.get("promoPrice")) || normalizePrice(formData.get("price")),
      ),
    };

    try {
      const response = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      await readJsonResponse(response);

      showMessage(formMessage, "Produto atualizado com sucesso.", "success");
      await reloadAll();
    } catch (error) {
      showMessage(formMessage, error.message || "Erro de conexao ao atualizar produto.", "error");
    }
  }

  if (deleteBtn) {
    const id = deleteBtn.getAttribute("data-delete-product");

    try {
      const response = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!response.ok) {
        await readJsonResponse(response);
      }

      showMessage(formMessage, "Produto excluido com sucesso.", "success");
      await reloadAll();
    } catch (error) {
      showMessage(formMessage, error.message || "Erro de conexao ao excluir produto.", "error");
    }
  }
});

refreshBtn.addEventListener("click", async () => {
  await reloadAll();
  showMessage(formMessage, "Dados atualizados.", "success");
});

senderPostalCodeInput?.addEventListener("blur", () => {
  const normalized = normalizePostalCode(senderPostalCodeInput.value);
  if (normalized) senderPostalCodeInput.value = normalized;
});

senderStateInput?.addEventListener("blur", () => {
  senderStateInput.value = normalizeStateInput(senderStateInput.value);
});

shippingConfigForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(shippingMessage, "", "");

  const sender = collectSenderPayload();
  const senderErrors = getSenderRequiredFieldErrors(sender);
  if (senderErrors.length) {
    showMessage(
      shippingMessage,
      `Complete os dados do remetente: ${senderErrors.join(", ")}.`,
      "error",
    );
    return;
  }

  const originPostalCode = normalizePostalCode(originPostalCodeInput.value || sender.postalCode || "");
  const payload = {
    originPostalCode,
    services: parseServiceIds(serviceIdsInput.value),
    options: {
      receipt: Boolean(optReceipt.checked),
      ownHand: Boolean(optOwnHand.checked),
      collect: Boolean(optCollect.checked),
    },
    sender,
  };

  if (!payload.originPostalCode) {
    showMessage(shippingMessage, "Informe um CEP de origem valido.", "error");
    return;
  }

  try {
    const response = await fetch("/api/shipping/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await readJsonResponse(response);
    showMessage(shippingMessage, "Configuracao de frete salva.", "success");
    await reloadAll();
  } catch (error) {
    showMessage(shippingMessage, error.message || "Falha ao salvar configuracao de frete.", "error");
  }
});

connectMelhorEnvioBtn.addEventListener("click", async () => {
  showMessage(shippingMessage, "", "");
  try {
    const response = await fetch("/api/melhorenvio/connect-url");
    const data = await readJsonResponse(response);
    const authUrl = String(data.authUrl || "").trim();
    if (!authUrl) {
      showMessage(shippingMessage, "Nao foi possivel iniciar a conexao com a Melhor Envio.", "error");
      return;
    }
    window.location.href = authUrl;
  } catch (error) {
    showMessage(shippingMessage, error.message || "Falha ao iniciar a conexao com a Melhor Envio.", "error");
  }
});

disconnectMelhorEnvioBtn.addEventListener("click", async () => {
  showMessage(shippingMessage, "", "");
  try {
    const response = await fetch("/api/melhorenvio/disconnect", { method: "POST" });
    await readJsonResponse(response);
    showMessage(shippingMessage, "Conexao com Melhor Envio removida.", "success");
    await reloadAll();
  } catch (error) {
    showMessage(shippingMessage, error.message || "Falha ao desconectar.", "error");
  }
});

productForm.addEventListener("change", (event) => {
  const input = event.target;
  if (!input || input.name !== "imageFiles") return;

  const selected = Array.from(input.files || []).filter((file) => file && file.size > 0);
  if (!selected.length) return;

  const capacity = 10 - state.createDraftImages.length;
  const accepted = selected.slice(0, Math.max(capacity, 0));

  for (const file of accepted) {
    state.createDraftImages.push({
      file,
      previewUrl: URL.createObjectURL(file),
    });
  }

  renderCreateDraftImages();
  input.value = "";
});

createImageOrder.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-draft-action]");
  if (!btn) return;

  const index = Number(btn.getAttribute("data-draft-index"));
  const action = btn.getAttribute("data-draft-action");
  const current = [...state.createDraftImages];

  if (action === "remove") {
    const [removed] = current.splice(index, 1);
    if (removed?.previewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    state.createDraftImages = current;
    renderCreateDraftImages();
    return;
  }

  state.createDraftImages = moveImage(current, index, action);
  renderCreateDraftImages();
});

initCollapsibles();

reloadAll()
  .then(() => {
    const params = new URLSearchParams(window.location.search);
    const meStatus = String(params.get("melhorenvio") || "").trim();
    if (meStatus === "connected") {
      showMessage(shippingMessage, "App Melhor Envio conectado com sucesso.", "success");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (meStatus === "error") {
      showMessage(shippingMessage, "Falha na autorizacao da Melhor Envio. Tente novamente.", "error");
      window.history.replaceState({}, "", window.location.pathname);
    }
  })
  .catch((error) => {
    productList.innerHTML = `<p class="empty">${escapeHtml(error.message || "Nao foi possivel carregar os dados.")}</p>`;
  });
