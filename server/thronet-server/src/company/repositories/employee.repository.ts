import mongoose from 'mongoose';
import { Employee } from '../models';
import { IEmployeeDocument } from '../interfaces';

class EmployeeRepository {

    async create(data: Partial<IEmployeeDocument>, session?: mongoose.ClientSession): Promise<IEmployeeDocument> {
        const [employee] = await Employee.create([data], { session });
        return employee;
    }

    async findById(objectId: string): Promise<IEmployeeDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return null;
        return Employee.findById(objectId)
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as IEmployeeDocument;
    }

    async findByUUID(uuid: string): Promise<IEmployeeDocument | null> {
        return Employee.findOne({ employeeId: uuid })
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as IEmployeeDocument;
    }

    async findByObjectId(objectId: string): Promise<IEmployeeDocument | null> {
        return this.findById(objectId);
    }

    async findByEmail(email: string): Promise<IEmployeeDocument | null> {
        return Employee.findOne({ email: email.toLowerCase().trim() }).lean().exec() as unknown as IEmployeeDocument;
    }

    async updateByObjectId(
        objectId: string,
        data: Partial<IEmployeeDocument>
    ): Promise<IEmployeeDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return null;
        return Employee.findByIdAndUpdate(objectId, data, { new: true, runValidators: true })
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as IEmployeeDocument;
    }

    async deleteByObjectId(
        objectId: string,
        session?: mongoose.ClientSession
    ): Promise<boolean> {
        if (!mongoose.Types.ObjectId.isValid(objectId)) return false;
        const result = await Employee.findByIdAndDelete(objectId).session(session || null);
        return !!result;
    }

    async findWithFilters(
        query: Record<string, unknown>,
        sortOption: Record<string, 1 | -1>,
        skip: number,
        limit: number
    ): Promise<[IEmployeeDocument[], number]> {
        return Promise.all([
            Employee.find(query)
                .populate('company', 'companyName media')
                .sort(sortOption)
                .skip(skip)
                .limit(limit)
                .lean()
                .exec() as unknown as Promise<IEmployeeDocument[]>,
            Employee.countDocuments(query),
        ]);
    }

    async findByCompanyObjectId(
        companyObjectId: string,
        skip: number,
        limit: number
    ): Promise<[IEmployeeDocument[], number]> {
        const objectId = new mongoose.Types.ObjectId(companyObjectId); // ✅ convert karo

        return Promise.all([
            Employee.find({
                company: objectId,  // ✅ ObjectId
            })
                .populate('company', 'companyName media')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec() as unknown as Promise<IEmployeeDocument[]>,
            Employee.countDocuments({ company: objectId }),  // ✅ isActive hata, ObjectId use karo
        ]);
    }

    async searchByText(
        searchTerm: string,
        skip: number,
        limit: number
    ): Promise<[IEmployeeDocument[], number]> {
        const query = {
            isActive: true,
            $or: [
                { firstName: { $regex: searchTerm, $options: 'i' } },
                { lastName: { $regex: searchTerm, $options: 'i' } },
                { email: { $regex: searchTerm, $options: 'i' } },
                { designation: { $regex: searchTerm, $options: 'i' } },
                { department: { $regex: searchTerm, $options: 'i' } },
            ],
        };

        return Promise.all([
            Employee.find(query)
                .populate('company', 'companyName media')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean()
                .exec() as unknown as Promise<IEmployeeDocument[]>,
            Employee.countDocuments(query),
        ]);
    }

    async assignAdvocacy(
        employeeObjectId: string,
        isAdvocate: boolean,
        assignedByObjectId: string
    ): Promise<IEmployeeDocument | null> {
        if (!mongoose.Types.ObjectId.isValid(employeeObjectId)) return null;

        const updateData: Record<string, any> = { isAdvocate };

        if (isAdvocate) {
            updateData.assignedAsAdvocateAt = new Date();
            updateData.assignedAsAdvocateBy = assignedByObjectId;
            updateData.advocacyScore = 0; // fresh start
        } else {
            updateData.assignedAsAdvocateAt = null;
            updateData.assignedAsAdvocateBy = null;
        }

        return Employee.findByIdAndUpdate(
            employeeObjectId,
            updateData,
            { new: true, runValidators: true }
        )
            .populate('company', 'companyName media')
            .lean()
            .exec() as unknown as IEmployeeDocument;
    }
}

export default new EmployeeRepository();