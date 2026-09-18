import mongoose from "mongoose";

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn("⚠️  MONGODB_URI not found in environment. Using local JSON storage fallback.");
    return false;
  }

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`✅ MongoDB Atlas Connected Successfully: ${conn.connection.host} [Database: ${conn.connection.name}]`);
    return true;
  } catch (err) {
    console.error(`❌ MongoDB Atlas Connection Error: ${err.message}`);
    console.warn("⚠️  Operating with local JSON fallback to ensure uptime.");
    return false;
  }
};

export const isConnected = () => mongoose.connection.readyState === 1;

export default connectDB;
