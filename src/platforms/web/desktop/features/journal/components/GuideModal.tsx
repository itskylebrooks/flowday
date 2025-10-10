import { useState, useEffect, useRef } from 'react';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

type Step = {
  title: string;
  body: string;
  icon: string;
  accent: string;
};

const STEPS: Step[] = [
  {
    title: 'Start a Flow',
    body: 'Tap +, pick up to 3 emojis, and watch Flowday frame the mood for today in seconds.',
    icon: '🌅',
    accent: 'from-[#F97316]/50 via-[#F97316]/20 to-transparent'
  },
  {
    title: 'Paint the vibe',
    body: 'Slide the rainbow once emojis are set. The hue powers every gradient in Flows and Mixes.',
    icon: '🎨',
    accent: 'from-[#A855F7]/40 via-[#3B82F6]/30 to-transparent'
  },
  {
    title: 'Add an Echo',
    body: 'Drop in a song title & artist for a cassette snapshot. Leave it blank to clear the track.',
    icon: '📼',
    accent: 'from-[#22D3EE]/40 via-[#67E8F9]/20 to-transparent'
  },
  {
    title: 'Auto-save magic',
    body: 'Flowday keeps everything synced as you edit—adjust today or yesterday anytime while past memories stay untouched.',
    icon: '💾',
    accent: 'from-[#34D399]/40 via-[#059669]/20 to-transparent'
  },
  {
    title: 'Explore your world',
    body: 'Swipe between Week Flows, Month Mix ribbons, Echo cards, and live emoji constellations.',
    icon: '🪐',
    accent: 'from-[#F59E0B]/40 via-[#F97316]/30 to-transparent'
  },
  {
    title: 'Share & manage',
    body: 'Export posters, share to Telegram, set a username, or move data with quick JSON backups.',
    icon: '✨',
    accent: 'from-[#F472B6]/40 via-[#EC4899]/25 to-transparent'
  }
];

