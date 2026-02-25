const carouselEl = document.getElementById("carouselList");
const benefitEl = document.getElementById("benefitText");
const featuredEl = document.getElementById("featuredProduct");
const gridEl = document.getElementById("productGrid");
const sidebarEl = document.getElementById("categorySidebar");
const sidebarListEl = document.getElementById("sidebarCategoryList");
const openSidebarBtn = document.getElementById("openSidebarBtn");
const closeSidebarBtn = document.getElementById("closeSidebarBtn");
const categoryShortcuts = document.getElementById("categoryShortcuts");
const searchInput = document.getElementById("searchInput");
const searchDropdown = document.getElementById("searchDropdown");

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const CATEGORIES = ["Fones de ouvido", "Carregadores", "Eletronicos", "Casa", "Carro"];
const MIN_SEARCH_CHARS = 3;
const SEARCH_LIMIT = 6;
const BLANK_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const state = {
  selectedCategory: "",
  searchQuery: "",
  content: null,
  products: [],
  loggedSearchTerms: new Set(),
  searchDebounce: null,
};

const fallbackContent = {
  benefitText: "Frete Rapido e garantia de 3 anos",
  featuredProductId: "",
  carousel: [],
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
    return product.images.map((img) => String(img || "").trim().replace(/\\/g, "/")).filter(Boolean);
  }
  const legacy = String(product?.image || "").trim();
  return legacy ? [legacy.replace(/\\/g, "/")] : [];
}

function isVideoUrl(url) {
  const cleanUrl = String(url || "").trim().toLowerCase();
  if (!cleanUrl) return false;
  if (cleanUrl.startsWith("data:video/")) return true;
  if (cleanUrl.includes("/video/upload/")) return true;
  return /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/.test(cleanUrl);
}

function getFirstImageThumb(mediaList) {
  if (!Array.isArray(mediaList)) return "";
  for (const item of mediaList) {
    const safeUrl = String(item || "").trim();
    if (safeUrl && !isVideoUrl(safeUrl)) return safeUrl;
  }
  return "";
}

