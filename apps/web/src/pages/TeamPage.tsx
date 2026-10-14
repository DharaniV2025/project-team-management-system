import { useEffect, useState } from 'react';
import { Search, ShieldCheck, Users } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { api, formatDate } from '../api';
import { useAuth } from '../auth';
import { ErrorState, LoadingState, PageHeader } from '../components/ui';
import type { PageResult, User, UserRole } from '../types';

const roles: UserRole[] = ['ADMIN', 'PROJECT_MANAGER', 'TEAM_MEMBER'];

export function TeamPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { const response = await api.get<PageResult<User>>(`/users?limit=100&search=${encodeURIComponent(search)}`); setUsers(response.data.data); setError(null); }
    catch (loadError) { setError(loadError); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (user?.role === 'ADMIN') void load();
  }, [search, user?.role]);

  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />;

  async function updateRole(id: string, role: UserRole) {
    setUpdating(id);
    try {
      const response = await api.patch<User>(`/users/${id}/role`, { role });
      setUsers((current) => current.map((item) => item.id === id ? { ...item, role: response.data.role } : item));
    } catch (updateError) { setError(updateError); }
    finally { setUpdating(null); }
  }

  return <>
    <PageHeader eyebrow="PEOPLE & PERMISSIONS" title="Team" description="Manage organization access and project assignment roles." />
    <section className="team-summary"><div className="team-summary-icon"><Users size={19} /></div><div><strong>{users.length}</strong><span>people in this workspace</span></div><div className="team-summary-note"><ShieldCheck size={16} /> Roles are enforced by the API</div></section>
    <div className="team-toolbar"><label className="search-field"><Search size={15} /><input aria-label="Search team" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="result-count">{users.length} people</span></div>
    {loading ? <LoadingState label="Loading team" /> : error ? <ErrorState error={error} retry={() => void load()} /> : <div className="panel task-table-wrap"><table className="data-table team-table"><thead><tr><th>Person</th><th>Role</th><th>Joined</th><th>Projects</th></tr></thead><tbody>{users.map((person) => <tr key={person.id}><td><div className="team-person"><div className="avatar avatar-soft">{person.name.slice(0, 1).toUpperCase()}</div><span><strong>{person.name}</strong><small>{person.email}</small></span></div></td><td><select aria-label={`Role for ${person.name}`} value={person.role} disabled={person.id === user.id || updating === person.id} onChange={(event) => void updateRole(person.id, event.target.value as UserRole)}>{roles.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ').toLowerCase()}</option>)}</select></td><td>{person.createdAt ? formatDate(person.createdAt) : '—'}</td><td>{person._count?.memberships ?? 0} projects</td></tr>)}</tbody></table></div>}
  </>;
}