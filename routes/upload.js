import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { verifyToken } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.join(__dirname, "../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e4)}`;
    cb(null, `${cleanName}_${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|svg|gif/;
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;
  if (allowed.test(ext) && (mime.startsWith("image/") || mime === "image/svg+xml")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files (JPG, PNG, WebP, SVG, GIF) are allowed!"));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter
});

const router = express.Router();

// POST /api/upload - Upload single image (requires auth)
router.post("/", verifyToken, upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    const host = req.get("host");
    const protocol = req.protocol;
    // URL relative or absolute
    const relativeUrl = `/uploads/${req.file.filename}`;
    const fullUrl = `${protocol}://${host}${relativeUrl}`;

    return res.json({
      success: true,
      message: "Image uploaded successfully",
      filename: req.file.filename,
      url: fullUrl,
      relativeUrl: relativeUrl
    });
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({ success: false, message: err.message || "Failed to upload image" });
  }
});

// GET /api/upload/gallery - List all uploaded images
router.get("/gallery", verifyToken, (req, res) => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    const host = req.get("host");
    const protocol = req.protocol;

    const images = files.map((filename) => {
      const stat = fs.statSync(path.join(UPLOADS_DIR, filename));
      return {
        filename,
        url: `${protocol}://${host}/uploads/${filename}`,
        relativeUrl: `/uploads/${filename}`,
        createdAt: stat.birthtime
      };
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.json({ success: true, images });
  } catch (err) {
    console.error("Gallery error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch uploads gallery" });
  }
});

export default router;
