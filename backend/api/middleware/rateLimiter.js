import rateLimit from 'express-rate-limit';

export const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 min
    max: 100,
    message: { status: "Error", message: "Too many requests, try again later"}
});

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 10,
    message: { status: "Error", message: "Too many login attempts, try again later"}
});

export const logoutLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 min
    max: 30,
    message: { status: "Error", message: "Too many logout requests, try again later"}
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hr
    max: 5,
    message: { status: "Error", message: "Too many created users, try again later"}
});