function normalizeProductForSearch(product) {
  const images = resolveProductImages(product);
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
    images,
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

function parseInitialState() {
  const params = new URLSearchParams(window.location.search);
  const category = String(params.get("category") || "").trim();
  const q = String(params.get("q") || "").trim();

  if (CATEGORIES.includes(category)) {
    state.selectedCategory = category;
  }

  if (normalizeText(q).length >= MIN_SEARCH_CHARS) {
    state.searchQuery = q;
  }
}

async function loadData() {
  const [contentRes, productsRes] = await Promise.all([
    fetch("/api/site-content"),
    fetch("/api/products"),
  ]);

  const content = contentRes.ok ? await contentRes.json() : fallbackContent;
  const products = productsRes.ok ? await productsRes.json() : [];

  state.content = {
    ...fallbackContent,
    ...(content || {}),
    carousel: Array.isArray(content?.carousel) ? content.carousel : [],
  };
  state.products = Array.isArray(products) ? products : [];
}

function openSidebar() {
  sidebarEl.classList.add("open");
  sidebarEl.setAttribute("aria-hidden", "false");
}

function closeSidebar() {
  sidebarEl.classList.remove("open");
  sidebarEl.setAttribute("aria-hidden", "true");
}

function buildSidebar() {
  sidebarListEl.innerHTML = CATEGORIES.map((category) => `
    <button type="button" class="sidebar-link" data-category="${category}">${category}</button>
  `).join("");
}

function updateCategoryUI() {
  categoryShortcuts.querySelectorAll(".shortcut").forEach((el) => {
    const active = el.dataset.category === state.selectedCategory;
    el.classList.toggle("active", active);
  });

  sidebarListEl.querySelectorAll(".sidebar-link").forEach((el) => {
    const active = el.dataset.category === state.selectedCategory;
    el.classList.toggle("active", active);
  });
}

function filterByCategory(products) {
  if (!state.selectedCategory) return products;
  return products.filter((p) => {
    if (Array.isArray(p.categories) && p.categories.includes(state.selectedCategory)) return true;
    return p.category === state.selectedCategory;
  });
}

function getBestSellers(source) {
  if (!source.length) return [];
  const content = state.content || fallbackContent;
  const featured = source.find((product) => product.id === content.featuredProductId);
  const others = source.filter((product) => product.id !== content.featuredProductId);
  return [featured, ...others].filter(Boolean).slice(0, 6);
}

function slideHtml(slide, index) {
  const classes = index % 2 === 0 ? "slide slide-main" : "slide slide-alt";
  const bgImage = slide.image
    ? `style="background-image:linear-gradient(130deg, rgba(7,20,54,0.75), rgba(15,77,243,0.58)), url('${slide.image.replace(/'/g, "%27")}')"`
    : "";

  const highlight = slide.highlight
    ? `${slide.title || ""} <span>${slide.highlight}</span>`
    : slide.title || "Produto em destaque";

  return `
    <article class="${classes}" ${bgImage}>
      <p class="slide-kicker">${slide.kicker || "DESTAQUE"}</p>
      <h2>${highlight}</h2>
      <p>${slide.description || "Oferta exclusiva para cliente fiel."}</p>
      <a class="btn ${index % 2 ? "btn-light" : ""}" href="${slide.buttonLink || "produto.html?cupom=CLIENTE30"}">${slide.buttonText || "Ver produto"}</a>
    </article>
  `;
}

function buildFeaturedShowcase(product) {
  const images = resolveProductImages(product).filter((item) => !isVideoUrl(item));
  if (!images.length) {
    return '<div class="thumb tracker-thumb" aria-hidden="true"></div>';
  }

  const list = images.slice(0, 5);
  while (list.length < 5) {
    list.push(list[list.length - 1] || list[0]);
  }

  return `
    <div class="featured-image-stage" aria-hidden="true">
      <div class="featured-shot far-left"><img src="${escapeHtml(list[3])}" alt="" loading="lazy" /></div>
      <div class="featured-shot near-left"><img src="${escapeHtml(list[1])}" alt="" loading="lazy" /></div>
      <div class="featured-shot main"><img src="${escapeHtml(list[0])}" alt="${escapeHtml(product.title)}" loading="lazy" /></div>
      <div class="featured-shot near-right"><img src="${escapeHtml(list[2])}" alt="" loading="lazy" /></div>
      <div class="featured-shot far-right"><img src="${escapeHtml(list[4])}" alt="" loading="lazy" /></div>
    </div>
  `;
}

function productCardHtml(product, featured = false) {
  const medias = resolveProductImages(product);
  const firstImage = getFirstImageThumb(medias);
  const firstMedia = medias[0] || "";
  const img = (firstImage || firstMedia)
    ? (featured
      ? buildFeaturedShowcase(product)
      : (firstImage
        ? `<img class="product-image" src="${escapeHtml(firstImage)}" alt="${escapeHtml(product.title)}" loading="lazy" />`
        : `<video class="product-image product-video" src="${escapeHtml(firstMedia)}" aria-label="${escapeHtml(product.title)}" muted playsinline preload="metadata"></video>`))
    : '<div class="thumb tracker-thumb" aria-hidden="true"></div>';

  const cardClass = featured ? "product-card featured" : "product-card";
  const productUrl = `produto.html?id=${encodeURIComponent(product.id)}&cupom=CLIENTE30`;
  const priceToShow = Number(product.promoPrice || product.price || 0);
  const oldPrice = product.promoPrice ? `<small class="price-old">de ${currency.format(product.price || 0)}</small>` : "";
  const bullets = Array.isArray(product.bullets) ? product.bullets.slice(0, 3) : [];
  const featuredBullets = bullets.length
    ? `<ul class="home-bullets">${bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "";

  return `
    <article class="${cardClass}">
      <a class="product-card-anchor" href="${productUrl}" aria-label="Abrir produto ${escapeHtml(product.title)}">
        ${img}
        <h3>${escapeHtml(product.title)}</h3>
        ${featured ? featuredBullets : ""}
        <p class="price">${currency.format(priceToShow)} ${oldPrice}<small>no PIX com cupom</small></p>
        <span class="btn">Ver produto</span>
      </a>
    </article>
  `;
}

function updateUrlState() {
  const params = new URLSearchParams();
  if (state.selectedCategory) params.set("category", state.selectedCategory);
  if (normalizeText(state.searchQuery).length >= MIN_SEARCH_CHARS) params.set("q", state.searchQuery.trim());
  const next = params.toString();
  const url = next ? `?${next}` : window.location.pathname;
  window.history.replaceState({}, "", url);
}

function renderSearchDropdown(results, query) {
  if (normalizeText(query).length < MIN_SEARCH_CHARS) {
    searchDropdown.hidden = true;
    searchDropdown.innerHTML = "";
    return;
  }

  if (!results.length) {
    searchDropdown.innerHTML = `<div class="search-empty">Nenhum resultado para "${escapeHtml(query)}"</div>`;
    searchDropdown.hidden = false;
    return;
  }

  searchDropdown.innerHTML = results.slice(0, SEARCH_LIMIT).map((entry) => {
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

  searchDropdown.hidden = false;
}

function hideSearchDropdown() {
  searchDropdown.hidden = true;
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
      page: "home",
      at: new Date().toISOString(),
    }),
  }).catch(() => {
    // logging is best-effort
  });
}

function render() {
  const content = state.content || fallbackContent;
  benefitEl.textContent = content.benefitText || fallbackContent.benefitText;

  if (content.carousel.length) {
    carouselEl.innerHTML = content.carousel.map(slideHtml).join("");
  } else {
    carouselEl.innerHTML = '<p class="empty-note">Nenhum card de carrossel configurado ainda.</p>';
  }

  const byCategory = filterByCategory(state.products);
  const searchTerm = state.searchQuery.trim();
  const hasSearch = normalizeText(searchTerm).length >= MIN_SEARCH_CHARS;

  let list = byCategory;
  if (hasSearch) {
    list = searchProducts(byCategory, searchTerm).map((item) => item.product);
  }

  if (!list.length) {
    if (hasSearch) {
      featuredEl.innerHTML = `
        <div class="not-found-panel">
          <p>Nao encontramos '<strong>${escapeHtml(searchTerm)}</strong>', mas voce pode gostar destes itens mais vendidos...</p>
        </div>
      `;
      const bestSellers = getBestSellers(state.products);
      gridEl.innerHTML = bestSellers.map((product) => productCardHtml(product, false)).join("");
    } else {
      featuredEl.innerHTML = '<p class="empty-note">Nenhum produto nesta categoria.</p>';
      gridEl.innerHTML = "";
    }
    updateCategoryUI();
    return;
  }

  const featuredInFilter = list.find((p) => p.id === content.featuredProductId) || list[0];
  featuredEl.innerHTML = productCardHtml(featuredInFilter, true);

  const others = list.filter((p) => p.id !== featuredInFilter.id);
  gridEl.innerHTML = others.map((p) => productCardHtml(p, false)).join("");

  updateCategoryUI();
}

function setCategory(category) {
  state.selectedCategory = state.selectedCategory === category ? "" : category;
  updateUrlState();
  render();
}

function handleSearchInput() {
  const raw = String(searchInput.value || "").trim();
  const normalized = normalizeText(raw);

  if (state.searchDebounce) {
    clearTimeout(state.searchDebounce);
  }

  state.searchDebounce = setTimeout(() => {
    if (normalized.length < MIN_SEARCH_CHARS) {
      state.searchQuery = "";
      hideSearchDropdown();
      updateUrlState();
      render();
      return;
    }

    state.searchQuery = raw;
    const dropdownResults = searchProducts(state.products, raw);
    renderSearchDropdown(dropdownResults, raw);
    logSearch(raw, dropdownResults.length);
    updateUrlState();
    render();
  }, 120);
}

function wireEvents() {
  openSidebarBtn.addEventListener("click", openSidebar);
  closeSidebarBtn.addEventListener("click", closeSidebar);

  sidebarEl.addEventListener("click", (event) => {
    if (event.target === sidebarEl) closeSidebar();
  });

  categoryShortcuts.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-category]");
    if (!btn) return;
    setCategory(btn.dataset.category);
  });

  sidebarListEl.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-category]");
    if (!btn) return;
    setCategory(btn.dataset.category);
    closeSidebar();
  });

  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("focus", () => {
    if (normalizeText(searchInput.value).length >= MIN_SEARCH_CHARS) {
      const results = searchProducts(state.products, searchInput.value);
      renderSearchDropdown(results, searchInput.value);
    }
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    if (normalizeText(searchInput.value).length < MIN_SEARCH_CHARS) return;
    event.preventDefault();
    state.searchQuery = String(searchInput.value || "").trim();
    updateUrlState();
    render();
    hideSearchDropdown();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".head-search")) {
      hideSearchDropdown();
    }
  });
}

(async function init() {
  parseInitialState();
  buildSidebar();
  wireEvents();

  try {
    await loadData();
    if (state.searchQuery) {
      searchInput.value = state.searchQuery;
      const initialResults = searchProducts(state.products, state.searchQuery);
      logSearch(state.searchQuery, initialResults.length);
    }
    render();
  } catch {
    carouselEl.innerHTML = '<p class="empty-note">Falha ao carregar conteudo.</p>';
  }
})();
