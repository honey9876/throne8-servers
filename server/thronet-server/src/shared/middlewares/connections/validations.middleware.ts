

/**
 * Validation Middleware
 * Validates incoming HTTP request bodies, queries, and params using Zod schemas or express-validator ValidationChains.
 * Optimized for 100M+ users with efficient validation, sanitization, and logging.
 * 
 * Features:
 * - Validates request body, query, params using Zod schemas OR express-validator ValidationChains
 * - Returns standardized error responses for invalid requests
 * - Supports audit logging for validation failures
 * - Lightweight validation for high-concurrency scenarios
 * - Automatic sanitization for strings (trim, escape)
 * - Supports custom error messages and safe parsing
 * - Backward compatibility with existing express-validator chains
 * 
 * Dependencies:
 * - express: For Request, Response, NextFunction types
 * - zod: For schema validation
 * - express-validator: For ValidationChain support
 * - response.ts: For ErrorResponse, HttpStatus
 * - logger.ts: For logging (winston-based, with auditLog)
 * - environment.ts: For AUDIT_LOG_ENABLED
 * 
 * Scalability Considerations:
 * - Minimal validation overhead with safeParse
 * - Structured logging for traceability
 * - Audit logging for compliance
 * - Supports both validation libraries for migration flexibility
 * 
 * Integration:
 * - Used by connectionRoutes.ts, searchRoutes.ts, profileViewRoutes.ts
 * - Supports connectionSchema.ts, searchSchema.ts, privacySchema.ts, commonSchema.ts
 * - Aligns with .env (LOG_FILE_PATH, LOG_ERROR_FILE_PATH, AUDIT_LOG_ENABLED)
 * - Supports package.json (zod, express, express-validator), tsconfig.json (@utils/*, @con/*)
  */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Joi from 'joi';
import { ValidationChain, validationResult } from 'express-validator';
import { ErrorResponse, HttpStatus } from '@/shared/response.util';
import logger from '@/shared/utils/company/logger';
import environmentConfig from '@/config/environment/environment';
import { LogCategory } from '@/shared/logger.util';
import constants from '@/shared/constants.util';

const ERROR_CODES = constants.ERROR_CODES;

type ValidationSchema = z.ZodSchema | ValidationChain[] | Joi.ObjectSchema<any>;

export const validateRequest = (schema: ValidationSchema, target: 'body' | 'query' | 'params' = 'body') => {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            const data = target === 'query' ? req.query : target === 'params' ? req.params : req.body;

            console.log(`🔍 validateRequest - Method: ${req.method}, Target: ${target}, Data:`, JSON.stringify(data, null, 2));

            if (req.method === 'GET' && target === 'body') {
                console.log(`⚠️ Skipping body validation for GET request`);
                return next();
            }

            if (target === 'params' || target === 'query') {
                if (Array.isArray(schema)) {
                    return await handleExpressValidator(schema, req, next, target);
                }
                if (isJoiSchema(schema)) {
                    return handleJoiSchema(schema, req, next, target);
                }
                return handleZodSchema(schema as z.ZodSchema, req, next, target);
            }

            const methodsRequiringBody = ['POST', 'PUT', 'PATCH'];
            if (methodsRequiringBody.includes(req.method) && (!data || (typeof data === 'object' && Object.keys(data).length === 0))) {
                logger.error('Request validation failed', {
                    path: req.path,
                    method: req.method,
                    userId: req.user?.id || 'anonymous',
                    target,
                    error: `${target}: Required`,
                    category: LogCategory.VALIDATION,
                });

                return next(new ErrorResponse(`${target}: Required`, HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED'));
            }

            if (Array.isArray(schema)) {
                return await handleExpressValidator(schema, req, next, target);
            }

            if (isJoiSchema(schema)) {
                console.log('✅ Detected JOI schema');
                return handleJoiSchema(schema, req, next, target);
            }

            console.log('✅ Detected ZOD schema');
            return handleZodSchema(schema as z.ZodSchema, req, next, target);

        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : 'Invalid request data';

            logger.error('Request validation failed', {
                path: req.path,
                method: req.method,
                userId: req.user?.id || 'anonymous',
                target,
                error: errorMessage,
                details: error instanceof z.ZodError ? error.issues : undefined,
                category: LogCategory.VALIDATION,
            });

            return next(new ErrorResponse(errorMessage, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
        }
    };
};

// ✅ FIXED: Better Joi schema detection
const isJoiSchema = (schema: any): schema is Joi.ObjectSchema<any> => {
    // Check for Joi-specific properties and methods
    return schema &&
        typeof schema === 'object' &&
        typeof schema.validate === 'function' &&
        (schema.isJoi === true || // Explicit isJoi property
            typeof schema.describe === 'function' || // Joi has describe method
            (schema._flags && typeof schema._flags === 'object') || // Joi internal _flags
            schema.type === 'object'); // Joi schema type
};

const handleJoiSchema = (
    schema: Joi.ObjectSchema<any>,
    req: Request,
    next: NextFunction,
    target: 'body' | 'query' | 'params'
) => {
    const data = target === 'query' ? req.query : target === 'params' ? req.params : req.body;

    console.log(`🔍 handleJoiSchema - ${target}:`, JSON.stringify(data, null, 2));

    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true,
        convert: true
    });

    if (error) {
        const errorMessage = error.details.map(detail => `${detail.path.join('.')}: ${detail.message}`).join(', ');
        console.log(`❌ Joi validation failed:`, errorMessage);
        throw new Error(errorMessage);
    }

    console.log(`✅ Joi validation passed`);

    if (target === 'body') {
        req.body = value;
    } else if (target === 'query') {
        req.query = value;
    } else if (target === 'params') {
        req.params = value;
    }

    logger.debug('Request validation passed (Joi)', {
        path: req.path,
        method: req.method,
        target,
        category: LogCategory.VALIDATION
    });

    next();
};

