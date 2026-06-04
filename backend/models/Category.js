import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  icon: { type: String, default: 'folder' },
  subcategories: { type: [String], default: [] }
}, { timestamps: true });

categorySchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    return ret;
  }
});

export default mongoose.model('Category', categorySchema);
