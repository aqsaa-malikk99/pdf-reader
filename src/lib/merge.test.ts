import { describe, expect, it } from 'vitest';
import { mergeAnnotations, visibleAnnotations } from './merge';
import type { Annotation } from '../types';

function annotation(overrides: Partial<Annotation> & { id: string }): Annotation {
  return {
    type: 'highlight',
    page: 1,
    color: '#ffe066',
    comment: '',
    author: { id: 'guest:a', name: 'A' },
    replies: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('mergeAnnotations', () => {
  it('keeps annotations that only exist on one side', () => {
    const mine = [annotation({ id: 'a' })];
    const theirs = [annotation({ id: 'b' })];
    const merged = mergeAnnotations(mine, theirs);
    expect(merged.map((a) => a.id).sort()).toEqual(['a', 'b']);
  });

  it('does not lose a collaborator comment added during my edit', () => {
    // The bug this guards: replacing the list wholesale drops the other person.
    const serverState = [annotation({ id: 'supervisor', comment: 'Fix this' })];
    const myState = [annotation({ id: 'mine', comment: 'Noted' })];
    const merged = mergeAnnotations(myState, serverState);
    expect(merged).toHaveLength(2);
    expect(merged.find((a) => a.id === 'supervisor')?.comment).toBe('Fix this');
  });

  it('resolves conflicting edits by newest updatedAt', () => {
    const older = annotation({ id: 'x', comment: 'old', updatedAt: 100 });
    const newer = annotation({ id: 'x', comment: 'new', updatedAt: 200 });
    expect(mergeAnnotations([older], [newer])[0].comment).toBe('new');
    expect(mergeAnnotations([newer], [older])[0].comment).toBe('new');
  });

  it('propagates deletions instead of resurrecting them', () => {
    const live = annotation({ id: 'x', updatedAt: 300 });
    const tombstone = annotation({ id: 'x', deleted: true, updatedAt: 100 });
    // Even though the live copy is newer, the delete must stick.
    expect(mergeAnnotations([live], [tombstone])[0].deleted).toBe(true);
    expect(visibleAnnotations(mergeAnnotations([live], [tombstone]))).toHaveLength(0);
  });

  it('unions replies so simultaneous replies both survive', () => {
    const mine = annotation({
      id: 'x',
      replies: [{ id: 'r1', author: { id: 'g:1', name: 'A' }, text: 'first', createdAt: 10 }],
    });
    const theirs = annotation({
      id: 'x',
      replies: [{ id: 'r2', author: { id: 'g:2', name: 'B' }, text: 'second', createdAt: 20 }],
    });
    const replies = mergeAnnotations([mine], [theirs])[0].replies;
    expect(replies.map((r) => r.text)).toEqual(['first', 'second']);
  });

  it('is order-independent for the same inputs', () => {
    const a = annotation({ id: 'a', updatedAt: 5 });
    const b = annotation({ id: 'b', updatedAt: 9 });
    const forward = mergeAnnotations([a], [b]).map((x) => x.id).sort();
    const backward = mergeAnnotations([b], [a]).map((x) => x.id).sort();
    expect(forward).toEqual(backward);
  });
});
