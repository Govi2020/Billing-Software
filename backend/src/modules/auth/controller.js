import * as auth from './service.js';
import { config } from '../../config.js';

export async function signup(req, res) {
  const user = await auth.signup(req.validated.body);
  res.status(201).json({ data: user });
}

export async function login(req, res) {
  const result = await auth.login(req.validated.body, req, res);
  res.json({ data: result });
}

export async function refresh(req, res) {
  const result = await auth.refresh(req.cookies?.[config.REFRESH_COOKIE_NAME], req, res);
  res.json({ data: result });
}

export async function logout(req, res) {
  await auth.logout(req.cookies?.[config.REFRESH_COOKIE_NAME], res);
  res.status(204).end();
}

export async function forgotPassword(req, res) {
  await auth.requestPasswordReset(req.validated.body.email);
  res.status(202).json({ data: { message: 'If an account exists for that email, a reset link will be sent.' } });
}

export async function resetPassword(req, res) {
  await auth.resetPassword(req.validated.body.token, req.validated.body.newPassword);
  res.json({ data: { message: 'Password reset successfully.' } });
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.validated.body;
  await auth.changePassword(req.auth.userId, currentPassword, newPassword);
  auth.clearSessionCookies(res);
  res.json({ data: { message: 'Password changed successfully. Sign in again.' } });
}

export async function me(req, res) {
  res.json({ data: await auth.me(req.auth.userId) });
}
