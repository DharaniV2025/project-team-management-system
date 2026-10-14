import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowUpDown, CalendarDays, MessageSquare, Send } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, formatDate } from '../api';
import { useAuth } from '../auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, SuccessMessage } from '../components/ui';
import type { PageResult, Project, Task, TaskPriority, TaskStatus } from '../types';

const taskStatuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];
const priorities: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export function TasksPage() {
  const [searchParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? '');
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdue') === 'true');
  const [priority, setPriority] = useState('');
  const [sortBy, setSortBy] = useState<'dueDate' | 'title' | 'priority' | 'createdAt'>('dueDate');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    api.get<PageResult<Project>>('/projects?limit=100').then((response) => setProjects(response.data.data)).catch(() => setProjects([]));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ page: String(page), limit: '20', sortBy, sortOrder });
      if (projectId) query.set('projectId', projectId);
      if (assigneeId) query.set('assigneeId', assigneeId);
      if (status) query.set('status', status);
      if (overdueOnly) query.set('overdue', 'true');
      if (priority) query.set('priority', priority);
      if (search.trim()) query.set('search', search.trim());
      setLoading(true);
      api.get<PageResult<Task>>(`/tasks?${query}`)
        .then((response) => { setTasks(response.data.data); setPages(response.data.pagination.pages); setError(null); })
        .catch(setError)
        .finally(() => setLoading(false));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [page, projectId, assigneeId, status, priority, search, sortBy, sortOrder, overdueOnly]);

  const people = [...new Map(projects.flatMap((project) => project.members.map((member) => [member.user.id, member.user] as const))).values()];
  const canCreate = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';
  return <>
    <PageHeader eyebrow="THE DAILY QUEUE" title="Tasks" description="Find the next action, owner, and due date without losing the thread." action={canCreate ? { label: 'New task', to: '/tasks/new' } : undefined} />
    <div className="task-filters"><label className="search-field"><span className="search-glyph">⌕</span><input aria-label="Search tasks" placeholder="Search task title" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="Filter by project" value={projectId} onChange={(event) => { setProjectId(event.target.value); setPage(1); }}><option value="">Every project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select><select aria-label="Filter by assignee" value={assigneeId} onChange={(event) => { setAssigneeId(event.target.value); setPage(1); }}><option value="">Every teammate</option>{people.map((person) => <option value={person.id} key={person.id}>{person.name}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Every status</option>{taskStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><select aria-label="Filter by priority" value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }}><option value="">Every priority</option>{priorities.map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select><label className="overdue-filter"><input type="checkbox" checked={overdueOnly} onChange={(event) => { setOverdueOnly(event.target.checked); setPage(1); }} />Overdue only</label><select aria-label="Sort tasks by" value={sortBy} onChange={(event) => { setSortBy(event.target.value as typeof sortBy); setPage(1); }}><option value="dueDate">Sort: due date</option><option value="title">Sort: title</option><option value="priority">Sort: priority</option><option value="createdAt">Sort: created</option></select><button className="icon-button sort-button" title={`Sort ${sortOrder === 'asc' ? 'ascending' : 'descending'}`} aria-label="Reverse task sort direction" onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}><ArrowUpDown size={16} /></button></div>
    {loading ? <LoadingState label="Loading tasks" /> : error ? <ErrorState error={error} /> : tasks.length ? <><div className="task-table-wrap panel"><table className="data-table task-list-table"><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Due date</th><th>Priority</th><th>Status</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><Link className="table-primary" to={`/tasks/${task.id}`}>{task.title}</Link><small>{task.comments?.length ? `${task.comments.length} comments` : task.description || 'No description'}</small></td><td><Link className="project-name-link" to={`/projects/${task.projectId}`}>{task.project.name}</Link></td><td><span className="person-cell"><span className="avatar avatar-tiny">{task.assignee?.name.slice(0, 1).toUpperCase() ?? '?'}</span>{task.assignee?.name ?? 'Unassigned'}</span></td><td>{formatDate(task.dueDate)}</td><td><span className={`priority-label priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()}</span></td><td><StatusBadge status={task.status} /></td></tr>)}</tbody></table></div><div className="pagination"><span>Page {page} of {Math.max(pages, 1)}</span><div><button className="button button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="button button-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div></> : <EmptyState title="No tasks found" detail="Change a filter or add a task to an active project." action={canCreate ? { label: 'Create a task', to: '/tasks/new' } : undefined} />}
  </>;
}

export function TaskFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManageTasks = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER';
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(searchParams.get('projectId') ?? '');
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));

  useEffect(() => {
    if (canManageTasks) {
      api.get<PageResult<Project>>('/projects?limit=100').then((response) => setProjects(response.data.data)).catch(setError);
    }
    if (id && canManageTasks) api.get<Task>(`/tasks/${id}`).then((response) => {
      if (!response.data.permissions?.canManage) {
        navigate(`/tasks/${id}`, { replace: true });
        return;
      }
      setTask(response.data);
      setProjectId(response.data.projectId);
    }).catch(setError).finally(() => setLoading(false));
  }, [id, canManageTasks, navigate]);
  const members = projects.find((project) => project.id === projectId)?.members ?? [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      title: String(data.get('title')),
      description: String(data.get('description')),
      projectId,
      assigneeId: String(data.get('assigneeId') ?? '') || null,
      priority: String(data.get('priority')),
      status: String(data.get('status')),
      dueDate: String(data.get('dueDate')),
    };
    setBusy(true);
    setError(null);
    try {
      const response = id ? await api.patch<Task>(`/tasks/${id}`, payload) : await api.post<Task>('/tasks', payload);
      navigate(`/tasks/${response.data.id}`, {
        state: { successMessage: id ? 'Task updated.' : 'Task created.' },
      });
    } catch (submitError) { setError(submitError); } finally { setBusy(false); }
  }
  if (!canManageTasks) return <Navigate to="/tasks" replace />;
  if (loading) return <LoadingState label="Loading task" />;
  return <>
    <Link className="back-link" to={id ? `/tasks/${id}` : '/tasks'}><ArrowLeft size={15} />Back to tasks</Link>
    <PageHeader eyebrow={id ? 'TASK DETAILS' : 'BREAK DOWN THE WORK'} title={id ? 'Edit task' : 'New task'} description="Make the owner, priority, and finish line explicit." />
    <form className="panel form-panel form-stack" onSubmit={(event) => void submit(event)}>
      <label>Task title<input name="title" minLength={3} maxLength={180} defaultValue={task?.title} placeholder="e.g. Review onboarding flow" required /></label>
      <label>Description<textarea name="description" rows={4} maxLength={5000} defaultValue={task?.description} placeholder="What does done look like?" required /></label>
      <label>Project<select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
      <div className="form-grid"><label>Assignee<select name="assigneeId" defaultValue={task?.assigneeId ?? ''}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.user.name}</option>)}</select></label><label>Due date<input name="dueDate" type="date" defaultValue={task?.dueDate.slice(0, 10)} required /></label></div>
      <div className="form-grid"><label>Priority<select name="priority" defaultValue={task?.priority ?? 'MEDIUM'}>{priorities.map((value) => <option key={value} value={value}>{value.toLowerCase()}</option>)}</select></label><label>Status<select name="status" defaultValue={task?.status ?? 'TODO'}>{taskStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label></div>
      {error !== null && <ErrorState error={error} />}
      <div className="form-actions"><Link className="button button-secondary" to={id ? `/tasks/${id}` : '/tasks'}>Cancel</Link><button className="button button-primary" disabled={busy || !projectId}>{busy ? 'Saving…' : id ? 'Save task' : 'Create task'}</button></div>
    </form>
  </>;
}

export function TaskDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [commentBusy, setCommentBusy] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try { const response = await api.get<Task>(`/tasks/${id}`); setTask(response.data); setError(null); }
    catch (loadError) { setError(loadError); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [id]);

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setCommentBusy(true);
    try { await api.post(`/tasks/${id}/comments`, { body: data.get('body') }); form.reset(); setSuccess('Comment added.'); await load(); }
    catch (commentError) { setError(commentError); }
    finally { setCommentBusy(false); }
  }
  async function changeStatus(status: string) {
    setStatusBusy(true);
    try { await api.patch(`/tasks/${id}`, { status }); setSuccess('Task status updated.'); await load(); }
    catch (statusError) { setError(statusError); }
    finally { setStatusBusy(false); }
  }
  async function removeTask() {
    if (!window.confirm('Delete this task and its comments?')) return;
    try { await api.delete(`/tasks/${id}`); navigate('/tasks', { state: { successMessage: 'Task deleted.' } }); }
    catch (deleteError) { setError(deleteError); }
  }

  if (loading) return <LoadingState label="Loading task details" />;
  if (!task) return <ErrorState error={error ?? 'Task not found'} retry={() => void load()} />;
  const canManage = task.permissions?.canManage ?? false;
  const canUpdateStatus = task.permissions?.canUpdateStatus ?? task.assigneeId === user?.id;
  return <>
    <Link className="back-link" to="/tasks"><ArrowLeft size={15} />All tasks</Link>
    <div className="detail-heading task-detail-heading"><div><p className="eyebrow"><Link to={`/projects/${task.projectId}`}>{task.project.name}</Link> / TASK</p><h1>{task.title}</h1><div className="detail-badges"><StatusBadge status={task.status} /><span className={`priority-label priority-${task.priority.toLowerCase()}`}>{task.priority.toLowerCase()} priority</span></div></div><div className="detail-actions">{canManage && <><Link className="button button-secondary" to={`/tasks/${id}/edit`}>Edit task</Link><button className="button button-danger" onClick={() => void removeTask()}>Delete</button></>}{canUpdateStatus && <select aria-label="Update task status" value={task.status} disabled={statusBusy} onChange={(event) => void changeStatus(event.target.value)}>{taskStatuses.map((value) => <option value={value} key={value}>{value.replaceAll('_', ' ')}</option>)}</select>}</div></div>
    {error && <ErrorState error={error} />}
    {success && <SuccessMessage message={success} onDismiss={() => setSuccess(null)} />}
    <section className="task-detail-grid"><div className="task-detail-main"><article className="panel description-panel"><div className="panel-caption">DESCRIPTION</div><p>{task.description || 'No description has been added yet.'}</p><div className="task-meta-grid"><div><span>Assignee</span><strong>{task.assignee?.name ?? 'Unassigned'}</strong></div><div><span>Due date</span><strong><CalendarDays size={14} />{formatDate(task.dueDate)}</strong></div><div><span>Created</span><strong>{formatDate(task.createdAt)}</strong></div><div><span>Updated</span><strong>{formatDate(task.updatedAt)}</strong></div></div></article>
      <article className="panel comments-panel"><div className="section-heading"><h2>Discussion</h2><span className="panel-caption">{task.comments?.length ?? 0} NOTES</span></div><div className="comment-list">{task.comments?.map((comment) => <div className="comment" key={comment.id}><div className="avatar avatar-soft">{comment.author.name.slice(0, 1).toUpperCase()}</div><div><div className="comment-head"><strong>{comment.author.name}</strong><time>{formatDate(comment.createdAt)}</time></div><p>{comment.body}</p></div></div>)}{!task.comments?.length && <p className="muted small-copy">No comments yet. Leave the first useful note.</p>}</div><form className="comment-form" onSubmit={(event) => void submitComment(event)}><textarea name="body" rows={2} maxLength={2000} placeholder="Add a note for the team…" required /><button className="button button-primary" disabled={commentBusy}><Send size={14} />{commentBusy ? 'Sending…' : 'Comment'}</button></form></article></div>
      <aside className="panel task-activity"><div className="section-heading"><h2>Activity</h2><MessageSquare size={16} /></div>{task.activities?.length ? <div className="activity-list">{task.activities.map((activity) => <div className="activity-item" key={activity.id}><span className="activity-dot" /><div><p><strong>{activity.actor?.name ?? 'A teammate'}</strong> {activity.action.replaceAll('.', ' ').replaceAll('_', ' ')}</p>{activity.detail && <small>{activity.detail}</small>}<time>{formatDate(activity.createdAt)}</time></div></div>)}</div> : <p className="muted small-copy">Task changes and comments will appear here.</p>}</aside></section>
  </>;
}