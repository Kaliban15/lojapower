const CATEGORIES = ["Fones de ouvido", "Carregadores", "Eletronicos", "Casa", "Carro"];
const MIN_SEARCH_CHARS = 3;
const SEARCH_LIMIT = 6;
const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
const MP_REDIRECT_DELAY_MS = 6000;
const SHIPPING_STORAGE_KEY = "power_shipping_selection_v1";
const SHIPPING_SELECTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const state = {
  basePrice: 299.9,
  finalPrice: 0,
  discountRate: 0,
  couponCode: "",
  productId: "",
  product: null,
  allProducts: [],
  activeImage: "",
  activeVariationId: "",
  searchDebounce: null,
  searchLastResults: [],
  loggedSearchTerms: new Set(),
  trackSyncRaf: null,
  autoPayOnInit: false,
  shippingSelection: null,
  checkoutInProgress: false,
  checkoutRedirectTimer: null,
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const elements = {
  breadcrumbs: document.getElementById("breadcrumbs"),
  productTitle: document.getElementById("productTitle"),
  productTrack: document.getElementById("productStageTrack"),
  stageFallback: document.getElementById("stageFallback"),
  imageThumbs: document.getElementById("imageThumbs"),
  variationList: document.getElementById("variationList"),
  productDescription: document.getElementById("productDescription"),
  descToggle: document.getElementById("descToggle"),
  heroBenefits: document.getElementById("heroBenefits"),
  trustCards: document.getElementById("trustCards"),
  heroBasePrice: document.getElementById("heroBasePrice"),
  heroDiscountPrice: document.getElementById("heroDiscountPrice"),
  heroInstallment: document.getElementById("heroInstallment"),
  oldPriceRow: document.getElementById("oldPriceRow"),
  discountBadge: document.getElementById("discountBadge"),
  stickyPrice: document.getElementById("stickyPrice"),
  buyNowBtn: document.getElementById("buyNowBtn"),
  stickyBuyBtn: document.getElementById("stickyBuyBtn"),
  cartLink: document.querySelector(".cart"),
  sidebarEl: document.getElementById("categorySidebar"),
  sidebarListEl: document.getElementById("sidebarCategoryList"),
  openSidebarBtn: document.getElementById("openSidebarBtn"),
  closeSidebarBtn: document.getElementById("closeSidebarBtn"),
  searchInput: document.getElementById("searchInput"),
  searchDropdown: document.getElementById("searchDropdown"),
  mpRedirectModal: document.getElementById("mpRedirectModal"),
  mpRedirectProgressBar: document.getElementById("mpRedirectProgressBar"),
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(" ")
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

function normalizeWithMap(value) {
  const source = String(value || "");
  let normalized = "";
  const map = [];

  for (let i = 0; i < source.length; i += 1) {
    const chunk = source[i]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    for (const ch of chunk) {
      normalized += ch;
      map.push(i);
    }
  }

  return { normalized, map };
}

function highlightTitle(title, query) {
  const text = String(title || "");
  const queryToken = tokenize(query).sort((a, b) => b.length - a.length)[0];
  if (!queryToken) return escapeHtml(text);

  const normalizedTitle = normalizeWithMap(text);
  const start = normalizedTitle.normalized.indexOf(queryToken);
  if (start < 0) return escapeHtml(text);

  const end = start + queryToken.length;
  const originalStart = normalizedTitle.map[start] ?? 0;
  const originalEnd = (normalizedTitle.map[end - 1] ?? (text.length - 1)) + 1;

  const head = escapeHtml(text.slice(0, originalStart));
  const mid = escapeHtml(text.slice(originalStart, originalEnd));
  const tail = escapeHtml(text.slice(originalEnd));
  return `${head}<span class="search-mark">${mid}</span>${tail}`;
}

function levenshteinDistance(a, b, maxDistance = 2) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);

  for (let j = 0; j <= b.length; j += 1) prev[j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > maxDistance) return maxDistance + 1;
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }

  return prev[b.length];
}

function resolveProductImages(product) {
  if (Array.isArray(product?.images) && product.images.length) {
    return product.images.map((img) => safeImageUrl(img)).filter(Boolean);
  }
  const legacy = safeImageUrl(product?.image || "");
  return legacy ? [legacy] : [];
}

