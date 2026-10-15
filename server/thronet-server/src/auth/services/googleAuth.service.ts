import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import { User, UserProfile } from '@/auth/models';
import userEmitter from '@/shared/events/emitters/user.emitter';
import { LoggerUtil as logger } from '@/shared/logger.util';
import { UserType } from '../types/auth.types';
import {
    duplicateEmailError,
    duplicateKeyConflict,
    duplicatePhoneError,
    normalizeEmail,
    normalizePhone,
    phoneLookupVariants,
    RegistrationConflictError,
    RegistrationFieldError,
} from '../utils/registrationIdentity';

export interface GoogleTokenPayload {
    sub: string;
    email: string;
    email_verified?: boolean;
    name?: string;
    given_name?: string;
    family_name?: string;
    picture?: string;
    aud: string;
    exp?: number;
}

export interface GoogleVerifyResult {
    isNewUser: boolean;
    googleData?: {
        email: string;
        firstName: string;
        lastName: string;
        picture: string;
        providerId: string;
    };
    tokens?: {
        accessToken: string;
        refreshToken: string;
        expiresIn: string;
    };
    user?: {
        userId: string;
        email: string;
        role: string;
        firstName: string;
        lastName: string;
    };
}

export interface GoogleRegistrationData {
    idToken: string;
    userType?: UserType;
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
    location?: string;
    skills?: string[];
    // Working profile fields
    jobTitle?: string;
    companyName?: string;
    startDate?: string | Date;
    endDate?: string | Date;
    // Student profile fields
    collegeName?: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: string;
    // Fresher profile fields
    highestEducation?: string;
    preferredRole?: string;
    cgpa?: string;
}

export interface GoogleProfileInput {
    id: string;
    displayName?: string;
    emails?: Array<{ value: string; verified?: boolean }>;
    photos?: Array<{ value: string }>;
}

