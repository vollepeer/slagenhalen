import mysql from "mysql2/promise";
import { config } from "./config.js";

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  connectionLimit: 10
});

export async function query<T>(sql: string, params: Array<unknown> = []) {
  const [rows] = await pool.query(sql, params);
  return rows as T;
}

export async function exec(sql: string, params: Array<unknown> = []) {
  const [result] = await pool.execute(sql, params);
  return result as mysql.ResultSetHeader;
}
