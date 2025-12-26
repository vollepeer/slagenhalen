export const config = {
  port: Number(process.env.PORT || 3001),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || "filip",
    password: process.env.DB_PASSWORD || "filip",
    database: process.env.DB_NAME || "filip_card"
  },
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173"
};
