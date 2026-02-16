import { Router } from 'express';
import { registerSchema, loginSchema, refreshTokenSchema } from '@personal-budget/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import * as authService from './service.js';

const router = Router();

router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/login', validate(loginSchema), async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', validate(refreshTokenSchema), (req, res, next) => {
  try {
    const tokens = authService.refreshToken(req.body.refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
});

router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const profile = await authService.getProfile(req.userId!);
    res.json(profile);
  } catch (err) {
    next(err);
  }
});

export default router;
