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

  if (!eventDate) return <p className="text-slate-600 text-lg font-medium">Event date and time: To be announced</p>;

  if (timeLeft.ended) {
    return (
      <div className="text-center">
        <div className="inline-block px-8 py-4 rounded-2xl liquid-btn-primary text-white font-bold text-2xl animate-pulse">
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
    <div className="flex items-center justify-center gap-2.5 sm:gap-5">
      {units.map((u, i) => (
        <div key={u.label} className="flex items-center gap-2.5 sm:gap-5">
          <div className="text-center">
            <div className="relative group">
              <div className="w-16 h-16 sm:w-22 sm:h-22 rounded-2xl liquid-glass-card flex items-center justify-center border-sky-200/80">
                <div className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none" />
                <span className="relative z-10 font-mono font-black text-2xl sm:text-4xl bg-gradient-to-b from-slate-900 via-sky-700 to-cyan-600 bg-clip-text text-transparent tabular-nums">
                  {pad(u.value)}
                </span>
              </div>
            </div>
            <p className="text-[11px] sm:text-xs text-slate-600 mt-2 font-semibold tracking-[0.2em] uppercase">
              {u.label}
            </p>
          </div>
          {i < 3 && (
            <span className="text-sky-600/80 font-bold text-2xl sm:text-3xl -mt-6 animate-pulse">
              :
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
