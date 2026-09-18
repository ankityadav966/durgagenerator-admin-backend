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

// Helper to destroy from Cloudinary trying multiple candidate IDs
const destroyCloudinaryAsset = async (rawId) => {
  if (!rawId || typeof rawId !== "string") return { success: false, message: "Invalid publicId" };

  let id = rawId.trim();
  // If it's a full Cloudinary URL, extract publicId
  if (id.startsWith("http://") || id.startsWith("https://")) {
    const parts = id.split("/upload/");
    if (parts.length > 1) {
      let pathAfterUpload = parts[1].replace(/^v\d+\//, "");
      id = pathAfterUpload.replace(/\.[^/.]+$/, "");
    }
  }

  const idWithoutExt = id.replace(/\.[^/.]+$/, "");

  const candidates = [
    id,
    idWithoutExt,
    id.startsWith(CLOUDINARY_FOLDER + "/") ? id : `${CLOUDINARY_FOLDER}/${id}`,
    idWithoutExt.startsWith(CLOUDINARY_FOLDER + "/") ? idWithoutExt : `${CLOUDINARY_FOLDER}/${idWithoutExt}`,
    id.replace(new RegExp(`^${CLOUDINARY_FOLDER}/`), ""),
  ];

  const uniqueCandidates = [...new Set(candidates.filter(Boolean))];

  for (const candidate of uniqueCandidates) {
    try {
      const res = await cloudinary.uploader.destroy(candidate, {
        resource_type: "image",
        invalidate: true,
      });
      if (res.result === "ok") {
        return { success: true, result: "ok", publicId: candidate };
      }
    } catch (e) {
      console.warn(`Destroy attempt failed for candidate ${candidate}:`, e.message);
    }
  }

  // If Cloudinary returned not found, the asset is already non-existent
  return { success: true, result: "not found", message: "Asset removed from Cloudinary" };
};

const handleDeleteRequest = async (req, res) => {
  try {
    const rawId = req.params.publicId || req.query.publicId || req.body?.publicId;
    if (!rawId) {
      return res.status(400).json({ success: false, message: "Public ID is required" });
    }

    const decodedId = decodeURIComponent(rawId);
    const result = await destroyCloudinaryAsset(decodedId);

    return res.json({
      success: true,
      message: "Image deleted from Cloudinary successfully",
      details: result,
    });
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
    return res.status(500).json({
      success: false,
      message: `Cloudinary delete failed: ${err.message}`,
    });
  }
};

// Support DELETE by query/body (/api/upload) AND by URL param (/api/upload/:publicId)
router.delete("/", verifyToken, handleDeleteRequest);
router.delete("/:publicId(*)", verifyToken, handleDeleteRequest);

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
