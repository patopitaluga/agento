import cookieParser from 'cookie-parser';
import csrf from 'csurf';
import type { ErrorRequestHandler, RequestHandler } from 'express';

export const parseCookies = cookieParser();

export const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
  },
}) as unknown as RequestHandler;

export const csrfTokenHandler: RequestHandler = (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
};

export const csrfErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  next(err);
};
