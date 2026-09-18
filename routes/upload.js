import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { verifyToken } from "../middleware/auth.js";
import { Readable } from "stream";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Load .env in case this module is initialized before server.js dotenv call (ESM hoisting)
dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "durga-generators";

// Use memory storage — file never touches disk, goes straight to Cloudinary
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|svg|gif/;
  const ext = file.originalname.split(".").pop().toLowerCase();
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
  fileFilter,
});

const router = express.Router();

// Helper: upload buffer to Cloudinary
const uploadToCloudinary = (buffer, mimetype, originalname) => {
  return new Promise((resolve, reject) => {
    const cleanName = originalname
      .replace(/\.[^/.]+$/, "") // remove extension
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 60);

    const uniqueName = `${cleanName}_${Date.now()}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        public_id: uniqueName,
        resource_type: "image",
        overwrite: false,
        quality: "auto:best",
        fetch_format: "auto",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    // Convert buffer to readable stream and pipe to Cloudinary
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

// POST /api/upload — Upload single image (requires auth)
router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    try {
      // Try Cloudinary first
      const result = await uploadToCloudinary(
        req.file.buffer,
        req.file.mimetype,
        req.file.originalname
      );

      return res.json({
        success: true,
        message: "Image uploaded successfully",
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
        format: result.format,
      });
    } catch (cloudErr) {
      console.warn("Cloudinary upload failed, falling back to local server storage:", cloudErr.message);
      const ext = req.file.originalname.split(".").pop().toLowerCase() || "png";
      const cleanBase = req.file.originalname
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 40);
      const filename = `${cleanBase}_${Date.now()}.${ext}`;
      const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), req.file.buffer);

      return res.json({
        success: true,
        message: "Image saved locally",
        url: `/uploads/${filename}`,
        publicId: `local_${filename}`,
      });
    }
  } catch (err) {
    console.error("Upload error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to upload image",
    });
  }
});

// DELETE /api/upload/:publicId — Delete image from Cloudinary (requires auth)
// publicId must be URL-encoded since it contains slashes (folder/filename)
router.delete("/:publicId(*)", verifyToken, async (req, res) => {
  try {
    const publicId = req.params.publicId;
    if (!publicId) {
      return res.status(400).json({ success: false, message: "Public ID is required" });
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "image",
    });

    if (result.result === "ok") {
      return res.json({ success: true, message: "Image deleted from Cloudinary successfully" });
    } else if (result.result === "not found") {
      return res.status(404).json({ success: false, message: "Image not found on Cloudinary" });
    } else {
      return res.status(500).json({ success: false, message: "Failed to delete image", result });
    }
  } catch (err) {
    console.error("Cloudinary delete error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Failed to delete image from Cloudinary",
    });
  }
});

// GET /api/upload/gallery — List uploaded images from Cloudinary folder (requires auth)
router.get("/gallery", verifyToken, async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression(`folder:${CLOUDINARY_FOLDER}`)
      .sort_by("created_at", "desc")
      .max_results(100)
      .execute();

    const images = (result.resources || []).map((asset) => ({
      publicId: asset.public_id,
      url: asset.secure_url,
      width: asset.width,
      height: asset.height,
      format: asset.format,
      createdAt: asset.created_at,
    }));

    return res.json({ success: true, images, total: result.total_count || images.length });
  } catch (err) {
    console.error("Cloudinary gallery error:", err);
    // Fallback: return empty gallery instead of crashing
    return res.json({ success: true, images: [], total: 0 });
  }
});

// GET /api/upload/status — Check Cloudinary configuration status
router.get("/status", verifyToken, async (req, res) => {
  try {
    const config = cloudinary.config();
    if (!config.cloud_name || !config.api_key || !config.api_secret) {
      return res.json({
        success: false,
        configured: false,
        message: "Cloudinary environment variables are missing",
      });
    }
    // Test connection
    await cloudinary.api.ping();
    return res.json({
      success: true,
      configured: true,
      cloud_name: config.cloud_name,
      folder: CLOUDINARY_FOLDER,
      message: "Cloudinary is configured and connected",
    });
  } catch (err) {
    return res.json({
      success: false,
      configured: true,
      message: `Cloudinary connection error: ${err.message}`,
    });
  }
});

export default router;
