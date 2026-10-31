import { Router } from 'express';
import { AppError } from '../../lib/errors.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createStaffSchema, listUsersSchema, patchUserSchema, userIdSchema,
} from '../auth/schemas.js';
import * as controller from './controller.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

function requireIfMatch(req, _res, next) {
  const value = req.get('if-match');
  if (!value || Number.isNaN(Date.parse(value))) {
    return next(new AppError(428, 'PRECONDITION_REQUIRED', 'Send the record updated_at value in If-Match.'));
  }
  req.ifMatch = value;
  next();
}

// Spec §11.2; people/staff management page in §14.3.
router.get('/', validate({ query: listUsersSchema }), async (req, res) => {
  await controller.list(req, res);
});

// Spec §11.2 and §6.1 staff creation; staff management page in §14.3.
router.post('/', validate({ body: createStaffSchema }), async (req, res) => {
  await controller.create(req, res);
});

// Spec §11.2; staff management page in §14.3.
router.get('/:id', validate({ params: userIdSchema }), async (req, res) => {
  await controller.get(req, res);
});

// Spec §11.2; staff management page in §14.3.
router.patch('/:id', requireIfMatch, validate({ params: userIdSchema, body: patchUserSchema }), async (req, res) => {
  await controller.patch(req, res);
});

// Spec §11.2; deactivate action on the staff management page in §14.3.
router.post('/:id/deactivate', requireIfMatch, validate({ params: userIdSchema }), async (req, res) => {
  await controller.deactivate(req, res);
});

// Spec §11.2; reactivate action on the staff management page in §14.3.
router.post('/:id/reactivate', requireIfMatch, validate({ params: userIdSchema }), async (req, res) => {
  await controller.reactivate(req, res);
});

// Spec §11.2 / §6.1; force-reset action on the staff management page in §14.3.
router.post('/:id/reset-password-link', validate({ params: userIdSchema }), async (req, res) => {
  await controller.sendPasswordResetLink(req, res);
});

export default router;