function normalizeProductForSearch(product) {
  const categories = Array.isArray(product.categories) ? product.categories : [product.category || ""];
  const bullets = Array.isArray(product.bullets) ? product.bullets : [];
  const source = [
    product.title,
    product.description,
    categories.join(" "),
    bullets.join(" "),
  ].join(" ");

  return {
    product,
    images: resolveProductImages(product),
    normalizedSource: normalizeText(source),
    normalizedTokens: tokenize(source),
  };
}

function scoreCandidate(candidate, query) {
  const queryNorm = normalizeText(query);
  if (!queryNorm || queryNorm.length < MIN_SEARCH_CHARS) return 0;

  if (candidate.normalizedSource.includes(queryNorm)) {
    const pos = candidate.normalizedSource.indexOf(queryNorm);
    return 100 - Math.min(pos, 60);
  }

  const queryTokens = tokenize(queryNorm);
  if (!queryTokens.length) return 0;

  let total = 0;
  let matched = 0;
  for (const token of queryTokens) {
    let best = 0;
    for (const target of candidate.normalizedTokens) {
      if (!target) continue;
      if (target.includes(token) || token.includes(target)) {
        best = Math.max(best, 0.95);
        continue;
      }
      const maxDistance = token.length >= 6 ? 2 : 1;
      const distance = levenshteinDistance(token, target, maxDistance);
      if (distance <= maxDistance) {
        const similarity = 1 - (distance / Math.max(token.length, target.length, 1));
        if (similarity > best) best = similarity;
      }
    }
    if (best >= 0.55) {
      matched += 1;
      total += best;
    }
  }

  if (!matched) return 0;
  return (total / queryTokens.length) * 100;
}

