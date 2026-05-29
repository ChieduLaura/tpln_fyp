"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
// Fallback to direct loopback IP if env string uses 'localhost' or is missing
let connectionString = process.env.DATABASE_URL;
if (!connectionString || connectionString.includes("localhost")) {
    connectionString = "postgresql://tpln_user:tpln_password123@127.0.0.1:5432/tpln_db";
}
console.log("DATABASE_URL is explicitly set to:", connectionString);
const pool = new pg_1.Pool({
    connectionString,
    options: "-c search_path=tpln,public"
});
exports.default = pool;
