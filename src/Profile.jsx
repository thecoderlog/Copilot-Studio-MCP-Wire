import { useQuery } from '@tanstack/react-query';
import UserCard from './UserCard.jsx';

export default function Profile({ userId }) {
  const { data: user, isPending } = useQuery({
    queryKey: ['user', userId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/users/${userId}`, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  return <UserCard user={user} loading={isPending} />;
}
