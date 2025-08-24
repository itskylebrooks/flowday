import { useState, useEffect, useRef } from 'react';
import { t } from '../lib/i18n';

interface GuideModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Welcome to Flowday',
    body: 'A 20-second ritual: pick up to 3 emojis, slide a color, and optionally add a song — your day distilled into color, emoji, and a vibe.'
  },
  {
    title: 'Pick emojis',
    body: 'Tap 1–3 triangle slots to select emojis that reflect your day. They form your aura and feed the constellations.'
  },
  {
    title: 'Color your vibe',
    body: 'Drag the rainbow slider (unlocks after first emoji) to set today\'s hue — it powers gradients in Flows and Month Mixes.'
  },
  {
    title: 'Add a song (optional)',
    body: 'Enter a title and artist to create an Echo (cassette-style snapshot). Leave blank to clear.'
  },
  {
    title: 'Save & edit rules',
    body: 'Saved entries show a gentle confirmation. You can edit today and yesterday only; earlier days are snapshots.'
  },
  {
    title: 'Flows, Mixes & Posters',
    body: 'Week Flow shows 7 blended bands; Month Mix creates a continuous ribbon — both exportable as PNG posters.'
  },
  {
    title: 'Constellations',
    body: 'Top emojis become nodes; co-occurrences connect them. Pinch / drag to explore your emoji sky.'
  },
  {
    title: 'Echoes',
    body: 'Days with songs surface as Echo cards (date, title, artist) — open one for a cassette-style view.'
  },
  {
    title: 'Sharing & privacy',
    body: 'Export PNGs or share directly to Telegram. Data is local-first; future sync is optional and opt-in only.'
  },
  {
    title: 'Settings & account',
    body: 'Set a username (auto in Telegram), manage reminders, or wipe local data from Settings.'
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
    className={`w-full max-w-sm rounded-2xl ring-1 ring-white/10 p-6 relative transition-all duration-250 ${closing || entering ? 'opacity-0 scale-[0.94] -translate-y-2' : 'opacity-100 scale-100 translate-y-0'} bg-[#111]`}
        onClick={(e)=> { e.stopPropagation(); }}
      >
        <div className="absolute top-2 right-2">
          <button aria-label={t('Close guide')} onClick={()=>{ if(!closing) onClose(); }} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition">
            ✕
          </button>
        </div>
        <div className="text-[11px] tracking-wide uppercase text-white/40 mb-2">{t('Quick guide')}</div>
        <div className="relative min-h-[120px]">
          {renderedSteps.map(layer => {
            const data = STEPS[layer.idx];
            const stateClass = layer.phase === 'enter'
              ? (layer.dir === 'forward' ? 'guide-step-enter-forward' : 'guide-step-enter-back')
              : (layer.dir === 'forward' ? 'guide-step-exit-forward' : 'guide-step-exit-back');
            return (
              <div key={layer.key} className={`guide-step-layer ${stateClass}`}>
                <h2 className="text-lg font-semibold mb-3 text-white/90">{t(data.title)}</h2>
                <p className="text-sm text-white/65 leading-relaxed">{t(data.body)}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex items-center justify-between text-xs text-white/45">
          <div>{t('Step')} {step+1} / {STEPS.length}</div>
          <div className="flex gap-1">
            {STEPS.map((_,i)=> <span key={i} className={`h-1.5 w-1.5 rounded-full ${i===step? 'bg-white':'bg-white/25'}`}/>) }
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          {step>0 && (
            <button
              onClick={()=> queueStep(Math.max(0, step-1))}
              className="flex-1 rounded-md px-3 py-2 text-sm font-medium bg-white/5 hover:bg-white/10 ring-1 ring-white/10 text-white/80 transition"
            >{t('Back')}</button>
          )}
          <button
            onClick={()=> { if(last) onClose(); else queueStep(Math.min(STEPS.length-1, step+1)); }}
            className="flex-1 rounded-md px-3 py-2 text-sm font-medium bg-white/15 hover:bg-white/25 ring-1 ring-white/15 text-white transition"
          >{last? t('Finish'):t('Next')}</button>
        </div>
      </div>
    </div>
  );
}
