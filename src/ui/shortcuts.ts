/** The parts of a KeyboardEvent the shortcut rules look at. */
export type KeyPress = {
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  repeat: boolean;
  target: { tagName?: string; isContentEditable?: boolean } | null;
};

const TYPING_TAGS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** "A" opens Add entry. Matched by key position (`code`), so it works on any layout, e.g. Russian ("ф"). */
export function isAddEntryShortcut(event: KeyPress, blocked: boolean): boolean {
  if (blocked || event.repeat || event.code !== 'KeyA') return false;
  if (event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target;
  return !(target && (TYPING_TAGS.has(target.tagName ?? '') || target.isContentEditable));
}
