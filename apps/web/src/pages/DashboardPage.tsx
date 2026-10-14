import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowUpRight, CalendarDays, CircleAlert, ListTodo } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../api';
import { useAuth } from '../auth';
import { EmptyState, ErrorState, LoadingState, PageHeader, SectionHeading, StatCard, StatusBadge } from '../components/ui';
import type { DashboardSummary, PageResult, Project, Task } from '../types';

const taskLanes = [
  { key: 'TODO', label: 'To do', color: 'lane-slate' },
  { key: 'IN_PROGRESS', label: 'In progress', color: 'lane-blue' },
  { key: 'IN_REVIEW', label: 'In review', color: 'lane-amber' },
  { key: 'DONE', label: 'Done', color: 'lane-green' },
] as const;

const todayLabel = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date()).toUpperCase();

export function DashboardPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [summaryResponse, projectResponse, taskResponse] = await Promise.all([
        api.get<DashboardSummary>('/dashboard/summary'),
        api.get<PageResult<Project>>('/projects?limit=4'),
        api.get<PageResult<Task>>('/tasks?limit=5&sortBy=dueDate&sortOrder=asc'),
      ]);
      setSummary(summaryResponse.data);
      setProjects(projectResponse.data.data);
      setTasks(taskResponse.data.data);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <>
      <PageHeader eyebrow={`${todayLabel} / TEAM OPERATIONS`} title="Overview" description="A clear read on the work moving across your team." action={user?.role !== 'TEAM_MEMBER' ? { label: 'New project', to: '/projects/new' } : undefined} />
      {loading ? <LoadingState /> : error ? <ErrorState error={error} retry={() => void load()} /> : summary && <>
        <section className="stats-grid">
          <StatCard label="Projects" value={summary.projects.total} note={`${summary.projects.active} active · ${summary.projects.completed} completed`} tone="green" />
          <StatCard label="Tasks in motion" value={summary.tasks.total} note={`${summary.tasks.byStatus.IN_PROGRESS} currently in progress`} tone="blue" />
          <StatCard label="Assigned to me" value={summary.tasks.assignedToMe} note="Tasks assigned to you" tone="amber" />
          <StatCard label="Overdue" value={summary.tasks.overdue} note="Needs a date or a decision" tone="coral" />
        </section>
        <section className="dashboard-grid">
          <article className="panel progress-panel">
            <SectionHeading title="Workload pulse" action={<span className="panel-caption">ALL TASKS</span>} />
            <div className="completion-row"><div><span className="completion-value">{summary.projectCompletionPercentage}<small>%</small></span><span className="completion-label">overall completion</span></div><div className="completion-ring" style={{ '--progress': `${summary.projectCompletionPercentage}%` } as CSSProperties}><span>{summary.projectCompletionPercentage}%</span></div></div>
            <div className="progress-track"><i style={{ width: `${summary.projectCompletionPercentage}%` }} /></div>
            <div className="status-lanes">{taskLanes.map((lane) => <div className="lane-row" key={lane.key}><span className={`lane-dot ${lane.color}`} /><span>{lane.label}</span><strong>{summary.tasks.byStatus[lane.key]}</strong><div className="lane-track"><i className={lane.color} style={{ width: `${summary.tasks.total ? (summary.tasks.byStatus[lane.key] / summary.tasks.total) * 100 : 0}%` }} /></div></div>)}</div>
          </article>
          <article className="panel projects-panel">
            <SectionHeading title="Projects in focus" action={<Link className="text-link" to="/projects">All projects <ArrowUpRight size={14} /></Link>} />
            {projects.length === 0 ? <EmptyState title="No projects yet" detail="Create a project to give your team a shared direction." action={{ label: 'Create project', to: '/projects/new' }} /> : <div className="focus-list">{projects.map((project) => <Link className="focus-project" to={`/projects/${project.id}`} key={project.id}><div className="project-monogram">{project.name.slice(0, 1).toUpperCase()}</div><div className="focus-project-copy"><strong>{project.name}</strong><span>{project._count?.tasks ?? 0} tasks · due {formatDate(project.deadline)}</span><div className="mini-progress"><i style={{ width: `${project.completionPercentage}%` }} /></div></div><span className="mini-percent">{project.completionPercentage}%</span></Link>)}</div>}
          </article>
          <article className="panel due-panel">
            <SectionHeading title="Next up" action={<Link className="text-link" to="/tasks">Task list <ArrowUpRight size={14} /></Link>} />
            {tasks.length === 0 ? <EmptyState title="Clear runway" detail="No tasks are waiting in your project space." /> : <div className="due-list">{tasks.map((task) => <Link className="due-task" to={`/tasks/${task.id}`} key={task.id}><span className="due-icon"><ListTodo size={16} /></span><span className="due-copy"><strong>{task.title}</strong><small>{task.project.name} · {task.assignee?.name ?? 'Unassigned'}</small></span><span className="due-date"><CalendarDays size={13} />{formatDate(task.dueDate)}</span><StatusBadge status={task.status} /></Link>)}</div>}
          </article>
          <article className="panel attention-panel"><div className="attention-stamp"><CircleAlert size={18} /></div><div><span className="panel-caption">DEADLINE WATCH</span><h2>{summary.tasks.overdue ? `${summary.tasks.overdue} task${summary.tasks.overdue === 1 ? '' : 's'} need attention` : 'Nothing overdue'}</h2><p>{summary.tasks.overdue ? 'Review the dates and unblock the work that slipped.' : 'Your open work is still inside its due dates.'}</p></div><Link className="arrow-link" to="/tasks?overdue=true" aria-label="Review overdue tasks"><ArrowUpRight size={18} /></Link></article>
        </section>
      </>}
    </>
  );
}