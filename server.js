import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import contentRoutes from "./routes/content.js";
import uploadRoutes from "./routes/upload.js";
import connectDB, { isConnected } from "./config/db.js";
import { autoMigrateData } from "./config/migrate.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure directories exist
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Middlewares
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Static directory for assets
const assetsDir = path.join(__dirname, "assets");
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
app.use("/assets", express.static(assetsDir));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/upload", uploadRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Durga Generator Rent API",
    database: isConnected() ? "MongoDB Atlas Connected" : "Local Storage Fallback",
    databaseName: "durgagenerator",
    time: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal server error"
  });
});

// Start Server and Connect Database
const startServer = async () => {
  const dbConnected = await connectDB();
  if (dbConnected) {
    await autoMigrateData();
  }

  app.listen(PORT, () => {
    console.log(`===========================================`);
    console.log(`⚡ Durga Generator Rent Backend is Running`);
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🍃 Database: ${isConnected() ? "MongoDB Atlas (durgagenerator)" : "Local JSON Fallback"}`);
    console.log(`☁️ Media Storage: Cloudinary (${process.env.CLOUDINARY_CLOUD_NAME || "dswm5fwef"} - durga-generators)`);
    console.log(`===========================================`);
  });
};

startServer();
