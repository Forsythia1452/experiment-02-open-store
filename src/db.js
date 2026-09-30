import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const seedProducts = [
  ["p01", "雾蓝机械键盘", "数码", 39900, 12, "青轴 / 热插拔", "⌨️"],
  ["p02", "轻量无线鼠标", "数码", 18900, 2, "黑色 / 55g", "🖱️"],
  ["p03", "桌面氛围灯", "家居", 12900, 0, "暖白 / USB-C", "💡"],
  ["p04", "旅行保温杯", "生活", 9900, 1, "500ml / 墨绿", "🥤"],
  ["p05", "城市通勤双肩包", "生活", 26900, 8, "18L / 防泼水", "🎒"],
  ["p06", "降噪头戴耳机", "数码", 59900, 5, "40h 续航", "🎧"],
  ["p07", "人体工学坐垫", "家居", 15900, 14, "记忆棉", "🪑"],
  ["p08", "便携手冲咖啡套装", "生活", 21900, 3, "滤杯 / 分享壶", "☕"],
  ["p09", "极简桌面收纳架", "家居", 13900, 20, "双层 / 胡桃木色", "🗄️"],
  ["p10", "超长标题测试商品：适合宿舍与工作室的多功能可折叠阅读支架", "数码", 7900, 6, "铝合金 / 多角度", "📐"]
];

export function openDatabase(filename = path.resolve("data/store.db")) {
  if (filename !== ":memory:") fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
      price INTEGER NOT NULL CHECK(price >= 0), stock INTEGER NOT NULL CHECK(stock >= 0),
      variant TEXT NOT NULL, emoji TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS carts (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0),
      UNIQUE(cart_id, product_id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
      total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'created', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL, product_name TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  seed(db);
  return db;
}

export function seed(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO products
    (id,name,category,price,stock,variant,emoji) VALUES (?,?,?,?,?,?,?)`);
  for (const product of seedProducts) insert.run(...product);
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('low_stock_threshold','3')").run();
}

export function resetDemo(db) {
  db.exec("BEGIN; DELETE FROM order_items; DELETE FROM orders; DELETE FROM cart_items; DELETE FROM carts; DELETE FROM products; DELETE FROM settings; COMMIT;");
  seed(db);
}
