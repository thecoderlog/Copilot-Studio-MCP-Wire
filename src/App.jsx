import { useState } from 'react';
import Profile from './Profile.jsx';

const PEOPLE = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
  { id: 'sam', name: 'Sam' },
];

export default function App() {
  const [userId, setUserId] = useState('alice');
  const picked = PEOPLE.find((p) => p.id === userId);

  return (
    <main>
      <nav className="picker">
        {PEOPLE.map((p) => (
          <button
            key={p.id}
            aria-pressed={p.id === userId}
            onClick={() => setUserId(p.id)}
          >
            {p.name}
          </button>
        ))}
      </nav>
      <h1>{picked.name}</h1>
      <Profile userId={userId} />
    </main>
  );
}
