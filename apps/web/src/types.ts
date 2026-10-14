export type UserRole = 'ADMIN' | 'PROJECT_MANAGER' | 'TEAM_MEMBER';
export type ProjectStatus = 'PLANNING' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  _count?: { memberships: number; assignedTasks: number };
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PageResult<T> {
  data: T[];
  pagination: Pagination;
}

export interface ProjectMember {
  userId: string;
  role: 'PROJECT_MANAGER' | 'MEMBER';
  user: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  startDate: string;
  deadline: string;
  status: ProjectStatus;
  completionPercentage: number;
  members: ProjectMember[];
  _count?: { tasks: number };
  tasks?: Task[];
  activities?: Activity[];
  taskStats?: { total: number; completed: number; open: number };
  taskPagination?: Pagination;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  project: Pick<Project, 'id' | 'name' | 'status'>;
  assigneeId?: string | null;
  assignee?: User | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  _count?: { comments: number };
  comments?: Comment[];
  activities?: Activity[];
  permissions?: { canManage: boolean; canUpdateStatus: boolean };
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: User;
}

export interface Activity {
  id: string;
  action: string;
  detail?: string | null;
  createdAt: string;
  actor?: User | null;
}

export interface DashboardSummary {
  projects: {
    total: number;
    active: number;
    completed: number;
    byStatus: Record<string, number>;
  };
  tasks: {
    total: number;
    overdue: number;
    assignedToMe: number;
    byStatus: Record<TaskStatus, number>;
  };
  projectCompletionPercentage: number;
}