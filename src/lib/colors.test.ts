import { describe, expect, it } from 'vitest';
import { HIGHLIGHT_COLORS, colorForUser, colorForUserInDocument, initialsOf } from './colors';

const at = (id: string, createdAt: number) => ({ author: { id }, createdAt });

describe('colorForUser', () => {
  it('is stable for the same id', () => {
    expect(colorForUser('google:123')).toBe(colorForUser('google:123'));
  });

  it('only ever returns palette colours', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(HIGHLIGHT_COLORS).toContain(colorForUser(`guest:${i}`) as never);
    }
  });
});

describe('colorForUserInDocument', () => {
  it('gives the first contributor the first palette colour', () => {
    expect(colorForUserInDocument('alice', [])).toBe(HIGHLIGHT_COLORS[0]);
  });

  it('gives a newcomer a colour nobody in the document is using', () => {
    const existing = [at('alice', 1)];
    expect(colorForUserInDocument('bob', existing)).toBe(HIGHLIGHT_COLORS[1]);
    expect(colorForUserInDocument('bob', existing)).not.toBe(
      colorForUserInDocument('alice', existing),
    );
  });

  it('keeps each existing contributor on their own colour', () => {
    const doc = [at('alice', 1), at('bob', 2), at('carol', 3)];
    const colors = ['alice', 'bob', 'carol'].map((id) => colorForUserInDocument(id, doc));
    expect(new Set(colors).size).toBe(3);
  });

  it('is stable as a contributor adds more annotations', () => {
    const before = [at('alice', 1), at('bob', 2)];
    const after = [...before, at('alice', 5), at('bob', 6), at('alice', 7)];
    expect(colorForUserInDocument('bob', after)).toBe(colorForUserInDocument('bob', before));
  });

  it('does not depend on the order annotations are listed in', () => {
    const forward = [at('alice', 1), at('bob', 2)];
    const shuffled = [at('bob', 2), at('alice', 1)];
    expect(colorForUserInDocument('bob', shuffled)).toBe(colorForUserInDocument('bob', forward));
  });

  it('falls back to a palette colour once every seat is taken', () => {
    const many = HIGHLIGHT_COLORS.map((_, i) => at(`user${i}`, i));
    expect(HIGHLIGHT_COLORS).toContain(colorForUserInDocument('overflow', many) as never);
  });
});

describe('initialsOf', () => {
  it('uses first and last initials', () => {
    expect(initialsOf('Aqsa Malik')).toBe('AM');
    expect(initialsOf('Dr Jane Q Smith')).toBe('DS');
  });

  it('handles single names and blanks', () => {
    expect(initialsOf('Cher')).toBe('CH');
    expect(initialsOf('   ')).toBe('?');
  });
});
