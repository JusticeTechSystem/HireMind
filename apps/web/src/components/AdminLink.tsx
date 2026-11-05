import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
/** Cosmetic only: the API enforces roles. */
export function AdminLink() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<{ roles: string[] }>('/me') });
  return me.data?.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN') ? <Link to="/admin" className="rounded border border-white/20 px-4 py-2">Admin</Link> : null;
}
