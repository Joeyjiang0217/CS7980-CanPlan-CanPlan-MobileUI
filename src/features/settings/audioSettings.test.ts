import { AUDIO_SETTINGS_DEFAULTS, sanitize, speechRateFor } from './audioSettings';

describe('audio settings sanitize', () => {
  it('falls back to the defaults for unusable input', () => {
    expect(sanitize(null)).toEqual(AUDIO_SETTINGS_DEFAULTS);
    expect(sanitize('nope')).toEqual(AUDIO_SETTINGS_DEFAULTS);
    expect(sanitize([])).toEqual(AUDIO_SETTINGS_DEFAULTS);
  });

  it('keeps recognised values', () => {
    expect(sanitize({ autoPlayStepSounds: true, speechSpeedPercent: 70 })).toEqual({
      autoPlayStepSounds: true,
      speechSpeedPercent: 70,
    });
  });

  it('keeps auto-play off unless it was explicitly stored as true', () => {
    // Speech starting unprompted would startle someone in company, so the
    // default has to survive anything malformed.
    expect(sanitize({}).autoPlayStepSounds).toBe(false);
    expect(sanitize({ autoPlayStepSounds: 'true' }).autoPlayStepSounds).toBe(false);
    expect(sanitize({ autoPlayStepSounds: 1 }).autoPlayStepSounds).toBe(false);
  });

  it('clamps the speed into 0–100', () => {
    expect(sanitize({ speechSpeedPercent: 999 }).speechSpeedPercent).toBe(100);
    expect(sanitize({ speechSpeedPercent: -20 }).speechSpeedPercent).toBe(0);
  });

  it('ignores a non-finite or non-numeric speed', () => {
    expect(sanitize({ speechSpeedPercent: NaN }).speechSpeedPercent).toBe(
      AUDIO_SETTINGS_DEFAULTS.speechSpeedPercent,
    );
    expect(sanitize({ speechSpeedPercent: Infinity }).speechSpeedPercent).toBe(
      AUDIO_SETTINGS_DEFAULTS.speechSpeedPercent,
    );
    expect(sanitize({ speechSpeedPercent: '70' }).speechSpeedPercent).toBe(
      AUDIO_SETTINGS_DEFAULTS.speechSpeedPercent,
    );
  });
});

describe('speechRateFor', () => {
  it('reads the default 50% as normal speed', () => {
    // Load-bearing: the slider ships at 50, so anything else would change how
    // the app sounds for every existing install.
    expect(speechRateFor(AUDIO_SETTINGS_DEFAULTS.speechSpeedPercent)).toBe(1);
  });

  it('maps the ends of the slider to the rate bounds', () => {
    expect(speechRateFor(0)).toBeCloseTo(0.5);
    expect(speechRateFor(100)).toBeCloseTo(1.5);
  });

  it('is monotonic across the range', () => {
    expect(speechRateFor(25)).toBeGreaterThan(speechRateFor(0));
    expect(speechRateFor(75)).toBeGreaterThan(speechRateFor(50));
    expect(speechRateFor(100)).toBeGreaterThan(speechRateFor(75));
  });

  it('clamps out-of-range percentages instead of extrapolating', () => {
    // A rate of 0 would be silence and a huge rate unintelligible.
    expect(speechRateFor(-50)).toBeCloseTo(0.5);
    expect(speechRateFor(500)).toBeCloseTo(1.5);
  });
});
