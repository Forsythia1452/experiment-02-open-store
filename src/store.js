import crypto from "node:crypto";

export class StoreService {
  constructor(db) {
    this.db = db;
  }

  listProducts({ q = "", category = "" } = {}) {
    const threshold = this.getLowStockThreshold();
    const rows = this.db.prepare(`
      SELECT * FROM products
      WHERE active=1 AND (?='' OR name LIKE '%' || ? || '%' OR variant LIKE '%' || ? || '%')
        AND (?='' OR category=?)
      ORDER BY id
    `).all(q, q, q, category, category);
    return rows.map((p) => ({ ...p, lowStock: p.stock > 0 && p.stock <= threshold, soldOut: p.stock === 0 }));
  }

  getProduct(id) {
    const product = this.db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(id);
    if (!product) throw problem(404, "商品不存在或已下架");
    const threshold = this.getLowStockThreshold();
    return { ...product, lowStock: product.stock > 0 && product.stock <= threshold, soldOut: product.stock === 0 };
  }

  ensureCart(cartId) {
    const id = cartId || `cart_${crypto.randomUUID()}`;
    this.db.prepare("INSERT OR IGNORE INTO carts(id) VALUES(?)").run(id);
    return id;
  }

  getCart(cartId) {
    const id = this.ensureCart(cartId);
    const items = this.db.prepare(`
      SELECT ci.id, ci.product_id AS productId, ci.quantity, p.name, p.price, p.stock, p.emoji,
             ci.quantity * p.price AS subtotal
      FROM cart_items ci JOIN products p ON p.id=ci.product_id
      WHERE ci.cart_id=? ORDER BY ci.id
    `).all(id);
    return { id, items, count: items.reduce((n, x) => n + x.quantity, 0), total: items.reduce((n, x) => n + x.subtotal, 0) };
  }

  addItem(cartId, productId, quantity) {
    quantity = integerQuantity(quantity);
    const id = this.ensureCart(cartId);
    const product = this.getProduct(productId);
    if (product.stock === 0) throw problem(409, "该商品已售罄");
    const existing = this.db.prepare("SELECT quantity FROM cart_items WHERE cart_id=? AND product_id=?").get(id, productId);
    const next = (existing?.quantity || 0) + quantity;
    if (next > product.stock) throw problem(409, `库存不足，当前最多可购买 ${product.stock} 件`);
    this.db.prepare(`INSERT INTO cart_items(cart_id,product_id,quantity) VALUES(?,?,?)
      ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=excluded.quantity`).run(id, productId, next);
    return this.getCart(id);
  }

  updateItem(cartId, itemId, quantity) {
    quantity = integerQuantity(quantity);
    const item = this.db.prepare(`SELECT ci.*, p.stock FROM cart_items ci JOIN products p ON p.id=ci.product_id
      WHERE ci.id=? AND ci.cart_id=?`).get(Number(itemId), cartId);
    if (!item) throw problem(404, "购物车项目不存在");
    if (quantity > item.stock) throw problem(409, `库存不足，当前最多可购买 ${item.stock} 件`);
    this.db.prepare("UPDATE cart_items SET quantity=? WHERE id=?").run(quantity, item.id);
    return this.getCart(cartId);
  }

  removeItem(cartId, itemId) {
    const result = this.db.prepare("DELETE FROM cart_items WHERE id=? AND cart_id=?").run(Number(itemId), cartId);
    if (!result.changes) throw problem(404, "购物车项目不存在或已删除");
    return this.getCart(cartId);
  }

  createOrder(cartId, data) {
    const requestId = String(data.requestId || "").trim();
    if (!requestId) throw problem(400, "缺少 requestId，无法保护重复提交");
    const duplicate = this.db.prepare("SELECT * FROM orders WHERE request_id=?").get(requestId);
    if (duplicate) return { ...duplicate, duplicate: true, items: this.orderItems(duplicate.id) };
    const customerName = String(data.customerName || "").trim();
    const phone = String(data.phone || "").trim();
    const address = String(data.address || "").trim();
    if (customerName.length < 2 || !/^1\d{10}$/.test(phone) || address.length < 8) {
      throw problem(400, "请填写有效姓名、11 位手机号和不少于 8 个字的地址");
    }
    const cart = this.getCart(cartId);
    if (!cart.items.length) throw problem(400, "购物车为空，不能创建订单");
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const item of cart.items) {
        const current = this.db.prepare("SELECT stock, active FROM products WHERE id=?").get(item.productId);
        if (!current?.active) throw problem(409, `${item.name} 已下架`);
        if (current.stock < item.quantity) throw problem(409, `${item.name} 库存不足，仅剩 ${current.stock} 件`);
      }
      this.db.prepare(`INSERT INTO orders(id,cart_id,request_id,customer_name,phone,address,total)
        VALUES(?,?,?,?,?,?,?)`).run(orderId, cartId, requestId, customerName, phone, address, cart.total);
      const insertItem = this.db.prepare(`INSERT INTO order_items(order_id,product_id,product_name,price,quantity)
        VALUES(?,?,?,?,?)`);
      const deduct = this.db.prepare("UPDATE products SET stock=stock-? WHERE id=? AND stock>=?");
      for (const item of cart.items) {
        const changed = deduct.run(item.quantity, item.productId, item.quantity);
        if (changed.changes !== 1) throw problem(409, `${item.name} 库存刚刚发生变化，请重试`);
        insertItem.run(orderId, item.productId, item.name, item.price, item.quantity);
      }
      this.db.prepare("DELETE FROM cart_items WHERE cart_id=?").run(cartId);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { ...this.db.prepare("SELECT * FROM orders WHERE id=?").get(orderId), duplicate: false, items: this.orderItems(orderId) };
  }

  orderItems(orderId) {
    return this.db.prepare("SELECT product_id AS productId, product_name AS name, price, quantity FROM order_items WHERE order_id=?").all(orderId);
  }

  getOrder(id) {
    const order = this.db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!order) throw problem(404, "订单不存在");
    return { ...order, items: this.orderItems(id) };
  }

  adminSummary() {
    return {
      threshold: this.getLowStockThreshold(),
      products: this.listProducts(),
      orders: this.db.prepare("SELECT id,customer_name,total,status,created_at FROM orders ORDER BY created_at DESC").all()
    };
  }

  getLowStockThreshold() {
    return Number(this.db.prepare("SELECT value FROM settings WHERE key='low_stock_threshold'").get()?.value || 3);
  }

  setLowStockThreshold(value) {
    const threshold = Number(value);
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 20) throw problem(400, "低库存阈值必须是 1 到 20 的整数");
    this.db.prepare("INSERT INTO settings(key,value) VALUES('low_stock_threshold',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(threshold));
    return { threshold };
  }
}

function integerQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1) throw problem(400, "数量必须是大于 0 的整数");
  return quantity;
}

export function problem(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}
