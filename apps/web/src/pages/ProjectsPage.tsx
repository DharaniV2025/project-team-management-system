import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpRight, CalendarDays, Check, Plus, Users } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { api, formatDate } from '../api';
import { useAuth } from '../auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionHeading, StatusBadge, SuccessMessage } from '../components/ui';
import type { PageResult, Project, ProjectStatus, User } from '../types';

const projectStatuses: ProjectStatus[] = ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED'];

export function ProjectsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true);
      const query = new URLSearchParams({ limit: '50', search });
      api.get<PageResult<Project>>(`/projects?${query}`)
        .then((response) => { setProjects(response.data.data); setError(null); })
        .catch(setError)
        .finally(() => setLoading(false));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [search]);

  const visible = projects.filter((project) => status === 'ALL' || project.status === status);
  const canCreate = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';

  return <>
    <PageHeader eyebrow="SHARED DIRECTION" title="Projects" description="See the scope, people, and pace behind each initiative." action={canCreate ? { label: 'New project', to: '/projects/new' } : undefined} />
    <div className="toolbar"><label className="search-field"><span className="search-glyph">⌕</span><input aria-label="Search projects" placeholder="Find a project" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="filter-field"><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option>{projectStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><span className="result-count">{visible.length} shown</span></div>
    {loading ? <LoadingState label="Loading projects" /> : error ? <ErrorState error={error} retry={() => setSearch((value) => `${value} `)} /> : visible.length ? <div className="project-grid">{visible.map((project, index) => <Link className={`project-card project-accent-${index % 4}`} to={`/projects/${project.id}`} key={project.id}><div className="project-card-head"><span className="project-icon">{project.name.slice(0, 1).toUpperCase()}</span><StatusBadge status={project.status} /></div><h2>{project.name}</h2><p className="project-summary">{project.description || 'No project summary yet.'}</p><div className="project-card-meta"><span><CalendarDays size={14} />Due {formatDate(project.deadline)}</span><span><Users size={14} />{project.members.length} people</span></div><div className="project-card-progress"><div><span>Completion</span><strong>{project.completionPercentage}%</strong></div><div className="mini-progress"><i style={{ width: `${project.completionPercentage}%` }} /></div><span className="project-task-count">{project._count?.tasks ?? 0} tasks <ArrowUpRight size={14} /></span></div></Link>)}</div> : <EmptyState title="No projects match" detail={search ? 'Try a shorter project name or clear the search.' : 'Start with one shared goal and build the plan around it.'} action={canCreate ? { label: 'Create project', to: '/projects/new' } : undefined} />}
  </>;
}

