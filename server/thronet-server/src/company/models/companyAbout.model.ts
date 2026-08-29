import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ==================== ENUMS ====================
export enum UpdateCategory {
    NEWS = 'News',
    PRESS = 'Press',
    PRODUCT = 'Product',
    MILESTONE = 'Milestone',
    ANNOUNCEMENT = 'Announcement',
}

export enum TimelineType {
    FOUNDING = 'Founding',
    PRODUCT_LAUNCH = 'Product Launch',
    FUNDING = 'Funding',
    EXPANSION = 'Expansion',
    AWARD = 'Award',
    MILESTONE = 'Milestone',
    PARTNERSHIP = 'Partnership',
    OTHER = 'Other',
}

export enum TestimonialSource {
    EMPLOYEE = 'Employee',
    USER = 'User',
    CLIENT = 'Client',
    PARTNER = 'Partner',
}

export enum GalleryType {
    OFFICE = 'Office',
    EVENT = 'Event',
    TEAM = 'Team',
    PRODUCT = 'Product',
    OTHER = 'Other',
}

// ==================== FEATURE 1: IDENTITY (Story, Mission, Vision etc.) ====================
export interface ICompanyIdentity extends Document {
    identityId: string;
    company: mongoose.Types.ObjectId;
    companyUUID: string;
    story?: string;
    mission?: string;
    vision?: string;
    promises?: string[];
    impacts?: { title: string; metric: string; description?: string }[];
    createdBy: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ImpactSchema = new Schema({
    title: { type: String, required: true, trim: true, maxlength: 100 },
    metric: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 300 },
}, { _id: false });

