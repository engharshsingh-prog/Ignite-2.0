import { useMemo, useState, useEffect } from 'react';

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function Countdown({ targetDateIso }: { targetDateIso?: string }) {
  const eventDate = useMemo(() => {
    const candidate = targetDateIso || '';
    if (!candidate) return null;
    const parsed = new Date(candidate);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }, [targetDateIso]);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: false });

  useEffect(() => {
    if (!eventDate) return;
    const calc = () => {
      const diff = eventDate.getTime() - Date.now();
      if (diff <= 0) { setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, ended: true }); return; }
      setTimeLeft({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000),
        ended: false,
      });
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [eventDate]);

  if (!eventDate) return <p className="text-slate-300 text-lg">Event date and time: To be announced</p>;

  if (timeLeft.ended) {
    return (
      <div className="text-center">
        <div className="inline-block px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-olive-500 text-white font-bold text-2xl animate-pulse">
          🎉 The Event Has Begun!
        </div>
      </div>
    );
  }

  const units = [
    { label: 'Days', value: timeLeft.days },
    { label: 'Hours', value: timeLeft.hours },
    { label: 'Minutes', value: timeLeft.minutes },
    { label: 'Seconds', value: timeLeft.seconds },
  ];

  return (
    <div className="flex items-center justify-center gap-3 sm:gap-5">
      {units.map((u, i) => (
        <div key={u.label} className="flex items-center gap-3 sm:gap-5">
          <div className="text-center">
            <div className="relative">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-white/5 border border-blue-500/30 backdrop-blur-sm flex items-center justify-center">
                <span className="font-mono font-bold text-2xl sm:text-3xl text-white tabular-nums">{pad(u.value)}</span>
              </div>
              <div className="absolute inset-0 rounded-xl bg-gradient-to-b from-blue-500/10 to-transparent pointer-events-none" />
            </div>
            <p className="text-xs text-blue-300 mt-1.5 font-medium tracking-widest uppercase">{u.label}</p>
          </div>
          {i < 3 && <span className="text-blue-400 font-bold text-2xl -mt-5">:</span>}
        </div>
      ))}
    </div>
  );
}
