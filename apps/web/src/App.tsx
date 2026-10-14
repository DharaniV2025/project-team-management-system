import { BrowserRouter, Link, Navigate, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { LogOut, PanelsTopLeft } from 'lucide-react';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage, ProjectDetailPage, ProjectFormPage } from './pages/ProjectsPage';
import { TasksPage, TaskDetailPage, TaskFormPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import { SuccessMessage } from './components/ui';
import './index.css';

function Guard() {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot-screen"><span className="spinner" />Connecting to workspace</div>;
  return user ? <Outlet /> : <Navigate to="/login" replace />;
}

function Shell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  useEffect(() => {
    const state = location.state as { successMessage?: unknown } | null;
    if (typeof state?.successMessage !== 'string') return;
    setSuccessMessage(state.successMessage);
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: null,
    });
  }, [location.key, location.hash, location.pathname, location.search, location.state, navigate]);
  useEffect(() => {
    if (!successMessage) return;
    const timer = window.setTimeout(() => setSuccessMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [successMessage]);
  async function logout() {
    await signOut().catch(() => undefined);
    navigate('/login');
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand"><span className="brand-mark"><PanelsTopLeft size={19} /></span><span>fieldwork<span className="brand-dot">.</span></span></Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav">
          <NavLink to="/" end>Overview</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/tasks">Tasks</NavLink>
          {user?.role === 'ADMIN' && <NavLink to="/team">Team</NavLink>}
        </nav>
        <div className="sidebar-foot"><div className="avatar">{user?.name.slice(0, 1).toUpperCase()}</div><div className="account-copy"><strong>{user?.name}</strong><span>{user?.role.replaceAll('_', ' ').toLowerCase()}</span></div><button className="icon-button signout" aria-label="Sign out" title="Sign out" onClick={() => void logout()}><LogOut size={17} /></button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><span className="topbar-kicker">TEAM OPERATIONS</span><span className="online-indicator"><i /> Workspace connected</span><button className="icon-button mobile-signout" aria-label="Sign out" title="Sign out" onClick={() => void logout()}><LogOut size={17} /></button></header>
        <div className="page-content">{successMessage && <SuccessMessage message={successMessage} onDismiss={() => setSuccessMessage(null)} />}<Outlet /></div>
      </main>
    </div>
  );
}

function AppRoutes() {
  return <AuthProvider><BrowserRouter><Routes><Route path="/login" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} /><Route element={<Guard />}><Route element={<Shell />}><Route index element={<DashboardPage />} /><Route path="projects" element={<ProjectsPage />} /><Route path="projects/new" element={<ProjectFormPage />} /><Route path="projects/:id/edit" element={<ProjectFormPage />} /><Route path="projects/:id" element={<ProjectDetailPage />} /><Route path="tasks" element={<TasksPage />} /><Route path="tasks/new" element={<TaskFormPage />} /><Route path="tasks/:id/edit" element={<TaskFormPage />} /><Route path="tasks/:id" element={<TaskDetailPage />} /><Route path="team" element={<TeamPage />} /></Route></Route><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter></AuthProvider>;
}

export default AppRoutes;