const CompanyIdentitySchema = new Schema<ICompanyIdentity>({
    identityId: { type: String, default: uuidv4, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
    companyUUID: { type: String, required: true },
    story: { type: String, trim: true, maxlength: 5000 },
    mission: { type: String, trim: true, maxlength: 1000 },
    vision: { type: String, trim: true, maxlength: 1000 },
    promises: [{ type: String, trim: true, maxlength: 500 }],
    impacts: { type: [ImpactSchema], default: [] },
    createdBy: { type: String, default: 'system' },
    updatedBy: { type: String },
}, { timestamps: true, collection: 'company_identities', versionKey: false });

// ==================== FEATURE 2: TIMELINE ====================
export interface ICompanyTimeline extends Document {
    timelineId: string;
    company: mongoose.Types.ObjectId;
    companyUUID: string;
    year: number;
    month?: number;
    title: string;
    description?: string;
    type: TimelineType;
    icon?: string;
    isPublished: boolean;
    createdBy: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CompanyTimelineSchema = new Schema<ICompanyTimeline>({
    timelineId: { type: String, default: uuidv4, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    companyUUID: { type: String, required: true },
    year: { type: Number, required: true, min: 1800, max: new Date().getFullYear() + 1 },
    month: { type: Number, min: 1, max: 12 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    type: { type: String, enum: Object.values(TimelineType), default: TimelineType.MILESTONE },
    icon: { type: String, trim: true, maxlength: 100 },
    isPublished: { type: Boolean, default: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
}, { timestamps: true, collection: 'company_timelines', versionKey: false });

CompanyTimelineSchema.index({ company: 1, year: -1, month: -1 });

// ==================== FEATURE 3: UPDATES / NEWS ====================
export interface ICompanyUpdate extends Document {
    updateId: string;
    company: mongoose.Types.ObjectId;
    companyUUID: string;
    title: string;
    content: string;
    summary?: string;
    category: UpdateCategory;
    coverImage?: string;
    tags?: string[];
    isPublished: boolean;
    publishedAt?: Date;
    externalLink?: string;
    createdBy: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CompanyUpdateSchema = new Schema<ICompanyUpdate>({
    updateId: { type: String, default: uuidv4, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    companyUUID: { type: String, required: true },
    title: { type: String, required: true, trim: true, minlength: 5, maxlength: 200 },
    content: { type: String, required: true, trim: true, minlength: 10, maxlength: 10000 },
    summary: { type: String, trim: true, maxlength: 500 },
    category: { type: String, enum: Object.values(UpdateCategory), default: UpdateCategory.ANNOUNCEMENT },
    coverImage: { type: String, trim: true },
    tags: [{ type: String, lowercase: true, trim: true, maxlength: 50 }],
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
    externalLink: { type: String, trim: true },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
}, { timestamps: true, collection: 'company_updates', versionKey: false });

CompanyUpdateSchema.index({ company: 1, isPublished: 1, publishedAt: -1 });
CompanyUpdateSchema.index({ company: 1, category: 1 });

// ==================== FEATURE 4: TESTIMONIALS (What users say) ====================
export interface ICompanyTestimonial extends Document {
    testimonialId: string;
    company: mongoose.Types.ObjectId;
    companyUUID: string;
    authorName: string;
    authorTitle?: string;
    authorCompany?: string;
    authorAvatar?: string;
    message: string;
    rating?: number;
    source: TestimonialSource;
    isPublished: boolean;
    isFeatured: boolean;
    createdBy: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CompanyTestimonialSchema = new Schema<ICompanyTestimonial>({
    testimonialId: { type: String, default: uuidv4, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    companyUUID: { type: String, required: true },
    authorName: { type: String, required: true, trim: true, maxlength: 100 },
    authorTitle: { type: String, trim: true, maxlength: 100 },
    authorCompany: { type: String, trim: true, maxlength: 100 },
    authorAvatar: { type: String, trim: true },
    message: { type: String, required: true, trim: true, minlength: 10, maxlength: 1000 },
    rating: { type: Number, min: 1, max: 5 },
    source: { type: String, enum: Object.values(TestimonialSource), default: TestimonialSource.USER },
    isPublished: { type: Boolean, default: false },
    isFeatured: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
}, { timestamps: true, collection: 'company_testimonials', versionKey: false });

// ==================== FEATURE 5: PRODUCT INFO ====================
export interface IProductFeature {
    title: string;
    description?: string;
    icon?: string;
    category: 'core' | 'key' | 'design' | 'analytics';
}

export interface ICompanyProduct extends Document {
    productId: string;
    company: mongoose.Types.ObjectId;
    companyUUID: string;
    name: string;
    tagline?: string;
    description?: string;
    features: IProductFeature[];
    screenshots?: string[];
    demoLink?: string;
    isPublished: boolean;
    createdBy: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const ProductFeatureSchema = new Schema<IProductFeature>({
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    icon: { type: String, trim: true },
    category: { type: String, enum: ['core', 'key', 'design', 'analytics'], default: 'core' },
}, { _id: false });

const CompanyProductSchema = new Schema<ICompanyProduct>({
    productId: { type: String, default: uuidv4, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    companyUUID: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    tagline: { type: String, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 5000 },
    features: { type: [ProductFeatureSchema], default: [] },
    screenshots: [{ type: String, trim: true }],
    demoLink: { type: String, trim: true },
    isPublished: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
}, { timestamps: true, collection: 'company_products', versionKey: false });

// ==================== FEATURE 6: COMPANY LIFE ====================
export interface ICompanyValue {
    title: string;
    description: string;
    icon?: string;
}

export interface IPerk {
    title: string;
    description: string;
    icon?: string;
    category?: string;
}

export interface ITeamMember {
    name: string;
    designation: string;
    bio?: string;
    avatar?: string;
    linkedinUrl?: string;
    order?: number;
}

export interface IGalleryItem {
    url: string;
    caption?: string;
    type: GalleryType;
    order?: number;
}

export interface ICompanyLife extends Document {
    lifeId: string;
    company: mongoose.Types.ObjectId;
    companyUUID: string;
    values: ICompanyValue[];
    perks: IPerk[];
    teamMembers: ITeamMember[];
    gallery: IGalleryItem[];
    createdBy: string;
    updatedBy?: string;
    createdAt: Date;
    updatedAt: Date;
}

const CompanyValueSchema = new Schema<ICompanyValue>({
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    icon: { type: String, trim: true },
}, { _id: false });

const PerkSchema = new Schema<IPerk>({
    title: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 500 },
    icon: { type: String, trim: true },
    category: { type: String, trim: true, maxlength: 50 },
}, { _id: false });

const TeamMemberSchema = new Schema<ITeamMember>({
    name: { type: String, required: true, trim: true, maxlength: 100 },
    designation: { type: String, required: true, trim: true, maxlength: 100 },
    bio: { type: String, trim: true, maxlength: 500 },
    avatar: { type: String, trim: true },
    linkedinUrl: { type: String, trim: true },
    order: { type: Number, default: 0 },
}, { _id: false });

const GalleryItemSchema = new Schema<IGalleryItem>({
    url: { type: String, required: true, trim: true },
    caption: { type: String, trim: true, maxlength: 300 },
    type: { type: String, enum: Object.values(GalleryType), default: GalleryType.OTHER },
    order: { type: Number, default: 0 },
}, { _id: false });

const CompanyLifeSchema = new Schema<ICompanyLife>({
    lifeId: { type: String, default: uuidv4, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, unique: true },
    companyUUID: { type: String, required: true },
    values: { type: [CompanyValueSchema], default: [] },
    perks: { type: [PerkSchema], default: [] },
    teamMembers: { type: [TeamMemberSchema], default: [] },
    gallery: { type: [GalleryItemSchema], default: [] },
    createdBy: { type: String, required: true },
    updatedBy: { type: String },
}, { timestamps: true, collection: 'company_life', versionKey: false });

// ==================== MODEL EXPORTS ====================
export const CompanyIdentity = mongoose.model<ICompanyIdentity>('CompanyIdentity', CompanyIdentitySchema);
export const CompanyTimeline = mongoose.model<ICompanyTimeline>('CompanyTimeline', CompanyTimelineSchema);
export const CompanyUpdate = mongoose.model<ICompanyUpdate>('CompanyUpdate', CompanyUpdateSchema);
export const CompanyTestimonial = mongoose.model<ICompanyTestimonial>('CompanyTestimonial', CompanyTestimonialSchema);
export const CompanyProduct = mongoose.model<ICompanyProduct>('CompanyProduct', CompanyProductSchema);
export const CompanyLife = mongoose.model<ICompanyLife>('CompanyLife', CompanyLifeSchema);