import mongoose from "mongoose";

const contentSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "site_content",
    },
    siteSettings: { type: mongoose.Schema.Types.Mixed, default: {} },
    hero: { type: mongoose.Schema.Types.Mixed, default: {} },
    generators: { type: Array, default: [] },
    features: { type: Array, default: [] },
    testimonials: { type: Array, default: [] },
    about: { type: mongoose.Schema.Types.Mixed, default: {} },
    howItWorks: { type: mongoose.Schema.Types.Mixed, default: {} },
    faqs: { type: Array, default: [] },
  },
  {
    timestamps: true,
    strict: false,
  }
);

const Content = mongoose.models.Content || mongoose.model("Content", contentSchema);

export default Content;
