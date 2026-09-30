import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/db.js";
import { StoreService } from "../src/store.js";

function fixture() {
  const db = openDatabase(":memory:");
  return { db, store: new StoreService(db) };
}

test("种子包含 10 个商品和三种分类", () => {
  const { db, store } = fixture();
  const products = store.listProducts();
  assert.equal(products.length, 10);
  assert.deepEqual([...new Set(products.map((p) => p.category))].sort(), ["家居", "数码", "生活"]);
  db.close();
});

test("搜索同时匹配商品名称和变体", () => {
  const { db, store } = fixture();
  assert.equal(store.listProducts({ q: "键盘" })[0].id, "p01");
  assert.equal(store.listProducts({ q: "USB-C" })[0].id, "p03");
  db.close();
});

test("低库存和售罄状态来自数据库库存", () => {
  const { db, store } = fixture();
  assert.equal(store.getProduct("p02").lowStock, true);
  assert.equal(store.getProduct("p03").soldOut, true);
  db.close();
});

test("售罄商品不能加入购物车", () => {
  const { db, store } = fixture();
  assert.throws(() => store.addItem("cart-a", "p03", 1), /售罄/);
  db.close();
});

test("购物数量必须为正整数且不能超过库存", () => {
  const { db, store } = fixture();
  assert.throws(() => store.addItem("cart-a", "p01", 0), /大于 0/);
  assert.throws(() => store.addItem("cart-a", "p04", 2), /库存不足/);
  db.close();
});

test("购物车支持加入、修改和删除", () => {
  const { db, store } = fixture();
  let cart = store.addItem("cart-a", "p01", 1);
  assert.equal(cart.count, 1);
  cart = store.updateItem("cart-a", cart.items[0].id, 2);
  assert.equal(cart.total, 79800);
  cart = store.removeItem("cart-a", cart.items[0].id);
  assert.equal(cart.items.length, 0);
  db.close();
});

test("无效收货信息不会创建订单", () => {
  const { db, store } = fixture();
  store.addItem("cart-a", "p01", 1);
  assert.throws(() => store.createOrder("cart-a", { requestId: "r1", customerName: "侯", phone: "123", address: "短" }), /有效姓名/);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 0);
  db.close();
});

test("创建订单会扣减库存并清空购物车", () => {
  const { db, store } = fixture();
  store.addItem("cart-a", "p04", 1);
  const order = store.createOrder("cart-a", { requestId: "r1", customerName: "侯宇晴", phone: "13800138000", address: "江苏省南京市软件大道2304号" });
  assert.match(order.id, /^ORD-/);
  assert.equal(order.total, 9900);
  assert.equal(store.getProduct("p04").stock, 0);
  assert.equal(store.getCart("cart-a").count, 0);
  db.close();
});

test("相同 requestId 重复提交只返回原订单", () => {
  const { db, store } = fixture();
  store.addItem("cart-a", "p02", 1);
  const data = { requestId: "same-request", customerName: "侯宇晴", phone: "13800138000", address: "江苏省南京市软件大道2304号" };
  const first = store.createOrder("cart-a", data);
  const second = store.createOrder("cart-a", data);
  assert.equal(second.id, first.id);
  assert.equal(second.duplicate, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM orders").get().n, 1);
  assert.equal(store.getProduct("p02").stock, 1);
  db.close();
});

test("低库存阈值可持久化调整并立即影响状态", () => {
  const { db, store } = fixture();
  store.setLowStockThreshold(6);
  assert.equal(store.getLowStockThreshold(), 6);
  assert.equal(store.getProduct("p06").lowStock, true);
  assert.throws(() => store.setLowStockThreshold(0), /1 到 20/);
  db.close();
});
