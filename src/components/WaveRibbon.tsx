export default function WaveRibbon({
  colors, height = 56, amplitude = 20, className = '',
}: {
  colors: string[];
  height?: number;
  amplitude?: number;
  className?: string;
}) {
  const width = 320;
  const segments = colors.length;
  const step = width / Math.max(1, segments - 1);

  const pathTop: string[] = [];
  for (let i = 0; i < segments; i++) {
    const x = i * step;
    const y = height / 2 + Math.sin((i / (segments - 1)) * Math.PI * 2) * amplitude * 0.4;
    pathTop.push(`${i === 0 ? 'M' : 'L'}${x},${y}`);
  }
  const pathBottom = [...pathTop].reverse().map((cmd) => {
    const [MOrL, rest] = [cmd[0], cmd.slice(1)];
    const [xStr, yStr] = rest.split(',');
    const x = Number(xStr); const y = Number(yStr);
    return `${MOrL}${x},${y + 12}`;
  });

  const stops = colors.map((c, i) => (
    <stop key={i} offset={`${(i / Math.max(1, segments - 1)) * 100}%`} stopColor={c} />
  ));

  return (
    <svg className={'mx-auto block ' + className} viewBox={`0 0 ${width} ${height + 20}`} width={width} height={height + 20}>
      <defs><linearGradient id="waveGrad" x1="0%" y1="0%" x2="100%" y2="0%">{stops}</linearGradient></defs>
      <path d={[...pathTop, ...pathBottom, 'Z'].join(' ')} fill="url(#waveGrad)" opacity={0.95} />
    </svg>
  );
}