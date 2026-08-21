import { avatarColorForUser, initialsOf } from '../lib/colors';
import type { AuthorRef } from '../types';

interface Props {
  author: AuthorRef;
  size?: number;
}

export default function Avatar({ author, size = 24 }: Props) {
  const dimension = { width: size, height: size, fontSize: size * 0.4 };

  if (author.picture) {
    return (
      <img
        className="avatar"
        src={author.picture}
        alt=""
        style={dimension}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className="avatar avatar--initials"
      style={{ ...dimension, background: avatarColorForUser(author.id) }}
      title={author.name}
      aria-hidden="true"
    >
      {initialsOf(author.name)}
    </span>
  );
}
