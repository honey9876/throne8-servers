import { v4 as uuidv4 } from 'uuid';
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
        const { createdBy, _id, createdAt, updatedAt, identityId, company, companyUUID: _, ...updateData } = data || {};
        return CompanyIdentity.findOneAndUpdate(
            { company: new mongoose.Types.ObjectId(companyObjectId) },
            {
                $set: {
                    ...updateData,
                    company: new mongoose.Types.ObjectId(companyObjectId),
                    companyUUID,
                    updatedBy: userId || 'system',
                },
                $setOnInsert: {
                    identityId: uuidv4(),
                    createdBy: userId || 'system',
                },
            },
            { new: true, upsert: true, setDefaultsOnInsert: false }
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
        const { createdBy, _id, createdAt, updatedAt, ...cleanData } = data || {};
        const doc = new CompanyTimeline({
            ...cleanData,
            company: new mongoose.Types.ObjectId(companyObjectId),
            companyUUID,
            createdBy: userId || 'system',
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
        const { createdBy, _id, createdAt, updatedAt, ...updateData } = data || {};
        return CompanyTimeline.findOneAndUpdate(
            { timelineId, company: new mongoose.Types.ObjectId(companyObjectId) },
            { $set: { ...updateData, updatedBy: userId || 'system' } },
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
        const { createdBy, _id, createdAt, updatedAt, ...cleanData } = data || {};
        const publishedAt = cleanData.isPublished ? new Date() : undefined;
        const doc = new CompanyUpdate({
            ...cleanData,
            company: new mongoose.Types.ObjectId(companyObjectId),
            companyUUID,
            createdBy: userId || 'system',
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
        const { createdBy, _id, createdAt, updatedAt, ...updateData } = data || {};
        const extra: any = { updatedBy: userId || 'system' };
        if (updateData.isPublished === true) extra.publishedAt = new Date();
        return CompanyUpdate.findOneAndUpdate(
            { updateId, company: new mongoose.Types.ObjectId(companyObjectId) },
            { $set: { ...updateData, ...extra } },
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
        const { createdBy, _id, createdAt, updatedAt, ...cleanData } = data || {};
        const doc = new CompanyTestimonial({
            ...cleanData,
            company: new mongoose.Types.ObjectId(companyObjectId),
            companyUUID,
            createdBy: userId || 'system',
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
        const { createdBy, _id, createdAt, updatedAt, ...updateData } = data || {};
        return CompanyTestimonial.findOneAndUpdate(
            { testimonialId, company: new mongoose.Types.ObjectId(companyObjectId) },
            { $set: { ...updateData, updatedBy: userId || 'system' } },
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
        const { createdBy, _id, createdAt, updatedAt, productId, company, companyUUID: _, ...updateData } = data || {};
        return CompanyProduct.findOneAndUpdate(
            { company: new mongoose.Types.ObjectId(companyObjectId) },
            {
                $set: {
                    ...updateData,
                    company: new mongoose.Types.ObjectId(companyObjectId),
                    companyUUID,
                    updatedBy: userId || 'system',
                },
                $setOnInsert: {
                    productId: uuidv4(),
                    createdBy: userId || 'system',
                },
            },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: false }
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
        const { createdBy, _id, createdAt, updatedAt, lifeId, company, companyUUID: _, ...updateData } = data || {};
        return CompanyLife.findOneAndUpdate(
            { company: new mongoose.Types.ObjectId(companyObjectId) },
            {
                $set: {
                    ...updateData,
                    company: new mongoose.Types.ObjectId(companyObjectId),
                    companyUUID,
                    updatedBy: userId || 'system',
                },
                $setOnInsert: {
                    lifeId: uuidv4(),
                    createdBy: userId || 'system',
                },
            },
            { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: false }
        ).lean();
    }

    async getLife(companyObjectId: string) {
        return CompanyLife.findOne({ company: new mongoose.Types.ObjectId(companyObjectId) }).lean();
    }
}

export default new CompanyAboutRepository();