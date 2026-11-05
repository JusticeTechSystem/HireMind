import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/auth';
export function NotificationsLink() {
  const n = useQuery({ queryKey: ['notifications'], queryFn: () => api<{ unread: number }>('/notifications'), refetchInterval: 60_000 }); const u = n.data?.unread ?? 0;
  return <Link to="/notifications" aria-label={u ? `Notifications, ${u} unread` : 'Notifications'} className="rounded border border-white/20 px-4 py-2">Notifications{u > 0 && <span className="ml-2 rounded-full bg-accent px-2 text-xs text-white">{u > 99 ? '99+' : u}</span>}</Link>;
}
