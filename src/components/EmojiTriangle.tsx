import EmojiBubble from './EmojiBubble';

export default function EmojiTriangle({
  emojis, onPick, onRemove, editable,
}: {
  emojis: string[];
  onPick: (slot: number) => void;
  onRemove: (idx: number) => void;
  editable: boolean;
}) {
  const slots = [emojis[0], emojis[1], emojis[2]];
  return (
    <div className="relative mx-auto mt-6 grid h-40 w-56 grid-cols-2 place-items-center">
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