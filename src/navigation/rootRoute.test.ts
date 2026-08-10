import { rootRouteName } from './rootRoute';

/**
 * The case this function exists for: Settings used to compute the root itself,
 * without the role check the navigator applies, so leaving Settings reset a
 * caregiver onto the primary user's Home. Both callers now share this, and these
 * tests pin the rule they share.
 */
describe('rootRouteName', () => {
  it('sends a caregiver to their own dashboard', () => {
    expect(
      rootRouteName({ role: 'SUPPORT_PERSON', simpleMode: false, startingPage: 'CALENDAR' }),
    ).toBe('CaregiverHome');
  });

  it('keeps a caregiver there even with Simple Mode and a starting page set', () => {
    // The role wins: a caregiver's own interface settings must not redirect them
    // into a primary user's screens.
    expect(
      rootRouteName({ role: 'SUPPORT_PERSON', simpleMode: true, startingPage: 'ALL_TASKS' }),
    ).toBe('CaregiverHome');
  });

  it('sends a primary user to Home when Simple Mode is off', () => {
    expect(
      rootRouteName({ role: 'PRIMARY_USER', simpleMode: false, startingPage: 'ALL_TASKS' }),
    ).toBe('Home');
  });

  it('honours the starting page in Simple Mode', () => {
    expect(
      rootRouteName({ role: 'PRIMARY_USER', simpleMode: true, startingPage: 'CALENDAR' }),
    ).toBe('Calendar');
    expect(
      rootRouteName({ role: 'PRIMARY_USER', simpleMode: true, startingPage: 'ALL_TASKS' }),
    ).toBe('AllTasks');
    expect(
      rootRouteName({ role: 'PRIMARY_USER', simpleMode: true, startingPage: 'CATEGORIES' }),
    ).toBe('Categories');
  });

  it('ignores the starting page while Simple Mode is off', () => {
    expect(
      rootRouteName({ role: 'PRIMARY_USER', simpleMode: false, startingPage: 'CATEGORIES' }),
    ).toBe('Home');
  });

  it('falls back to Home for an unresolved role', () => {
    // The profile query can be in flight; Home is the safe default because it is
    // where a non-caregiver belongs, and the navigator re-renders once it lands.
    expect(rootRouteName({ role: undefined, simpleMode: false, startingPage: 'CALENDAR' })).toBe(
      'Home',
    );
  });

  it('treats an org admin as a non-caregiver', () => {
    expect(
      rootRouteName({ role: 'ORG_ADMIN', simpleMode: false, startingPage: 'CALENDAR' }),
    ).toBe('Home');
  });
});
