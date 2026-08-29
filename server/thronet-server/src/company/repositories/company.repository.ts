import { Company } from '../models';
import { ICompanyDocument, CreateCompanyDTO, UpdateCompanyDTO, CompanyFilterQuery } from '../interfaces';
import { FilterQuery, SortOrder } from 'mongoose';

class CompanyRepository {
    async findByObjectId(objectId: string) {
        return Company.findById(objectId).lean();
    }

    async findByUUID(uuid: string) {
        return Company.findOne({ companyId: uuid, 'audit.isDeleted': false }).lean();
    }

    async findBySlug(slug: string) {
        return Company.findOne({ slug, 'audit.isDeleted': false }).lean();
    }

    async create(data: any): Promise<any> {
        const company = new Company(data);
        return company.save();
    }

    async updateByObjectId(objectId: string, data: any) {
        const updateFields: any = { updatedAt: new Date() };
        if (data.companyName) updateFields.companyName = data.companyName;
        if (data.companySlug) updateFields.companySlug = data.companySlug.toLowerCase().trim();
        if (data.slug && !updateFields.companySlug) updateFields.companySlug = data.slug.toLowerCase().trim();
        if (data.descriptions?.tagline !== undefined) updateFields['descriptions.tagline'] = data.descriptions.tagline;
        if (data.descriptions?.short !== undefined) updateFields['descriptions.short'] = data.descriptions.short;
        if (data.descriptions?.detailed !== undefined) updateFields['descriptions.detailed'] = data.descriptions.detailed;
        if (data.tagline !== undefined && !updateFields['descriptions.tagline']) updateFields['descriptions.tagline'] = data.tagline;
        if (data.description !== undefined && !updateFields['descriptions.short']) updateFields['descriptions.short'] = data.description;
        if (data.industry) updateFields.industry = data.industry;
        if (data.companySize) updateFields.companySize = data.companySize;
        if (data.size && !updateFields.companySize) updateFields.companySize = data.size;
        if (data.website !== undefined) updateFields.website = data.website;
        if (data.foundedYear !== undefined) updateFields.foundedYear = data.foundedYear;
        if (data.founded !== undefined && !updateFields.foundedYear) updateFields.foundedYear = Number(data.founded);
        if (data.socialMedia) updateFields.socialMedia = data.socialMedia;
        if (data.updatedBy) updateFields['audit.updatedBy'] = data.updatedBy;

        for (const key of Object.keys(data)) {
            if (!['companyName', 'companySlug', 'slug', 'descriptions', 'tagline', 'description', 'industry', 'companySize', 'size', 'website', 'foundedYear', 'founded', 'socialMedia', 'updatedBy'].includes(key)) {
                updateFields[key] = data[key];
            }
        }

        return Company.findByIdAndUpdate(
            objectId,
            { $set: updateFields },
            { new: true, runValidators: false }
        ).lean();
    }

    async deleteByObjectId(objectId: string) {
        return Company.findByIdAndUpdate(
            objectId,
            { 'audit.isDeleted': true, 'audit.deletedAt': new Date() },
            { new: true }
        ).lean();
    }

    async softDeleteByObjectId(objectId: string) {
        return Company.findByIdAndUpdate(
            objectId,
            { status: 'Inactive', updatedAt: new Date() },
            { new: true }
        ).lean();
    }

    async verifyByObjectId(objectId: string) {
        return Company.findByIdAndUpdate(
            objectId,
            { isVerified: true, updatedAt: new Date() },
            { new: true }
        ).lean();
    }

    async updateSocialLinksByObjectId(objectId: string, socialLinks: any) {
        return Company.findByIdAndUpdate(
            objectId,
            { socialLinks, updatedAt: new Date() },
            { new: true }
        ).lean();
    }

    async countByObjectId(objectId: string) {
        return Company.countDocuments({ _id: objectId });
    }

    async findWithFilters(filter: FilterQuery<ICompanyDocument>, sortOptions: any, skip: number, pageSize: number) {
        return Promise.all([
            Company.find(filter).sort(sortOptions).skip(skip).limit(pageSize).lean(),
            Company.countDocuments(filter),
        ]);
    }

    async searchByText(searchTerm: string, skip: number, limit: number) {
        return Promise.all([
            Company.searchByText(searchTerm).skip(skip).limit(limit).lean(),
            Company.countDocuments({ $text: { $search: searchTerm }, status: 'Active' }),
        ]);
    }

    async findPopular(limit: number) {
        return Company.find({ status: 'Active' })
            .sort({ 'stats.followersCount': -1 })
            .limit(limit)
            .lean();
    }

    async findNearby(longitude: number, latitude: number, maxDistance: number) {
        return Company.findNearby(longitude, latitude, maxDistance).lean();
    }
}

export default new CompanyRepository();