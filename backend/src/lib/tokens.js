import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export const hashToken = token => createHash('sha256').update(token).digest('hex');
export const newOpaqueToken = () => randomBytes(32).toString('base64url');
export const newFamilyId = () => randomUUID();

export function signAccessToken(user) {
  return jwt.sign(
    { role: user.role, mustChangePassword: Boolean(user.must_change_password) },
    config.JWT_SECRET,
    {
      subject: String(user.id),
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      expiresIn: '15m',
      algorithm: 'HS256',
      keyid: config.JWT_KEY_ID,
    },
  );
}

export function verifyAccessToken(token) {
  const decoded = jwt.decode(token, { complete: true });
  const keyId = decoded?.header?.kid;
  const secret = keyId === config.JWT_KEY_ID ? config.JWT_SECRET : config.previousJwtKeys[keyId];
  if (!secret) throw new Error('Unknown signing key.');
  return jwt.verify(token, secret, {
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    algorithms: ['HS256'],
  });
}
