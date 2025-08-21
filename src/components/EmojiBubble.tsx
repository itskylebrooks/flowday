export default function EmojiBubble({
  emoji, empty, onClick, onRemove,
}: {
  emoji?: string;
  empty?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="relative h-12 w-12">
      <button
        onClick={onClick}
        className={
          'flex h-12 w-12 items-center justify-center rounded-full border ' +
          (empty ? 'border-white/20 text-white/40' : 'border-white/20 bg-white/5')
        }
      >
        <span className="text-2xl leading-none">{empty ? '+' : emoji}</span>
      </button>
      {!empty && (
        <button
          onClick={onRemove}
          className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-xs text-white/70 hover:bg-white/20"
          aria-label="Remove emoji"
        >
          ×
        </button>
      )}
    </div>
  );
}