export function ProjectFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageProjects = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    if (canManageProjects) {
      api.get<PageResult<User>>('/users?limit=100').then((response) => setUsers(response.data.data)).catch(() => setUsers([]));
    }
    if (id) api.get<Project>(`/projects/${id}`).then((response) => setProject(response.data)).catch(setError).finally(() => setLoading(false));
  }, [id, canManageProjects]);

  if (!canManageProjects || (id && project && user?.role !== 'ADMIN' && !project.members.some((member) => member.userId === user?.id && member.role === 'PROJECT_MANAGER'))) {
    return <Navigate to={id ? `/projects/${id}` : '/projects'} replace />;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const payload = {
      name: String(data.get('name')),
      description: String(data.get('description')),
      startDate: String(data.get('startDate')),
      deadline: String(data.get('deadline')),
      status: String(data.get('status')),
      memberIds: data.getAll('memberIds').map(String),
    };
    try {
      const { memberIds, ...updatePayload } = payload;
      const response = id
        ? await api.patch<Project>(`/projects/${id}`, updatePayload)
        : await api.post<Project>('/projects', { ...updatePayload, memberIds });
      navigate(id ? `/projects/${response.data.id}` : '/projects', {
        state: { successMessage: id ? 'Project updated.' : 'Project created.' },
      });
    } catch (submitError) {
      setError(submitError);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading project" />;
  if (id && error) return <ErrorState error={error} />;
  return <>
    <Link className="back-link" to={id ? `/projects/${id}` : '/projects'}><ArrowLeft size={15} />Back to projects</Link>
    <PageHeader eyebrow={id ? 'PROJECT SETTINGS' : 'SET A SHARED DIRECTION'} title={id ? 'Edit project' : 'New project'} description="Keep the scope, dates, and team clear from day one." />
    <form className="panel form-panel form-stack" onSubmit={(event) => void submit(event)}>
      <label>Project name<input name="name" minLength={3} maxLength={120} defaultValue={project?.name} placeholder="e.g. Customer onboarding refresh" required /></label>
      <label>What is this project about?<textarea name="description" maxLength={5000} rows={4} defaultValue={project?.description} placeholder="A short brief helps everyone understand the outcome." required /></label>
      <div className="form-grid"><label>Start date<input name="startDate" type="date" defaultValue={project?.startDate.slice(0, 10)} required /></label><label>Deadline<input name="deadline" type="date" defaultValue={project?.deadline.slice(0, 10)} required /></label></div>
      <label>Project status<select name="status" defaultValue={project?.status ?? 'PLANNING'}>{projectStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      {!id && <label>Invite team members<select name="memberIds" multiple size={Math.min(5, Math.max(2, users.length))}>{users.filter((item) => item.id !== user?.id).map((member) => <option key={member.id} value={member.id}>{member.name} · {member.role.replaceAll('_', ' ').toLowerCase()}</option>)}</select><small>Use Ctrl or Command to select more than one person.</small></label>}
      {error !== null && <ErrorState error={error} />}
      <div className="form-actions"><Link className="button button-secondary" to={id ? `/projects/${id}` : '/projects'}>Cancel</Link><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : id ? 'Save changes' : 'Create project'}</button></div>
    </form>
  </>;
}

export function ProjectDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [taskPage, setTaskPage] = useState(1);

  async function load(page = taskPage) {
    setLoading(true);
    try {
      const response = await api.get<Project>(`/projects/${id}?taskPage=${page}`);
      setProject(response.data);
      setError(null);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(taskPage); }, [id, taskPage]);

  async function openMemberPicker() {
    try {
      const response = await api.get<PageResult<User>>('/users?limit=100');
      setUsers(response.data.data.filter((candidate) => !project?.members.some((member) => member.userId === candidate.id)));
    } catch (loadError) { setError(loadError); }
  }
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/projects/${id}/members`, { userId: selectedUser });
      setSelectedUser('');
      setSuccess('Team member added.');
      await load();
    } catch (submitError) { setError(submitError); } finally { setBusy(false); }
  }
  async function removeMember(userId: string) {
    if (!window.confirm('Remove this person from the project? Open tasks must be reassigned first.')) return;
    try {
      await api.delete(`/projects/${id}/members/${userId}`);
      setSuccess('Team member removed.');
      await load();
    } catch (removeError) { setError(removeError); }
  }
  async function archiveProject() {
    if (!window.confirm('Archive this project? It will disappear from active project lists.')) return;
    try { await api.patch(`/projects/${id}/archive`); navigate('/projects', { state: { successMessage: 'Project archived.' } }); } catch (archiveError) { setError(archiveError); }
  }

  if (loading) return <LoadingState label="Loading project details" />;
  if (error && !project) return <ErrorState error={error} retry={() => void load()} />;
  if (!project) return null;
  const canManage = user?.role === 'ADMIN' || project.members.some((member) => member.userId === user?.id && member.role === 'PROJECT_MANAGER');

  return <>
    <Link className="back-link" to="/projects"><ArrowLeft size={15} />All projects</Link>
    <div className="detail-heading"><div><p className="eyebrow">PROJECT / {project.status.replaceAll('_', ' ')}</p><h1>{project.name}</h1><p className="muted page-description">{project.description || 'No project summary provided.'}</p></div><div className="detail-actions">{canManage && <><Link className="button button-secondary" to={`/projects/${id}/edit`}>Edit project</Link><button className="button button-secondary" onClick={() => void archiveProject()}>Archive</button><Link className="button button-primary" to={`/tasks/new?projectId=${id}`}><Plus size={15} />New task</Link></>}</div></div>
    {error && <ErrorState error={error} />}
    {success && <SuccessMessage message={success} onDismiss={() => setSuccess(null)} />}
    <section className="detail-metrics"><div><span>Progress</span><strong>{project.completionPercentage}%</strong><div className="mini-progress"><i style={{ width: `${project.completionPercentage}%` }} /></div></div><div><span>Project dates</span><strong>{formatDate(project.startDate)} — {formatDate(project.deadline)}</strong></div><div><span>Open tasks</span><strong>{project.taskStats?.open ?? 0}<small> / {project.taskStats?.total ?? 0}</small></strong></div><div><span>Team</span><strong>{project.members.length} people</strong></div></section>
    <div className="project-detail-grid"><section className="panel detail-tasks"><SectionHeading title="Project tasks" action={canManage ? <Link className="text-link" to={`/tasks/new?projectId=${id}`}>Add task <Plus size={14} /></Link> : undefined} />{project.taskStats?.total ? <><div className="task-table-wrap"><table className="data-table"><thead><tr><th>Task</th><th>Assignee</th><th>Due</th><th>Status</th></tr></thead><tbody>{project.tasks?.map((task) => <tr key={task.id}><td><Link className="table-primary" to={`/tasks/${task.id}`}>{task.title}</Link><small>{task.priority.toLowerCase()} priority</small></td><td>{task.assignee?.name ?? 'Unassigned'}</td><td>{formatDate(task.dueDate)}</td><td><StatusBadge status={task.status} /></td></tr>)}</tbody></table></div>{project.taskPagination && project.taskPagination.pages > 1 && <div className="pagination"><span>Page {taskPage} of {project.taskPagination.pages}</span><div><button className="button button-secondary" disabled={taskPage <= 1} onClick={() => setTaskPage(taskPage - 1)}>Previous</button><button className="button button-secondary" disabled={taskPage >= project.taskPagination!.pages} onClick={() => setTaskPage(taskPage + 1)}>Next</button></div></div>}</> : <EmptyState title="No tasks yet" detail="Break the project into clear next actions." action={canManage ? { label: 'Create first task', to: `/tasks/new?projectId=${id}` } : undefined} />}</section>
      <div className="project-side-column"><section className="panel team-panel"><SectionHeading title="Project team" action={canManage ? <button className="icon-button light-icon" title="Load people to add" aria-label="Add team member" onClick={() => void openMemberPicker()}><Plus size={17} /></button> : undefined} />{canManage && users.length > 0 && <form className="member-add" onSubmit={(event) => void addMember(event)}><select aria-label="Select team member" value={selectedUser} onChange={(event) => setSelectedUser(event.target.value)} required><option value="">Choose a person</option>{users.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select><button className="button button-primary" disabled={busy || !selectedUser}><Check size={14} />Add</button></form>}<div className="member-list">{project.members.map((member) => <div className="member-row" key={member.userId}><div className="avatar avatar-soft">{member.user.name.slice(0, 1).toUpperCase()}</div><div className="member-copy"><strong>{member.user.name}</strong><span>{member.role.replaceAll('_', ' ').toLowerCase()}</span></div>{canManage && member.userId !== user?.id && <button className="member-remove" title="Remove member" onClick={() => void removeMember(member.userId)}>×</button>}</div>)}</div></section>
        <section className="panel activity-panel"><SectionHeading title="Recent activity" />{project.activities?.length ? <div className="activity-list">{project.activities.map((activity) => <div className="activity-item" key={activity.id}><span className="activity-dot" /><div><p><strong>{activity.actor?.name ?? 'A teammate'}</strong> {activity.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p>{activity.detail && <small>{activity.detail}</small>}<time>{formatDate(activity.createdAt)}</time></div></div>)}</div> : <p className="muted small-copy">Updates about this project will appear here.</p>}</section></div>
    </div>
  </>;
}