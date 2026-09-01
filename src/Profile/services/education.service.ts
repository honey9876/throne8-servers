/**
 * Education Service - Business Logic for Educational Background
 * Handles education creation with validation
 * 
 * @module services/education.service
 * @version 1.0.0
 */

import { Education, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';
import { v4 as uuidv4 } from 'uuid';
import validator from 'validator';

// ==================== INTERFACES ====================

interface CreateEducationData {
    userId: string;
    schoolCollegeName: string;
    degree: string;
    degreeType: 'High School' | 'Diploma' | "Bachelor's" | "Master's" | 'Doctorate' | 'Certificate' | 'Other';
    specialization?: string;
    startDate: string;              // ISO string (YYYY-MM-DD)
    endDate?: string | null;        // ISO string or null for ongoing
    description?: string;
    educationType?: 'full-time' | 'part-time' | 'distance' | 'online';
    gradeType?: 'percentage' | 'cgpa' | 'gpa' | 'grade';
    gradeValue?: string;
    location?: string;
}

interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

interface UpdateEducationData {
    schoolCollegeName?: string;
    degree?: string;
    degreeType?: 'High School' | 'Diploma' | "Bachelor's" | "Master's" | 'Doctorate' | 'Certificate' | 'Other';
    specialization?: string;
    startDate?: string;
    endDate?: string | null;
    description?: string;
    educationType?: 'full-time' | 'part-time' | 'distance' | 'online';
    gradeType?: 'percentage' | 'cgpa' | 'gpa' | 'grade';
    gradeValue?: string;
    location?: string;
}


// ==================== EDUCATION SERVICE CLASS ====================

class EducationService {

    /**
     * ✅ Create new education record
     */
    static async createEducation(data: CreateEducationData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new education', {
                userId: data.userId,
                schoolCollegeName: data.schoolCollegeName,
                degree: data.degree,
                correlationId,
            });

            // Step 1: Validate user exists
            const user = await User.findOne({ userId: data.userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Step 2: Validate education data
            // const validation = this.validateEducationData(data);
            // if (!validation.isValid) {
            //     throw new Error(validation.errors.join(', '));
            // }

            // Step 3: Parse and validate dates
            const startDate = new Date(data.startDate);
            const endDate = data.endDate ? new Date(data.endDate) : null;

            // Additional date validations
            this.validateDates(startDate, endDate);

            // Step 4: Create education document
            const education = new Education({
                educationId: uuidv4(),
                userId: data.userId,
                schoolCollegeName: data.schoolCollegeName.trim(),
                degree: data.degree.trim(),
                degreeType: data.degreeType,
                specialization: data.specialization?.trim(),
                startDate,
                endDate,
                isOngoing: !endDate,
                description: data.description?.trim(),
                educationType: data.educationType,
                gradeType: data.gradeType,
                gradeValue: data.gradeValue?.trim(),
                location: data.location?.trim(),
            });

            await education.save();

            LoggerUtil.info('Education created successfully', {
                educationId: education.educationId,
                userId: data.userId,
                degree: data.degree,
                correlationId,
            });

            // Step 5: Return formatted response
            return {
                educationId: education.educationId,
                userId: education.userId,
                schoolCollegeName: education.schoolCollegeName,
                degree: education.degree,
                degreeType: education.degreeType,
                specialization: education.specialization,
                startDate: education.startDate,
                endDate: education.endDate,
                isOngoing: education.isOngoing,
                duration: education.duration,  // Virtual field
                description: education.description,
                educationType: education.educationType,
                gradeType: education.gradeType,
                gradeValue: education.gradeValue,
                location: education.location,
                createdAt: education.createdAt,
                updatedAt: education.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Education creation failed', {
                error: error.message,
                stack: error.stack,
                userId: data.userId,
                correlationId,
            });

            throw error;
        }
    }

    /**
     * ✅ Get all education records for user
     */
    static async getAllEducation(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all education records', {
                userId,
                includeArchived,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            // Get all education records
            const educationList = await Education.findByUserId(userId, includeArchived);

            LoggerUtil.info('Education records fetched successfully', {
                userId,
                count: educationList.length,
                correlationId,
            });

            return {
                educationList,
                total: educationList.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all education failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single education by ID
     */
    static async getEducationById(educationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching education by ID', {
                educationId,
                userId,
                correlationId,
            });

            // Find education
            const education = await Education.findActiveById(educationId, userId);

            if (!education) {
                throw new Error('Education not found');
            }

            LoggerUtil.info('Education fetched successfully', {
                educationId,
                userId,
                correlationId,
            });

            return {
                educationId: education.educationId,
                userId: education.userId,
                schoolCollegeName: education.schoolCollegeName,
                degree: education.degree,
                degreeType: education.degreeType,
                specialization: education.specialization,
                startDate: education.startDate,
                endDate: education.endDate,
                isOngoing: education.isOngoing,
                duration: education.duration,
                description: education.description,
                educationType: education.educationType,
                gradeType: education.gradeType,
                gradeValue: education.gradeValue,
                location: education.location,
                isArchived: education.isArchived,
                archivedAt: education.archivedAt,
                createdAt: education.createdAt,
                updatedAt: education.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get education by ID failed', {
                error: error.message,
                educationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update education record
     */
    static async updateEducation(
        educationId: string,
        userId: string,
        updates: UpdateEducationData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating education', {
                educationId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            // Find education
            const education = await Education.findActiveById(educationId, userId);

            if (!education) {
                throw new Error('Education not found');
            }

            // Validate updates
            // const validation = this.validateUpdateData(updates);
            // if (!validation.isValid) {
            //     throw new Error(validation.errors.join(', '));
            // }

            // Apply updates
            if (updates.schoolCollegeName !== undefined) {
                education.schoolCollegeName = updates.schoolCollegeName.trim();
            }
            if (updates.degree !== undefined) {
                education.degree = updates.degree.trim();
            }
            if (updates.degreeType !== undefined) {
                education.degreeType = updates.degreeType;
            }
            if (updates.specialization !== undefined) {
                education.specialization = updates.specialization ? updates.specialization.trim() : undefined;
            }
            if (updates.startDate !== undefined) {
                education.startDate = new Date(updates.startDate);
            }
            if (updates.endDate !== undefined) {
                education.endDate = updates.endDate ? new Date(updates.endDate) : undefined;
                education.isOngoing = !updates.endDate;
            }
            if (updates.description !== undefined) {
                education.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.educationType !== undefined) {
                education.educationType = updates.educationType;
            }
            if (updates.gradeType !== undefined) {
                education.gradeType = updates.gradeType;
            }
            if (updates.gradeValue !== undefined) {
                education.gradeValue = updates.gradeValue ? updates.gradeValue.trim() : undefined;
            }
            if (updates.location !== undefined) {
                education.location = updates.location ? updates.location.trim() : undefined;
            }

            // Validate dates if both are present
            if (education.startDate && education.endDate) {
                this.validateDates(education.startDate, education.endDate);
            }

            await education.save();

            LoggerUtil.info('Education updated successfully', {
                educationId,
                userId,
                correlationId,
            });

            return {
                educationId: education.educationId,
                userId: education.userId,
                schoolCollegeName: education.schoolCollegeName,
                degree: education.degree,
                degreeType: education.degreeType,
                specialization: education.specialization,
                startDate: education.startDate,
                endDate: education.endDate,
                isOngoing: education.isOngoing,
                duration: education.duration,
                description: education.description,
                educationType: education.educationType,
                gradeType: education.gradeType,
                gradeValue: education.gradeValue,
                location: education.location,
                createdAt: education.createdAt,
                updatedAt: education.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update education failed', {
                error: error.message,
                educationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete education (soft delete)
     */
    static async deleteEducation(educationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting education', {
                educationId,
                userId,
                correlationId,
            });

            // Find education
            const education = await Education.findActiveById(educationId, userId);

            if (!education) {
                throw new Error('Education not found');
            }

            // Soft delete
            education.isDeleted = true;
            education.deletedAt = new Date();
            await education.save();

            LoggerUtil.info('Education deleted successfully', {
                educationId,
                userId,
                correlationId,
            });

            return {
                educationId: education.educationId,
                deletedAt: education.deletedAt,
                message: 'Education deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete education failed', {
                error: error.message,
                educationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive education
     */
    static async archiveEducation(educationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving education', {
                educationId,
                userId,
                correlationId,
            });

            // Find education
            const education = await Education.findActiveById(educationId, userId);

            if (!education) {
                throw new Error('Education not found');
            }

            if (education.isArchived) {
                throw new Error('Education is already archived');
            }

            // Archive
            education.isArchived = true;
            education.archivedAt = new Date();
            await education.save();

            LoggerUtil.info('Education archived successfully', {
                educationId,
                userId,
                correlationId,
            });

            return {
                educationId: education.educationId,
                isArchived: education.isArchived,
                archivedAt: education.archivedAt,
                message: 'Education archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive education failed', {
                error: error.message,
                educationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived education
     */
    static async restoreEducation(educationId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring education', {
                educationId,
                userId,
                correlationId,
            });

            // Find education (including archived)
            const education = await Education.findOne({
                educationId,
                userId,
                isDeleted: false,
            });

            if (!education) {
                throw new Error('Education not found');
            }

            if (!education.isArchived) {
                throw new Error('Education is not archived');
            }

            // Restore
            education.isArchived = false;
            education.archivedAt = undefined;
            await education.save();

            LoggerUtil.info('Education restored successfully', {
                educationId,
                userId,
                correlationId,
            });

            return {
                educationId: education.educationId,
                isArchived: education.isArchived,
                message: 'Education restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore education failed', {
                error: error.message,
                educationId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Validate education data
     */
    // private static validateEducationData(data: CreateEducationData): ValidationResult {
    //     const errors: string[] = [];

    //     // ==================== SCHOOL/COLLEGE NAME VALIDATION ====================
    //     if (!data.schoolCollegeName || typeof data.schoolCollegeName !== 'string') {
    //         errors.push('School/College name is required');
    //     } else {
    //         const name = data.schoolCollegeName.trim();

    //         if (name.length < Constants.EDUCATION_VALIDATION.SCHOOL_COLLEGE_NAME.MIN_LENGTH) {
    //             errors.push(`School/College name must be at least ${Constants.EDUCATION_VALIDATION.SCHOOL_COLLEGE_NAME.MIN_LENGTH} characters`);
    //         }

    //         if (name.length > Constants.EDUCATION_VALIDATION.SCHOOL_COLLEGE_NAME.MAX_LENGTH) {
    //             errors.push(`School/College name cannot exceed ${Constants.EDUCATION_VALIDATION.SCHOOL_COLLEGE_NAME.MAX_LENGTH} characters`);
    //         }

    //         if (!Constants.EDUCATION_VALIDATION.SCHOOL_COLLEGE_NAME.PATTERN.test(name)) {
    //             errors.push('School/College name must start with a capital letter or number');
    //         }
    //     }

    //     // ==================== DEGREE VALIDATION ====================
    //     if (!data.degree || typeof data.degree !== 'string') {
    //         errors.push('Degree is required');
    //     } else {
    //         const degree = data.degree.trim();

    //         if (degree.length < Constants.EDUCATION_VALIDATION.DEGREE.MIN_LENGTH) {
    //             errors.push(`Degree must be at least ${Constants.EDUCATION_VALIDATION.DEGREE.MIN_LENGTH} characters`);
    //         }

    //         if (degree.length > Constants.EDUCATION_VALIDATION.DEGREE.MAX_LENGTH) {
    //             errors.push(`Degree cannot exceed ${Constants.EDUCATION_VALIDATION.DEGREE.MAX_LENGTH} characters`);
    //         }

    //         if (!Constants.EDUCATION_VALIDATION.DEGREE.PATTERN.test(degree)) {
    //             errors.push('Degree must start with a capital letter or number');
    //         }
    //     }

    //     // ==================== SPECIALIZATION VALIDATION (OPTIONAL) ====================
    //     if (data.specialization !== undefined && data.specialization !== null && data.specialization !== '') {
    //         const specialization = data.specialization.trim();

    //         if (specialization.length < Constants.EDUCATION_VALIDATION.SPECIALIZATION.MIN_LENGTH) {
    //             errors.push(`Specialization must be at least ${Constants.EDUCATION_VALIDATION.SPECIALIZATION.MIN_LENGTH} characters`);
    //         }

    //         if (specialization.length > Constants.EDUCATION_VALIDATION.SPECIALIZATION.MAX_LENGTH) {
    //             errors.push(`Specialization cannot exceed ${Constants.EDUCATION_VALIDATION.SPECIALIZATION.MAX_LENGTH} characters`);
    //         }

    //         if (!Constants.EDUCATION_VALIDATION.SPECIALIZATION.PATTERN.test(specialization)) {
    //             errors.push('Specialization must start with a capital letter');
    //         }
    //     }

    //     // ==================== START DATE VALIDATION ====================
    //     if (!data.startDate || typeof data.startDate !== 'string') {
    //         errors.push('Start date is required');
    //     } else {
    //         // ✅ Extract date part from ISO string (handle both YYYY-MM-DD and ISO timestamp)
    //         const dateStr = data.startDate.includes('T')
    //             ? data.startDate.split('T')[0]
    //             : data.startDate;

    //         if (!validator.isISO8601(dateStr)) {
    //             errors.push('Start date must be in valid date format');
    //         } else {
    //             const startDate = new Date(data.startDate);

    //             // Check if date is valid
    //             if (isNaN(startDate.getTime())) {
    //                 errors.push('Start date is invalid');
    //             } else {
    //                 const year = startDate.getFullYear();

    //                 if (year < Constants.EDUCATION_VALIDATION.DATE_VALIDATION.MIN_YEAR) {
    //                     errors.push(`Start date cannot be before ${Constants.EDUCATION_VALIDATION.DATE_VALIDATION.MIN_YEAR}`);
    //                 }

    //                 if (year > Constants.EDUCATION_VALIDATION.DATE_VALIDATION.MAX_YEAR) {
    //                     errors.push('Start date cannot be in the distant future');
    //                 }
    //             }
    //         }
    //     }

    //     // ==================== END DATE VALIDATION ====================
    //     if (data.endDate !== null && data.endDate !== undefined && data.endDate !== '') {
    //         if (typeof data.endDate !== 'string') {
    //             errors.push('End date must be a string or null');
    //         } else {
    //             // ✅ Extract date part from ISO string
    //             const dateStr = data.endDate.includes('T')
    //                 ? data.endDate.split('T')[0]
    //                 : data.endDate;

    //             if (!validator.isISO8601(dateStr)) {
    //                 errors.push('End date must be in valid date format');
    //             } else {
    //                 const endDate = new Date(data.endDate);

    //                 // Check if date is valid
    //                 if (isNaN(endDate.getTime())) {
    //                     errors.push('End date is invalid');
    //                 } else {
    //                     const year = endDate.getFullYear();

    //                     if (year < Constants.EDUCATION_VALIDATION.DATE_VALIDATION.MIN_YEAR) {
    //                         errors.push(`End date cannot be before ${Constants.EDUCATION_VALIDATION.DATE_VALIDATION.MIN_YEAR}`);
    //                     }

    //                     if (year > Constants.EDUCATION_VALIDATION.DATE_VALIDATION.MAX_YEAR) {
    //                         errors.push('End date cannot be in the distant future');
    //                     }

    //                     // Check if end date is after start date
    //                     if (data.startDate) {
    //                         const startDate = new Date(data.startDate);
    //                         if (!isNaN(startDate.getTime()) && endDate < startDate) {
    //                             errors.push('End date must be after start date');
    //                         }

    //                         // Minimum duration check
    //                         if (!isNaN(startDate.getTime())) {
    //                             const diffMs = endDate.getTime() - startDate.getTime();
    //                             const diffDays = diffMs / (1000 * 60 * 60 * 24);

    //                             if (diffDays < 1) {
    //                                 errors.push('Minimum education duration is 1 day');
    //                             }
    //                         }
    //                     }
    //                 }
    //             }
    //         }
    //     }

    //     // ==================== DESCRIPTION VALIDATION (OPTIONAL) ====================
    //     if (data.description !== undefined && data.description !== null && data.description !== '') {
    //         const description = data.description.trim();

    //         if (description.length < Constants.EDUCATION_VALIDATION.DESCRIPTION.MIN_LENGTH) {
    //             errors.push(`Description must be at least ${Constants.EDUCATION_VALIDATION.DESCRIPTION.MIN_LENGTH} characters`);
    //         }

    //         if (description.length > Constants.EDUCATION_VALIDATION.DESCRIPTION.MAX_LENGTH) {
    //             errors.push(`Description cannot exceed ${Constants.EDUCATION_VALIDATION.DESCRIPTION.MAX_LENGTH} characters`);
    //         }
    //     }

    //     // ==================== EDUCATION TYPE VALIDATION (OPTIONAL) ====================
    //     if (data.educationType) {
    //         if (!Constants.EDUCATION_VALIDATION.EDUCATION_TYPES.includes(data.educationType)) {
    //             errors.push(`Education type must be one of: ${Constants.EDUCATION_VALIDATION.EDUCATION_TYPES.join(', ')}`);
    //         }
    //     }

    //     // ==================== GRADE VALIDATION (OPTIONAL) ====================
    //     if (data.gradeValue && !data.gradeType) {
    //         errors.push('Grade type is required when grade value is provided');
    //     }

    //     if (data.gradeType) {
    //         if (!Constants.EDUCATION_VALIDATION.GRADE_TYPES.includes(data.gradeType)) {
    //             errors.push(`Grade type must be one of: ${Constants.EDUCATION_VALIDATION.GRADE_TYPES.join(', ')}`);
    //         }

    //         if (data.gradeValue) {
    //             const gradeValue = data.gradeValue.trim();

    //             // Validate grade value based on type
    //             if (data.gradeType === 'percentage') {
    //                 const num = parseFloat(gradeValue);
    //                 if (isNaN(num) || num < 0 || num > 100) {
    //                     errors.push('Percentage must be between 0 and 100');
    //                 }
    //             } else if (data.gradeType === 'cgpa') {
    //                 const num = parseFloat(gradeValue);
    //                 if (isNaN(num) || num < 0 || num > 10) {
    //                     errors.push('CGPA must be between 0.00 and 10.00');
    //                 }
    //             } else if (data.gradeType === 'gpa') {
    //                 const num = parseFloat(gradeValue);
    //                 if (isNaN(num) || num < 0 || num > 4) {
    //                     errors.push('GPA must be between 0.00 and 4.00');
    //                 }
    //             }
    //         }
    //     }

    //     // ==================== LOCATION VALIDATION (OPTIONAL) ====================
    //     if (data.location !== undefined && data.location !== null && data.location !== '') {
    //         const location = data.location.trim();

    //         if (location.length > 100) {
    //             errors.push('Location cannot exceed 100 characters');
    //         }
    //     }

    //     return {
    //         isValid: errors.length === 0,
    //         errors,
    //     };
    // }

    /**
     * ✅ Validate date logic
     */
    private static validateDates(startDate: Date, endDate: Date | null): void {
        const now = new Date();

        // Start date validation - can be in future for planned courses
        if (startDate > now) {
            const diffDays = Math.ceil((startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays > 365) {
                throw new Error('Start date cannot be more than 1 year in the future');
            }
        }

        // End date validation
        if (endDate) {
            if (endDate < startDate) {
                throw new Error('End date must be after start date');
            }

            if (endDate > now) {
                const diffDays = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays > 365) {
                    throw new Error('End date cannot be more than 1 year in the future');
                }
            }

            // Minimum duration (1 day)
            const diffMs = endDate.getTime() - startDate.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            if (diffDays < 1) {
                throw new Error('Minimum education duration is 1 day');
            }
        }
    }
}

export default EducationService;