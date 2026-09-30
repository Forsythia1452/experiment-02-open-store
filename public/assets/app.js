const $ = (s) => document.querySelector(s);
const money = (n) => `¥${(n / 100).toFixed(2)}`;
let cart;

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function loadProducts() {
  const q = encodeURIComponent($("#search").value.trim());
  const category = encodeURIComponent($("#category").value);
  const products = await api(`/api/products?q=${q}&category=${category}`);
  $("#productGrid").innerHTML = products.length ? products.map(card).join("") : `<p>没有找到匹配商品，请换个关键词。</p>`;
  document.querySelectorAll("[data-add]").forEach((button) => button.addEventListener("click", () => add(button.dataset.add, button)));
}

function card(p) {
  const stock = p.soldOut ? `<span class="stock out">已售罄</span>` : p.lowStock ? `<span class="stock low">仅剩 ${p.stock} 件</span>` : `<span class="stock">库存 ${p.stock}</span>`;
  return `<article class="product-card"><div class="product-visual" aria-hidden="true">${p.emoji}</div><div class="product-body"><div class="product-meta"><span>${p.category}</span>${stock}</div><h3>${escapeHtml(p.name)}</h3><p class="variant">${escapeHtml(p.variant)}</p><div class="price-row"><span class="price">${money(p.price)}</span></div><button class="add-button" data-add="${p.id}" ${p.soldOut ? "disabled" : ""}>${p.soldOut ? "暂时缺货" : "加入购物车"}</button></div></article>`;
}

async function add(productId, button) {
  try {
    button.disabled = true;
    cart = await api("/api/cart/items", { method: "POST", body: JSON.stringify({ productId, quantity: 1 }) });
    renderCart(); showNotice("已加入购物车");
  } catch (e) { showNotice(e.message, true); } finally { button.disabled = false; }
}

async function loadCart() { cart = await api("/api/cart"); renderCart(); }

function renderCart() {
  $("#cartCount").textContent = cart.count;
  $("#cartTotal").textContent = money(cart.total);
  $("#cartItems").innerHTML = cart.items.length ? cart.items.map((item) => `<div class="cart-item"><span class="emoji">${item.emoji}</span><div><strong>${escapeHtml(item.name)}</strong><small>${money(item.price)}</small><button class="remove" data-remove="${item.id}">删除</button></div><div class="qty"><button data-qty="${item.id}" data-value="${item.quantity - 1}">−</button><span>${item.quantity}</span><button data-qty="${item.id}" data-value="${item.quantity + 1}">＋</button></div></div>`).join("") : "<p>购物车还是空的。</p>";
  document.querySelectorAll("[data-qty]").forEach((b) => b.addEventListener("click", () => b.dataset.value === "0" ? remove(b.dataset.qty) : update(b.dataset.qty, Number(b.dataset.value))));
  document.querySelectorAll("[data-remove]").forEach((b) => b.addEventListener("click", () => remove(b.dataset.remove)));
  $("#checkoutButton").disabled = !cart.items.length;
}

async function update(id, quantity) { try { cart = await api(`/api/cart/items/${id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }); renderCart(); } catch (e) { showNotice(e.message, true); } }
async function remove(id) { try { cart = await api(`/api/cart/items/${id}`, { method: "DELETE" }); renderCart(); } catch (e) { showNotice(e.message, true); } }

function openCart() { $("#cartDrawer").classList.add("open"); $("#cartDrawer").setAttribute("aria-hidden", "false"); $("#backdrop").hidden = false; }
function closeCart() { $("#cartDrawer").classList.remove("open"); $("#cartDrawer").setAttribute("aria-hidden", "true"); $("#backdrop").hidden = true; }
function showNotice(message, error = false) { const n = $("#notice"); n.hidden = false; n.textContent = message; n.style.background = error ? "#ffd8cc" : "#e2f3b7"; setTimeout(() => n.hidden = true, 3500); }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

$("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); loadProducts(); });
$("#cartButton").addEventListener("click", openCart); $("#closeCart").addEventListener("click", closeCart); $("#backdrop").addEventListener("click", closeCart);
$("#checkoutButton").addEventListener("click", () => { closeCart(); $("#checkoutDialog").showModal(); });
$("#closeCheckout").addEventListener("click", () => $("#checkoutDialog").close());
$("#closeResult").addEventListener("click", () => $("#resultDialog").close());
$("#checkoutForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const button = $("#placeOrder"); button.disabled = true;
  const form = new FormData(e.currentTarget); const payload = Object.fromEntries(form); payload.requestId = sessionStorage.lastRequestId || crypto.randomUUID(); sessionStorage.lastRequestId = payload.requestId;
  try { const order = await api("/api/orders", { method: "POST", body: JSON.stringify(payload) }); sessionStorage.removeItem("lastRequestId"); $("#checkoutDialog").close(); $("#orderMessage").textContent = `订单号 ${order.id}，金额 ${money(order.total)}。管理台已可查询。`; $("#resultDialog").showModal(); await Promise.all([loadCart(), loadProducts()]); } catch (err) { showNotice(err.message, true); } finally { button.disabled = false; }
});

await Promise.all([loadProducts(), loadCart()]);
