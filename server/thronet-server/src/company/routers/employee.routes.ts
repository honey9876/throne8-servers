import { Router } from 'express';
import { employeeController } from '../controllers';
import AuthMiddleware from '@/shared/middlewares/auth.middleware';
import validationMiddleware from '@/shared/middlewares/validation.middleware';
import { employeeValidators } from '../validations/company.validation';
import { resolveCompanyUUID } from '../middlewares/resolveCompanyId.middleware';
import { resolveEmployeeUUID } from '../middlewares/resolveEmployeeId.middleware';

const router = Router();

// =====================================================
// EMPLOYEE ROUTES
// =====================================================

/**
 * @route   POST /api/employees
 * @desc    Create new employee
 * @access  Private (Admin/HR)
 */
router.post(
  '/create',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateJoi(employeeValidators.create),
  employeeController.createEmployee.bind(employeeController)
);

/**
 * @route   GET /api/employees
 * @desc    List all employees (with filters & pagination)
 * @access  Private
 * @query   page, pageSize, company, department, designation, search, isActive, sort
 */
router.get(
  '/',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(employeeValidators.query),
  employeeController.listEmployees.bind(employeeController)
);

/**
 * @route   GET /api/employees/active
 * @desc    Get all active employees
 * @access  Private
 */
router.get(
  '/active',
  AuthMiddleware.authenticate as any,
  employeeController.getActiveEmployees.bind(employeeController)
);

/**
 * @route   GET /api/employees/search
 * @desc    Search employees by name/email/designation
 * @access  Private
 * @query   q (search query), page, pageSize
 */
router.get(
  '/search',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateQueryJoi(employeeValidators.search),
  employeeController.searchEmployees.bind(employeeController)
);

/**
 * @route   GET /api/employees/companies-employees/:companyId
 * @route   GET /api/employees/company/:companyId
 * @route   GET /api/employees/:companyId
 * @desc    Get all employees of a company
 * @access  Private
 */
router.get(
  '/companies-employees/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.companyId),
  resolveCompanyUUID,
  employeeController.getEmployeesByCompany.bind(employeeController)
);

router.get(
  '/company/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.companyId),
  resolveCompanyUUID,
  employeeController.getEmployeesByCompany.bind(employeeController)
);

router.get(
  '/:companyId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.companyId),
  resolveCompanyUUID,
  employeeController.getEmployeesByCompany.bind(employeeController)
);

/**
 * @route   GET /api/employees/:id
 * @desc    Get employee by ID
 * @access  Private
 */
router.get(
  '/get-employee-by-id/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.id),
  resolveEmployeeUUID,
  employeeController.getEmployeeById.bind(employeeController)
);

/**
 * @route   PUT /api/employees/:id
 * @desc    Update employee (full update)
 * @access  Private (Admin/HR)
 */
router.put(
  '/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.id),
  validationMiddleware.validateJoi(employeeValidators.update),
  resolveEmployeeUUID,
  employeeController.updateEmployee.bind(employeeController)
);

/**
 * @route   PATCH /api/employees/:id
 * @desc    Update employee (partial update)
 * @access  Private (Admin/HR)
 */
router.patch(
  '/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.id),
  validationMiddleware.validateJoi(employeeValidators.partialUpdate),
  resolveEmployeeUUID,
  employeeController.updateEmployee.bind(employeeController)
);

/**
 * @route   PATCH /api/employees/:id/status
 * @desc    Toggle employee active status
 * @access  Private (Admin/HR)
 */
router.patch(
  '/:id/status',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.id),
  resolveEmployeeUUID,
  employeeController.toggleActiveStatus.bind(employeeController)
);

/**
 * @route   PATCH /api/employees/advocacy/:companyId/:employeeId
 * @desc    Assign/remove employee as company advocate
 * @access  Private (Admin/HR)
 */
router.patch(
  '/advocacy/:companyId/:employeeId',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.advocacyParams),
  validationMiddleware.validateJoi(employeeValidators.assignAdvocacyBody), // ← YE ADD KARO
  employeeController.assignAdvocacy.bind(employeeController)
);

/**
 * @route   DELETE /api/employees/:id
 * @desc    Delete employee
 * @access  Private (Admin only)
 */
router.delete(
  '/:id',
  AuthMiddleware.authenticate as any,
  validationMiddleware.validateParamsJoi(employeeValidators.id),
  resolveEmployeeUUID,
  employeeController.deleteEmployee.bind(employeeController)
);

/**
 * @route   POST /api/employees/bulk
 * @desc    Bulk create employees (CSV upload)
 * @access  Private (Admin/HR)
 */
router.post(
  '/bulk',
  AuthMiddleware.authenticate as any,
  employeeController.bulkCreateEmployees.bind(employeeController)
);

export default router;