import Joi, { ObjectSchema, ValidationResult } from 'joi';
import sanitizeHtml from 'sanitize-html';
import validator from 'validator';

const sanitize = (value: any): any =>
    typeof value === 'string' ? sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).trim() : value;

const emailSchema = Joi.string()
    .custom((value, helpers) => {
        if (!validator.isEmail(value)) return helpers.error('any.invalid');
        return sanitize(value).toLowerCase();
    }, 'Email validation')
    .messages({ 'any.invalid': '"{{#label}}" is not a valid email address' });

const passwordSchema = Joi.string()
    .min(12)
    .custom((value, helpers) => {
        if (!validator.isStrongPassword(value, {
            minLength: 12,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 1,
        })) return helpers.error('password.weak');
        return value;
    }, 'Strong password')
    .messages({
        'password.weak': '"{{#label}}" must contain 12+ chars, 1 lowercase, 1 uppercase, 1 number, 1 symbol',
    });

interface ValidationOptions {
    abortEarly?: boolean;
    stripUnknown?: boolean;
}

interface ValidationOutput<T = any> {
    error?: Joi.ValidationError;
    value: T;
}

class ValidationUtil {
    static validate<T = any>(schema: ObjectSchema, data: any, options: ValidationOptions = {}): ValidationOutput<T> {
        return schema.validate(data, { abortEarly: false, stripUnknown: true, ...options });
    }

    static registerSchema = Joi.object({
        name: Joi.string().min(2).max(50).required().custom(sanitize),
        email: emailSchema.required(),
        password: passwordSchema.required(),
        phone: Joi.string().allow('').optional(),
        role: Joi.string().valid('user', 'employer', 'admin').default('user'),
    });

    static loginSchema = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(1).required(),
        rememberMe: Joi.boolean().optional().default(false),
    });

    static passwordChangeSchema = Joi.object({
        currentPassword: Joi.string().required(),
        newPassword: passwordSchema.required(),
        confirmPassword: Joi.any().valid(Joi.ref('newPassword')).required()
            .messages({ 'any.only': 'Passwords do not match' }),
    });

    static sanitizeObject(obj: any): any {
        if (!obj || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(this.sanitizeObject.bind(this));

        const clean: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                clean[key] = this.sanitizeObject(sanitize(obj[key]));
            }
        }
        return clean;
    }
}



export default ValidationUtil;