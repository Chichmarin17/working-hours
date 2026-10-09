import { describe, expect, it } from 'vitest';
import { isAddEntryShortcut, type KeyPress } from './shortcuts';

const press = (overrides: Partial<KeyPress> = {}): KeyPress => ({
  code: 'KeyA',
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  repeat: false,
  target: { tagName: 'BODY', isContentEditable: false },
  ...overrides,
});

describe('isAddEntryShortcut', () => {
  it('fires on the A key by position, whatever letter the layout types (e.g. "ф")', () => {
    expect(isAddEntryShortcut(press(), false)).toBe(true);
  });

  it('ignores other keys and held-down repeats', () => {
    expect(isAddEntryShortcut(press({ code: 'KeyN' }), false)).toBe(false);
    expect(isAddEntryShortcut(press({ repeat: true }), false)).toBe(false);
  });

  it('never clashes with Cmd, Ctrl or Alt shortcuts', () => {
    expect(isAddEntryShortcut(press({ metaKey: true }), false)).toBe(false);
    expect(isAddEntryShortcut(press({ ctrlKey: true }), false)).toBe(false);
    expect(isAddEntryShortcut(press({ altKey: true }), false)).toBe(false);
  });

  it('is ignored while typing in a field', () => {
    for (const tagName of ['INPUT', 'SELECT', 'TEXTAREA']) {
      expect(isAddEntryShortcut(press({ target: { tagName, isContentEditable: false } }), false)).toBe(false);
    }
    expect(isAddEntryShortcut(press({ target: { tagName: 'DIV', isContentEditable: true } }), false)).toBe(false);
  });

  it('is ignored while something blocks it, like the away dialog', () => {
    expect(isAddEntryShortcut(press(), true)).toBe(false);
  });
});
