import mongoose, { Schema, Document, Model } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { LoggerUtil } from '@/shared/logger.util';

export interface ICompanyLogo extends Document {
    logoId: string;
    companyId: string;        // UUID (company ka companyId)
    cloudinaryPublicId: string;
    cloudinaryUrl: string;
    cloudinarySecureUrl: string;
    cloudinaryFolder: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    width: number;
    height: number;
    format: string;
    isActive: boolean;
    status: 'active' | 'archived' | 'deleted';
    isDeleted: boolean;
    deletedAt?: Date;
    uploadedBy: string;       // userId jo upload kar raha hai
    uploadedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICompanyLogoModel extends Model<ICompanyLogo> {
    findByCompanyId(companyId: string): Promise<ICompanyLogo[]>;
    findActiveLogo(companyId: string): Promise<ICompanyLogo | null>;
    getCompanyLogoCount(companyId: string): Promise<number>;
    setActiveLogo(logoId: string, companyId: string): Promise<ICompanyLogo>;
    findByLogoId(logoId: string, companyId: string): Promise<ICompanyLogo | null>;
    deleteLogo(logoId: string, companyId: string): Promise<ICompanyLogo | null>;  
}

const CompanyLogoSchema = new Schema<ICompanyLogo, ICompanyLogoModel>(
    {
        logoId: {
            type: String,
            required: true,
            unique: true,
            default: () => uuidv4(),
            immutable: true,
        },
        companyId: {
            type: String,
            required: [true, 'Company ID is required'],
        },
        cloudinaryPublicId: {
            type: String,
            required: true,
        },
        cloudinaryUrl: {
            type: String,
            required: true,
        },
        cloudinarySecureUrl: {
            type: String,
            required: true,
        },
        cloudinaryFolder: {
            type: String,
            default: 'company-logos',
        },
        originalName: {
            type: String,
            required: true,
        },
        mimeType: {
            type: String,
            required: true,
            enum: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
        },
        fileSize: {
            type: Number,
            required: true,
            min: 0,
            max: 10485760,   // 10MB
        },
        width: {
            type: Number,
            required: true,
            min: 100,
            max: 5000,
        },
        height: {
            type: Number,
            required: true,
            min: 100,
            max: 5000,
        },
        format: {
            type: String,
            required: true,
            enum: ['jpg', 'jpeg', 'png', 'webp'],
        },
        isActive: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: ['active', 'archived', 'deleted'],
            default: 'active',
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
        uploadedBy: {
            type: String,
            required: true,
        },
        uploadedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        collection: 'company_logos',
        toJSON: {
            virtuals: true,
            transform: (_doc, ret) => {
                delete (ret as any).__v;
                return ret;
            },
        },
    }
);

// Indexes
CompanyLogoSchema.index({ companyId: 1, isActive: 1 });
CompanyLogoSchema.index({ companyId: 1, isDeleted: 1 });
CompanyLogoSchema.index({ cloudinaryPublicId: 1 });
CompanyLogoSchema.index({ createdAt: -1 });

// Pre-save middleware
CompanyLogoSchema.pre('save', function (next) {
    if (this.isDeleted) {
        this.status = 'deleted';
        this.isActive = false;
    } else {
        this.status = 'active';
    }
    next();
});

// Static methods
CompanyLogoSchema.statics.findByCompanyId = async function (companyId: string): Promise<ICompanyLogo[]> {
    return this.find({ companyId, isDeleted: false }).sort({ createdAt: -1 }).exec();
};

CompanyLogoSchema.statics.findActiveLogo = async function (companyId: string): Promise<ICompanyLogo | null> {
    return this.findOne({ companyId, isActive: true, isDeleted: false }).exec();
};

CompanyLogoSchema.statics.getCompanyLogoCount = async function (companyId: string): Promise<number> {
    return this.countDocuments({ companyId, isDeleted: false });
};

CompanyLogoSchema.statics.setActiveLogo = async function (logoId: string, companyId: string): Promise<ICompanyLogo> {
    // Pehle sab deactivate karo
    await this.updateMany({ companyId }, { $set: { isActive: false } });

    // Phir selected ko activate karo
    const logo = await this.findOneAndUpdate(
        { logoId, companyId, isDeleted: false },
        { $set: { isActive: true } },
        { new: true }
    );

    if (!logo) throw new Error('Logo not found');
    return logo;
};

// Existing statics ke neeche add karo

CompanyLogoSchema.statics.findByLogoId = async function (logoId: string, companyId: string): Promise<ICompanyLogo | null> {
    return this.findOne({ logoId, companyId, isDeleted: false }).exec();
};

CompanyLogoSchema.statics.deleteLogo = async function (logoId: string, companyId: string): Promise<ICompanyLogo | null> {
    return this.findOneAndUpdate(
        { logoId, companyId, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: new Date(), isActive: false, status: 'deleted' } },
        { new: true }
    );
};

const CompanyLogo = mongoose.model<ICompanyLogo, ICompanyLogoModel>('CompanyLogo', CompanyLogoSchema);
export default CompanyLogo;