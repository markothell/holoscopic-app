'use client';

// Live token balance — the player's stake capacity in this room.
// Holons under the hood; always "tokens" in the UI.
export default function TokenChip({ balance }: { balance: number | null }) {
  if (balance === null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-paper-raised px-3 py-1">
      <span className="text-ax" aria-hidden>●</span>
      <span className="eyebrow !text-ink">{balance} token{balance === 1 ? '' : 's'}</span>
    </span>
  );
}
