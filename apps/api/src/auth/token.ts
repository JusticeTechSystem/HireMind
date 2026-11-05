import * as jwt from 'jsonwebtoken';
import { loadEnv } from '@justiceview/config';
export function verifyAccessToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, loadEnv().JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
}
