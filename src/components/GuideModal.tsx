import { useState, useEffect, useRef } from 'react';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Welcome to Flowday',
    body: 'Capture each day with up to 3 emojis. They form your monthly aura and yearly constellations.'
  },
  {
    title: 'Pick emojis',
    body: 'Tap the triangle slots to choose emojis that reflect your day. They stay unique per day.'
  },
  {
    title: 'Color your vibe',
    body: 'Drag the rainbow slider to set a hue for today. This powers gradients and mood summaries.'
  },
  {
    title: 'Song of the day',
    body: 'Optionally add a song (artist + title). Leave both blank to clear it.'
  },
  {
    title: 'Flows view',
    body: 'See recent days (week / month) and color patterns. Switch modes inside Flows.'
  },
  {
    title: 'Constellations',
    body: 'Your most frequent emojis form a physics constellation. Pinch / drag / zoom to explore.'
  },
  {
    title: 'Echoes',
    body: 'Look back across years to see how your vibe evolves (year offset navigation).'
  },
  {
    title: 'Auto avatar',
    body: 'Top-right in settings: auto-generated from this month\'s top emoji + colors.'
  },
  {
    title: 'Reset & privacy',
    body: 'Data is local first. Use the settings account section to delete all local data anytime.'
  }
];

export default function GuideModal({ open, onClose }: GuideModalProps) {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(open);
  const [closing, setClosing] = useState(false);
  const [entering, setEntering] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const enterRaf = useRef<number | null>(null);

  // When open toggles true -> show immediately
  useEffect(()=>{
    if (open) {
      if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
      if (enterRaf.current) cancelAnimationFrame(enterRaf.current);
      setVisible(true);
      setClosing(false);
      setEntering(true); // start from hidden state
      setStep(0);
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

  if (!visible) return null;
  const last = step === STEPS.length - 1;
  return (
  <div className={`fixed inset-0 z-[60] flex items-center justify-center p-5 transition-colors duration-250 ${closing || entering ? 'bg-black/0' : 'bg-black/70 backdrop-blur-sm'}`} onClick={()=>{ if(!closing) onClose(); }}>
      <div
    className={`w-full max-w-sm rounded-2xl ring-1 ring-white/10 p-6 relative transition-all duration-250 ${closing || entering ? 'opacity-0 scale-[0.94] -translate-y-2' : 'opacity-100 scale-100 translate-y-0'} bg-[#111]`}
        onClick={(e)=> { e.stopPropagation(); }}
      >
        <div className="absolute top-2 right-2">
          <button aria-label="Close guide" onClick={()=>{ if(!closing) onClose(); }} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition">
            ✕
          </button>
        </div>
        <div className="text-[11px] tracking-wide uppercase text-white/40 mb-2">Quick guide</div>
        <h2 className="text-lg font-semibold mb-3 text-white/90">{STEPS[step].title}</h2>
        <p className="text-sm text-white/65 leading-relaxed min-h-[68px]">{STEPS[step].body}</p>
        <div className="mt-5 flex items-center justify-between text-xs text-white/45">
          <div>Step {step+1} / {STEPS.length}</div>
          <div className="flex gap-1">
            {STEPS.map((_,i)=> <span key={i} className={`h-1.5 w-1.5 rounded-full ${i===step? 'bg-white':'bg-white/25'}`}/>) }
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          {step>0 && (
            <button
              onClick={()=> setStep(s=> Math.max(0,s-1))}
              className="flex-1 rounded-md px-3 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/80 transition"
            >Back</button>
          )}
          <button
            onClick={()=> { if(last) onClose(); else setStep(s=> Math.min(STEPS.length-1, s+1)); }}
            className="flex-1 rounded-md px-3 py-2 text-sm font-medium bg-white/15 hover:bg-white/25 ring-1 ring-white/15 text-white transition"
          >{last? 'Finish':'Next'}</button>
        </div>
      </div>
    </div>
  );
}
