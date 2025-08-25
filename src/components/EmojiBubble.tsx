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
        {empty ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="rgba(255,255,255,1)" className="h-6 w-6">
            <path d="M10.5199 19.8634C10.5955 18.6615 10.8833 17.5172 11.3463 16.4676C9.81124 16.3252 8.41864 15.6867 7.33309 14.7151L8.66691 13.2248C9.55217 14.0172 10.7188 14.4978 12 14.4978C12.1763 14.4978 12.3501 14.4887 12.5211 14.471C14.227 12.2169 16.8661 10.7083 19.8634 10.5199C19.1692 6.80877 15.9126 4 12 4C7.58172 4 4 7.58172 4 12C4 15.9126 6.80877 19.1692 10.5199 19.8634ZM19.0233 12.636C15.7891 13.2396 13.2396 15.7891 12.636 19.0233L19.0233 12.636ZM22 12C22 12.1677 21.9959 12.3344 21.9877 12.5L12.5 21.9877C12.3344 21.9959 12.1677 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM10 10C10 10.8284 9.32843 11.5 8.5 11.5C7.67157 11.5 7 10.8284 7 10C7 9.17157 7.67157 8.5 8.5 8.5C9.32843 8.5 10 9.17157 10 10ZM17 10C17 10.8284 16.3284 11.5 15.5 11.5C14.6716 11.5 14 10.8284 14 10C14 9.17157 14.6716 8.5 15.5 8.5C16.3284 8.5 17 9.17157 17 10Z"></path>
          </svg>
        ) : (
          <span className="text-2xl leading-none">{emoji}</span>
        )}
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