import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { JWT_SECRET, verifyToken } from "../middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_FILE = path.join(__dirname, "../data/admin.json");

const router = express.Router();

// Helper to get or create admin credentials
const getAdminData = () => {
  if (!fs.existsSync(ADMIN_FILE)) {
    const defaultAdmin = {
      username: "admin",
      // default password: admin123
      passwordHash: bcrypt.hashSync("admin123", 10),
      name: "Durga Admin",
      email: "vinayvssaini45254525@gmail.com"
    };
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(defaultAdmin, null, 2), "utf8");
    return defaultAdmin;
  }
  const raw = fs.readFileSync(ADMIN_FILE, "utf8");
  return JSON.parse(raw);
};

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    const admin = getAdminData();
    if (username !== admin.username) {
      return res.status(401).json({ success: false, message: "Invalid username or password" });
    }

    const isMatch = bcrypt.compareSync(password, admin.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid username or password" });
    }

    const token = jwt.sign(
      { username: admin.username, name: admin.name },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        username: admin.username,
        name: admin.name,
        email: admin.email
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ success: false, message: "Server error during login" });
  }
});

// GET /api/auth/me (verify current token)
router.get("/me", verifyToken, (req, res) => {
  const admin = getAdminData();
  return res.json({
    success: true,
    user: {
      username: admin.username,
      name: admin.name,
      email: admin.email
    }
  });
});

// PUT /api/auth/change-password
router.put("/change-password", verifyToken, (req, res) => {
  try {
    const { currentPassword, newPassword, newUsername } = req.body;
    const admin = getAdminData();

    if (!bcrypt.compareSync(currentPassword, admin.passwordHash)) {
      return res.status(400).json({ success: false, message: "Incorrect current password" });
    }

    if (newPassword && newPassword.length < 5) {
      return res.status(400).json({ success: false, message: "New password must be at least 5 characters" });
    }

    if (newPassword) {
      admin.passwordHash = bcrypt.hashSync(newPassword, 10);
    }
    if (newUsername) {
      admin.username = newUsername;
    }

    fs.writeFileSync(ADMIN_FILE, JSON.stringify(admin, null, 2), "utf8");

    return res.json({ success: true, message: "Admin credentials updated successfully" });
  } catch (err) {
    console.error("Password change error:", err);
    return res.status(500).json({ success: false, message: "Failed to update password" });
  }
});

export default router;
