'use client';

import { useId, useState } from 'react';
import styles from './GameCards.module.css';

// The count in a dashboard card's corner, and the short list it opens beneath
// the card. Its own client file so the toggle state lives here rather than in
// GameCards.tsx, which carries no 'use client' and stays usable from a server
// component.

export default function GameCardSignal({
  name,
  signal,
}: {
  name: string;
  signal: { count: number; items: { title: string; href: string }[] };
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <>
      <button
        type="button"
        className={styles.signalButton}
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`${signal.count} waiting in ${name}`}
        onClick={() => setOpen(o => !o)}
      >
        {signal.count > 9 ? '9+' : signal.count}
      </button>
      {open && (
        <ul id={listId} className={styles.signalList}>
          {signal.items.map(item => (
            <li key={item.href}>
              <a href={item.href} className={styles.signalItem}>
                {item.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
