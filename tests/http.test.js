import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../src/server.js";
import { openDatabase } from "../src/db.js";

test("健康检查和商品 API 返回预期 Schema", async () => {
  const server = createServer({ database: openDatabase(":memory:") });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${base}/api/health`).then((r) => r.json());
  const products = await fetch(`${base}/api/products?category=数码`).then((r) => r.json());
  assert.deepEqual(health, { status: "ok", database: "sqlite" });
  assert.ok(products.length >= 4);
  assert.ok(products.every((p) => p.category === "数码"));
  await new Promise((resolve) => server.close(resolve));
});

test("API 对无效数量返回 400 和可理解错误", async () => {
  const server = createServer({ database: openDatabase(":memory:") });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/cart/items`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productId: "p01", quantity: -1 }) });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.match(body.error, /大于 0/);
  await new Promise((resolve) => server.close(resolve));
});
