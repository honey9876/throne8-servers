import mongoose, { Document, Types } from 'mongoose';
import { Company } from '../models';
import logger from '@/shared/logger.util';
import pagination from '@/shared/utils/company/pagination';
import {
  CreateEmployeeDTO,
  UpdateEmployeeDTO,
  EmployeeFilterQuery,
  EmployeeResponseDTO,
  EmployeeListResponse,
} from '../interfaces';
import CacheUtil from '@/shared/cache.util';
import employeeRepository from '../repositories/employee.repository';
import companyRepository from '../repositories/company.repository';

// Define types for populated employee
interface PopulatedEmployee {
  _id: Types.ObjectId;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  company: {
    _id: string;
    name: string;
    logo?: string;
  };
  designation: string;
  department?: string;
  profileImage?: string;
  bio?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  skills?: string[];
  socialLinks?: {
    linkedin?: string;
    twitter?: string;
    github?: string;
  };
  advocacyScore?: number;
  isAdvocate?: boolean;
  assignedAsAdvocateAt?: Date;
  postsCount?: number;
  followersCount?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class EmployeeService {
  private readonly CACHE_TTL = 3600;
  private readonly CACHE_PREFIX = 'employee:';

  // =====================================================
  // CREATE EMPLOYEE
  // =====================================================
  async createEmployee(data: CreateEmployeeDTO): Promise<EmployeeResponseDTO> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      logger.info('Creating employee with transaction', { email: data.email });

      // ✅ company UUID → ObjectId resolve karo
      const company = await companyRepository.findByUUID(data.company);
      if (!company) throw new Error('Company not found');

      // ✅ email duplicate check
      const existingEmployee = await employeeRepository.findByEmail(data.email);
      if (existingEmployee) throw new Error('Employee with this email already exists');

      // ✅ Create with ObjectId
      const employee = await employeeRepository.create({
        ...data,
        company: company._id,  // UUID → ObjectId
      }, session);

      // Increment company employee count
      await Company.findByIdAndUpdate(
        company._id,
        { $inc: { 'stats.employeesCount': 1 } },
        { session }
      );

      await session.commitTransaction();
      logger.info(`✅ Employee created: ${employee._id}`);

      // Populate after commit
      const populated = await employeeRepository.findByObjectId(employee._id.toString());
      if (!populated) throw new Error('Created employee not found');

      await this.invalidateEmployeeCache(company._id.toString());

      return this.formatEmployeeResponse(populated as unknown as PopulatedEmployee);
    } catch (error: any) {
      await session.abortTransaction();
      logger.error('❌ Error creating employee (rolled back):', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // GET EMPLOYEE BY ID (ObjectId aayega middleware se)
  // =====================================================
  async getEmployeeById(objectId: string): Promise<EmployeeResponseDTO> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}${objectId}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) {
        logger.debug(`Employee cache hit: ${objectId}`);
        return cached;
      }

      const employee = await employeeRepository.findByObjectId(objectId);
      if (!employee) throw new Error('Employee not found');

      const formatted = this.formatEmployeeResponse(employee as unknown as PopulatedEmployee);
      await CacheUtil.set(cacheKey, formatted, this.CACHE_TTL);

