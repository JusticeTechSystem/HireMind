import * as jwt from 'jsonwebtoken';
import { loadEnv } from '@hiremind/config';
export function verifyAccessToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, loadEnv().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
}
