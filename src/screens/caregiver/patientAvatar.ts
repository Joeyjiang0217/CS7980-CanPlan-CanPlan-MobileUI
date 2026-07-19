/**
 * Avatar helpers shared by the caregiver screens. A linked patient carries no
 * stored avatar, so we derive a stable colour + initials from their id/name.
 */

/** Uppercase initials: first two words, else the first character. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

// Shared category-style palette; a given id always maps to the same tint.
const AVATAR_COLORS = [
  '#E8623A',
  '#3DB8AD',
  '#6C7BE0',
  '#E0A93D',
  '#B85AC9',
  '#4CA1E0',
];

/** Deterministic avatar tint for a user id (stable across renders/screens). */
export function avatarColorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) & 0xffffffff;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
