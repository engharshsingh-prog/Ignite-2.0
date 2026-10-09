import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  Calendar,
  MapPin,
  Clock,
  Camera,
  Mic2,
  UtensilsCrossed,
  Star,
  BadgeCheck,
  PartyPopper,
} from 'lucide-react';
import Countdown from '../components/Countdown';
import SplashScreen from '../components/SplashScreen';
import { useEventSettings } from '../lib/useEventSettings';

const fadeUp = { hidden: { opacity: 0, y: 28 }, show: { opacity: 1, y: 0 } };

const EVENT_PILLARS = [
  { icon: Mic2, title: 'Stage Showdowns', desc: 'Singing, dance, stand-up and surprise acts with live crowd voting.' },
  { icon: Camera, title: 'Memory Walls', desc: 'Photo booths, portrait corners and roaming candid captures all day.' },
  { icon: Star, title: 'Fresher Crowns', desc: 'Mr. and Ms. Fresher finale with spotlight rounds and jury reveals.' },
  { icon: UtensilsCrossed, title: 'Grand Feast', desc: 'Curated dinner spread with multi-cuisine counters and chill zones.' },
];

const FLOATING_ICONS = [
  { icon: Sparkles, top: '16%', left: '8%', delay: 0.1, duration: 5.5 },
  { icon: Camera, top: '30%', right: '10%', delay: 0.4, duration: 6.2 },
  { icon: Mic2, top: '62%', left: '12%', delay: 0.7, duration: 5.8 },
  { icon: Star, top: '70%', right: '14%', delay: 1, duration: 6.5 },
  { icon: PartyPopper, top: '46%', left: '4%', delay: 1.2, duration: 7.1 },
];

