// In-memory online tracking, keyed by user id, counting open sockets rather
// than a boolean — a user with two tabs open shouldn't flip to "offline"
// the instant one of them closes. Module-level state is fine for a single
// process; a multi-instance deploy would need this backed by Redis instead.
const socketCounts = new Map<string, number>();

export function markOnline(userId: string): boolean {
  const count = socketCounts.get(userId) ?? 0;
  socketCounts.set(userId, count + 1);
  return count === 0; // true the instant this user's first socket connects
}

export function markOffline(userId: string): boolean {
  const count = socketCounts.get(userId) ?? 0;
  if (count <= 1) {
    socketCounts.delete(userId);
    return true; // true once their last socket disconnects
  }
  socketCounts.set(userId, count - 1);
  return false;
}

export function isOnline(userId: string): boolean {
  return (socketCounts.get(userId) ?? 0) > 0;
}
