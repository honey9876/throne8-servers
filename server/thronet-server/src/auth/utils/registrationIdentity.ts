export type RegistrationField =
    | 'email'
    | 'password'
    | 'confirmPassword'
    | 'firstName'
    | 'lastName'
    | 'phoneNumber'
    | 'location'
    | 'userType'
    | 'jobTitle'
    | 'companyName'
    | 'startDate'
    | 'endDate'
    | 'collegeName'
    | 'degree'
    | 'fieldOfStudy'
    | 'graduationYear'
    | 'highestEducation'
    | 'preferredRole'
    | 'cgpa';

export interface RegistrationFieldError {
    field: RegistrationField;
    message: string;
}

export const normalizeEmail = (email: string): string =>
    email.trim().toLowerCase();

export function normalizePhone(phone: string): string {
    const cleaned = phone.trim().replace(/[\s().-]/g, '');

    if (cleaned.startsWith('+')) {
        const digits = cleaned.slice(1);
        if (/^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
    } else if (/^\d{10}$/.test(cleaned) && /^[6-9]/.test(cleaned)) {
        return `+91${cleaned}`;
    }

    throw new Error(
        'Enter a valid phone number: use + and country code, or a 10-digit Indian mobile number.'
    );
}

export function phoneLookupVariants(canonicalPhone: string): string[] {
    const digits = canonicalPhone.slice(1);
    if (canonicalPhone.startsWith('+91') && digits.length === 12) {
        const nationalNumber = digits.slice(2);
        return [
            canonicalPhone,
            digits,
            nationalNumber,
            `0${nationalNumber}`,
        ];
    }
    return [canonicalPhone, digits];
}

export class RegistrationConflictError extends Error {
    readonly fieldErrors: RegistrationFieldError[];

    constructor(fieldErrors: RegistrationFieldError[]) {
        super('Registration conflicts with an existing account');
        this.name = 'RegistrationConflictError';
        this.fieldErrors = fieldErrors;
    }
}

export function duplicateKeyConflict(error: any): RegistrationConflictError | null {
    if (Number(error?.code) !== 11000) return null;

    const pattern = error.keyPattern || {};
    const value = error.keyValue || {};
    const message = typeof error.message === 'string' ? error.message : '';
    const fieldErrors: RegistrationFieldError[] = [];
    if (
        pattern.email ||
        Object.prototype.hasOwnProperty.call(value, 'email') ||
        /email_1|email\s*:/i.test(message)
    ) {
        fieldErrors.push({
            field: 'email',
            message: 'This email is already registered. Log in or reset your password.',
        });
    }
    if (
        pattern.phoneNumber ||
        Object.prototype.hasOwnProperty.call(value, 'phoneNumber') ||
        /phoneNumber_1|phoneNumber\s*:/i.test(message)
    ) {
        fieldErrors.push({
            field: 'phoneNumber',
            message: 'This phone number is already registered.',
        });
    }
    return fieldErrors.length ? new RegistrationConflictError(fieldErrors) : null;
}

export const duplicateEmailError: RegistrationFieldError = {
    field: 'email',
    message: 'This email is already registered. Log in or reset your password.',
};

export const duplicatePhoneError: RegistrationFieldError = {
    field: 'phoneNumber',
    message: 'This phone number is already registered.',
};
