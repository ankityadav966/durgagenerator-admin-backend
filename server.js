import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import contentRoutes from "./routes/content.js";
import uploadRoutes from "./routes/upload.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure directories exist
const uploadsDir = path.join(__dirname, "uploads");
const dataDir = path.join(__dirname, "data");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Middlewares
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

// Static directory for uploaded images
app.use("/uploads", express.static(uploadsDir));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/upload", uploadRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "Durga Generator Rent API",
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

app.listen(PORT, () => {
  console.log(`===========================================`);
  console.log(`⚡ Durga Generator Rent Backend is Running`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`📁 Uploads served at: http://localhost:${PORT}/uploads/`);
  console.log(`===========================================`);
});