/**
 * Verify Google ID Token using google-auth-library OAuth2Client.
 * Ensures audience matches GOOGLE_CLIENT_ID.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
    if (!idToken) {
        throw new Error('idToken is required');
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const allowedAudiences = [
        clientId,
        process.env.GOOGLE_WEB_CLIENT_ID,
        process.env.GOOGLE_ANDROID_CLIENT_ID,
        process.env.GOOGLE_IOS_CLIENT_ID,
    ].filter(Boolean) as string[];

    try {
        const oauthClient = new OAuth2Client(clientId);
        const ticket = await oauthClient.verifyIdToken({
            idToken,
            audience: allowedAudiences.length > 0 ? allowedAudiences : clientId,
        });

        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            throw new Error('Invalid Google token payload: email missing');
        }

        return {
            sub: payload.sub,
            email: payload.email.toLowerCase(),
            email_verified: payload.email_verified,
            name: payload.name,
            given_name: payload.given_name,
            family_name: payload.family_name,
            picture: payload.picture,
            aud: payload.aud,
            exp: payload.exp,
        };
    } catch (libraryError: any) {
        if (libraryError.message && libraryError.message.includes('audience')) {
            logger.warn('Google token audience mismatch in OAuth2Client', { error: libraryError.message });
            throw new Error('Google token audience mismatch');
        }

        // Fallback to Google OAuth2 tokeninfo REST API
        try {
            const response = await axios.get<Record<string, any>>(
                `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
                { timeout: 10000 }
            );

            const data = response.data;
            if (!data || !data.email) {
                throw new Error('Invalid Google token payload: email missing');
            }

            if (allowedAudiences.length > 0 && !allowedAudiences.includes(data.aud)) {
                logger.warn('Google token audience mismatch', { aud: data.aud, allowedAudiences });
                throw new Error('Google token audience mismatch');
            }

            if (data.exp && Number(data.exp) * 1000 < Date.now()) {
                throw new Error('Google token has expired');
            }

            return {
                sub: data.sub,
                email: data.email.toLowerCase(),
                email_verified: data.email_verified === 'true' || data.email_verified === true,
                name: data.name,
                given_name: data.given_name,
                family_name: data.family_name,
                picture: data.picture,
                aud: data.aud,
                exp: Number(data.exp),
            };
        } catch (error: any) {
            logger.error('Google idToken verification failed', {
                error: error.response?.data || error.message || libraryError.message,
            });
            throw new Error(error.response?.data?.error_description || libraryError.message || error.message || 'Google token verification failed');
        }
    }
}

export class GoogleAuthService {
    /**
     * Verify Google ID Token using OAuth2Client / tokeninfo API.
     */
    static async verifyIdToken(idToken: string): Promise<GoogleTokenPayload> {
        return verifyGoogleIdToken(idToken);
    }

    /**
     * Native SDK Flow:
     * Verify Google ID token and return whether user is new or existing with tokens.
     */
    static async verifyOrAuthenticate(idToken: string): Promise<GoogleVerifyResult> {
        const payload = await this.verifyIdToken(idToken);
        const email = payload.email.toLowerCase();

        let user = await User.findOne({ email });

        if (!user) {
            return {
                isNewUser: true,
                googleData: {
                    email,
                    firstName: payload.given_name || payload.name?.split(' ')[0] || 'User',
                    lastName: payload.family_name || payload.name?.split(' ').slice(1).join(' ') || '',
                    picture: payload.picture || '',
                    providerId: payload.sub,
                },
            };
        }

        // Link Google provider if not already linked
        const hasGoogle = user.oauthProviders?.find((p: any) => p.provider === 'google');
        if (!hasGoogle) {
            user.oauthProviders = user.oauthProviders || [];
            user.oauthProviders.push({
                provider: 'google',
                providerId: payload.sub,
                connectedAt: new Date(),
            });
            await user.save();
        }

        const accessToken = User.generateAccessToken({
            userId: user.userId,
            role: user.role,
        });
        const refreshToken = User.generateRefreshToken({
            userId: user.userId,
            role: user.role,
        });

        return {
            isNewUser: false,
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: '7d',
            },
            user: {
                userId: user.userId,
                email: user.email,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName || "",
            },
        };
    }

    /**
     * Native SDK Flow:
     * Register a new user using verified Google account and onboarding data.
     */
    static async registerGoogleUser(registrationData: GoogleRegistrationData): Promise<GoogleVerifyResult> {
        const payload = await this.verifyIdToken(registrationData.idToken);
        const email = normalizeEmail(payload.email);
        const phoneNumber = registrationData.phoneNumber?.trim()
            ? normalizePhone(registrationData.phoneNumber)
            : undefined;

        const [existingEmail, existingPhone] = await Promise.all([
            User.findOne({ email }).collation({ locale: 'en', strength: 2 }).select('_id').lean().exec(),
            phoneNumber
                ? User.findOne({
                    phoneNumber: { $in: phoneLookupVariants(phoneNumber) },
                }).select('_id').lean().exec()
                : Promise.resolve(null),
        ]);
        const fieldErrors: RegistrationFieldError[] = [];
        if (existingEmail) fieldErrors.push(duplicateEmailError);
        if (existingPhone) fieldErrors.push(duplicatePhoneError);
        if (fieldErrors.length) throw new RegistrationConflictError(fieldErrors);

        const userId = uuidv4();
        const userType = registrationData.userType || 'fresher';
        const firstName = registrationData.firstName || payload.given_name || payload.name?.split(' ')[0] || 'User';
        const lastName = registrationData.lastName || payload.family_name || payload.name?.split(' ').slice(1).join(' ') || '';

        const user = new User({
            userId,
            email,
            firstName,
            lastName,
            role: 'user',
            emailVerified: true,
            emailVerifiedAt: new Date(),
            status: 'active',
            location: registrationData.location || 'India',
            ...(phoneNumber ? { phoneNumber } : {}),
            oauthProviders: [
                {
                    provider: 'google',
                    providerId: payload.sub,
                    connectedAt: new Date(),
                },
            ],
            onboarding: {
                userType,
                completedAt: new Date(),
                ...(userType === 'working' && {
                    workingProfile: {
                        jobTitle: registrationData.jobTitle || '',
                        companyName: registrationData.companyName || '',
                        startDate: registrationData.startDate ? new Date(registrationData.startDate) : new Date(),
                        endDate: registrationData.endDate ? new Date(registrationData.endDate) : undefined,
                    },
                }),
                ...(userType === 'student' && {
                    studentProfile: {
                        collegeName: registrationData.collegeName || '',
                        degree: registrationData.degree || '',
                        fieldOfStudy: registrationData.fieldOfStudy || '',
                        graduationYear: registrationData.graduationYear || '',
                    },
                }),
                ...(userType === 'fresher' && {
                    fresherProfile: {
                        highestEducation: registrationData.highestEducation || '',
                        preferredRole: registrationData.preferredRole || '',
                        cgpa: registrationData.cgpa || '',
                    },
                }),
            },
        });

        try {
            await user.save();
        } catch (error) {
            const conflict = duplicateKeyConflict(error);
            if (conflict) throw conflict;
            throw error;
        }

        // Create UserProfile document
        try {
            const usernameBase = (email.split('@')[0] || firstName).toLowerCase().replace(/[^a-z0-9_]/g, '');
            let username = usernameBase.length >= 3 ? usernameBase : `user_${userId.substring(0, 6)}`;
            if (typeof (UserProfile as any).generateUniqueUsername === 'function') {
                username = await (UserProfile as any).generateUniqueUsername(username);
            }

            await UserProfile.create({
                userId,
                username,
                displayName: `${firstName} ${lastName}`.trim() || username,
                bio: '',
                location: {
                    city: registrationData.location || 'India',
                    country: 'India',
                    timezone: 'Asia/Kolkata',
                },
                avatar: payload.picture ? { url: payload.picture } : undefined,
            });
        } catch (profileErr: any) {
            logger.warn('⚠️ UserProfile creation skipped or failed in Google registration:', {
                error: profileErr?.message,
            });
        }

        // Emit registration event
        userEmitter.emit('user:registered', {
            userId: user.userId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            location: user.location || 'Not specified',
            userType: user.onboarding?.userType || 'fresher',
            timestamp: new Date(),
        });

        const accessToken = User.generateAccessToken({
            userId: user.userId,
            role: user.role,
        });
        const refreshToken = User.generateRefreshToken({
            userId: user.userId,
            role: user.role,
        });

        return {
            isNewUser: false,
            tokens: {
                accessToken,
                refreshToken,
                expiresIn: '7d',
            },
            user: {
                userId: user.userId,
                email: user.email,
                role: user.role,
                firstName: user.firstName,
                lastName: user.lastName || "",
            },
        };
    }

    /**
     * Passport OAuth Strategy Callback Handler (Web Flow):
     * Handles Passport profile ingestion and user linking/creation.
     */
    static async handlePassportProfile(profile: GoogleProfileInput): Promise<{ user: any; isNewUser: boolean }> {
        const email = profile.emails?.[0]?.value;
        if (!email) {
            throw new Error('No email from Google');
        }

        let user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
            const hasGoogle = user.oauthProviders?.find((p: any) => p.provider === 'google');
            if (!hasGoogle) {
                user.oauthProviders = user.oauthProviders || [];
                user.oauthProviders.push({
                    provider: 'google',
                    providerId: profile.id,
                    connectedAt: new Date(),
                });
                await user.save();
            }
            (user as any).isNewUser = false;
            return { user, isNewUser: false };
        }

        const nameParts = profile.displayName?.split(' ') || [];
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || '';

        user = new User({
            userId: uuidv4(),
            email: email.toLowerCase(),
            firstName,
            lastName,
            location: 'Mumbai',
            emailVerified: true,
            emailVerifiedAt: new Date(),
            status: 'active',
            role: 'user',
            onboarding: {
                userType: 'fresher',
                completedAt: new Date(),
            },
            oauthProviders: [
                {
                    provider: 'google',
                    providerId: profile.id,
                    connectedAt: new Date(),
                },
            ],
        });

        await user.save();
        (user as any).isNewUser = true;

        userEmitter.emit('user:registered', {
            userId: user.userId,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            location: user.location || 'Not specified',
            userType: user.onboarding?.userType || 'fresher',
            timestamp: new Date(),
        });

        return { user, isNewUser: true };
    }

    /**
     * Link Google account to an existing authenticated user.
     */
    static async linkGoogleAccount(userId: string, idToken: string): Promise<boolean> {
        const payload = await this.verifyIdToken(idToken);

        const existingWithGoogle = await User.findOne({
            'oauthProviders.provider': 'google',
            'oauthProviders.providerId': payload.sub,
        });

        if (existingWithGoogle && existingWithGoogle.userId !== userId) {
            throw new Error('This Google account is already linked to another user');
        }

        const user = await User.findOne({ userId });
        if (!user) {
            throw new Error('User not found');
        }

        const hasGoogle = user.oauthProviders?.some((p: any) => p.provider === 'google');
        if (!hasGoogle) {
            user.oauthProviders = user.oauthProviders || [];
            user.oauthProviders.push({
                provider: 'google',
                providerId: payload.sub,
                connectedAt: new Date(),
            });
            await user.save();
        }

        return true;
    }

    /**
     * Unlink Google account from an existing authenticated user.
     */
    static async unlinkGoogleAccount(userId: string): Promise<boolean> {
        const user = await User.findOne({ userId });
        if (!user) {
            throw new Error('User not found');
        }

        const hasPassword = Boolean((user as any).password || (user as any).passwordHash);
        const otherProviders = user.oauthProviders?.filter((p: any) => p.provider !== 'google') || [];

        if (!hasPassword && otherProviders.length === 0) {
            throw new Error('Cannot unlink Google account without setting a password or connecting another login method');
        }

        user.oauthProviders = otherProviders;
        await user.save();

        return true;
    }
}

export default GoogleAuthService;
