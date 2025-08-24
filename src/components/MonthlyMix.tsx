import { hsl } from '../lib/utils';

export default function MonthlyMix({ hues, className = '' }: { hues: number[]; className?: string }) {
  const width = 320, height = 80;
  const colors = hues.map((h) => hsl(h));
  const stops = colors.map((c, i) => (
    <stop key={i} offset={`${(i / Math.max(1, colors.length - 1)) * 100}%`} stopColor={c} />
  ));
  const amplitude = 18;
  const pathTop: string[] = [];
  for (let i = 0; i < 20; i++) {
    const x = (i / 19) * width;
    const y = height / 2 + Math.sin((i / 19) * Math.PI * 2) * amplitude * 0.5;
    pathTop.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
  }
  const pathBottom = [...pathTop].reverse().map((cmd) => {
    const [MOrL, rest] = [cmd[0], cmd.slice(1)];
    const [xStr, yStr] = rest.split(',');
    const x = Number(xStr); const y = Number(yStr);
    return `${MOrL}${x},${y + 18}`;
  });

  return (
    <svg className={'mx-auto block ' + className} viewBox={`0 0 ${width} ${height + 20}`} width={width} height={height + 20}>
      <defs><linearGradient id="monthGrad" x1="0%" y1="0%" x2="100%" y2="0%">{stops}</linearGradient></defs>
      <path d={[...pathTop, ...pathBottom, 'Z'].join(' ')} fill="url(#monthGrad)" opacity={0.95} />
    </svg>
  );
}