import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  user: { type: String },
  rating: { type: Number },
  comment: { type: String, default: '' },
  date: { type: Date, default: Date.now }
}, { _id: false });

const appSchema = new mongoose.Schema({
  _id: { type: String },
  name: { type: String, required: true },
  developer: { type: String, required: true },
  category: { type: String, required: true },
  subcategory: { type: String, default: '' },
  description: { type: String, required: true },
  icon: { type: String, default: '' },
  banner: { type: String, default: '' },
  screenshots: { type: [String], default: [] },
  websiteLink: { type: String, default: '' },
  apkLink: { type: String, default: '' },
  version: { type: String, default: '1.0.0' },
  featured: { type: Boolean, default: false },
  rating: { type: Number, default: 0 },
  reviews: { type: [reviewSchema], default: [] },
  installs: { type: Number, default: 0 },
  usage: { type: Object, default: {} }
}, { timestamps: true });

appSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    ret.featured = Boolean(ret.featured);
    ret.rating = Number(ret.rating);
    ret.installs = Number(ret.installs);
    return ret;
  }
});

export default mongoose.model('App', appSchema);
