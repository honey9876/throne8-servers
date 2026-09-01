import { Request, Response } from 'express';
import { employeeService } from '../services';
import ResponseUtil from '@/shared/response.util';
import logger from '@/shared/logger.util';
import { CreateEmployeeDTO, EmployeeFilterQuery } from '../interfaces';

class EmployeeController {
  // =====================================================
  // CREATE EMPLOYEE — NO CHANGE (body se data aata hai)
  // =====================================================
  async createEmployee(req: Request, res: Response): Promise<void> {
    try {
      const data: CreateEmployeeDTO = req.body;
      const employee = await employeeService.createEmployee(data);
      ResponseUtil.created(res, employee, 'Employee created successfully');
    } catch (error: any) {
      const err = error as Error;
      logger.error(`[${req.user?.id}] Error creating employee:`, err);

      if (err.message === 'Company not found') {
        ResponseUtil.notFound(res, err.message);
        return;
      }
      if (err.message.includes('already exists')) {
        ResponseUtil.conflict(res, err.message);
        return;
      }
      ResponseUtil.error(res, 'Failed to create employee');
    }
  }

  // =====================================================
  // GET EMPLOYEE BY ID
  // =====================================================
  async getEmployeeById(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId; // ✅ middleware se

      const employee = await employeeService.getEmployeeById(objectId);
      ResponseUtil.success(res, employee, 'Employee fetched successfully');
    } catch (error: any) {
      const err = error as Error;
      logger.error(`[${req.user?.id}] Error getting employee:`, err);

      if (err.message === 'Employee not found') {
        ResponseUtil.notFound(res, err.message);
        return;
      }
      ResponseUtil.error(res, 'Failed to fetch employee');
    }
  }

  // =====================================================
  // LIST EMPLOYEES — NO CHANGE
  // =====================================================
  async listEmployees(req: Request, res: Response): Promise<void> {
    try {
      const query = (req as any).validatedQuery || req.query; // fallback bhi rakho

      const filters: EmployeeFilterQuery = {
        page: parseInt(query.page as string) || 1,
        pageSize: parseInt(query.pageSize as string) || 20,
        company: query.company as string,
        department: query.department as string,
        designation: query.designation as string,
        search: query.search as string,
        isActive: query.isActive === 'true' ? true
          : query.isActive === 'false' ? false : undefined,
        sort: query.sort as 'advocacy' | 'recent' | 'name',
      };

      const result = await employeeService.listEmployees(filters);
      ResponseUtil.success(res, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
        result: result.employees,
      }, 'Employees fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error listing employees:`, error);
      ResponseUtil.error(res, 'Failed to fetch employees');
    }
  }

  // =====================================================
  // UPDATE EMPLOYEE
  // =====================================================
  async updateEmployee(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId; // ✅ middleware se

      const employee = await employeeService.updateEmployee(objectId, req.body);
      ResponseUtil.success(res, employee, 'Employee updated successfully');
    } catch (error: any) {
      const err = error as Error;
      logger.error(`[${req.user?.id}] Error updating employee:`, err);

      if (err.message === 'Employee not found') {
        ResponseUtil.notFound(res, err.message);
        return;
      }
      ResponseUtil.error(res, 'Failed to update employee');
    }
  }

  async assignAdvocacy(req: Request, res: Response): Promise<void> {
    try {
      const { companyId, employeeId } = req.params;
      const { isAdvocate } = req.body;
      const requestingUserId = req.user?.id;

      const employee = await employeeService.assignAdvocacy(
        companyId,
        employeeId,
        isAdvocate,
        requestingUserId
      );

      const message = employee.isAdvocate
        ? 'Employee assigned as advocate successfully'
        : 'Employee removed as advocate successfully';

      ResponseUtil.success(res, employee, message);
    } catch (error: any) {
      const err = error as Error;
      logger.error(`[${req.user?.id}] Error assigning advocacy:`, err);

      if (err.message === 'Company not found' || err.message === 'Employee not found') {
        ResponseUtil.notFound(res, err.message);
        return;
      }
      if (err.message === 'Employee does not belong to this company') {
        ResponseUtil.badRequest(res, err.message);
        return;
      }
      if (err.message === 'Cannot assign advocacy to inactive employee') {
        ResponseUtil.badRequest(res, err.message);
        return;
      }
      ResponseUtil.error(res, 'Failed to assign advocacy');
    }
  }

  // =====================================================
  // DELETE EMPLOYEE
  // =====================================================
  async deleteEmployee(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId; // ✅ middleware se

      await employeeService.deleteEmployee(objectId);
      ResponseUtil.success(res, null, 'Employee deleted successfully');
    } catch (error: any) {
      const err = error as Error;
      logger.error(`[${req.user?.id}] Error deleting employee:`, err);

      if (err.message === 'Employee not found') {
        ResponseUtil.notFound(res, err.message);
        return;
      }
      ResponseUtil.error(res, 'Failed to delete employee');
    }
  }

  // =====================================================
  // GET EMPLOYEES BY COMPANY  ✅ FIXED
  // =====================================================
  async getEmployeesByCompany(req: Request, res: Response): Promise<void> {
    try {
      const companyObjectId = (req as any).resolvedObjectId; // ✅ resolveCompanyUUID se

      console.log('companyObjectId received:', companyObjectId);
      console.log('type:', typeof companyObjectId);

      if (!companyObjectId) {
        ResponseUtil.badRequest(res, 'Company not found');
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await employeeService.getEmployeesByCompany(
        companyObjectId, page, pageSize
      );

      ResponseUtil.success(res, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
        result: result.employees,
      }, 'Company employees fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error getting company employees:`, error);
      ResponseUtil.error(res, 'Failed to fetch company employees');
    }
  }

  // =====================================================
  // TOGGLE ACTIVE STATUS
  // =====================================================
  async toggleActiveStatus(req: Request, res: Response): Promise<void> {
    try {
      const objectId = (req as any).resolvedObjectId; // ✅ middleware se

      const employee = await employeeService.toggleActiveStatus(objectId);
      ResponseUtil.success(res, employee, 'Employee status updated successfully');
    } catch (error: any) {
      const err = error as Error;
      logger.error(`[${req.user?.id}] Error toggling employee status:`, err);

      if (err.message === 'Employee not found') {
        ResponseUtil.notFound(res, err.message);
        return;
      }
      ResponseUtil.error(res, 'Failed to update employee status');
    }
  }

  // =====================================================
  // GET ACTIVE EMPLOYEES — NO CHANGE
  // =====================================================
  async getActiveEmployees(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      const result = await employeeService.getActiveEmployees(page, pageSize);
      ResponseUtil.success(res, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
        result: result.employees,
      }, 'Active employees fetched successfully');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error getting active employees:`, error);
      ResponseUtil.error(res, 'Failed to fetch active employees');
    }
  }

  // =====================================================
  // SEARCH EMPLOYEES — NO CHANGE
  // =====================================================
  async searchEmployees(req: Request, res: Response): Promise<void> {
    try {
      const searchTerm = req.query.q as string;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 20;

      if (!searchTerm) {
        ResponseUtil.badRequest(res, 'Search query is required');
        return;
      }

      const result = await employeeService.searchEmployees(searchTerm, page, pageSize);
      ResponseUtil.success(res, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
        hasMore: result.hasMore,
        result: result.employees,
      }, 'Employees search results');
    } catch (error: any) {
      const err = error as Error;
      logger.error(`[${req.user?.id}] Error searching employees:`, {
        message: err.message,
        stack: err.stack,
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
      ResponseUtil.error(res, 'Failed to search employees');
    }
  }

  // =====================================================
  // BULK CREATE — NO CHANGE
  // =====================================================
  async bulkCreateEmployees(req: Request, res: Response): Promise<void> {
    try {
      ResponseUtil.success(res, null, 'Bulk upload endpoint - Coming soon');
    } catch (error: any) {
      logger.error(`[${req.user?.id}] Error bulk creating employees:`, error);
      ResponseUtil.error(res, 'Failed to bulk create employees');
    }
  }
}

export const employeeController = new EmployeeController();