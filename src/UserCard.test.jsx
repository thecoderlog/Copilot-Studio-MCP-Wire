import { render, screen } from '@testing-library/react';
import UserCard from './UserCard.jsx';

const alice = { name: 'Alice', role: 'Frontend engineer', city: 'Pune', color: '#f5a524' };

test('shows the name, role and city', () => {
  render(<UserCard user={alice} />);
  expect(screen.getByRole('heading')).toHaveTextContent('Alice');
  expect(screen.getByText('Frontend engineer · Pune')).toBeInTheDocument();
});

test('shows a loading state before the user arrives', () => {
  render(<UserCard loading />);
  expect(screen.getByRole('status')).toBeInTheDocument();
});
