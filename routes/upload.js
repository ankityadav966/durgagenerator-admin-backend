import express from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { verifyToken } from "../middleware/auth.js";
import { Readable } from "stream";
import dotenv from "dotenv";

dotenv.config();

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const CLOUDINARY_FOLDER = process.env.CLOUDINARY_FOLDER || "durga-generators";

// Memory storage: file goes directly to Cloudinary without touching disk
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

// Helper: upload buffer stream directly to Cloudinary
const uploadToCloudinary = (buffer, originalname) => {
  return new Promise((resolve, reject) => {
    const cleanName = originalname
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 50);

    const uniqueName = `${cleanName}_${Date.now()}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: CLOUDINARY_FOLDER,
        public_id: uniqueName,
        resource_type: "image",
        overwrite: true,
        quality: "auto:best",
        fetch_format: "auto",
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

// POST /api/upload — Upload single image directly to Cloudinary (Requires Auth)
router.post("/", verifyToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No image file provided" });
    }

    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname);

    return res.json({
      success: true,
      message: "Image uploaded successfully to Cloudinary",
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
    });
  } catch (err) {
    console.error("Cloudinary upload error:", err.message);
    return res.status(500).json({
      success: false,
      message: `Cloudinary upload failed: ${err.message}`,
    });
  }
});

// DELETE /api/upload/:publicId — Delete image directly from Cloudinary (Requires Auth)
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
      return res.status(500).json({ success: false, message: "Cloudinary delete error", result });
    }
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
    return res.status(500).json({
      success: false,
      message: `Cloudinary delete failed: ${err.message}`,
    });
  }
});

// GET /api/upload/gallery — Get all images from Cloudinary folder
router.get("/gallery", async (req, res) => {
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
    console.error("Cloudinary gallery error:", err.message);
    return res.json({ success: true, images: [], total: 0 });
  }
});

// GET /api/upload/status — Check Cloudinary connection status
router.get("/status", async (req, res) => {
  try {
    const config = cloudinary.config();
    if (!config.cloud_name || !config.api_key || !config.api_secret) {
      return res.json({
        success: false,
        configured: false,
        message: "Cloudinary environment variables are missing",
      });
    }

    await cloudinary.api.ping();
    return res.json({
      success: true,
      configured: true,
      cloudName: config.cloud_name,
      folder: CLOUDINARY_FOLDER,
      message: "Cloudinary connected successfully",
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      configured: true,
      message: `Cloudinary connection error: ${err.message}`,
    });
  }
});

export default router;
