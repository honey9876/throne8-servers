/**
 * Course Service - Business Logic for Courses Management
 * Handles course CRUD, certificate upload, skills tagging, reordering
 * 
 * @module services/course.service
 * @version 1.0.0
 */

import { Course, User, Skill } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

// ==================== INTERFACES ====================

interface CreateCourseData {
    userId: string;
    courseName: string;
    courseNumber?: string;
    associatedSchool: string;
    completionDate: {
        month: number;
        year: number;
    };
    description?: string;
    skillsLearned?: string[];
}

interface UpdateCourseData {
    courseName?: string;
    courseNumber?: string;
    associatedSchool?: string;
    completionDate?: {
        month: number;
        year: number;
    };
    description?: string;
    skillsLearned?: string[];
}

// ==================== COURSE SERVICE CLASS ====================

class CourseService {

    /**
     * ✅ Create new course
     */
    static async createCourse(data: CreateCourseData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new course', {
                userId: data.userId,
                courseName: data.courseName,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId: data.userId });
            if (!user) {
                throw new Error('User not found');
            }

            if (user.status !== 'active') {
                throw new Error('User account is not active');
            }

            // Check course limit (50 courses max)
            const courseCount = await Course.getUserCourseCount(data.userId);
            if (courseCount >= 50) {
                throw new Error('Maximum course limit (50) reached');
            }

            // Validate skills if provided
            if (data.skillsLearned && data.skillsLearned.length > 0) {
                const skills = await Skill.find({
                    skillId: { $in: data.skillsLearned },
                    userId: data.userId,
                    isDeleted: false,
                });

                if (skills.length !== data.skillsLearned.length) {
                    throw new Error('One or more skill IDs are invalid');
                }
            }

            // Get next display order
            const maxOrder = await Course.findOne({ userId: data.userId, isDeleted: false })
                .sort({ displayOrder: -1 })
                .select('displayOrder')
                .exec();

            const displayOrder = maxOrder ? maxOrder.displayOrder + 1 : 0;

            // Create course
            const courseId = uuidv4();
            const course = new Course({
                courseId,
                userId: data.userId,
                courseName: data.courseName.trim(),
                courseNumber: data.courseNumber?.trim(),
                associatedSchool: data.associatedSchool.trim(),
                completionDate: data.completionDate,
                description: data.description?.trim(),
                skillsLearned: data.skillsLearned || [],
                displayOrder,
            });

            await course.save();

            // Update user model
            await User.findOneAndUpdate(
                { userId: data.userId },
                { $addToSet: { coursesIds: courseId } },
                { new: true }
            );

            LoggerUtil.info('Course created successfully', {
                courseId,
                userId: data.userId,
                correlationId,
            });

            return {
                courseId: course.courseId,
                userId: course.userId,
                courseName: course.courseName,
                courseNumber: course.courseNumber,
                associatedSchool: course.associatedSchool,
                completionDate: course.completionDate,
                description: course.description,
                skillsLearned: course.skillsLearned,
                hasCertificate: false,
                hasProviderLogo: false,
                displayOrder: course.displayOrder,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Course creation failed', {
                error: error.message,
                stack: error.stack,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload certificate (image or PDF)
     */
    static async uploadCertificate(courseId: string, userId: string, file: Express.Multer.File): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading certificate', {
                courseId,
                userId,
                fileName: file.originalname,
                fileSize: file.size,
                correlationId,
            });

            // Find course
            const course = await Course.findActiveById(courseId, userId);
            if (!course) {
                throw new Error('Course not found');
            }

            // Delete old certificate if exists
            if (course.certificate?.certificatePublicId) {
                try {
                    const resourceType = course.certificate.fileType === 'pdf' ? 'raw' : 'image';
                    await cloudinary.uploader.destroy(course.certificate.certificatePublicId, {
                        resource_type: resourceType,
                    });
                    LoggerUtil.info('Old certificate deleted from Cloudinary', {
                        publicId: course.certificate.certificatePublicId,
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete old certificate (non-critical)', {
                        error: err.message,
                    });
                }
            }

            // Determine file type
            const fileType = file.mimetype === 'application/pdf' ? 'pdf' : 'image';

            // Upload to Cloudinary
            const uploadResult = fileType === 'pdf'
                ? await this.uploadPDFToCloudinary(file.buffer, userId, file.originalname)
                : await this.uploadImageToCloudinary(file.buffer, userId);

            // Update course
            course.certificate = {
                certificateUrl: uploadResult.url,
                certificatePublicId: uploadResult.public_id,
                certificateSecureUrl: uploadResult.secure_url,
                fileName: file.originalname,
                fileSize: uploadResult.bytes,
                fileType,
                uploadedAt: new Date(),
            };

            await course.save();

            LoggerUtil.info('Certificate uploaded successfully', {
                courseId,
                userId,
                fileType,
                correlationId,
            });

            return {
                courseId: course.courseId,
                certificate: course.certificate,
                message: 'Certificate uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Certificate upload failed', {
                error: error.message,
                courseId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload provider logo
     */
    static async uploadProviderLogo(courseId: string, userId: string, file: Express.Multer.File): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Uploading provider logo', {
                courseId,
                userId,
                fileName: file.originalname,
                correlationId,
            });

            // Find course
            const course = await Course.findActiveById(courseId, userId);
            if (!course) {
                throw new Error('Course not found');
            }

            // Delete old logo if exists
            if (course.providerLogo?.logoPublicId) {
                try {
                    await cloudinary.uploader.destroy(course.providerLogo.logoPublicId);
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete old logo (non-critical)', {
                        error: err.message,
                    });
                }
            }

            // Upload to Cloudinary
            const uploadResult = await this.uploadImageToCloudinary(file.buffer, userId);

            // Update course
            course.providerLogo = {
                logoUrl: uploadResult.url,
                logoPublicId: uploadResult.public_id,
                logoSecureUrl: uploadResult.secure_url,
                uploadedAt: new Date(),
            };

            await course.save();

            LoggerUtil.info('Provider logo uploaded successfully', {
                courseId,
                userId,
                correlationId,
            });

            return {
                courseId: course.courseId,
                providerLogo: course.providerLogo,
                message: 'Provider logo uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Provider logo upload failed', {
                error: error.message,
                courseId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get all courses for user
     */
    static async getAllCourses(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all courses', {
                userId,
                includeArchived,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const coursesList = await Course.findByUserId(userId, includeArchived);

            LoggerUtil.info('Courses fetched successfully', {
                userId,
                total: coursesList.length,
                correlationId,
            });

            return {
                coursesList,
                total: coursesList.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all courses failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get single course by ID
     */
    static async getCourseById(courseId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching course by ID', {
                courseId,
                userId,
                correlationId,
            });

            const course = await Course.findActiveById(courseId, userId);

            if (!course) {
                throw new Error('Course not found');
            }

            LoggerUtil.info('Course fetched successfully', {
                courseId,
                userId,
                correlationId,
            });

            return {
                courseId: course.courseId,
                userId: course.userId,
                courseName: course.courseName,
                courseNumber: course.courseNumber,
                associatedSchool: course.associatedSchool,
                completionDate: course.completionDate,
                description: course.description,
                certificate: course.certificate,
                providerLogo: course.providerLogo,
                skillsLearned: course.skillsLearned,
                hasCertificate: !!(course.certificate?.certificateUrl),
                hasProviderLogo: !!(course.providerLogo?.logoUrl),
                skillsCount: course.skillsLearned.length,
                displayOrder: course.displayOrder,
                isArchived: course.isArchived,
                archivedAt: course.archivedAt,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get course by ID failed', {
                error: error.message,
                courseId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update course
     */
    static async updateCourse(
        courseId: string,
        userId: string,
        updates: UpdateCourseData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating course', {
                courseId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            const course = await Course.findActiveById(courseId, userId);

            if (!course) {
                throw new Error('Course not found');
            }

            // Validate skills if provided
            if (updates.skillsLearned && updates.skillsLearned.length > 0) {
                const skills = await Skill.find({
                    skillId: { $in: updates.skillsLearned },
                    userId,
                    isDeleted: false,
                });

                if (skills.length !== updates.skillsLearned.length) {
                    throw new Error('One or more skill IDs are invalid');
                }
            }

            // Apply updates
            if (updates.courseName !== undefined) {
                course.courseName = updates.courseName.trim();
            }
            if (updates.courseNumber !== undefined) {
                course.courseNumber = updates.courseNumber ? updates.courseNumber.trim() : undefined;
            }
            if (updates.associatedSchool !== undefined) {
                course.associatedSchool = updates.associatedSchool.trim();
            }
            if (updates.completionDate !== undefined) {
                course.completionDate = updates.completionDate;
            }
            if (updates.description !== undefined) {
                course.description = updates.description ? updates.description.trim() : undefined;
            }
            if (updates.skillsLearned !== undefined) {
                course.skillsLearned = updates.skillsLearned;
            }

            await course.save();

            LoggerUtil.info('Course updated successfully', {
                courseId,
                userId,
                correlationId,
            });

            return {
                courseId: course.courseId,
                userId: course.userId,
                courseName: course.courseName,
                courseNumber: course.courseNumber,
                associatedSchool: course.associatedSchool,
                completionDate: course.completionDate,
                description: course.description,
                skillsLearned: course.skillsLearned,
                hasCertificate: !!(course.certificate?.certificateUrl),
                hasProviderLogo: !!(course.providerLogo?.logoUrl),
                displayOrder: course.displayOrder,
                createdAt: course.createdAt,
                updatedAt: course.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update course failed', {
                error: error.message,
                courseId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete course (soft delete or permanent)
     */
    static async deleteCourse(courseId: string, userId: string, permanent: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting course', {
                courseId,
                userId,
                permanent,
                correlationId,
            });

            const course = await Course.findActiveById(courseId, userId);

            if (!course) {
                throw new Error('Course not found');
            }

            if (permanent) {
                // Delete certificate from Cloudinary
                if (course.certificate?.certificatePublicId) {
                    try {
                        const resourceType = course.certificate.fileType === 'pdf' ? 'raw' : 'image';
                        await cloudinary.uploader.destroy(course.certificate.certificatePublicId, {
                            resource_type: resourceType,
                        });
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete certificate (non-critical)', {
                            error: err.message,
                        });
                    }
                }

                // Delete provider logo
                if (course.providerLogo?.logoPublicId) {
                    try {
                        await cloudinary.uploader.destroy(course.providerLogo.logoPublicId);
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete logo (non-critical)', {
                            error: err.message,
                        });
                    }
                }

                // Permanent delete
                await Course.deleteOne({ courseId, userId });

                // Remove from user model
                await User.findOneAndUpdate(
                    { userId },
                    { $pull: { coursesIds: courseId } },
                    { new: true }
                );

                LoggerUtil.info('Course permanently deleted', {
                    courseId,
                    userId,
                    correlationId,
                });

                return {
                    courseId,
                    message: 'Course permanently deleted',
                };
            } else {
                // Soft delete
                course.isDeleted = true;
                course.deletedAt = new Date();
                await course.save();

                LoggerUtil.info('Course soft deleted', {
                    courseId,
                    userId,
                    correlationId,
                });

                return {
                    courseId,
                    deletedAt: course.deletedAt,
                    message: 'Course deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete course failed', {
                error: error.message,
                courseId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive course
     */
    static async archiveCourse(courseId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving course', {
                courseId,
                userId,
                correlationId,
            });

            const course = await Course.findActiveById(courseId, userId);

            if (!course) {
                throw new Error('Course not found');
            }

            if (course.isArchived) {
                throw new Error('Course is already archived');
            }

            course.isArchived = true;
            course.archivedAt = new Date();
            await course.save();

            LoggerUtil.info('Course archived successfully', {
                courseId,
                userId,
                correlationId,
            });

            return {
                courseId: course.courseId,
                isArchived: course.isArchived,
                archivedAt: course.archivedAt,
                message: 'Course archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive course failed', {
                error: error.message,
                courseId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived/deleted course
     */
    static async restoreCourse(courseId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring course', {
                courseId,
                userId,
                correlationId,
            });

            const course = await Course.findOne({
                courseId,
                userId,
            });

            if (!course) {
                throw new Error('Course not found');
            }

            if (!course.isArchived && !course.isDeleted) {
                throw new Error('Course is not archived or deleted');
            }

            course.isArchived = false;
            course.archivedAt = undefined;
            course.isDeleted = false;
            course.deletedAt = undefined;
            await course.save();

            LoggerUtil.info('Course restored successfully', {
                courseId,
                userId,
                correlationId,
            });

            return {
                courseId: course.courseId,
                isArchived: course.isArchived,
                isDeleted: course.isDeleted,
                message: 'Course restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore course failed', {
                error: error.message,
                courseId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder courses
     */
    static async reorderCourses(userId: string, courseIds: string[]): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Reordering courses', {
                userId,
                count: courseIds.length,
                correlationId,
            });

            // Validate all courses belong to user
            const courses = await Course.find({
                courseId: { $in: courseIds },
                userId,
                isDeleted: false,
            });

            if (courses.length !== courseIds.length) {
                throw new Error('One or more course IDs are invalid');
            }

            await Course.reorderCourses(userId, courseIds);

            LoggerUtil.info('Courses reordered successfully', {
                userId,
                count: courseIds.length,
                correlationId,
            });

            return {
                message: 'Courses reordered successfully',
                count: courseIds.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder courses failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    // ==================== CLOUDINARY HELPERS ====================

    private static async uploadImageToCloudinary(buffer: Buffer, userId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'course-certificates',
                    public_id: `${userId}_${Date.now()}`,
                    resource_type: 'image',
                    transformation: [
                        { width: 1200, height: 1200, crop: 'limit' },
                        { quality: 'auto:good' },
                    ],
                    overwrite: true,
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(buffer);
        });
    }

    private static async uploadPDFToCloudinary(buffer: Buffer, userId: string, fileName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'course-certificates',
                    public_id: `${userId}_${Date.now()}_${fileName}`,
                    resource_type: 'raw',
                    overwrite: true,
                },
                (error, result) => {
                    if (error) return reject(error);
                    resolve(result);
                }
            );
            uploadStream.end(buffer);
        });
    }
}

export default CourseService;