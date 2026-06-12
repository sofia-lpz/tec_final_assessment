import rateLimit from 'express-rate-limit';
import { logger } from '../../utils/logger/logger.js';

const logLimitHandler = (req, res, next, options) => {
    logger.warn({ event: 'rate_limit_exceeded', ip: req.ip, url: req.url }, 'Rate limit triggered');
    res.status(options.statusCode).send(options.message);
}

export const globalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 min
    max: 100,
    message: { status: "Error", message: "Too many requests, try again later"},
    handler: logLimitHandler
});

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 10,
    message: { status: "Error", message: "Too many login attempts, try again later"},
    handler: logLimitHandler
});

export const logoutLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 min
    max: 30,
    message: { status: "Error", message: "Too many logout requests, try again later"},
    handler: logLimitHandler
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hr
    max: 5,
    message: { status: "Error", message: "Too many created users, try again later"},
    handler: logLimitHandler
});
