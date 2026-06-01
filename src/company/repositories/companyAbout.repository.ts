import mongoose from 'mongoose';
import {
    CompanyIdentity, CompanyTimeline, CompanyUpdate,
    CompanyTestimonial, CompanyProduct, CompanyLife,
    ICompanyIdentity, ICompanyTimeline, ICompanyUpdate,
    ICompanyTestimonial, ICompanyProduct, ICompanyLife,
} from '../models/companyAbout.model';

class CompanyAboutRepository {

    // ============ IDENTITY ============
    async upsertIdentity(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        return CompanyIdentity.findOneAndUpdate(
            { company: new mongoose.Types.ObjectId(companyObjectId) },
            { ...data, company: new mongoose.Types.ObjectId(companyObjectId), companyUUID, updatedBy: userId },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();
    }

    async getIdentity(companyObjectId: string) {
        return CompanyIdentity.findOne({ company: new mongoose.Types.ObjectId(companyObjectId) }).lean();
    }

    async deleteIdentity(companyObjectId: string) {
        return CompanyIdentity.findOneAndDelete({ company: new mongoose.Types.ObjectId(companyObjectId) }).lean();
    }

    // ============ TIMELINE ============
    async createTimeline(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const doc = new CompanyTimeline({
            ...data,
            company: new mongoose.Types.ObjectId(companyObjectId),
            companyUUID,
            createdBy: userId,
        });
        return doc.save();
    }

    async getTimelines(companyObjectId: string, page = 1, pageSize = 20) {
        const skip = (page - 1) * pageSize;
        const query = { company: new mongoose.Types.ObjectId(companyObjectId) };
        const [items, total] = await Promise.all([
            CompanyTimeline.find(query).sort({ year: -1, month: -1 }).skip(skip).limit(pageSize).lean(),
            CompanyTimeline.countDocuments(query),
        ]);
        return { items, total };
    }

    async updateTimeline(timelineId: string, companyObjectId: string, data: any, userId: string) {
        return CompanyTimeline.findOneAndUpdate(
            { timelineId, company: new mongoose.Types.ObjectId(companyObjectId) },
            { ...data, updatedBy: userId },
            { new: true, runValidators: true }
        ).lean();
    }

    async deleteTimeline(timelineId: string, companyObjectId: string) {
        return CompanyTimeline.findOneAndDelete({
            timelineId,
            company: new mongoose.Types.ObjectId(companyObjectId),
        }).lean();
    }

    // ============ UPDATES / NEWS ============
    async createUpdate(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const publishedAt = data.isPublished ? new Date() : undefined;
        const doc = new CompanyUpdate({
            ...data,
            company: new mongoose.Types.ObjectId(companyObjectId),
            companyUUID,
            createdBy: userId,
            publishedAt,
        });
        return doc.save();
    }

    async getUpdates(companyObjectId: string, filters: {
        page?: number; pageSize?: number; category?: string; isPublished?: boolean;
    }) {
        const { page = 1, pageSize = 20, category, isPublished } = filters;
        const skip = (page - 1) * pageSize;
        const query: any = { company: new mongoose.Types.ObjectId(companyObjectId) };
        if (category) query.category = category;
        if (typeof isPublished === 'boolean') query.isPublished = isPublished;

        const [items, total] = await Promise.all([
            CompanyUpdate.find(query).sort({ publishedAt: -1, createdAt: -1 }).skip(skip).limit(pageSize).lean(),
            CompanyUpdate.countDocuments(query),
        ]);
        return { items, total };
    }

    async getUpdateById(updateId: string, companyObjectId: string) {
        return CompanyUpdate.findOne({
            updateId,
            company: new mongoose.Types.ObjectId(companyObjectId),
        }).lean();
    }

    async updateUpdate(updateId: string, companyObjectId: string, data: any, userId: string) {
        const extra: any = { updatedBy: userId };
        if (data.isPublished === true) extra.publishedAt = new Date();
        return CompanyUpdate.findOneAndUpdate(
            { updateId, company: new mongoose.Types.ObjectId(companyObjectId) },
            { ...data, ...extra },
            { new: true, runValidators: true }
        ).lean();
    }

    async deleteUpdate(updateId: string, companyObjectId: string) {
        return CompanyUpdate.findOneAndDelete({
            updateId,
            company: new mongoose.Types.ObjectId(companyObjectId),
        }).lean();
    }

    // ============ TESTIMONIALS ============
    async createTestimonial(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        const doc = new CompanyTestimonial({
            ...data,
            company: new mongoose.Types.ObjectId(companyObjectId),
            companyUUID,
            createdBy: userId,
        });
        return doc.save();
    }

    async getTestimonials(companyObjectId: string, filters: {
        page?: number; pageSize?: number; isFeatured?: boolean; isPublished?: boolean;
    }) {
        const { page = 1, pageSize = 20, isFeatured, isPublished } = filters;
        const skip = (page - 1) * pageSize;
        const query: any = { company: new mongoose.Types.ObjectId(companyObjectId) };
        if (typeof isFeatured === 'boolean') query.isFeatured = isFeatured;
        if (typeof isPublished === 'boolean') query.isPublished = isPublished;

        const [items, total] = await Promise.all([
            CompanyTestimonial.find(query).sort({ isFeatured: -1, createdAt: -1 }).skip(skip).limit(pageSize).lean(),
            CompanyTestimonial.countDocuments(query),
        ]);
        return { items, total };
    }

    async updateTestimonial(testimonialId: string, companyObjectId: string, data: any, userId: string) {
        return CompanyTestimonial.findOneAndUpdate(
            { testimonialId, company: new mongoose.Types.ObjectId(companyObjectId) },
            { ...data, updatedBy: userId },
            { new: true, runValidators: true }
        ).lean();
    }

    async deleteTestimonial(testimonialId: string, companyObjectId: string) {
        return CompanyTestimonial.findOneAndDelete({
            testimonialId,
            company: new mongoose.Types.ObjectId(companyObjectId),
        }).lean();
    }

    // ============ PRODUCT ============
    async upsertProduct(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        return CompanyProduct.findOneAndUpdate(
            { company: new mongoose.Types.ObjectId(companyObjectId) },
            { ...data, company: new mongoose.Types.ObjectId(companyObjectId), companyUUID, updatedBy: userId },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();
    }

    async getProduct(companyObjectId: string) {
        return CompanyProduct.findOne({ company: new mongoose.Types.ObjectId(companyObjectId) }).lean();
    }

    async deleteProduct(companyObjectId: string) {
        return CompanyProduct.findOneAndDelete({ company: new mongoose.Types.ObjectId(companyObjectId) }).lean();
    }

    // ============ COMPANY LIFE ============
    async upsertLife(companyObjectId: string, companyUUID: string, data: any, userId: string) {
        return CompanyLife.findOneAndUpdate(
            { company: new mongoose.Types.ObjectId(companyObjectId) },
            { ...data, company: new mongoose.Types.ObjectId(companyObjectId), companyUUID, updatedBy: userId },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
        ).lean();
    }

    async getLife(companyObjectId: string) {
        return CompanyLife.findOne({ company: new mongoose.Types.ObjectId(companyObjectId) }).lean();
    }
}

export default new CompanyAboutRepository();