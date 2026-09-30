import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./db.js";
import { StoreService, problem } from "./store.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createServer({ database = openDatabase(), publicDir = path.join(ROOT, "public") } = {}) {
  const store = new StoreService(database);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const cartId = cookie(req, "cart_id");
      if (req.method === "GET" && url.pathname === "/api/health") return json(res, 200, { status: "ok", database: "sqlite" });
      if (req.method === "GET" && url.pathname === "/api/products") return json(res, 200, store.listProducts({ q: url.searchParams.get("q") || "", category: url.searchParams.get("category") || "" }));
      if (req.method === "GET" && url.pathname.startsWith("/api/products/")) return json(res, 200, store.getProduct(url.pathname.split("/").pop()));
      if (req.method === "GET" && url.pathname === "/api/cart") {
        const cart = store.getCart(cartId);
        setCartCookie(res, cart.id);
        return json(res, 200, cart);
      }
      if (req.method === "POST" && url.pathname === "/api/cart/items") {
        const body = await readJson(req);
        const id = store.ensureCart(cartId);
        setCartCookie(res, id);
        return json(res, 201, store.addItem(id, body.productId, body.quantity));
      }
      const itemMatch = url.pathname.match(/^\/api\/cart\/items\/(\d+)$/);
      if (itemMatch && req.method === "PATCH") return json(res, 200, store.updateItem(cartId, itemMatch[1], (await readJson(req)).quantity));
      if (itemMatch && req.method === "DELETE") return json(res, 200, store.removeItem(cartId, itemMatch[1]));
      if (req.method === "POST" && url.pathname === "/api/orders") return json(res, 201, store.createOrder(cartId, await readJson(req)));
      if (req.method === "GET" && url.pathname.startsWith("/api/orders/")) return json(res, 200, store.getOrder(url.pathname.split("/").pop()));
      if (req.method === "GET" && url.pathname === "/api/admin/summary") return json(res, 200, store.adminSummary());
      if (req.method === "PUT" && url.pathname === "/api/admin/settings/low-stock") return json(res, 200, store.setLowStockThreshold((await readJson(req)).threshold));
      if (req.method === "GET" && url.pathname === "/admin") return file(res, path.join(publicDir, "admin.html"));
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) return file(res, path.join(publicDir, "index.html"));
      if (req.method === "GET" && url.pathname.startsWith("/assets/")) return file(res, path.join(publicDir, url.pathname));
      throw problem(404, "页面或接口不存在");
    } catch (error) {
      json(res, error.status || 500, { error: error.message || "服务器错误" });
    }
  });
  server.on("close", () => database.close());
  return server;
}

function json(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100_000) throw problem(413, "请求内容过大");
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw problem(400, "JSON 格式错误"); }
}

function cookie(req, name) {
  const found = (req.headers.cookie || "").split(";").map((x) => x.trim()).find((x) => x.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : "";
}

function setCartCookie(res, value) {
  res.setHeader("Set-Cookie", `cart_id=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
}

function file(res, filename) {
  const normalized = path.normalize(filename);
  if (!normalized.startsWith(path.join(ROOT, "public"))) throw problem(403, "禁止访问");
  if (!fs.existsSync(normalized) || !fs.statSync(normalized).isFile()) throw problem(404, "文件不存在");
  const ext = path.extname(normalized);
  const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(normalized).pipe(res);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 9100);
  createServer().listen(port, "127.0.0.1", () => console.log(`Open Store running at http://localhost:${port}`));
}
