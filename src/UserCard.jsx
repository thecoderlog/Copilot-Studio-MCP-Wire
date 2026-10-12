export default function UserCard({ user, loading }) {
  if (loading) return <p className="card loading" role="status">Loading…</p>;

  return (
    <article className="card">
      <div className="avatar" style={{ background: user.color }}>
        {user.name[0]}
      </div>
      <div>
        <h2>{user.name}</h2>
        <p>{user.role} · {user.city}</p>
      </div>
    </article>
  );
}
