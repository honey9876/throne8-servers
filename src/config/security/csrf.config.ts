import csrf from 'csurf';
import { Request, Response, NextFunction } from 'express';

export const csrfProtection = csrf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
    },
});

// Sirf OAuth routes ke liye use hoga
export const oauthCsrfMiddleware = (req: Request, res: Response, next: NextFunction) => {
    csrfProtection(req, res, next);
};