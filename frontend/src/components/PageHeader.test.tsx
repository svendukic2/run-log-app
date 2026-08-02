import { render, screen } from '@testing-library/react';
import PageHeader from './PageHeader';

describe('Page header (RUN-15)', () => {
  it('shows the overline above the title', () => {
    render(<PageHeader overline="Good morning, Marko" title="Dashboard" />);

    expect(screen.getByText('Good morning, Marko')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders the action passed to it', () => {
    render(<PageHeader overline="Your activity" title="Runs" action={<button>Add run</button>} />);

    expect(screen.getByRole('button', { name: 'Add run' })).toBeInTheDocument();
  });

  it('works without an action', () => {
    render(<PageHeader overline="Your activity" title="Runs" />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stacks the title and the action below `sm` (responsive)', () => {
    render(<PageHeader overline="Good morning, Marko" title="Dashboard" />);

    const header = screen.getByTestId('page-header');
    expect(header).toHaveClass('flex-col');
    expect(header).toHaveClass('sm:flex-row');
  });
});
