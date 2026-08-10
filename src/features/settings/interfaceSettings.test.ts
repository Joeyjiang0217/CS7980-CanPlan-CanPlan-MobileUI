import { INTERFACE_SETTINGS_DEFAULTS, sanitize } from './interfaceSettings';

describe('interface settings sanitize', () => {
  it('falls back to the defaults for unusable input', () => {
    // Unreadable storage, or a blob written by something else entirely.
    expect(sanitize(null)).toEqual(INTERFACE_SETTINGS_DEFAULTS);
    expect(sanitize(undefined)).toEqual(INTERFACE_SETTINGS_DEFAULTS);
    expect(sanitize('a string')).toEqual(INTERFACE_SETTINGS_DEFAULTS);
    expect(sanitize(42)).toEqual(INTERFACE_SETTINGS_DEFAULTS);
    expect(sanitize([])).toEqual(INTERFACE_SETTINGS_DEFAULTS);
  });

  it('keeps stored values it recognises', () => {
    const result = sanitize({ simpleMode: true, showOverdue: true, startingPage: 'ALL_TASKS' });
    expect(result.simpleMode).toBe(true);
    expect(result.showOverdue).toBe(true);
    expect(result.startingPage).toBe('ALL_TASKS');
  });

  it('leaves absent keys at their defaults', () => {
    // A blob written before a setting existed.
    const result = sanitize({ simpleMode: true });
    expect(result.onlyToday).toBe(INTERFACE_SETTINGS_DEFAULTS.onlyToday);
    expect(result.allowChangingDate).toBe(INTERFACE_SETTINGS_DEFAULTS.allowChangingDate);
  });

  it('drops keys that no longer exist', () => {
    // This is what makes removing a setting safe: blobs still carrying the
    // dropped toggles and the icon-size percentage must not resurrect them.
    const result = sanitize({
      simpleMode: true,
      allowCompleteOnStart: true,
      autoAddCompleted: true,
      iconSizePercent: 80,
      whateverElse: 'x',
    });
    expect(result).toEqual({ ...INTERFACE_SETTINGS_DEFAULTS, simpleMode: true });
  });

  it('ignores a boolean stored as something else', () => {
    // Truthy strings must not read as true.
    const result = sanitize({ simpleMode: 'yes', useCategories: 0, onlyToday: null });
    expect(result.simpleMode).toBe(INTERFACE_SETTINGS_DEFAULTS.simpleMode);
    expect(result.useCategories).toBe(INTERFACE_SETTINGS_DEFAULTS.useCategories);
    expect(result.onlyToday).toBe(INTERFACE_SETTINGS_DEFAULTS.onlyToday);
  });

  it('ignores a starting page outside the enum', () => {
    expect(sanitize({ startingPage: 'MARS' }).startingPage).toBe(
      INTERFACE_SETTINGS_DEFAULTS.startingPage,
    );
  });

  describe('coherence between categories and the starting page', () => {
    it('resets the starting page when categories are off', () => {
      // Otherwise the chosen start page is a screen the user has hidden — the
      // "ghost selection" the settings screen also guards against.
      const result = sanitize({ useCategories: false, startingPage: 'CATEGORIES' });
      expect(result.startingPage).toBe(INTERFACE_SETTINGS_DEFAULTS.startingPage);
    });

    it('keeps Categories as the starting page while categories are on', () => {
      const result = sanitize({ useCategories: true, startingPage: 'CATEGORIES' });
      expect(result.startingPage).toBe('CATEGORIES');
    });

    it('leaves other starting pages alone when categories are off', () => {
      const result = sanitize({ useCategories: false, startingPage: 'ALL_TASKS' });
      expect(result.startingPage).toBe('ALL_TASKS');
    });
  });
});
