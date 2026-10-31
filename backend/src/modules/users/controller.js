import * as auth from '../auth/service.js';

export async function list(req, res) {
  res.json(await auth.listUsers(req.validated.query));
}

export async function create(req, res) {
  const user = await auth.createStaff(req.validated.body, req.auth.userId);
  res.status(201).json({ data: user });
}

export async function get(req, res) {
  res.json({ data: await auth.getUser(req.validated.params.id) });
}

export async function patch(req, res) {
  res.json({ data: await auth.patchUser(req.validated.params.id, req.validated.body, req.auth.userId, req.ifMatch) });
}

export async function deactivate(req, res) {
  res.json({ data: await auth.setUserActive(req.validated.params.id, false, req.auth.userId, req.ifMatch) });
}

export async function reactivate(req, res) {
  res.json({ data: await auth.setUserActive(req.validated.params.id, true, req.auth.userId, req.ifMatch) });
}

export async function sendPasswordResetLink(req, res) {
  await auth.sendStaffResetLink(req.validated.params.id, req.auth.userId);
  res.status(202).json({ data: { message: 'If the staff account exists, a reset link will be sent.' } });
}
