import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { EmptyState, StatusBadge } from './ui';

describe('shared interface states', () => {
  it('presents task status as readable text', () => {
    render(<StatusBadge status="IN_PROGRESS" />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('shows an empty state with a working next-step link', () => {
    render(
      <MemoryRouter>
        <EmptyState
          title="No projects yet"
          detail="Create the first project."
          action={{ label: 'Create project', to: '/projects/new' }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create project' })).toHaveAttribute(
      'href',
      '/projects/new',
    );
  });
});