console.log('🔍 passport.config.ts LOADING START');
import { v4 as uuidv4 } from 'uuid';
import passport from 'passport';
import { User } from '@/auth/models';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import userEmitter from '@/shared/events/emitters/user.emitter';

function isValidCredential(value: string | undefined): boolean {
    if (!value) return false;
    if (value.includes('YAHAN')) return false;
    if (value.includes('NAYA_')) return false;
    return true;
}

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL;

if (isValidCredential(googleClientId) && isValidCredential(googleClientSecret) && isValidCredential(googleCallbackUrl)) {
    passport.use(new GoogleStrategy({
        clientID: googleClientId!,
        clientSecret: googleClientSecret!,
        callbackURL: googleCallbackUrl!,
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            const email = profile.emails?.[0]?.value;
            if (!email) return done(new Error('No email from Google'), false);

            let user = await User.findOne({ email: email.toLowerCase() });

            if (user) {
                const hasGoogle = user.oauthProviders?.find(p => p.provider === 'google');
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
                return done(null, user);
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
                oauthProviders: [{
                    provider: 'google',
                    providerId: profile.id,
                    connectedAt: new Date(),
                }],
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

            return done(null, user);

        } catch (error: any) {
            return done(error, false);
        }
    }));
} else {
    console.warn('Google OAuth skipped: credentials missing or placeholder');
}

// ==================== GITHUB STRATEGY ====================

const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL;

if (isValidCredential(githubClientId) && isValidCredential(githubClientSecret) && isValidCredential(githubCallbackUrl)) {
    passport.use(new GitHubStrategy({
        clientID: githubClientId!,
        clientSecret: githubClientSecret!,
        callbackURL: githubCallbackUrl!,
        scope: ['user:email'],
    }, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
            const emails = profile.emails || [];
            const primaryEmail = emails.find((e: any) => e.primary)?.value
                || emails[0]?.value;

            if (!primaryEmail) {
                return done(new Error('No email found. Please make your GitHub email public.'), false);
            }

            let user = await User.findOne({ email: primaryEmail.toLowerCase() });

            if (user) {
                const hasGithub = user.oauthProviders?.find(p => p.provider === 'github');
                if (!hasGithub) {
                    user.oauthProviders = user.oauthProviders || [];
                    user.oauthProviders.push({
                        provider: 'github',
                        providerId: profile.id,
                        connectedAt: new Date(),
                    });
                    await user.save();
                }
                (user as any).isNewUser = false;
                return done(null, user);
            }

            const displayName = profile.displayName || profile.username || '';
            const nameParts = displayName.split(' ');
            const firstName = nameParts[0] || profile.username || 'User';
            const lastName = nameParts.slice(1).join(' ') || '';

            user = new User({
                userId: uuidv4(),
                email: primaryEmail.toLowerCase(),
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
                oauthProviders: [{
                    provider: 'github',
                    providerId: profile.id,
                    connectedAt: new Date(),
                }],
            });

            await user.save();
            (user as any).isNewUser = true;
            return done(null, user);

        } catch (error: any) {
            return done(error, false);
        }
    }));
} else {
    console.warn('GitHub OAuth skipped: credentials missing or placeholder');
}

export default passport;

console.log('🔍 passport.config.ts LOADING END');