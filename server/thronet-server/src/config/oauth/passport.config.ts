import { v4 as uuidv4 } from 'uuid';
import passport from 'passport';
import { User } from '@/auth/models';
import { Strategy as GitHubStrategy } from 'passport-github2';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import userEmitter from '@/shared/events/emitters/user.emitter';

// Only register OAuth strategies if ENABLE_OAUTH=true and credentials exist
if (process.env.ENABLE_OAUTH === 'true' && process.env.GOOGLE_CLIENT_ID) {
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackURL: process.env.GOOGLE_CALLBACK_URL!,
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error('No email from Google'), false);

        // Existing user check karo
        let user = await User.findOne({ email: email.toLowerCase() });

        if (user) {
            // OAuth provider add karo agar nahi hai
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

        // Naya user banao — yahan required fields ke liye defaults denge
        const nameParts = profile.displayName?.split(' ') || [];
        const firstName = nameParts[0] || 'User';
        const lastName = nameParts.slice(1).join(' ') || '';

        user = new User({
            userId: uuidv4(),
            email: email.toLowerCase(),
            firstName,
            lastName,
            location: 'Mumbai', // default — baad mein update karega user
            emailVerified: true, // Google ne verify kiya hai
            emailVerifiedAt: new Date(),
            status: 'active',
            role: 'user',
            // password required nahi — OAuth user ke liye
            onboarding: {
                userType: 'fresher', // default — onboarding flow mein change hoga
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
} // end Google strategy guard

// ==================== GITHUB STRATEGY ====================
// Google strategy ke BAAD add karo

if (process.env.ENABLE_OAUTH === 'true' && process.env.GITHUB_CLIENT_ID) {
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID!,
    clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    callbackURL: process.env.GITHUB_CALLBACK_URL!,
    scope: ['user:email'],
}, async (accessToken: string, refreshToken: string, profile: any, done: any) => {
    try {
        // GitHub par email public nahi hoti — emails array check karo
        const emails = profile.emails || [];
        const primaryEmail = emails.find((e: any) => e.primary)?.value
            || emails[0]?.value;

        if (!primaryEmail) {
            return done(new Error('No email found. Please make your GitHub email public.'), false);
        }

        // Existing user check karo
        let user = await User.findOne({ email: primaryEmail.toLowerCase() });

        if (user) {
            // GitHub provider add karo agar nahi hai
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

        // Naya user banao
        const displayName = profile.displayName || profile.username || '';
        const nameParts = displayName.split(' ');
        const firstName = nameParts[0] || profile.username || 'User';
        const lastName = nameParts.slice(1).join(' ') || '';

        user = new User({
            userId: uuidv4(),
            email: primaryEmail.toLowerCase(),
            firstName,
            lastName,
            location: 'Mumbai',       // onboarding mein lenge
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
} // end GitHub strategy guard

export default passport;