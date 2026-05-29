import { Pool } from "pg";

// Fallback to direct loopback IP if env string uses 'localhost' or is missing
let connectionString = process.env.DATABASE_URL;

if (!connectionString || connectionString.includes("localhost")) {
  connectionString = "postgresql://tpln_user:tpln_password123@127.0.0.1:5432/tpln_db";
}

console.log("DATABASE_URL is explicitly set to:", connectionString);

const pool = new Pool({
  connectionString,
  options: "-c search_path=tpln,public"
});

export default pool;