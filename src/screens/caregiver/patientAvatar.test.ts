import { avatarColorFor, initialsFor } from './patientAvatar';

describe('initialsFor', () => {
  it('takes the first two words', () => {
    expect(initialsFor('Michael Chen')).toBe('MC');
  });

  it('takes one letter from a single name', () => {
    expect(initialsFor('Michael')).toBe('M');
  });

  it('ignores words past the second', () => {
    expect(initialsFor('Ana Maria Sofia Reyes')).toBe('AM');
  });

  it('tolerates padding and repeated spaces', () => {
    expect(initialsFor('  Michael   Chen  ')).toBe('MC');
  });

  it('falls back to "?" for an empty or blank name', () => {
    // A linked user with no profile yet: the avatar still needs a glyph.
    expect(initialsFor('')).toBe('?');
    expect(initialsFor('   ')).toBe('?');
  });

  it('uppercases lowercase input', () => {
    expect(initialsFor('michael chen')).toBe('MC');
  });

  it('passes through characters that have no uppercase form', () => {
    // Non-Latin names must not become "?" — 江 is a perfectly good initial.
    expect(initialsFor('江 力')).toBe('江力');
  });
});

describe('avatarColorFor', () => {
  it('is stable for the same id', () => {
    // The tint appears on the caregiver list and again on the overview; they
    // must agree, so it is derived rather than randomised.
    expect(avatarColorFor('user-abc')).toBe(avatarColorFor('user-abc'));
  });

  it('always returns a colour from the palette', () => {
    const ids = ['a', 'user-1', 'user-2', '', 'ᵾ', 'a-very-long-cognito-sub-0123456789'];
    for (const id of ids) {
      expect(avatarColorFor(id)).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it('spreads different ids across more than one colour', () => {
    // A hash that collapsed to one tint would make every patient look alike.
    const colors = new Set(
      Array.from({ length: 24 }, (_, index) => avatarColorFor(`user-${index}`)),
    );
    expect(colors.size).toBeGreaterThan(1);
  });
});