export default function GuideModal({ open, onClose }: GuideModalProps) {
  const [step, setStep] = useState(0);
  // transition layering state
  const [renderedSteps, setRenderedSteps] = useState([{ key: 0, idx: 0, phase: 'enter' as 'enter'|'exit', dir: 'forward' as 'forward'|'back' }]);
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const [entering, setEntering] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const enterRaf = useRef<number | null>(null);
  const stepAnimTimer = useRef<number | null>(null);
  const stepKeyRef = useRef(0);

  // When open toggles true -> show immediately
  useEffect(()=>{
    if (open) {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
      if (enterRaf.current) cancelAnimationFrame(enterRaf.current);
      setVisible(true);
      setClosing(false);
      setEntering(true); // start from hidden state
      setStep(0);
      stepKeyRef.current++;
      setRenderedSteps([{ key: stepKeyRef.current, idx: 0, phase: 'enter', dir: 'forward' }]);
      // two RAFs to ensure initial class applied before transition
      enterRaf.current = requestAnimationFrame(()=> {
        enterRaf.current = requestAnimationFrame(()=> setEntering(false));
      });
    } else if (visible) {
      // animate out
      setClosing(true);
      closeTimer.current = window.setTimeout(()=> { setVisible(false); setClosing(false); }, 260);
    }
  }, [open, visible]);

  useEffect(()=>()=> {
    if(closeTimer.current) clearTimeout(closeTimer.current);
    if(enterRaf.current) cancelAnimationFrame(enterRaf.current);
  }, []);

  // step change effect to trigger animated layer swap
  useEffect(()=>{
    return () => { if(stepAnimTimer.current) clearTimeout(stepAnimTimer.current); };
  }, []);

  const queueStep = (next: number) => {
    if (next === step) return; // no-op
    const dir: 'forward'|'back' = next > step ? 'forward' : 'back';
    // mark existing layers exiting (only keep top-most latest active one)
    setRenderedSteps(prev => {
      const updated = prev.map(p => ({ ...p, phase: 'exit' as const, dir }));
      stepKeyRef.current++;
      return [...updated, { key: stepKeyRef.current, idx: next, phase: 'enter' as const, dir }];
    });
    setStep(next);
    if(stepAnimTimer.current) clearTimeout(stepAnimTimer.current);
    stepAnimTimer.current = window.setTimeout(()=> {
      setRenderedSteps(curr => curr.filter(layer => layer.phase === 'enter'));
    }, 400); // longer than exit animation (0.32s) to be safe
  };

  if (!visible) return null;
  const last = step === STEPS.length - 1;
  return (
    <div className={`fixed inset-0 z-[60] flex items-center justify-center p-5 transition-colors duration-250 ${closing || entering ? 'bg-black/0' : 'bg-black/70 backdrop-blur-sm'}`} onClick={()=>{ if(!closing) onClose(); }}>
      <div
        className={`w-full max-w-sm rounded-3xl ring-1 ring-white/10 p-6 relative transition-all duration-250 ${closing || entering ? 'opacity-0 scale-[0.94] -translate-y-2' : 'opacity-100 scale-100 translate-y-0'} bg-[#0B0B0B]`}
        onClick={(e)=> { e.stopPropagation(); }}
      >
        <div className="absolute top-2 right-2">
          <button aria-label="Close guide" onClick={()=>{ if(!closing) onClose(); }} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition">
            ✕
          </button>
        </div>
        <div className="text-[11px] tracking-wide uppercase text-white/40">Quick guide</div>
        <div className="mt-1 text-sm font-medium text-white/80">Flowday in a flash</div>
        <p className="mt-2 text-xs text-white/50">Tap a tile to jump around — each step keeps things breezy and visual.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {STEPS.map((item, i) => (
            <button
              key={item.title}
              onClick={()=> queueStep(i)}
              className={`group relative overflow-hidden rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0B] ${i === step ? 'border-white/25 bg-white/10 text-white' : 'border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20 hover:bg-white/10'}`}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${item.accent} transition-opacity ${i === step ? 'opacity-80' : 'opacity-0 group-hover:opacity-50'}`} />
              <div className="relative flex flex-col gap-2">
                <span className="text-xl leading-none">{item.icon}</span>
                <span className="text-[11px] font-semibold leading-tight tracking-wide uppercase">{item.title}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-5 relative min-h-[150px]">
          {renderedSteps.map(layer => {
            const data = STEPS[layer.idx];
            const stateClass = layer.phase === 'enter'
              ? (layer.dir === 'forward' ? 'guide-step-enter-forward' : 'guide-step-enter-back')
              : (layer.dir === 'forward' ? 'guide-step-exit-forward' : 'guide-step-exit-back');
            return (
              <div key={layer.key} className={`guide-step-layer ${stateClass}`}>
                <div className="relative overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5">
                  <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${data.accent} opacity-70`} />
                  <div className="relative flex flex-col gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black/30 text-2xl">{data.icon}</div>
                      <h2 className="text-lg font-semibold text-white">{data.title}</h2>
                    </div>
                    <p className="text-sm text-white/75 leading-relaxed">{data.body}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-white/45">
            <span>Step {step+1} / {STEPS.length}</span>
            <span>{STEPS[step].title}</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/70 transition-all"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          {step>0 && (
            <button
              onClick={()=> queueStep(Math.max(0, step-1))}
              className="flex-1 rounded-md px-3 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/80 transition"
            >Back</button>
          )}
          <button
            onClick={()=> { if(last) onClose(); else queueStep(Math.min(STEPS.length-1, step+1)); }}
            className="flex-1 rounded-md px-3 py-2 text-sm font-medium bg-white/15 hover:bg-white/25 ring-1 ring-white/15 text-white transition"
          >{last? 'Finish':'Next'}</button>
        </div>
      </div>
    </div>
  );
}