function searchProducts(products, query) {
  const queryNorm = normalizeText(query);
  if (queryNorm.length < MIN_SEARCH_CHARS) return [];

  const ranked = [];
  for (const product of products) {
    const candidate = normalizeProductForSearch(product);
    const score = scoreCandidate(candidate, queryNorm);
    if (score >= 45) {
      ranked.push({
        product: candidate.product,
        images: candidate.images,
        score,
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

function renderSearchDropdown(results, query) {
  if (normalizeText(query).length < MIN_SEARCH_CHARS) {
    elements.searchDropdown.hidden = true;
    elements.searchDropdown.innerHTML = "";
    return;
  }

  if (!results.length) {
    elements.searchDropdown.innerHTML = `<div class="search-empty">Nenhum resultado para "${escapeHtml(query)}"</div>`;
    elements.searchDropdown.hidden = false;
    return;
  }

  elements.searchDropdown.innerHTML = results.slice(0, SEARCH_LIMIT).map((entry) => {
    const product = entry.product;
    const thumb = getFirstImageThumb(entry.images) || BLANK_IMAGE;
    const basePrice = Number(product.promoPrice || product.price || 0);
    const discounted = basePrice * 0.7;
    const productUrl = `produto.html?id=${encodeURIComponent(product.id)}&cupom=CLIENTE30`;

    return `
      <a class="search-item" href="${productUrl}" aria-label="Abrir ${escapeHtml(product.title)}">
        <img src="${escapeHtml(thumb)}" alt="${escapeHtml(product.title)}" loading="lazy" />
        <span>
          <strong>${highlightTitle(product.title, query)}</strong>
          <span class="search-price-row">
            <span class="search-old">${currency.format(basePrice)}</span>
            <span class="search-new">${currency.format(discounted)} com 30% OFF</span>
          </span>
        </span>
      </a>
    `;
  }).join("");

  elements.searchDropdown.hidden = false;
}

function hideSearchDropdown() {
  elements.searchDropdown.hidden = true;
}

function logSearch(term, resultCount) {
  const normalized = normalizeText(term);
  if (normalized.length < MIN_SEARCH_CHARS) return;
  if (state.loggedSearchTerms.has(normalized)) return;
  state.loggedSearchTerms.add(normalized);

  fetch("/api/search-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: term,
      normalizedQuery: normalized,
      resultCount,
      page: "produto",
      at: new Date().toISOString(),
    }),
  }).catch(() => {
    // logging is best-effort
  });
}

function parseParams() {
  const params = new URLSearchParams(window.location.search);
  state.productId = String(params.get("id") || "").trim();
  state.activeVariationId = String(params.get("variation") || "").trim();
  state.autoPayOnInit = String(params.get("autopay") || "").trim() === "1";

  const coupon = (params.get("cupom") || params.get("coupon") || "").trim().toUpperCase();
  const rateParam = Number(params.get("desconto") || params.get("discount") || 0);

  if (coupon) {
    if (coupon.includes("30")) state.discountRate = 0.3;
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

function getActiveVariant() {
  const list = Array.isArray(state.product?.variations) ? state.product.variations : [];
  if (!list.length) return null;
  if (!state.activeVariationId) return null;
  return list.find((v) => v.id === state.activeVariationId) || null;
}

function getEffectiveImages() {
  const variant = getActiveVariant();
  if (variant && Array.isArray(variant.images) && variant.images.length) {
    return variant.images.map((img) => safeImageUrl(img)).filter(Boolean);
  }
  return resolveProductImages(state.product);
}

function getActiveImageIndex(images) {
  const activeSafe = safeImageUrl(state.activeImage);
  const idx = images.findIndex((img) => safeImageUrl(img) === activeSafe);
  return idx >= 0 ? idx : 0;
}

async function loadProduct() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) return;

    const products = await response.json();
    if (!Array.isArray(products) || !products.length) return;

    state.allProducts = products;

    let product = null;
    if (state.productId) {
      product = products.find((item) => item.id === state.productId) || null;
    }
    if (!product) {
      product = products[0];
      state.productId = product.id;
    }

    state.product = product;
    state.basePrice = Number(product.price || state.basePrice);
    const variations = Array.isArray(product.variations) ? product.variations : [];
    if (state.activeVariationId && !variations.some((variation) => variation.id === state.activeVariationId)) {
      state.activeVariationId = "";
    }

    const variant = getActiveVariant();
    if (variant) {
      state.activeImage = Array.isArray(variant.images) && variant.images.length ? safeImageUrl(variant.images[0]) : "";
    }

    if (!state.activeImage) {
      const images = getEffectiveImages();
      state.activeImage = images[0] || "";
    }
  } catch {
    // silent fallback
  }
}

function openSidebar() {
  elements.sidebarEl.classList.add("open");
  elements.sidebarEl.setAttribute("aria-hidden", "false");
}

function closeSidebar() {
  elements.sidebarEl.classList.remove("open");
  elements.sidebarEl.setAttribute("aria-hidden", "true");
}

function renderSidebar() {
  elements.sidebarListEl.innerHTML = CATEGORIES.map((category) => {
    return `<a class="sidebar-link" href="index.html?category=${encodeURIComponent(category)}">${category}</a>`;
  }).join("");
}

function safeImageUrl(url) {
  let cleanUrl = String(url || "").trim().replace(/\\/g, "/");
  
  // BLINDAGEM: Se o link vier do banco com o prefixo /uploads/ grudado no https
  // nós removemos o lixo aqui no frontend automaticamente.
  if (cleanUrl.includes("/uploads/https://")) {
    return cleanUrl.replace("/uploads/", "");
  }
  
  return cleanUrl;
}

function isVideoUrl(url) {
  const cleanUrl = safeImageUrl(url).toLowerCase();
  if (!cleanUrl) return false;
  if (cleanUrl.startsWith("data:video/")) return true;
  if (cleanUrl.includes("/video/upload/")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/.test(cleanUrl);
}

function getFirstImageThumb(mediaList) {
  if (!Array.isArray(mediaList)) return "";
  for (const item of mediaList) {
    const safeUrl = safeImageUrl(item);
    if (safeUrl && !isVideoUrl(safeUrl)) return safeUrl;
  }
  return "";
}

function getVariantLabel(variation) {
  const name = String(variation?.name || "").trim();
  const value = String(variation?.value || variation?.title || "").trim();
  if (name && value) return `${name}: ${value}`;
  return value || name || "Variacao";
}

function round2(value) {
  return Number((Number(value) || 0).toFixed(2));
}

function buildShippingPageUrl() {
  const params = new URLSearchParams();
  if (state.productId) params.set("product", state.productId);
  if (state.activeVariationId) params.set("variation", state.activeVariationId);
  if (state.couponCode) params.set("cupom", state.couponCode);
  params.set("discount", String(Math.round(state.discountRate * 100)));

  return `shipping.html?${params.toString()}`;
}

function readStoredShippingSelection() {
  try {
    const raw = localStorage.getItem(SHIPPING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getValidatedShippingSelection() {
  const saved = readStoredShippingSelection();
  if (!saved) return null;

  const savedAt = Date.parse(String(saved.createdAt || ""));
  if (!Number.isFinite(savedAt) || (Date.now() - savedAt) > SHIPPING_SELECTION_MAX_AGE_MS) {
    return null;
  }

  const sameProduct = String(saved.productId || "") === String(state.productId || "");
  const sameVariation = String(saved.variationId || "") === String(state.activeVariationId || "");
  if (!sameProduct || !sameVariation) {
    return null;
  }

  const shippingPrice = Number(saved.shipping?.price || 0);
  if (!Number.isFinite(shippingPrice) || shippingPrice < 0) return null;

  const customerName = String(saved.customer?.name || "").trim();
  const customerEmail = String(saved.customer?.email || "").trim();
  const customerPhone = String(saved.customer?.phone || "").trim();
  const customerCpf = String(saved.customer?.cpf || "").replace(/\D/g, "");
  if (!customerName || !customerEmail || !customerPhone) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return null;
  if (customerCpf.length !== 11) return null;

  const postalCode = String(saved.address?.postalCode || "").replace(/\D/g, "");
  const street = String(saved.address?.street || "").trim();
  const number = String(saved.address?.number || "").trim();
  const district = String(saved.address?.district || "").trim();
  const city = String(saved.address?.city || "").trim();
  const stateCode = String(saved.address?.state || "").trim().toUpperCase();
  if (postalCode.length !== 8 || !street || !number || !district || !city || stateCode.length !== 2) return null;

  return saved;
}

function renderVariations() {
  const variations = Array.isArray(state.product?.variations) ? state.product.variations : [];
  if (!variations.length) {
    elements.variationList.innerHTML = "";
    return;
  }

  const baseActive = state.activeVariationId ? "" : "active";
  const buttons = [
    `<button type="button" class="variation-btn ${baseActive}" data-variation-id="">Produto principal</button>`,
    ...variations.map((variation) => {
      const active = variation.id === state.activeVariationId ? "active" : "";
      return `<button type="button" class="variation-btn ${active}" data-variation-id="${variation.id}">${escapeHtml(getVariantLabel(variation))}</button>`;
    }),
  ];

  elements.variationList.innerHTML = buttons.join("");
}

function updateThumbActiveState() {
  const activeSafe = safeImageUrl(state.activeImage);
  elements.imageThumbs.querySelectorAll("[data-image]").forEach((btn) => {
    btn.classList.toggle("active", safeImageUrl(btn.getAttribute("data-image") || "") === activeSafe);
  });
}

function scrollToImage(index, behavior = "auto") {
  const width = elements.productTrack.clientWidth || 1;
  const left = width * index;
  elements.productTrack.scrollTo({ left, behavior });
}

function getTrackImageIndex(images) {
  if (!images.length) return 0;
  const width = elements.productTrack.clientWidth || 1;
  const rawIndex = Math.round(elements.productTrack.scrollLeft / width);
  return Math.max(0, Math.min(images.length - 1, rawIndex));
}

function syncActiveImageFromTrack() {
  const images = getEffectiveImages();
  if (!images.length) return;

  const index = getTrackImageIndex(images);
  const nextImage = images[index];
  if (!nextImage) return;

  if (safeImageUrl(nextImage) !== safeImageUrl(state.activeImage)) {
    state.activeImage = nextImage;
    updateThumbActiveState();
  }

  pauseInactiveVideos();
}

function pauseInactiveVideos() {
  const activeSafe = safeImageUrl(state.activeImage);
  elements.productTrack.querySelectorAll(".stage-video").forEach((video) => {
    const source = safeImageUrl(video.getAttribute("data-source") || video.getAttribute("src") || video.currentSrc || "");
    if (source !== activeSafe) {
      video.pause();
    }
  });
}

function renderImages() {
  const images = getEffectiveImages();

  if (!images.length) {
    elements.productTrack.innerHTML = "";
    elements.stageFallback.hidden = false;
    elements.imageThumbs.innerHTML = "";
    return;
  }

  const active = images.includes(state.activeImage) ? state.activeImage : images[0];
  state.activeImage = active;
  elements.stageFallback.hidden = true;

  elements.productTrack.innerHTML = images.map((url, index) => {
    const safeUrl = safeImageUrl(url);
    const optimizedUrl = optimizeMediaUrl(safeUrl);
    const isVideo = isVideoUrl(safeUrl);
    const alt = `${state.product?.title || "Imagem do produto"} ${index + 1}`;
    const cardClass = index % 2 === 0 ? "stage-slide stage-slide-main" : "stage-slide stage-slide-alt";
    
    // Otimizamos também a imagem de fundo (background-image)
    const bgImage = optimizedUrl && !isVideo
      ? `style="background-image:linear-gradient(130deg, rgba(7,20,54,0.75), rgba(15,77,243,0.58)), url('${optimizedUrl.replace(/'/g, "%27")}')"`
      : "";

    // Otimizamos o src do vídeo e da imagem
    const mediaMarkup = isVideo
      ? `<video class="stage-video" src="${escapeHtml(optimizedUrl)}" data-source="${escapeHtml(safeUrl)}" aria-label="${escapeHtml(alt)}" controls playsinline preload="metadata"></video>`
      : `<img class="stage-image" src="${escapeHtml(optimizedUrl)}" alt="${escapeHtml(alt)}" draggable="false" loading="lazy" />`;

    return `
      <article class="${cardClass}" ${bgImage}>
        <div class="stage-image-frame">
          ${mediaMarkup}
        </div>
      </article>
    `;
  }).join("");

  elements.imageThumbs.innerHTML = images.map((url) => {
    const safeUrl = safeImageUrl(url);
    const optimizedUrl = optimizeMediaUrl(safeUrl);
    const activeClass = safeUrl === safeImageUrl(active) ? "active" : "";
    
    if (isVideoUrl(safeUrl)) {
      return `
        <button type="button" class="thumb-btn thumb-btn-video ${activeClass}" data-image="${escapeHtml(safeUrl)}">
          <video src="${escapeHtml(optimizedUrl)}" aria-label="Miniatura do video" autoplay loop muted playsinline preload="metadata"></video>
          <span class="thumb-video-badge">Video</span>
        </button>
      `;
    }
    
    return `
      <button type="button" class="thumb-btn ${activeClass}" data-image="${escapeHtml(safeUrl)}">
        <img src="${escapeHtml(optimizedUrl)}" alt="Miniatura" loading="lazy" />
      </button>
    `;
  }).join("");

  const index = getActiveImageIndex(images);
  requestAnimationFrame(() => {
    scrollToImage(index, "auto");
    pauseInactiveVideos();
  });
}

function renderBenefits() {
  const bullets = Array.isArray(state.product?.bullets) && state.product.bullets.length
    ? state.product.bullets
    : [
      "Garantia oficial de 3 anos",
      "Rastreamento em tempo real no celular",
      "Despacho prioritario para entrega agil",
    ];

  elements.heroBenefits.innerHTML = bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderTrustCards() {
  const cards = Array.isArray(state.product?.trustCards) && state.product.trustCards.length
    ? state.product.trustCards
    : [
      { title: "Entrega no mesmo dia*", description: "Em regioes elegiveis, pedido aprovado vai para expedicao expressa." },
      { title: "Checkout sem senha", description: "Compra de convidado em uma pagina, com menos friccao." },
      { title: "Compra protegida", description: "Pagamento via PIX copia e cola com validacao simplificada." },
    ];

  elements.trustCards.innerHTML = cards.map((card) => `
    <article>
      <h2>${escapeHtml(card.title)}</h2>
      <p>${escapeHtml(card.description)}</p>
    </article>
  `).join("");
}

function updateDescriptionClamp() {
  const el = elements.productDescription;
  el.classList.remove("expanded");
  el.classList.add("collapsed");

  requestAnimationFrame(() => {
    const needsToggle = el.scrollHeight > el.clientHeight + 2;
    elements.descToggle.hidden = !needsToggle;
    elements.descToggle.textContent = "Ver descricao completa";
  });
}

function renderProductInfo() {
  const product = state.product;
  if (!product) return;

  const activeVariant = getActiveVariant();
  const title = activeVariant ? `${product.title} - ${getVariantLabel(activeVariant)}` : product.title;

  elements.productTitle.textContent = title;
  elements.productDescription.textContent = product.description;
  elements.breadcrumbs.textContent = `Inicio > ${product.categories?.[0] || "Eletronicos"} > ${title}`;

  renderVariations();
  renderImages();
  renderBenefits();
  renderTrustCards();
  updateDescriptionClamp();
}

function renderPricing() {
  const activeVariant = getActiveVariant();

  const normalPrice = Number(activeVariant?.price || state.product?.price || state.basePrice);
  const promoPrice = Number(activeVariant?.promoPrice || state.product?.promoPrice || 0);

  let finalPrice = normalPrice;
  if (promoPrice > 0 && promoPrice < normalPrice) {
    finalPrice = promoPrice;
    const discountPercent = Math.round(((normalPrice - promoPrice) / normalPrice) * 100);
    elements.discountBadge.hidden = false;
    elements.discountBadge.textContent = `${discountPercent}% OFF`;
    elements.oldPriceRow.style.display = "block";
  } else {
    finalPrice = normalPrice * (1 - state.discountRate);
    elements.discountBadge.hidden = true;
    elements.oldPriceRow.style.display = "none";
  }

  const installment = finalPrice / 6;
  state.finalPrice = round2(finalPrice);

  elements.heroBasePrice.textContent = currency.format(normalPrice);
  elements.heroDiscountPrice.textContent = currency.format(finalPrice);
  elements.heroInstallment.textContent = currency.format(installment);
  elements.stickyPrice.textContent = currency.format(finalPrice);

  const shippingUrl = buildShippingPageUrl();
  elements.buyNowBtn.href = shippingUrl;
  elements.stickyBuyBtn.href = shippingUrl;
  if (elements.cartLink) {
    elements.cartLink.href = "my-orders.html";
  }
}

function setDirectCheckoutLoading(loading) {
  state.checkoutInProgress = loading;
  [elements.buyNowBtn, elements.stickyBuyBtn].forEach((link) => {
    if (!link) return;
    if (!link.dataset.originalText) {
      link.dataset.originalText = link.textContent || "";
    }
    link.textContent = loading ? "Abrindo Checkout..." : link.dataset.originalText;
    link.setAttribute("aria-disabled", loading ? "true" : "false");
    link.style.pointerEvents = loading ? "none" : "";
    link.style.opacity = loading ? "0.86" : "";
  });
}

async function readCheckoutResponse(response) {
  const raw = await response.text();
  let parsed = null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    throw new Error(parsed?.message || "Nao foi possivel iniciar o Checkout Pro.");
  }

  return parsed || {};
}

function hideMercadoPagoRedirectModal() {
  if (state.checkoutRedirectTimer) {
    clearTimeout(state.checkoutRedirectTimer);
    state.checkoutRedirectTimer = null;
  }

  if (elements.mpRedirectModal) {
    elements.mpRedirectModal.hidden = true;
    elements.mpRedirectModal.setAttribute("aria-hidden", "true");
  }
  if (elements.mpRedirectProgressBar) {
    elements.mpRedirectProgressBar.classList.remove("run");
  }
  document.body.classList.remove("mp-redirect-lock");
}

function showMercadoPagoRedirectModal(checkoutUrl) {
  const modal = elements.mpRedirectModal;
  const progressBar = elements.mpRedirectProgressBar;

  if (!modal || !progressBar) {
    window.location.href = checkoutUrl;
    return Promise.resolve();
  }

  progressBar.classList.remove("run");
  void progressBar.offsetWidth;
  progressBar.style.animationDuration = `${MP_REDIRECT_DELAY_MS}ms`;
  progressBar.classList.add("run");

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("mp-redirect-lock");

  return new Promise((resolve) => {
    state.checkoutRedirectTimer = window.setTimeout(() => {
      state.checkoutRedirectTimer = null;
      window.location.href = checkoutUrl;
      resolve();
    }, MP_REDIRECT_DELAY_MS);
  });
}

function buildDirectCheckoutPayload(shippingSelection) {
  const activeVariant = getActiveVariant();
  const variationLabel = activeVariant ? getVariantLabel(activeVariant) : "";
  const title = activeVariant
    ? `${state.product?.title || "Pedido Power Tech"} - ${variationLabel}`
    : (state.product?.title || "Pedido Power Tech");
  const fallbackTotal = round2(state.basePrice * (1 - state.discountRate));
  const productAmount = round2(state.finalPrice || fallbackTotal);
  const shippingAmount = round2(shippingSelection?.shipping?.price || 0);
  const total = round2(productAmount + shippingAmount);

  if (!Number.isFinite(productAmount) || productAmount <= 0) {
    return null;
  }

  const payer = shippingSelection?.customer || {};
  const address = shippingSelection?.address || {};
  const items = [
    {
      id: `order-${state.productId || "main"}`,
      title,
      quantity: 1,
      unitPrice: productAmount,
      currencyId: "BRL",
    },
  ];
  if (shippingAmount > 0) {
    items.push({
      id: `shipping-${shippingSelection?.shipping?.id || "service"}`,
      title: `Frete - ${shippingSelection?.shipping?.company?.name || "Transportadora"}`,
      quantity: 1,
      unitPrice: shippingAmount,
      currencyId: "BRL",
    });
  }

  return {
    title: shippingAmount > 0 ? `${title} + Frete` : title,
    externalReference: `POWER-${Date.now()}`,
    items,
    payer: {
      name: String(payer.name || "").trim(),
      email: String(payer.email || "").trim(),
      phone: String(payer.phone || "").trim(),
      cpf: String(payer.cpf || "").replace(/\D/g, "").slice(0, 11),
    },
    order: {
      source: "produto-direto",
      productId: state.product?.id || "",
      variationId: activeVariant?.id || "",
      variationName: String(activeVariant?.name || "").trim(),
      variationValue: String(activeVariant?.value || activeVariant?.title || "").trim(),
      variationLabel,
      quantity: 1,
      couponCode: state.couponCode,
      productAmount,
      shippingAmount,
      total,
      shipping: {
        id: shippingSelection?.shipping?.id || "",
        serviceName: shippingSelection?.shipping?.name || "",
        company: shippingSelection?.shipping?.company || {},
        deliveryTime: Number(shippingSelection?.shipping?.deliveryTime || 0),
        price: shippingAmount,
      },
      customer: {
        name: String(payer.name || "").trim(),
        email: String(payer.email || "").trim(),
        phone: String(payer.phone || "").trim(),
        cpf: String(payer.cpf || "").replace(/\D/g, "").slice(0, 11),
      },
      customerAddress: {
        postalCode: String(address.postalCode || ""),
        street: String(address.street || ""),
        number: String(address.number || ""),
        complement: String(address.complement || ""),
        district: String(address.district || ""),
        city: String(address.city || ""),
        state: String(address.state || ""),
      },
    },
  };
}

async function openDirectCheckoutPro() {
  if (state.checkoutInProgress) return;
  window.location.href = buildShippingPageUrl();
}

function handleSearchInput() {
  const raw = String(elements.searchInput.value || "").trim();
  const normalized = normalizeText(raw);

  if (state.searchDebounce) {
    clearTimeout(state.searchDebounce);
  }

  state.searchDebounce = setTimeout(() => {
    if (normalized.length < MIN_SEARCH_CHARS) {
      state.searchLastResults = [];
      hideSearchDropdown();
      return;
    }

    const results = searchProducts(state.allProducts, raw);
    state.searchLastResults = results;
    renderSearchDropdown(results, raw);
    logSearch(raw, results.length);
  }, 120);
}

function wireEvents() {
  [elements.buyNowBtn, elements.stickyBuyBtn].forEach((link) => {
    if (!link) return;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openDirectCheckoutPro();
    });
  });

  elements.openSidebarBtn.addEventListener("click", openSidebar);
  elements.closeSidebarBtn.addEventListener("click", closeSidebar);
  elements.sidebarEl.addEventListener("click", (event) => {
    if (event.target === elements.sidebarEl) closeSidebar();
  });

  elements.imageThumbs.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-image]");
    if (!btn) return;
    const image = btn.getAttribute("data-image") || "";
    const images = getEffectiveImages();
    const index = images.findIndex((item) => safeImageUrl(item) === safeImageUrl(image));
    if (index < 0) return;
    state.activeImage = images[index];
    updateThumbActiveState();
    scrollToImage(index, "smooth");
    pauseInactiveVideos();
  });

  elements.productTrack.addEventListener("scroll", () => {
    if (state.trackSyncRaf) return;
    state.trackSyncRaf = requestAnimationFrame(() => {
      state.trackSyncRaf = null;
      syncActiveImageFromTrack();
    });
  }, { passive: true });

  elements.variationList.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-variation-id]");
    if (!btn) return;
    const nextVariationId = String(btn.getAttribute("data-variation-id") || "").trim();
    const variations = Array.isArray(state.product?.variations) ? state.product.variations : [];
    if (nextVariationId && !variations.some((variation) => variation.id === nextVariationId)) {
      return;
    }
    state.activeVariationId = nextVariationId === state.activeVariationId ? "" : nextVariationId;
    state.activeImage = "";
    renderProductInfo();
    renderPricing();
  });

  elements.descToggle.addEventListener("click", () => {
    const isExpanded = elements.productDescription.classList.contains("expanded");
    if (isExpanded) {
      elements.productDescription.classList.remove("expanded");
      elements.productDescription.classList.add("collapsed");
      elements.descToggle.textContent = "Ver descricao completa";
      return;
    }

    elements.productDescription.classList.remove("collapsed");
    elements.productDescription.classList.add("expanded");
    elements.descToggle.textContent = "Recolher descricao";
  });

  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.searchInput.addEventListener("focus", () => {
    if (normalizeText(elements.searchInput.value).length >= MIN_SEARCH_CHARS) {
      const results = searchProducts(state.allProducts, elements.searchInput.value);
      state.searchLastResults = results;
      renderSearchDropdown(results, elements.searchInput.value);
    }
  });

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (normalizeText(elements.searchInput.value).length < MIN_SEARCH_CHARS) return;

    event.preventDefault();
    const term = String(elements.searchInput.value || "").trim();
    const topResult = state.searchLastResults[0]?.product;
    if (topResult) {
      window.location.href = `produto.html?id=${encodeURIComponent(topResult.id)}&cupom=CLIENTE30`;
      return;
    }

    window.location.href = `index.html?q=${encodeURIComponent(term)}`;
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".head-search")) {
      hideSearchDropdown();
    }
  });

  window.addEventListener("resize", () => {
    const images = getEffectiveImages();
    if (!images.length) return;
    const index = getActiveImageIndex(images);
    scrollToImage(index, "auto");
  });
}

async function init() {
  parseParams();
  renderSidebar();
  wireEvents();
  await loadProduct();
  renderProductInfo();
  renderPricing();
}

init();




/**
 * Otimiza URLs do Cloudinary adicionando f_auto (formato automático) 
 * e q_auto (qualidade automática) para melhor performance em dispositivos móveis.
 */
function optimizeMediaUrl(url) {
  const safeUrl = safeImageUrl(url);
  if (!safeUrl || !safeUrl.includes("res.cloudinary.com")) {
    return safeUrl;
  }
  if (safeUrl.includes("/upload/f_auto,q_auto/")) {
    return safeUrl;
  }
  if (!safeUrl.includes("/upload/")) {
    return safeUrl;
  }
  return safeUrl.replace("/upload/", "/upload/f_auto,q_auto/");
}

