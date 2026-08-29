import { Schema } from 'mongoose';

export const ShowcasePageSchema = new Schema(
  {
    company: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      required: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
    },
    theme: {
      primaryColor: { type: String, default: '#0066cc' },
      secondaryColor: { type: String, default: '#f0f0f0' },
      fontFamily: { type: String, default: 'Inter' },
    },
    sections: [
      {
        id: String,
        type: {
          type: String,
          enum: [
            'Hero',
            'About',
            'Team',
            'Products',
            'Stats',
            'Testimonials',
            'CTA',
          ],
        },
        title: String,
        content: String,
        order: Number,
        isVisible: { type: Boolean, default: true },
        customData: Schema.Types.Mixed,
      },
    ],
    hero: {
      title: String,
      subtitle: String,
      backgroundImage: String,
      callToAction: {
        text: String,
        link: String,
      },
    },
    stats: [
      {
        label: String,
        value: String,
        icon: String,
      },
    ],
    testimonials: [
      {
        quote: String,
        author: String,
        designation: String,
        company: String,
        image: String,
      },
    ],
    socialLinks: {
      linkedin: String,
      twitter: String,
      facebook: String,
      instagram: String,
    },
    seo: {
      metaTitle: String,
      metaDescription: String,
      keywords: [String],
      ogImage: String,
    },
    analytics: {
      viewsCount: { type: Number, default: 0 },
      lastVisited: Date,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
  },
  {
    timestamps: true,
    collection: 'showcase_pages',
  }
);

// Indexes
ShowcasePageSchema.index({ company: 1 });
ShowcasePageSchema.index({ isPublished: 1, publishedAt: -1 });

export default ShowcasePageSchema;