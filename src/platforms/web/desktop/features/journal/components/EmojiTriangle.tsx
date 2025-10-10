import { EmojiBubble } from '@shared/ui';

type EmojiTriangleVariant = 'compact' | 'expanded';

export default function EmojiTriangle({
  emojis, onPick, onRemove, editable, variant = 'expanded',
}: {
  emojis: string[];
  onPick: (slot: number) => void;
  onRemove: (idx: number) => void;
  editable: boolean;
  variant?: EmojiTriangleVariant;
}) {
  const slots = [emojis[0], emojis[1], emojis[2]];
  const containerClass = variant === 'compact'
    ? 'relative mx-auto mt-6 grid h-40 w-56 grid-cols-2 place-items-center'
    : 'relative mx-auto mt-6 grid h-48 w-72 grid-cols-2 place-items-center gap-y-4';
  return (
    <div className={containerClass}>
      {/* top-left */}
      <EmojiBubble emoji={slots[0]} empty={!slots[0]} onClick={() => editable && onPick(0)} onRemove={() => editable && onRemove(0)} />
      {/* top-right */}
      <EmojiBubble emoji={slots[1]} empty={!slots[1]} onClick={() => editable && onPick(1)} onRemove={() => editable && onRemove(1)} />
      {/* bottom, spans both cols */}
      <div className="col-span-2 mt-6 flex items-center justify-center">
        <EmojiBubble emoji={slots[2]} empty={!slots[2]} onClick={() => editable && onPick(2)} onRemove={() => editable && onRemove(2)} />
      </div>
    </div>
  );
}