export default function Home() {
  const [showSplash, setShowSplash] = useState(false);
  const { settings, loading, error } = useEventSettings();

  const quickDetails = useMemo(() => [
    { icon: Calendar, label: 'Date', value: settings.dateLabel, tone: 'blue' },
    { icon: Clock, label: 'Time', value: settings.timeLabel, tone: 'olive' },
    { icon: MapPin, label: 'Venue', value: settings.venue, tone: 'olive' },
  ], [settings.dateLabel, settings.timeLabel, settings.venue]);

  const flow = useMemo(() => settings.flow, [settings.flow]);
  const scheduleConfigured = Boolean(settings.dateLabel && settings.timeLabel);

  useEffect(() => {
    const key = 'ignite26_splash_seen';
    const hasSeen = sessionStorage.getItem(key) === '1';
    if (hasSeen) return;

    setShowSplash(true);
    const t = window.setTimeout(() => {
      setShowSplash(false);
      sessionStorage.setItem(key, '1');
    }, 2200);

    return () => window.clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-[#111411] grid-bg text-white overflow-x-hidden relative">
      <SplashScreen show={showSplash} />
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(113,128,68,0.24),transparent_34%),radial-gradient(circle_at_82%_14%,rgba(59,130,246,0.2),transparent_30%),radial-gradient(circle_at_50%_78%,rgba(163,180,106,0.12),transparent_34%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#111411]/20 via-[#141916]/35 to-[#111411]/30" />
      </div>
      <div className="pointer-events-none absolute inset-0 z-[1]">
        {FLOATING_ICONS.map((item, idx) => (
          <motion.div
            key={`floating-icon-${idx}`}
            className="absolute hidden md:flex w-12 h-12 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm items-center justify-center text-blue-200"
            style={{ top: item.top, left: item.left, right: item.right }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0.4, 0.8, 0.4], y: [0, -14, 0], rotate: [0, 4, 0] }}
            transition={{ delay: item.delay, duration: item.duration, repeat: Infinity, ease: 'easeInOut' }}
          >
            <item.icon size={20} />
          </motion.div>
        ))}
      </div>

      <section className="relative min-h-screen flex items-center justify-center pt-8 scroll-snap-section">
        <div className="absolute inset-0 bg-gradient-to-b from-[#171b18]/20 via-[#171b18]/35 to-[#171b18]/45 pointer-events-none" />

        <motion.div className="relative z-10 text-center px-4 max-w-5xl mx-auto" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}>
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-blue-500/40 bg-blue-500/10 backdrop-blur-sm text-blue-300 text-sm font-medium mb-8"
          >
            <Sparkles size={14} />
            Institute of Engineering and Technology | Batch 2024
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tight mb-4">
            <span className="text-white">Ignite</span>
            <span className="bg-gradient-to-r from-olive-300 to-blue-300 bg-clip-text text-transparent">2.O</span>
            <br />
            <span className="text-3xl sm:text-4xl md:text-5xl font-light text-blue-300 tracking-[0.26em]">2026</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="text-lg sm:text-xl text-gray-300 max-w-3xl mx-auto mb-9">
            The unified campus celebration of talent, style, interaction, fresh energy and unforgettable moments. Music, motion, crowns, and a full-day social vibe.
          </motion.p>

          <motion.div variants={fadeUp} className="mb-10">
            <p className="text-blue-300 text-sm font-medium tracking-widest uppercase mb-6">Event Countdown</p>
            <Countdown targetDateIso={scheduleConfigured ? settings.countdownIso : ''} />
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/register" className="group px-8 py-4 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#718044] text-white font-bold text-lg hover:opacity-90 transition-all hover:scale-[1.03] flex items-center gap-2">
              Register Now
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link to="/gallery" className="px-8 py-4 rounded-xl border border-white/20 text-white font-semibold hover:bg-white/5 transition-all">
              View Gallery
            </Link>
          </motion.div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="absolute top-24 right-6 sm:right-14 px-4 py-3 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-sm hidden md:block z-10">
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Live Energy</p>
          <div className="flex items-center gap-2 text-emerald-300 text-sm font-semibold">
            <BadgeCheck size={14} /> Campus Pulse: High
          </div>
        </motion.div>
      </section>

      <section className="py-20 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quickDetails.map((item, i) => (
              <motion.div key={item.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="flex items-center gap-4 p-6 rounded-2xl bg-[#191e1b]/90 border border-[#303a32] hover:border-blue-500/30 transition-colors backdrop-blur-sm">
                <div className={`w-12 h-12 min-w-12 min-h-12 aspect-square shrink-0 rounded-xl flex items-center justify-center ${item.tone === 'blue' ? 'bg-blue-500/20 text-blue-400' : 'bg-olive-500/20 text-olive-300'}`}>
                  <item.icon size={22} className="shrink-0" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</p>
                  <p className="text-white font-semibold">{loading ? 'Loading…' : error ? 'Details unavailable' : (item.value || 'To be announced')}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="py-8 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
            <motion.div className="flex gap-6 py-4 whitespace-nowrap" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}>
              {Array.from({ length: 2 }).map((_, loop) => (
                <div key={loop} className="flex gap-6">
                  {['Music', 'Dance', 'Fashion Walk', 'Open Mic', 'Crown Finale', 'Afterparty'].map(tag => (
                    <span key={`${loop}-${tag}`} className="px-4 py-2 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-200 text-sm">
                      {tag}
                    </span>
                  ))}
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-12 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-6">
            <h2 className="text-3xl sm:text-4xl font-bold mb-2">Dress Code</h2>
            <p className="text-gray-400">Come dressed to match the Ignite 2.O vibe.</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="p-5 rounded-2xl border border-blue-500/30 bg-blue-500/10">
              <p className="text-xs text-blue-300 uppercase tracking-wider mb-1">For Boys / Male</p>
              <p className="text-xl font-bold text-white">{settings.dressCodeMale}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.06 }} className="p-5 rounded-2xl border border-olive-500/30 bg-olive-500/10">
              <p className="text-xs text-olive-300 uppercase tracking-wider mb-1">For Girls / Ladies</p>
              <p className="text-xl font-bold text-white">{settings.dressCodeFemale}</p>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="py-16 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">What Awaits You</h2>
            <p className="text-gray-400">A day packed with talent, glamour, and celebration</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {EVENT_PILLARS.map((item, i) => (
              <motion.div key={item.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="p-6 rounded-2xl bg-gradient-to-br from-white/6 to-white/[0.02] border border-white/10 hover:border-blue-500/40 transition-all hover:-translate-y-1 group backdrop-blur-sm">
                <div className="w-12 h-12 rounded-xl mb-4 bg-blue-500/15 border border-blue-500/30 text-blue-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <item.icon size={20} />
                </div>
                <h3 className="font-bold text-white mb-2 group-hover:text-blue-300 transition-colors">{item.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-18 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold mb-2">Day Flow</h2>
            <p className="text-gray-400">A quick look at the rhythm of Ignite 2.O.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scheduleConfigured && flow.length ? flow.map((item, i) => (
              <motion.div key={`${item.time}-${item.title}`} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="p-5 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
                <div className="flex items-start gap-4">
                  <div className="px-3 py-1 rounded-lg bg-olive-500/15 border border-olive-500/40 text-olive-300 text-sm font-bold">{item.time}</div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">{item.title}</h3>
                    <p className="text-sm text-gray-400">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            )) : <p className="text-gray-300">{error ? 'Schedule unavailable.' : 'Schedule to be announced.'}</p>}
          </div>
        </div>
      </section>

      <section className="py-20 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative rounded-3xl overflow-hidden border border-white/10">
            <div className="absolute inset-0 bg-gradient-to-br from-[#3b82f6] to-[#718044]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.16),transparent_42%),radial-gradient(circle_at_80%_70%,rgba(255,255,255,0.14),transparent_40%)]" />
            <div className="relative p-10 sm:p-16 text-center">
              <PartyPopper size={40} className="mx-auto mb-4 text-white/85" />
              <h2 className="text-3xl sm:text-4xl font-black mb-4">Secure Your Spot</h2>
              <p className="text-white/85 mb-8 text-lg">Limited seats available. Register before they run out.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/register" className="px-8 py-4 bg-white text-blue-700 font-bold rounded-xl hover:bg-gray-100 transition-colors">
                  Register Now
                </Link>
                <Link to="/my-profile" className="px-8 py-4 border-2 border-white/50 text-white font-semibold rounded-xl hover:bg-white/10 transition-colors">
                  Already Registered?
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
