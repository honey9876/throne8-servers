/**
 * Contact Service - Business Logic for Contact Information
 * Handles contact CRUD operations with privacy controls
 * 
 * @module services/contact.service
 * @version 1.0.0
 */

import { Contact, User } from '@/shared/models/index.models';
import { LoggerUtil } from '@/shared/logger.util';
import Constants from '@/shared/constants.util';
import { v4 as uuidv4 } from 'uuid';

// ==================== INTERFACES ====================

interface IPhone {
    phoneNumber: string;
    type: 'mobile' | 'home' | 'work';
    isPrimary: boolean;
    countryCode?: string;
}

interface IWebsite {
    url: string;
    type: 'personal' | 'company' | 'portfolio' | 'blog' | 'social' | 'other';
    label?: string;
}

interface IAddress {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    postalCode?: string;
    fullAddress?: string;
}

interface IBirthday {
    day: number;
    month: number;
    year?: number;
    hideYear: boolean;
}

interface CreateContactData {
    userId: string;
    profileUrl?: string;
    phones?: IPhone[];
    birthday?: IBirthday;
    address?: IAddress;
    websites?: IWebsite[];
    privacy?: {
        phoneVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        birthdayVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        addressVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        phoneDiscovery?: 'anyone' | 'connections_only' | 'no_one';
        contactButtonVisibility?: 'public' | 'connections' | 'private' | 'me_only';
    };
}

interface UpdateContactData {
    profileUrl?: string;
    phones?: IPhone[];
    birthday?: IBirthday;
    address?: IAddress;
    websites?: IWebsite[];
    privacy?: {
        phoneVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        birthdayVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        addressVisibility?: 'public' | 'connections' | 'private' | 'me_only';
        phoneDiscovery?: 'anyone' | 'connections_only' | 'no_one';
        contactButtonVisibility?: 'public' | 'connections' | 'private' | 'me_only';
    };
}

// ==================== CONTACT SERVICE CLASS ====================

class ContactService {

    /**
     * ✅ Create new contact
     */
    static async createContact(data: CreateContactData): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Creating new contact', {
                userId: data.userId,
                profileUrl: data.profileUrl,
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

            // Step 2: Check if contact already exists
            const existingContact = await Contact.findByUserId(data.userId);
            if (existingContact) {
                throw new Error('Contact information already exists for this user');
            }

            // Step 3: Validate profile URL availability
            if (data.profileUrl) {
                const isAvailable = await Contact.checkProfileUrlAvailability(data.profileUrl);
                if (!isAvailable) {
                    throw new Error('Profile URL is already taken');
                }

                // Check against reserved usernames
                if (Constants.CONTACT_VALIDATION.PROFILE_URL.RESERVED_USERNAMES.includes(data.profileUrl.toLowerCase())) {
                    throw new Error('Profile URL is reserved and cannot be used');
                }
            }

            // Step 4: Create contact document
            const contact = new Contact({
                contactId: uuidv4(),
                userId: data.userId,
                profileUrl: data.profileUrl?.toLowerCase(),
                phones: data.phones || [],
                birthday: data.birthday,
                address: data.address,
                websites: data.websites || [],
                privacy: {
                    phoneVisibility: data.privacy?.phoneVisibility || 'connections',
                    birthdayVisibility: data.privacy?.birthdayVisibility || 'connections',
                    addressVisibility: data.privacy?.addressVisibility || 'private',
                    phoneDiscovery: data.privacy?.phoneDiscovery || 'connections_only',
                    contactButtonVisibility: data.privacy?.contactButtonVisibility || 'public',
                },
            });

            await contact.save();

            // Step 5: Update user model with contactId
            user.contactId = contact.contactId;
            await user.save();

            LoggerUtil.info('Contact created successfully', {
                contactId: contact.contactId,
                userId: data.userId,
                correlationId,
            });