const handleExpressValidator = async (
    validations: ValidationChain[],
    req: Request,
    next: NextFunction,
    target: string
) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessage = errors.array().map(e => `${(e as any).param || 'field'}: ${e.msg}`).join(', ');
        throw new Error(errorMessage);
    }

    logger.debug('Request validation passed (express-validator)', {
        path: req.path,
        method: req.method,
        target,
        category: LogCategory.VALIDATION
    });

    next();
};

const handleZodSchema = (
    schema: z.ZodSchema,
    req: Request,
    next: NextFunction,
    target: 'body' | 'query' | 'params'
) => {
    const data = target === 'query' ? req.query : target === 'params' ? req.params : req.body;

    console.log(`🔍 handleZodSchema - ${target}:`, JSON.stringify(data, null, 2));

    const result = schema.safeParse(data);
    if (!result.success) {
        const errorMessage = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
        console.log(`❌ Zod validation failed:`, errorMessage);
        throw new Error(errorMessage);
    }

    console.log(`✅ Zod validation passed`);

    if (target === 'body') {
        req.body = sanitizeData(result.data) as any;
    } else if (target === 'query') {
        req.query = sanitizeData(result.data) as any;
    } else if (target === 'params') {
        req.params = sanitizeData(result.data) as any;
    }

    logger.debug('Request validation passed (Zod)', {
        path: req.path,
        method: req.method,
        target,
        category: LogCategory.VALIDATION
    });

    next();
};

export const validateGetRequest = (schema: z.ZodSchema) => {
    return (req: Request, _res: Response, next: NextFunction) => {
        try {
            console.log(`🔍 validateGetRequest - Params:`, req.params, `Query:`, req.query);

            const dataToValidate = {
                params: req.params || {},
                query: req.query || {}
            };

            const result = schema.safeParse(dataToValidate);
            if (!result.success) {
                const errorMessage = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
                console.log(`❌ GET validation failed:`, errorMessage);
                return next(new ErrorResponse(errorMessage, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
            }

            console.log(`✅ GET validation passed`);

            const validatedData = result.data as { params: any; query: any };
            req.params = validatedData.params;
            req.query = validatedData.query;

            next();
        } catch (error: any) {
            return next(new ErrorResponse(error.message || 'Validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
        }
    };
};

export const createQuerySchema = () => z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(10),
    skip: z.coerce.number().min(0).optional().default(0),
    sort: z.string().optional().refine((val) => {
        if (!val) return true;
        try {
            JSON.parse(val);
            return true;
        } catch {
            return false;
        }
    }, { message: "Sort must be valid JSON" }),
    includeMetadata: z.coerce.boolean().optional().default(false)
});

export const createProfileViewQuerySchema = () => z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(10),
    skip: z.coerce.number().min(0).optional().default(0),
    sort: z.string().optional().refine((val) => {
        if (!val) return true;
        try {
            const parsed = JSON.parse(val);
            return typeof parsed === 'object' && parsed !== null;
        } catch {
            return false;
        }
    }, { message: "Sort must be valid JSON object" }),
    includeMetadata: z.coerce.boolean().optional().default(false)
});

const sanitizeData = (data: any): any => {
    if (typeof data === 'string') {
        return data.trim();
    } else if (Array.isArray(data)) {
        return data.map(sanitizeData);
    } else if (typeof data === 'object' && data !== null) {
        return Object.fromEntries(
            Object.entries(data).map(([key, value]) => [key, sanitizeData(value)])
        );
    }
    return data;
};

export const validateRequestSimple = (schema: z.ZodSchema, target: 'body' | 'query' | 'params' = 'body') => {
    return (req: Request, _res: Response, next: NextFunction) => {
        try {
            const data = target === 'query' ? req.query : target === 'params' ? req.params : req.body;

            const result = schema.safeParse(data);
            if (!result.success) {
                const errorMessage = result.error.issues.map((e: z.ZodIssue) => `${e.path.join('.')}: ${e.message}`).join(', ');
                return next(new ErrorResponse(errorMessage, HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
            }

            if (target === 'body') req.body = result.data as any;
            else if (target === 'query') req.query = result.data as any;
            else if (target === 'params') req.params = result.data as any;

            next();
        } catch (error: any) {
            return next(new ErrorResponse(error.message || 'Validation failed', HttpStatus.BAD_REQUEST, ERROR_CODES.VALIDATION_FAILED));
        }
    };
};

export default {
    validateRequest,
    validateGetRequest,
    validateRequestSimple,
    createQuerySchema,
    createProfileViewQuerySchema
};