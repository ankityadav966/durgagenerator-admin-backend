import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcryptjs";
import Admin from "../models/Admin.js";
import Content from "../models/Content.js";
import { isConnected } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "../data");

export const autoMigrateData = async () => {
  if (!isConnected()) {
    return;
  }

  try {
    // 1. Check and migrate Admin
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const adminFile = path.join(DATA_DIR, "admin.json");
      let adminData = {
        username: "admin",
        passwordHash: bcrypt.hashSync("admin123", 10),
        name: "Durga Admin",
        email: "vinayvssaini45254525@gmail.com",
      };

      if (fs.existsSync(adminFile)) {
        try {
          const raw = fs.readFileSync(adminFile, "utf8");
          const parsed = JSON.parse(raw);
          if (parsed.username && parsed.passwordHash) {
            adminData = parsed;
          }
        } catch (e) {
          console.warn("Could not parse admin.json, using default:", e.message);
        }
      }

      await Admin.create(adminData);
      console.log(`📦 Migrated Admin credentials into MongoDB Atlas collection 'admins'.`);
    }

    // 2. Check and migrate Content
    const contentDoc = await Content.findOne({ key: "site_content" });
    if (!contentDoc) {
      const contentFile = path.join(DATA_DIR, "content.json");
      if (fs.existsSync(contentFile)) {
        try {
          const raw = fs.readFileSync(contentFile, "utf8");
          const parsed = JSON.parse(raw);

          await Content.create({
            key: "site_content",
            ...parsed,
          });
          console.log(`📦 Migrated full website content into MongoDB Atlas collection 'contents'.`);
        } catch (e) {
          console.warn("Could not migrate content.json into MongoDB:", e.message);
        }
      }
    }
  } catch (err) {
    console.error("Migration check error:", err.message);
  }
};
