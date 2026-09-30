import fs from "node:fs";
import path from "node:path";
import { openDatabase } from "../src/db.js";

const db = openDatabase();
const exportData = {
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  products: db.prepare("SELECT id,name,category,price,stock,variant,emoji,active FROM products ORDER BY id").all(),
  settings: db.prepare("SELECT key,value FROM settings ORDER BY key").all(),
  orders: db.prepare("SELECT id,total,status,created_at FROM orders ORDER BY created_at").all()
};
const output = path.resolve("backup/store-export.sanitized.json");
fs.writeFileSync(output, JSON.stringify(exportData, null, 2) + "\n", "utf8");
console.log(`Sanitized backup written: ${output}`);
db.close();
