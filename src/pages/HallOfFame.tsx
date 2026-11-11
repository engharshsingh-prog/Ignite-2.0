import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Crown, Trophy, Star, Sparkles, Mic2, Laugh, Shirt } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import WinnerAvatar from '../components/WinnerAvatar';
import { readJsonSafe } from '../lib/http';

interface Winner {
  id: number;
  name: string;
  roll_no: string;
  branch: string;
  award_title: string;
  image_url: string;
  description: string;
}

function normalizeMojibake(value: string): string {
  const raw = String(value || '');
  if (!/[ðâÃ]/.test(raw)) return raw;
  try {
    const bytes = Uint8Array.from(Array.from(raw).map((ch) => ch.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    return decoded || raw;
  } catch {
    return raw;
  }
}

const AWARD_ICONS: Record<string, LucideIcon> = {
  'Mr. IGNITE': Crown,
  'Ms. IGNITE': Crown,
  'Mr. Fresher': Trophy,
  'Ms. Fresher': Trophy,
  'Best Dancer': Sparkles,
  'Best Singer': Mic2,
  'Most Talented': Star,
  'Mr. Personality': Star,
  'Ms. Personality': Star,
  'Best Dressed': Shirt,
  'Funniest Fresher': Laugh,
};

const AWARD_COLORS: Record<string, string> = {
  'Mr. IGNITE': 'from-cyan-400 via-sky-400 to-blue-500',
  'Ms. IGNITE': 'from-violet-400 via-purple-400 to-cyan-300',
  'Mr. Fresher': 'from-cyan-400 to-blue-500',
  'Ms. Fresher': 'from-violet-400 to-cyan-300',
  'Best Dancer': 'from-blue-400 to-violet-400',
  'Best Singer': 'from-sky-400 to-indigo-400',
  'Most Talented': 'from-teal-300 to-cyan-500',
  'Mr. Personality': 'from-amber-300 to-cyan-400',
};

export default function HallOfFame() {
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWinners = async () => {
      try {
        const res = await fetch('/api/winners');
        const data = await readJsonSafe<Winner[]>(res);
        setWinners(Array.isArray(data) ? data : []);
      } catch {
        setWinners([]);
      } finally {
        setLoading(false);
      }
    };
    fetchWinners();
  }, []);

  const normalizedWinners = winners.map((w) => ({
    ...w,
    award_title: normalizeMojibake(w.award_title),
    description: normalizeMojibake(w.description),
    name: normalizeMojibake(w.name),
    branch: normalizeMojibake(w.branch),
  }));

  const featuredAwards = new Set(['Mr. IGNITE', 'Ms. IGNITE', 'Mr. Fresher', 'Ms. Fresher']);
  const topTwo = normalizedWinners.filter((w) => featuredAwards.has(w.award_title));
  const rest = normalizedWinners.filter((w) => !featuredAwards.has(w.award_title));

  return (
    <div className="min-h-screen text-white pt-24 pb-20">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/10 via-blue-500/5 to-transparent pointer-events-none" />
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-[28rem] h-48 bg-cyan-400/12 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-4 py-14 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full liquid-glass-pill text-xs font-semibold tracking-widest uppercase text-cyan-200 mb-5">
              <Crown size={14} className="text-cyan-300" /> Champions & Icons
            </div>
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="liquid-icon-bubble w-11 h-11 text-cyan-300 shrink-0">
                <Trophy size={22} />
              </span>
              <h1 className="text-4xl sm:text-6xl font-black bg-gradient-to-r from-white via-cyan-200 to-violet-300 bg-clip-text text-transparent">
                Hall of Fame
              </h1>
              <span className="liquid-icon-bubble w-11 h-11 text-cyan-300 shrink-0">
                <Trophy size={22} />
              </span>
            </div>
            <p className="text-slate-300/85 text-lg">The stars of Ignite 2.O</p>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4">
        {loading ? <LoadingSpinner text="Loading winners..." /> : normalizedWinners.length === 0 ? (
          <div className="liquid-glass-card rounded-3xl max-w-md mx-auto text-center py-14 px-8">
            <div className="liquid-icon-bubble w-16 h-16 mx-auto mb-4 text-cyan-300/75">
              <Crown size={30} />
            </div>
            <p className="text-slate-300">Winners will be announced soon. Stay tuned!</p>
          </div>
        ) : (
          <>
            {topTwo.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                {topTwo.map((winner, i) => {
                  const FeaturedIcon = AWARD_ICONS[winner.award_title] || Trophy;
                  const badgeGradient = AWARD_COLORS[winner.award_title] || 'from-cyan-400 to-blue-500';
                  return (
                    <motion.div
                      key={winner.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.15 }}
                      className="relative group"
                    >
                      <div className={`absolute -inset-0.5 bg-gradient-to-br ${badgeGradient} rounded-3xl opacity-20 group-hover:opacity-35 blur-md transition-opacity duration-300 pointer-events-none`} />
                      <div className="relative liquid-glass-strong rounded-3xl p-8 text-center overflow-hidden transition-transform duration-300 group-hover:-translate-y-1">
                        <div className="absolute top-4 right-4 liquid-icon-bubble w-9 h-9 text-cyan-300">
                          <Star size={16} fill="currentColor" />
                        </div>
                        <div className="mb-4 flex justify-center">
                          <div className="liquid-icon-bubble w-16 h-16 rounded-2xl text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.22)]">
                            <FeaturedIcon size={32} />
                          </div>
                        </div>
                        <div className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-5 bg-gradient-to-r ${badgeGradient} text-slate-950 shadow-lg shadow-cyan-500/20`}>
                          {winner.award_title}
                        </div>
                        <div className="flex justify-center mb-4">
                          <WinnerAvatar
                            src={winner.image_url}
                            name={winner.name}
                            className="w-32 h-32 rounded-full object-cover border-4 border-cyan-300/35 shadow-[0_0_28px_rgba(34,211,238,0.22)]"
                            fallbackClassName="w-32 h-32 rounded-full bg-gradient-to-br from-blue-500 via-cyan-500 to-violet-500 flex items-center justify-center text-4xl font-black text-white border-4 border-cyan-300/35 shadow-[0_0_28px_rgba(34,211,238,0.22)]"
                            textSize="text-4xl"
                          />
                        </div>
                        <h2 className="text-2xl font-black text-white mb-1">{winner.name}</h2>
                        <p className="text-cyan-200/75 text-sm mb-3">{winner.roll_no} &bull; {winner.branch}</p>
                        {winner.description && <p className="text-slate-300/90 text-sm leading-relaxed">{winner.description}</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {rest.length > 0 && (
              <>
                <h2 className="text-2xl font-bold text-center mb-8 bg-gradient-to-r from-white to-cyan-200 bg-clip-text text-transparent">
                  Other Award Winners
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rest.map((winner, i) => {
                    const CardIcon = AWARD_ICONS[winner.award_title] || Trophy;
                    const badgeGradient = AWARD_COLORS[winner.award_title] || 'from-cyan-400 to-blue-500';
                    return (
                      <motion.div
                        key={winner.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                        className="liquid-glass-card rounded-2xl p-6 transition-all duration-300 hover:-translate-y-1.5"
                      >
                        <div className="flex items-center gap-4 mb-4">
                          <WinnerAvatar
                            src={winner.image_url}
                            name={winner.name}
                            className="w-16 h-16 rounded-full object-cover border-2 border-cyan-400/40 shadow-[0_0_16px_rgba(34,211,238,0.18)] shrink-0"
                            fallbackClassName="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 via-cyan-500 to-violet-500 flex items-center justify-center text-2xl font-black text-white border-2 border-cyan-400/40 shrink-0"
                            textSize="text-2xl"
                          />
                          <div>
                            <h3 className="font-bold text-white">{winner.name}</h3>
                            <p className="text-slate-300/75 text-xs">{winner.roll_no} &bull; {winner.branch}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="liquid-icon-bubble w-8 h-8 rounded-lg text-cyan-300 shrink-0">
                            <CardIcon size={16} />
                          </span>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r ${badgeGradient} text-slate-950 shadow-sm shadow-cyan-500/20`}>
                            {winner.award_title}
                          </span>
                        </div>
                        {winner.description && <p className="text-slate-300/80 text-sm leading-relaxed">{winner.description}</p>}
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
