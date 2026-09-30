import { openDatabase, resetDemo } from "../src/db.js";

const db = openDatabase();
resetDemo(db);
const count = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
console.log(`Seed complete: ${count} products, carts and orders cleared.`);
db.close();
