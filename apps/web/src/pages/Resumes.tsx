import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, useAuth } from '../lib/auth';

interface R { id: string; fileName: string; isDefault: boolean; scanStatus: string; analysisStatus: string; sizeBytes: number }
export function Resumes() {
  const qc = useQueryClient(); const input = useRef<HTMLInputElement>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['resumes'], queryFn: () => api<R[]>('/resumes') });
  const inv = () => qc.invalidateQueries({ queryKey: ['resumes'] });
  const upload = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData(); fd.append('file', f);
      const r = await fetch('/api/v1/resumes', { method: 'POST', body: fd, headers: { Authorization: `Bearer ${useAuth.getState().session?.access_token}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `Upload failed (${r.status})`);
    }, onSuccess: inv });
  const setDef = useMutation({ mutationFn: (id: string) => api(`/resumes/${id}/default`, { method: 'PATCH' }), onSuccess: inv });
  const del = useMutation({ mutationFn: (id: string) => api(`/resumes/${id}`, { method: 'DELETE' }), onSuccess: inv });
  const preview = async (id: string) => { const { url } = await api<{ url: string }>(`/resumes/${id}/url`); window.open(url, '_blank', 'noopener'); };
  return (
    <main id="main" className="min-h-screen bg-navy text-white p-6 max-w-2xl mx-auto">
      <Link to="/dashboard" className="text-sm text-gray-400 underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold my-3">Resumes</h1>
      <input ref={input} type="file" accept=".pdf,.docx" hidden onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
      <button className="rounded bg-accent px-4 py-2" disabled={upload.isPending} onClick={() => input.current?.click()}>{upload.isPending ? 'Uploading…' : 'Upload PDF or DOCX (max 5 MB)'}</button>
      {upload.isError && <p role="alert" className="text-red-400 text-sm mt-2">{(upload.error as Error).message}</p>}
      {isLoading && <p className="text-gray-400 mt-4">Loading…</p>}
      {error && <p role="alert" className="text-red-400 mt-4">Could not load resumes.</p>}
      {data?.length === 0 && <p className="text-gray-400 mt-4">No resumes yet.</p>}
      <ul className="mt-4 space-y-2">{data?.map((r) => (
        <li key={r.id} className="rounded bg-charcoal p-3 flex flex-wrap gap-2 items-center">
          <span className="flex-1">{r.fileName}{r.isDefault && <b className="ml-2 text-accent-text text-xs">DEFAULT</b>}
            <small className="block text-gray-400">scan: {r.scanStatus} · analysis: {r.analysisStatus}</small></span>
          <button className="underline text-sm" onClick={() => preview(r.id)}>Preview</button>
          {!r.isDefault && <button className="underline text-sm" onClick={() => setDef.mutate(r.id)}>Make default</button>}
          <button className="underline text-sm text-red-400" onClick={() => confirm('Delete this resume?') && del.mutate(r.id)}>Delete</button>
        </li>))}</ul>
    </main>
  );
}