      return formatted;
    } catch (error: any) {
      logger.error(`Error getting employee ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // LIST EMPLOYEES (WITH FILTERS)
  // =====================================================
  async listEmployees(filters: EmployeeFilterQuery): Promise<EmployeeListResponse> {
    try {
      const {
        page = 1, pageSize = 20,
        company, department, designation,
        search, isActive, sort
      } = filters;

      const cacheKey = `${this.CACHE_PREFIX}list:${JSON.stringify(filters)}`;
      const cached = await CacheUtil.get(cacheKey);
      if (cached) {
        logger.debug('Employee list cache hit');
        return cached;
      }

      const query: Record<string, any> = {};
      if (company) query.company = company;  // ObjectId string (query me aayega)
      if (department) query.department = department;
      if (designation) query.designation = designation;
      if (typeof isActive === 'boolean') query.isActive = isActive;
      if (search) {
        query.$or = [
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { designation: { $regex: search, $options: 'i' } },
        ];
      }

      let sortOption: Record<string, any> = { createdAt: -1 };
      if (sort === 'advocacy') sortOption = { advocacyScore: -1 };
      if (sort === 'name') sortOption = { firstName: 1, lastName: 1 };

      const { skip, limit } = pagination.paginate({ page, pageSize });

      const [employees, total] = await employeeRepository.findWithFilters(
        query, sortOption, skip, limit
      );

      const formatted = employees.map(emp =>
        this.formatEmployeeResponse(emp as unknown as PopulatedEmployee)
      );

      const result: EmployeeListResponse = {
        employees: formatted,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: pagination.hasMore(total, page, pageSize),
      };

      await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
      return result;
    } catch (error: any) {
      logger.error('Error listing employees:', error);
      throw error;
    }
  }

  // =====================================================
  // UPDATE EMPLOYEE (ObjectId aayega middleware se)
  // =====================================================
  async updateEmployee(objectId: string, data: UpdateEmployeeDTO): Promise<EmployeeResponseDTO> {
    try {
      const existing = await employeeRepository.findByObjectId(objectId);
      if (!existing) throw new Error('Employee not found');

      const updated = await employeeRepository.updateByObjectId(objectId, data);
      if (!updated) throw new Error('Updated employee not found');

      logger.info(`Employee updated: ${objectId}`);
      await this.invalidateEmployeeCache((existing as any).company._id?.toString() || (existing as any).company.toString(), objectId);

      return this.formatEmployeeResponse(updated as unknown as PopulatedEmployee);
    } catch (error: any) {
      logger.error(`Error updating employee ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // DELETE EMPLOYEE (ObjectId aayega middleware se)
  // =====================================================
  async deleteEmployee(objectId: string): Promise<void> {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      logger.info('Deleting employee with transaction', { employeeId: objectId });

      const employee = await employeeRepository.findByObjectId(objectId);
      if (!employee) throw new Error('Employee not found');

      const companyId = (employee as any).company._id?.toString() || (employee as any).company.toString();

      console.log('🗑️ Deleting employee, companyId:', companyId, 'objectId:', objectId);

      await employeeRepository.deleteByObjectId(objectId, session);

      await Company.findByIdAndUpdate(
        companyId,
        { $inc: { 'stats.employeesCount': -1 } },
        { session }
      );

      await session.commitTransaction();
      logger.info(`✅ Employee deleted: ${objectId}`);

      await this.invalidateEmployeeCache(companyId, objectId);
    } catch (error: any) {
      await session.abortTransaction();
      logger.error('❌ Error deleting employee (rolled back):', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // =====================================================
  // GET EMPLOYEES BY COMPANY (companyObjectId aayega middleware se)
  // =====================================================
  async getEmployeesByCompany(
    companyObjectId: string,
    page = 1,
    pageSize = 20
  ): Promise<EmployeeListResponse> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}company:${companyObjectId}:${page}:${pageSize}`;

      // ✅ Cache ko try/catch mein wrap karo — fail hone par DB hit karo
      let cached = null;
      try {
        cached = await CacheUtil.get(cacheKey);
      } catch (cacheError: any) {
        logger.warn(`Cache get failed, fetching from DB: ${cacheKey}`, { error: cacheError.message });
      }

      if (cached) {
        logger.debug(`Company employees cache hit: ${companyObjectId}`);
        return cached;
      }

      const { skip, limit } = pagination.paginate({ page, pageSize });

      let [employees, total] = await employeeRepository.findByCompanyObjectId(
        companyObjectId, skip, limit
      );

      if (total === 0) {
        try {
          const company = await companyRepository.findByObjectId(companyObjectId);
          if (company) {
            const slug = company.companySlug || (company as any).slug || 'company';
            const defaultEmp = await employeeRepository.create({
              firstName: company.companyName || 'Company',
              lastName: 'Team',
              email: `team@${slug}-${company._id.toString().slice(-4)}.com`,
              company: company._id,
              designation: 'Admin / Author',
              department: 'Leadership',
              isActive: true,
              isAdvocate: true,
              joinDate: new Date(),
            });
            employees = [defaultEmp];
            total = 1;
          }
        } catch (autoErr: any) {
          logger.warn('Auto-create author skipped:', autoErr.message);
        }
      }

      const formatted = employees.map(emp =>
        this.formatEmployeeResponse(emp as unknown as PopulatedEmployee)
      );

      const result: EmployeeListResponse = {
        employees: formatted,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: pagination.hasMore(total, page, pageSize),
      };

      console.log('DB fetched employees for company:', companyObjectId, 'result count:', employees.length);

      // ✅ Cache set bhi try/catch mein
      try {
        await CacheUtil.set(cacheKey, result, this.CACHE_TTL);
      } catch (cacheError: any) {
        logger.warn(`Cache set failed: ${cacheKey}`, { error: cacheError.message });
      }

      return result;
    } catch (error: any) {
      logger.error(`Error getting employees for company ${companyObjectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // TOGGLE ACTIVE STATUS (ObjectId aayega middleware se)
  // =====================================================
  async toggleActiveStatus(objectId: string): Promise<EmployeeResponseDTO> {
    try {
      const employee = await employeeRepository.findByObjectId(objectId);
      if (!employee) throw new Error('Employee not found');

      const newStatus = !employee.isActive;
      const updateData: any = { isActive: newStatus };
      if (!newStatus) updateData.endDate = new Date();  // deactivate → endDate set

      const updated = await employeeRepository.updateByObjectId(objectId, updateData);
      if (!updated) throw new Error('Updated employee not found');

      logger.info(`Employee status toggled: ${objectId} → isActive: ${newStatus}`);

      const companyId = (employee as any).company._id?.toString() || (employee as any).company.toString();
      await this.invalidateEmployeeCache(companyId, objectId);

      return this.formatEmployeeResponse(updated as unknown as PopulatedEmployee);
    } catch (error: any) {
      logger.error(`Error toggling employee status ${objectId}:`, error);
      throw error;
    }
  }

  // =====================================================
  // GET ACTIVE EMPLOYEES
  // =====================================================
  async getActiveEmployees(page = 1, pageSize = 20): Promise<EmployeeListResponse> {
    try {
      const { skip, limit } = pagination.paginate({ page, pageSize });

      const [employees, total] = await employeeRepository.findWithFilters(
        { isActive: true },
        { createdAt: -1 },
        skip,
        limit
      );

      const formatted = employees.map(emp =>
        this.formatEmployeeResponse(emp as unknown as PopulatedEmployee)
      );

      return {
        employees: formatted,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: pagination.hasMore(total, page, pageSize),
      };
    } catch (error: any) {
      logger.error('Error getting active employees:', error);
      throw error;
    }
  }

  // =====================================================
  // SEARCH EMPLOYEES
  // =====================================================
  async searchEmployees(
    searchTerm: string,
    page = 1,
    pageSize = 20
  ): Promise<EmployeeListResponse> {
    try {
      const { skip, limit } = pagination.paginate({ page, pageSize });

      const [employees, total] = await employeeRepository.searchByText(
        searchTerm, skip, limit
      );

      const formatted = employees.map(emp =>
        this.formatEmployeeResponse(emp as unknown as PopulatedEmployee)
      );

      return {
        employees: formatted,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
        hasMore: pagination.hasMore(total, page, pageSize),
      };
    } catch (error: any) {
      // Logger bypass karke direct console use karo
      console.error('=== SEARCH ERROR ===');
      console.error('Message:', error.message);
      console.error('Name:', error.name);
      console.error('Stack:', error.stack);
      console.error('Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      console.error('===================');

      logger.error('Error searching employees:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        code: error.code,        // MongoDB error code
        codeName: error.codeName // MongoDB error name
      });
      console.error('=== SEARCH RAW ERROR ===', {
        message: error.message,
        code: error.code,
        codeName: error.codeName,
      });
      logger.error('Error searching employees:', {
        message: error.message,
        stack: error.stack,
        code: error.code,
      });
      throw error;
    }
  }

  async assignAdvocacy(
    companyUUID: string,
    employeeUUID: string,
    isAdvocate: boolean,
    requestingUserId: string
  ): Promise<EmployeeResponseDTO> {
    try {
      const company = await companyRepository.findByUUID(companyUUID);
      if (!company) throw new Error('Company not found');

      const employee = await employeeRepository.findByUUID(employeeUUID);
      if (!employee) throw new Error('Employee not found');

      const empCompanyId = (employee as any).company._id?.toString()
        || (employee as any).company.toString();

      if (empCompanyId !== company._id.toString()) {
        throw new Error('Employee does not belong to this company');
      }

      if (!employee.isActive) {
        throw new Error('Cannot assign advocacy to inactive employee');
      }

      // ✅ TOGGLE HATAO — body se aaya isAdvocate directly use karo
      const updated = await employeeRepository.assignAdvocacy(
        (employee as any)._id.toString(),
        isAdvocate,
        requestingUserId
      );
      if (!updated) throw new Error('Employee not found');

      logger.info(
        `Advocacy ${isAdvocate ? 'assigned' : 'removed'}: employee=${employeeUUID}, company=${companyUUID}`
      );

      await this.invalidateEmployeeCache(
        company._id.toString(),
        (employee as any)._id.toString()
      );

      return this.formatEmployeeResponse(updated as unknown as PopulatedEmployee);
    } catch (error: any) {
      logger.error('Error assigning advocacy:', error);
      throw error;
    }
  }

  // =====================================================
  // HELPER: FORMAT RESPONSE
  // =====================================================
  private formatEmployeeResponse(employee: PopulatedEmployee): EmployeeResponseDTO {
    return {
      _id: employee._id.toString(),
      employeeId: employee.employeeId,   // ✅ UUID expose karo
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      company: {
        _id: employee.company._id?.toString() || (employee.company as any).toString(),
        name: employee.company.name || '',
        logo: employee.company.logo,
      },
      designation: employee.designation,
      department: employee.department,
      profileImage: employee.profileImage,
      bio: employee.bio,
      location: employee.location,
      skills: employee.skills || [],
      socialLinks: employee.socialLinks,
      advocacyScore: employee.advocacyScore || 0,
      assignedAsAdvocateAt: employee.assignedAsAdvocateAt,
      isAdvocate: employee.isAdvocate || false,
      postsCount: employee.postsCount || 0,
      followersCount: employee.followersCount || 0,
      isActive: employee.isActive,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    } as EmployeeResponseDTO;
  }

  // =====================================================
  // HELPER: INVALIDATE CACHE
  // =====================================================
  private async invalidateEmployeeCache(companyId: string, employeeId?: string): Promise<void> {
    try {
      if (employeeId) {
        try {
          await CacheUtil.del(`${this.CACHE_PREFIX}${employeeId}`);
        } catch (e: any) {
          logger.warn(`Cache del failed for employee: ${employeeId}`, { error: e.message });
        }
      }

      try {
        await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}company:${companyId}:*`);
      } catch (e: any) {
        logger.warn(`Cache clearByPattern failed for company: ${companyId}`, { error: e.message });
      }

      try {
        await CacheUtil.clearByPattern(`${this.CACHE_PREFIX}list:*`);
      } catch (e: any) {
        logger.warn(`Cache clearByPattern failed for list`, { error: e.message });
      }

      logger.debug(`✅ Cache invalidated for company: ${companyId}`);
    } catch (error: any) {
      logger.error('❌ Cache invalidation failed:', error);
    }
  }
}

export default new EmployeeService();