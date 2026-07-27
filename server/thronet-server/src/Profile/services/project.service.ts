/**
 * Project Service - Business Logic for Projects Management
 * 
 * @module services/project.service
 * @version 1.0.0
 */

import { Project, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import { v4 as uuidv4 } from 'uuid';
import cloudinary from '@/config/images/store/cloudinary/cloudinary.config';

// ==================== INTERFACES ====================

interface CreateProjectData {
    userId: string;
    projectName: string;
    projectDescription: string;
    startDate: string | Date;
    endDate?: string | Date;
    isCurrentlyWorking?: boolean;
    projectUrl?: string;
    associatedWith?: {
        type: 'company' | 'school';
        name: string;
        organizationId?: string;
    };
    skillsUsed?: string[];
}

interface UpdateProjectData {
    projectName?: string;
    projectDescription?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    isCurrentlyWorking?: boolean;
    projectUrl?: string;
    associatedWith?: {
        type: 'company' | 'school';
        name: string;
        organizationId?: string;
    };
    isVisible?: boolean;
    skillsUsed?: string[];
}

interface AddTeamMemberData {
    memberName: string;
    memberLinkedInUrl?: string;
}

interface MediaAttachment {
    mediaType: 'image' | 'video' | 'document';
    caption?: string;
}

// ==================== PROJECT SERVICE ====================

class ProjectService {

    /**
     * ✅ Create Project
     */
    static async createProject(data: CreateProjectData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new project', {
                userId: data.userId,
                projectName: data.projectName,
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

            // Check project limit (100 max)
            const projectCount = await Project.getUserProjectCount(data.userId);
            if (projectCount >= 100) {
                throw new Error('Maximum project limit (100) reached');
            }

            // Get next display order
            const displayOrder = await Project.getNextDisplayOrder(data.userId);

            // Parse dates
            const startDate = new Date(data.startDate);
            const endDate = data.endDate && !data.isCurrentlyWorking ? new Date(data.endDate) : undefined;

            // Create project
            const project = new Project({
                projectId: uuidv4(),
                userId: data.userId,
                projectName: data.projectName.trim(),
                projectDescription: data.projectDescription.trim(),
                startDate,
                endDate,
                isCurrentlyWorking: data.isCurrentlyWorking || false,
                projectUrl: data.projectUrl?.trim(),
                associatedWith: data.associatedWith,
                skillsUsed: data.skillsUsed || [],
                teamMembers: [],
                mediaAttachments: [],
                displayOrder,
                isVisible: true,
                isPinned: false,
            });

            await project.save();

            // Update user's projects array
            await User.findOneAndUpdate(
                { userId: data.userId },
                { $push: { projects: project.projectId } },
                { new: true }
            );

            LoggerUtil.info('Project created successfully', {
                projectId: project.projectId,
                userId: data.userId,
                correlationId,
            });

            return {
                projectId: project.projectId,
                userId: project.userId,
                projectName: project.projectName,
                projectDescription: project.projectDescription,
                startDate: project.startDate,
                endDate: project.endDate,
                isCurrentlyWorking: project.isCurrentlyWorking,
                projectUrl: project.projectUrl,
                associatedWith: project.associatedWith,
                skillsUsed: project.skillsUsed,
                teamSize: 0,
                mediaCount: 0,
                displayOrder: project.displayOrder,
                isPinned: project.isPinned,
                isVisible: project.isVisible,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Project creation failed', {
                error: error.message,
                userId: data.userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get All Projects
     */
    static async getAllProjects(userId: string, includeArchived: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching all projects', {
                userId,
                includeArchived,
                correlationId,
            });

            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            const projects = await Project.findByUserId(userId, includeArchived);

            const pinnedProjects = projects.filter(p => p.isPinned);
            const regularProjects = projects.filter(p => !p.isPinned);

            return {
                projects,
                total: projects.length,
                pinnedProjects,
                regularProjects,
            };

        } catch (error: any) {
            LoggerUtil.error('Get all projects failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get Project by ID
     */
    static async getProjectById(projectId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            return {
                projectId: project.projectId,
                userId: project.userId,
                projectName: project.projectName,
                projectDescription: project.projectDescription,
                startDate: project.startDate,
                endDate: project.endDate,
                isCurrentlyWorking: project.isCurrentlyWorking,
                duration: (project as any).duration,
                projectUrl: project.projectUrl,
                associatedWith: project.associatedWith,
                teamMembers: project.teamMembers,
                teamSize: (project as any).teamSize,
                skillsUsed: project.skillsUsed,
                mediaAttachments: project.mediaAttachments,
                mediaCount: project.mediaAttachments.length,
                isPinned: project.isPinned,
                pinnedOrder: project.pinnedOrder,
                displayOrder: project.displayOrder,
                isVisible: project.isVisible,
                isArchived: project.isArchived,
                lastEditedAt: project.lastEditedAt,
                createdAt: project.createdAt,
                updatedAt: project.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Get project by ID failed', {
                error: error.message,
                projectId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update Project
     */
    static async updateProject(projectId: string, userId: string, updates: UpdateProjectData): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            // Apply updates
            if (updates.projectName !== undefined) {
                project.projectName = updates.projectName.trim();
            }
            if (updates.projectDescription !== undefined) {
                project.projectDescription = updates.projectDescription.trim();
            }
            if (updates.startDate !== undefined) {
                project.startDate = new Date(updates.startDate);
            }
            if (updates.endDate !== undefined) {
                project.endDate = new Date(updates.endDate);
            }
            if (updates.isCurrentlyWorking !== undefined) {
                project.isCurrentlyWorking = updates.isCurrentlyWorking;
            }
            if (updates.projectUrl !== undefined) {
                project.projectUrl = updates.projectUrl?.trim();
            }
            if (updates.associatedWith !== undefined) {
                project.associatedWith = updates.associatedWith;
            }
            if (updates.isVisible !== undefined) {
                project.isVisible = updates.isVisible;
            }
            if (updates.skillsUsed !== undefined) {
                project.skillsUsed = updates.skillsUsed;
            }

            await project.save();

            return {
                projectId: project.projectId,
                projectName: project.projectName,
                projectDescription: project.projectDescription,
                startDate: project.startDate,
                endDate: project.endDate,
                isCurrentlyWorking: project.isCurrentlyWorking,
                projectUrl: project.projectUrl,
                associatedWith: project.associatedWith,
                skillsUsed: project.skillsUsed,
                isVisible: project.isVisible,
                updatedAt: project.updatedAt,
            };

        } catch (error: any) {
            LoggerUtil.error('Update project failed', {
                error: error.message,
                projectId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Project
     */
    static async deleteProject(projectId: string, userId: string, permanent: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            // Delete media from Cloudinary
            for (const media of project.mediaAttachments) {
                if (media.mediaPublicId) {
                    try {
                        const resourceType = media.mediaType === 'image' ? 'image' : media.mediaType === 'video' ? 'video' : 'raw';
                        await cloudinary.uploader.destroy(media.mediaPublicId, {
                            resource_type: resourceType,
                        });
                    } catch (err: any) {
                        LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                    }
                }
            }

            if (permanent) {
                await Project.deleteOne({ projectId, userId });

                // Remove from user's projects array
                await User.findOneAndUpdate(
                    { userId },
                    { $pull: { projects: projectId } },
                    { new: true }
                );

                return {
                    projectId,
                    message: 'Project permanently deleted',
                };
            } else {
                project.isDeleted = true;
                project.deletedAt = new Date();
                project.isPinned = false;
                project.pinnedOrder = undefined;
                await project.save();

                return {
                    projectId,
                    deletedAt: project.deletedAt,
                    message: 'Project deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete project failed', {
                error: error.message,
                projectId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive Project
     */
    static async archiveProject(projectId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            if (project.isArchived) {
                throw new Error('Project is already archived');
            }

            project.isArchived = true;
            project.archivedAt = new Date();
            project.isPinned = false;
            project.pinnedOrder = undefined;
            await project.save();

            return {
                projectId: project.projectId,
                isArchived: project.isArchived,
                archivedAt: project.archivedAt,
                message: 'Project archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive project failed', {
                error: error.message,
                projectId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore Project
     */
    static async restoreProject(projectId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findOne({
                projectId,
                userId,
            });

            if (!project) {
                throw new Error('Project not found');
            }

            if (project.isDeleted) {
                project.isDeleted = false;
                project.deletedAt = undefined;
            }

            if (project.isArchived) {
                project.isArchived = false;
                project.archivedAt = undefined;
            }

            await project.save();

            return {
                projectId: project.projectId,
                isDeleted: project.isDeleted,
                isArchived: project.isArchived,
                message: 'Project restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore project failed', {
                error: error.message,
                projectId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Add Team Member
     */
    static async addTeamMember(projectId: string, userId: string, memberData: AddTeamMemberData): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            if (project.teamMembers.length >= 50) {
                throw new Error('Maximum 50 team members allowed');
            }

            const member = {
                memberId: uuidv4(),
                memberName: memberData.memberName.trim(),
                memberLinkedInUrl: memberData.memberLinkedInUrl?.trim(),
                addedAt: new Date(),
            };

            project.teamMembers.push(member as any);
            await project.save();

            return {
                projectId: project.projectId,
                teamMember: member,
                teamSize: project.teamMembers.length,
                message: 'Team member added successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Add team member failed', {
                error: error.message,
                projectId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Remove Team Member
     */
    static async removeTeamMember(projectId: string, userId: string, memberId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            const memberIndex = project.teamMembers.findIndex(m => m.memberId === memberId);
            if (memberIndex === -1) {
                throw new Error('Team member not found');
            }

            project.teamMembers.splice(memberIndex, 1);
            await project.save();

            return {
                projectId: project.projectId,
                memberId,
                teamSize: project.teamMembers.length,
                message: 'Team member removed successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Remove team member failed', {
                error: error.message,
                projectId,
                memberId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Upload Media Attachment
     */
    static async uploadMediaAttachment(
        projectId: string,
        userId: string,
        file: Express.Multer.File,
        metadata: MediaAttachment
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            if (project.mediaAttachments.length >= 20) {
                throw new Error('Maximum 20 media attachments allowed');
            }

            let uploadResult: any;

            if (metadata.mediaType === 'image') {
                uploadResult = await this.uploadImageToCloudinary(file.buffer, userId);
            } else if (metadata.mediaType === 'video') {
                uploadResult = await this.uploadVideoToCloudinary(file.buffer, userId);
            } else if (metadata.mediaType === 'document') {
                uploadResult = await this.uploadDocumentToCloudinary(file.buffer, userId, file.originalname);
            } else {
                throw new Error('Invalid media type');
            }

            const mediaId = uuidv4();
            project.mediaAttachments.push({
                mediaId,
                mediaType: metadata.mediaType,
                mediaUrl: uploadResult.url,
                mediaSecureUrl: uploadResult.secure_url,
                mediaPublicId: uploadResult.public_id,
                fileName: file.originalname,
                fileSize: uploadResult.bytes,
                mimeType: file.mimetype,
                caption: metadata.caption,
                uploadedAt: new Date(),
            } as any);

            await project.save();

            return {
                projectId: project.projectId,
                mediaAttachment: project.mediaAttachments[project.mediaAttachments.length - 1],
                mediaCount: project.mediaAttachments.length,
                message: 'Media uploaded successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Upload media failed', {
                error: error.message,
                projectId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete Media Attachment
     */
    static async deleteMediaAttachment(projectId: string, userId: string, mediaId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            const mediaIndex = project.mediaAttachments.findIndex(m => m.mediaId === mediaId);
            if (mediaIndex === -1) {
                throw new Error('Media attachment not found');
            }

            const media = project.mediaAttachments[mediaIndex];

            if (media.mediaPublicId) {
                try {
                    const resourceType = media.mediaType === 'image' ? 'image' : media.mediaType === 'video' ? 'video' : 'raw';
                    await cloudinary.uploader.destroy(media.mediaPublicId, {
                        resource_type: resourceType,
                    });
                } catch (err: any) {
                    LoggerUtil.warn('Failed to delete media (non-critical)', { error: err.message });
                }
            }

            project.mediaAttachments.splice(mediaIndex, 1);
            await project.save();

            return {
                projectId: project.projectId,
                mediaId,
                mediaCount: project.mediaAttachments.length,
                message: 'Media deleted successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Delete media failed', {
                error: error.message,
                projectId,
                mediaId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Reorder Projects
     */
    static async reorderProjects(userId: string, projectOrders: Array<{ projectId: string; displayOrder: number }>): Promise<any> {
        const correlationId = uuidv4();

        try {
            const updatePromises = projectOrders.map(async (order) => {
                const project = await Project.findActiveById(order.projectId, userId);
                if (project) {
                    project.displayOrder = order.displayOrder;
                    return project.save();
                }
            });

            await Promise.all(updatePromises);

            return {
                message: 'Projects reordered successfully',
                updatedCount: projectOrders.length,
            };

        } catch (error: any) {
            LoggerUtil.error('Reorder projects failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Pin Project
     */
    static async pinProject(projectId: string, userId: string, pinnedOrder?: number): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            if (project.isArchived) {
                throw new Error('Cannot pin archived project');
            }

            // If pinnedOrder specified, unpin existing project at that position
            if (pinnedOrder) {
                const existing = await Project.findOne({
                    userId,
                    isPinned: true,
                    pinnedOrder,
                    projectId: { $ne: projectId },
                    isDeleted: false,
                });

                if (existing) {
                    existing.isPinned = false;
                    existing.pinnedOrder = undefined;
                    await existing.save();
                }
            }

            project.isPinned = true;
            project.pinnedOrder = pinnedOrder;
            await project.save();

            return {
                projectId: project.projectId,
                isPinned: project.isPinned,
                pinnedOrder: project.pinnedOrder,
                message: 'Project pinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Pin project failed', {
                error: error.message,
                projectId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Unpin Project
     */
    static async unpinProject(projectId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            const project = await Project.findActiveById(projectId, userId);

            if (!project) {
                throw new Error('Project not found');
            }

            if (!project.isPinned) {
                throw new Error('Project is not pinned');
            }

            project.isPinned = false;
            project.pinnedOrder = undefined;
            await project.save();

            return {
                projectId: project.projectId,
                isPinned: project.isPinned,
                message: 'Project unpinned successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Unpin project failed', {
                error: error.message,
                projectId,
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
                    folder: 'project-images',
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

    private static async uploadVideoToCloudinary(buffer: Buffer, userId: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'project-videos',
                    public_id: `${userId}_${Date.now()}`,
                    resource_type: 'video',
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

    private static async uploadDocumentToCloudinary(buffer: Buffer, userId: string, fileName: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'project-documents',
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

export default ProjectService;