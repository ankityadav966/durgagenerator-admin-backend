import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { verifyToken } from "../middleware/auth.js";
import Content from "../models/Content.js";
import { isConnected } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONTENT_FILE = path.join(__dirname, "../data/content.json");

const router = express.Router();

// Helper to read content from local file
const readLocalContent = () => {
  if (!fs.existsSync(CONTENT_FILE)) {
    throw new Error("Content database file missing!");
  }
  const raw = fs.readFileSync(CONTENT_FILE, "utf8");
  return JSON.parse(raw);
};

// Helper to save content to local file (as secondary backup)
const saveLocalContent = (data) => {
  try {
    fs.writeFileSync(CONTENT_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not save to local JSON backup:", err.message);
  }
};

// Unified helper to get all content (MongoDB first, JSON fallback)
const getAllContent = async () => {
  if (isConnected()) {
    try {
      const doc = await Content.findOne({ key: "site_content" }).lean();
      if (doc) {
        const { _id, __v, key, createdAt, updatedAt, ...cleanData } = doc;
        return cleanData;
      }
    } catch (err) {
      console.warn("MongoDB read error, using local fallback:", err.message);
    }
  }
  return readLocalContent();
};

// Unified helper to save full content (MongoDB first, JSON fallback)
const saveAllContent = async (data) => {
  saveLocalContent(data);
  if (isConnected()) {
    try {
      await Content.findOneAndUpdate(
        { key: "site_content" },
        { ...data, key: "site_content" },
        { upsert: true, new: true }
      );
    } catch (err) {
      console.error("MongoDB write error:", err.message);
    }
  }
};

// GET /api/content - Fetch full website content (Public)
router.get("/", async (req, res) => {
  try {
    const data = await getAllContent();
    return res.json({ success: true, data });
  } catch (err) {
    console.error("Fetch content error:", err);
    return res.status(500).json({ success: false, message: "Could not read content data" });
  }
});

// GET /api/content/:section - Fetch specific section
router.get("/:section", async (req, res) => {
  try {
    const { section } = req.params;
    const data = await getAllContent();
    if (data[section] === undefined) {
      return res.status(404).json({ success: false, message: `Section '${section}' not found` });
    }
    return res.json({ success: true, data: data[section] });
  } catch (err) {
    console.error("Fetch section error:", err);
    return res.status(500).json({ success: false, message: "Could not read section data" });
  }
});

// PUT /api/content/:section - Update a specific section (Requires Auth)
router.put("/:section", verifyToken, async (req, res) => {
  try {
    const { section } = req.params;
    const updatedData = req.body;
    const allData = await getAllContent();

    allData[section] = updatedData;
    await saveAllContent(allData);

    return res.json({
      success: true,
      message: `Section '${section}' updated successfully!`,
      data: allData[section],
    });
  } catch (err) {
    console.error("Update section error:", err);
    return res.status(500).json({ success: false, message: "Could not save section data" });
  }
});

// POST /api/content/generators/item - Add a new generator (Requires Auth)
router.post("/generators/item", verifyToken, async (req, res) => {
  try {
    const newGen = req.body;
    if (!newGen.name || !newGen.price) {
      return res.status(400).json({ success: false, message: "Generator name and price are required" });
    }

    const allData = await getAllContent();
    if (!Array.isArray(allData.generators)) {
      allData.generators = [];
    }

    const id = newGen.id || `gen-${Date.now()}`;
    const genItem = {
      ...newGen,
      id,
    };

    allData.generators.push(genItem);
    await saveAllContent(allData);

    return res.json({
      success: true,
      message: "New generator added successfully!",
      generator: genItem,
    });
  } catch (err) {
    console.error("Add generator error:", err);
    return res.status(500).json({ success: false, message: "Failed to add generator" });
  }
});

// PUT /api/content/generators/item/:id - Update specific generator by ID (Requires Auth)
router.put("/generators/item/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updatedFields = req.body;
    const allData = await getAllContent();

    const index = (allData.generators || []).findIndex((g) => g.id === id);
    if (index === -1) {
      return res.status(404).json({ success: false, message: "Generator not found" });
    }

    allData.generators[index] = {
      ...allData.generators[index],
      ...updatedFields,
      id,
    };

    await saveAllContent(allData);

    return res.json({
      success: true,
      message: "Generator updated successfully!",
      generator: allData.generators[index],
    });
  } catch (err) {
    console.error("Update generator item error:", err);
    return res.status(500).json({ success: false, message: "Failed to update generator" });
  }
});

// DELETE /api/content/generators/item/:id - Delete a generator (Requires Auth)
router.delete("/generators/item/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const allData = await getAllContent();

    const initialLen = (allData.generators || []).length;
    allData.generators = (allData.generators || []).filter((g) => g.id !== id);

    if (allData.generators.length === initialLen) {
      return res.status(404).json({ success: false, message: "Generator not found" });
    }

    await saveAllContent(allData);

    return res.json({
      success: true,
      message: "Generator removed successfully!",
      generators: allData.generators,
    });
  } catch (err) {
    console.error("Delete generator error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete generator" });
  }
});

export default router;