            // Step 6: Return formatted response
            return this.formatContactResponse(contact);

        } catch (error: any) {
            LoggerUtil.error('Contact creation failed', {
                error: error.message,
                stack: error.stack,
                userId: data.userId,
                correlationId,
            });

            throw error;
        }
    }

    /**
     * ✅ Get contact by userId
     */
    static async getContactByUserId(userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching contact by userId', {
                userId,
                correlationId,
            });

            // Validate user exists
            const user = await User.findOne({ userId });
            if (!user) {
                throw new Error('User not found');
            }

            // Get contact
            const contact = await Contact.findByUserId(userId);

            if (!contact) {
                throw new Error('Contact information not found');
            }

            LoggerUtil.info('Contact fetched successfully', {
                contactId: contact.contactId,
                userId,
                correlationId,
            });

            return this.formatContactResponse(contact);

        } catch (error: any) {
            LoggerUtil.error('Get contact by userId failed', {
                error: error.message,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Get contact by contactId
     */
    static async getContactById(contactId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Fetching contact by ID', {
                contactId,
                userId,
                correlationId,
            });

            // Find contact
            const contact = await Contact.findActiveById(contactId, userId);

            if (!contact) {
                throw new Error('Contact not found');
            }

            LoggerUtil.info('Contact fetched successfully', {
                contactId,
                userId,
                correlationId,
            });

            return this.formatContactResponse(contact);

        } catch (error: any) {
            LoggerUtil.error('Get contact by ID failed', {
                error: error.message,
                contactId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Update contact
     */
    static async updateContact(
        contactId: string,
        userId: string,
        updates: UpdateContactData
    ): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Updating contact', {
                contactId,
                userId,
                updates: Object.keys(updates),
                correlationId,
            });

            // Find contact
            const contact = await Contact.findActiveById(contactId, userId);

            if (!contact) {
                throw new Error('Contact not found');
            }

            // Validate profile URL if being updated
            if (updates.profileUrl !== undefined) {
                if (updates.profileUrl) {
                    const isAvailable = await Contact.checkProfileUrlAvailability(
                        updates.profileUrl,
                        contactId
                    );
                    if (!isAvailable) {
                        throw new Error('Profile URL is already taken');
                    }

                    if (Constants.CONTACT_VALIDATION.PROFILE_URL.RESERVED_USERNAMES.includes(updates.profileUrl.toLowerCase())) {
                        throw new Error('Profile URL is reserved and cannot be used');
                    }

                    contact.profileUrl = updates.profileUrl.toLowerCase();
                } else {
                    contact.profileUrl = undefined;
                }
            }

            // Update fields
            if (updates.phones !== undefined) {
                contact.phones = updates.phones;
            }
            if (updates.birthday !== undefined) {
                contact.birthday = updates.birthday;
            }
            if (updates.address !== undefined) {
                contact.address = updates.address;
            }
            if (updates.websites !== undefined) {
                contact.websites = updates.websites;
            }
            if (updates.privacy) {
                contact.privacy = {
                    ...contact.privacy,
                    ...updates.privacy,
                };
            }

            await contact.save();

            LoggerUtil.info('Contact updated successfully', {
                contactId,
                userId,
                correlationId,
            });

            return this.formatContactResponse(contact);

        } catch (error: any) {
            LoggerUtil.error('Update contact failed', {
                error: error.message,
                contactId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Delete contact (soft delete)
     */
    static async deleteContact(contactId: string, userId: string, permanent: boolean = false): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Deleting contact', {
                contactId,
                userId,
                permanent,
                correlationId,
            });

            // Find contact
            const contact = await Contact.findOne({
                contactId,
                userId,
            });

            if (!contact) {
                throw new Error('Contact not found');
            }

            if (permanent) {
                // Permanent delete
                await Contact.deleteOne({ contactId, userId });

                // Remove contactId from user
                await User.updateOne(
                    { userId },
                    { $unset: { contactId: 1 } }
                );

                LoggerUtil.info('Contact permanently deleted', {
                    contactId,
                    userId,
                    correlationId,
                });

                return {
                    contactId,
                    deletedAt: new Date(),
                    permanent: true,
                    message: 'Contact permanently deleted',
                };
            } else {
                // Soft delete
                contact.isDeleted = true;
                contact.deletedAt = new Date();
                await contact.save();

                LoggerUtil.info('Contact soft deleted', {
                    contactId,
                    userId,
                    correlationId,
                });

                return {
                    contactId,
                    deletedAt: contact.deletedAt,
                    permanent: false,
                    message: 'Contact deleted successfully',
                };
            }

        } catch (error: any) {
            LoggerUtil.error('Delete contact failed', {
                error: error.message,
                contactId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Archive contact
     */
    static async archiveContact(contactId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Archiving contact', {
                contactId,
                userId,
                correlationId,
            });

            const contact = await Contact.findActiveById(contactId, userId);

            if (!contact) {
                throw new Error('Contact not found');
            }

            if (contact.isArchived) {
                throw new Error('Contact is already archived');
            }

            contact.isArchived = true;
            contact.archivedAt = new Date();
            await contact.save();

            LoggerUtil.info('Contact archived successfully', {
                contactId,
                userId,
                correlationId,
            });

            return {
                contactId: contact.contactId,
                isArchived: contact.isArchived,
                archivedAt: contact.archivedAt,
                message: 'Contact archived successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Archive contact failed', {
                error: error.message,
                contactId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Restore archived contact
     */
    static async restoreContact(contactId: string, userId: string): Promise<any> {
        const correlationId = uuidv4();

        try {
            LoggerUtil.info('Restoring contact', {
                contactId,
                userId,
                correlationId,
            });

            const contact = await Contact.findOne({
                contactId,
                userId,
                isDeleted: false,
            });

            if (!contact) {
                throw new Error('Contact not found');
            }

            if (!contact.isArchived) {
                throw new Error('Contact is not archived');
            }

            contact.isArchived = false;
            contact.archivedAt = undefined;
            await contact.save();

            LoggerUtil.info('Contact restored successfully', {
                contactId,
                userId,
                correlationId,
            });

            return {
                contactId: contact.contactId,
                isArchived: contact.isArchived,
                message: 'Contact restored successfully',
            };

        } catch (error: any) {
            LoggerUtil.error('Restore contact failed', {
                error: error.message,
                contactId,
                userId,
                correlationId,
            });
            throw error;
        }
    }

    /**
     * ✅ Format contact response
     */
    private static formatContactResponse(contact: any): any {
        return {
            contactId: contact.contactId,
            userId: contact.userId,
            profileUrl: contact.profileUrl,
            phones: contact.phones,
            primaryPhone: contact.primaryPhone,
            birthday: contact.birthday,
            age: contact.age,
            address: contact.address,
            websites: contact.websites,
            privacy: contact.privacy,
            isArchived: contact.isArchived,
            archivedAt: contact.archivedAt,
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
        };
    }
}

export default ContactService;