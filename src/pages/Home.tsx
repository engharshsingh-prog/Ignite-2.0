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
  Navigation,
  ExternalLink,
} from 'lucide-react';
import Countdown from '../components/Countdown';
import SplashScreen from '../components/SplashScreen';
import { useEventSettings } from '../lib/useEventSettings';

const VENUE_MAP_URL = 'https://maps.app.goo.gl/DTi1mudbavWHZzYCA?g_st=aw';

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
    { icon: Calendar, label: 'Date', value: settings.dateLabel, tone: 'blue' as const },
    { icon: Clock, label: 'Time', value: settings.timeLabel, tone: 'cyan' as const },
    {
      icon: MapPin,
      label: 'Venue',
      value: settings.venue || 'Institute Campus',
      tone: 'purple' as const,
      link: VENUE_MAP_URL,
      actionText: 'Open in Maps',
    },
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
    <div className="min-h-screen text-white overflow-x-hidden relative">
      <SplashScreen show={showSplash} />

      {/* Floating Glass Elements */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        {FLOATING_ICONS.map((item, idx) => (
          <motion.div
            key={`floating-icon-${idx}`}
            className="absolute hidden md:flex w-13 h-13 rounded-2xl liquid-icon-bubble items-center justify-center text-cyan-200"
            style={{ top: item.top, left: item.left, right: item.right }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: [0.45, 0.9, 0.45], y: [0, -16, 0], rotate: [0, 5, 0] }}
            transition={{ delay: item.delay, duration: item.duration, repeat: Infinity, ease: 'easeInOut' }}
          >
            <item.icon size={20} />
          </motion.div>
        ))}
      </div>

      {/* HERO SECTION */}
      <section className="relative min-h-screen flex items-center justify-center pt-20 pb-12 scroll-snap-section">
        <motion.div
          className="relative z-10 text-center px-4 max-w-5xl mx-auto"
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        >
          <motion.div
            variants={fadeUp}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full liquid-glass-pill text-cyan-200 text-sm font-medium mb-8"
          >
            <Sparkles size={14} className="text-cyan-300" />
            <span>Institute of Engineering and Technology | Batch 2026</span>
          </motion.div>

          <motion.h1 variants={fadeUp} className="text-5xl sm:text-7xl md:text-8xl font-black tracking-tight mb-4 drop-shadow-[0_6px_30px_rgba(34,211,238,0.2)]">
            <span className="text-white">Ignite</span>
            <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">2.O</span>
            <br />
            <span className="text-3xl sm:text-4xl md:text-5xl font-light text-cyan-200/90 tracking-[0.28em]">2026</span>
          </motion.h1>

          <motion.p variants={fadeUp} className="text-lg sm:text-xl text-slate-200/90 max-w-3xl mx-auto mb-9 leading-relaxed">
            The unified campus celebration of talent, style, interaction, fresh energy and unforgettable moments. Music, motion, crowns, and a full-day social vibe.
          </motion.p>

          <motion.div variants={fadeUp} className="mb-10">
            <p className="text-cyan-200/90 text-xs sm:text-sm font-semibold tracking-[0.25em] uppercase mb-5">Event Countdown</p>
            <Countdown targetDateIso={scheduleConfigured ? settings.countdownIso : ''} />
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/register"
              className="group px-8 py-4 rounded-2xl liquid-btn-primary text-white font-bold text-lg flex items-center gap-2"
            >
              <span>Register Now</span>
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/gallery"
              className="px-8 py-4 rounded-2xl liquid-btn-glass text-white font-semibold text-lg"
            >
              View Gallery
            </Link>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="absolute top-24 right-6 sm:right-14 px-4 py-3 rounded-2xl liquid-glass-pill hidden md:block z-10"
        >
          <p className="text-[11px] text-cyan-200/70 uppercase tracking-widest mb-1">Live Energy</p>
          <div className="flex items-center gap-2 text-cyan-200 text-sm font-semibold">
            <BadgeCheck size={15} className="text-cyan-300" /> Campus Pulse: High
          </div>
        </motion.div>
      </section>

      {/* QUICK DETAILS SECTION */}
      <section className="py-16 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {quickDetails.map((item, i) => {
              const toneClass =
                item.tone === 'blue'
                  ? 'text-blue-300'
                  : item.tone === 'cyan'
                  ? 'text-cyan-300'
                  : 'text-violet-300';

              const content = (
                <>
                  <div className={`w-13 h-13 min-w-13 min-h-13 aspect-square shrink-0 rounded-2xl liquid-icon-bubble flex items-center justify-center ${toneClass}`}>
                    <item.icon size={22} className="shrink-0" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-cyan-200/70 uppercase tracking-wider font-semibold">{item.label}</p>
                    <p className="text-white font-bold text-base truncate mt-0.5">
                      {loading ? 'Loading…' : error ? 'Details unavailable' : (item.value || 'To be announced')}
                    </p>
                    {'link' in item && item.link ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-cyan-300 group-hover:text-cyan-200 transition-colors">
                        <Navigation size={12} className="shrink-0" />
                        {item.actionText}
                        <ExternalLink size={11} className="shrink-0 opacity-75" />
                      </span>
                    ) : null}
                  </div>
                </>
              );

              if ('link' in item && item.link) {
                return (
                  <motion.a
                    key={item.label}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="group flex items-center gap-4 p-6 rounded-3xl liquid-glass-card border-cyan-300/25"
                  >
                    {content}
                  </motion.a>
                );
              }

              return (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-4 p-6 rounded-3xl liquid-glass-card"
                >
                  {content}
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* MARQUEE STRIP */}
      <section className="py-8 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <div className="relative overflow-hidden rounded-2xl liquid-glass border-cyan-200/15">
            <motion.div className="flex gap-5 py-4 whitespace-nowrap" animate={{ x: ['0%', '-50%'] }} transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}>
              {Array.from({ length: 2 }).map((_, loop) => (
                <div key={loop} className="flex gap-5 px-2">
                  {['Music', 'Dance', 'Fashion Walk', 'Open Mic', 'Crown Finale', 'Afterparty'].map(tag => (
                    <span
                      key={`${loop}-${tag}`}
                      className="px-4 py-1.5 rounded-full liquid-glass-pill text-cyan-100 text-sm font-medium"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* DRESS CODE */}
      <section className="py-12 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-4xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-7">
            <h2 className="text-3xl sm:text-4xl font-bold mb-2">Dress Code</h2>
            <p className="text-slate-300">Come dressed to match the Ignite 2.O vibe.</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="p-6 rounded-3xl liquid-glass-card border-sky-400/30">
              <p className="text-xs text-cyan-300 uppercase tracking-widest font-bold mb-1.5">For Boys / Male</p>
              <p className="text-xl sm:text-2xl font-bold text-white">{settings.dressCodeMale}</p>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.06 }} className="p-6 rounded-3xl liquid-glass-card border-violet-400/30">
              <p className="text-xs text-violet-300 uppercase tracking-widest font-bold mb-1.5">For Girls / Ladies</p>
              <p className="text-xl sm:text-2xl font-bold text-white">{settings.dressCodeFemale}</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* VENUE & LOCATION SECTION */}
      <section className="py-16 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl liquid-glass p-7 sm:p-10 border-cyan-300/25 shadow-2xl"
          >
            {/* Ambient Liquid Highlights */}
            <div className="absolute -top-24 -right-24 w-80 h-80 bg-cyan-400/15 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-violet-500/15 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-5">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full liquid-glass-pill text-cyan-200 text-xs font-semibold uppercase tracking-wider">
                  <MapPin size={13} className="shrink-0 text-cyan-300" />
                  Event Venue & Navigation
                </div>

                <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                  Reach the Celebration Venue
                </h2>

                <p className="text-slate-200 text-base leading-relaxed">
                  Join us at the official venue for Ignite 2.O. Find your way effortlessly using Google Maps navigation with real-time route directions and live traffic updates.
                </p>

                <div className="p-4 rounded-2xl bg-white/[0.05] border border-white/15 backdrop-blur-md flex items-start gap-3.5">
                  <div className="w-11 h-11 rounded-xl liquid-icon-bubble text-cyan-300 flex items-center justify-center shrink-0 mt-0.5">
                    <MapPin size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-cyan-200/75 uppercase tracking-wider font-semibold">Venue Location</p>
                    <p className="text-white font-bold text-lg sm:text-xl">
                      {settings.venue || 'Institute Campus Grounds'}
                    </p>
                    <p className="text-xs text-cyan-300 mt-1 flex items-center gap-1.5 font-medium">
                      <span className="w-2 h-2 rounded-full bg-cyan-300 animate-pulse inline-block" />
                      Live Location Pin Ready • Tap below to start navigation
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap gap-3.5">
                  <a
                    href={VENUE_MAP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-2xl liquid-btn-primary text-white font-bold text-base group"
                  >
                    <Navigation size={18} className="group-hover:rotate-12 transition-transform" />
                    <span>Open in Google Maps</span>
                    <ExternalLink size={15} className="opacity-85" />
                  </a>

                  <a
                    href={VENUE_MAP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl liquid-btn-glass text-white font-semibold text-sm"
                  >
                    <span>Get Directions</span>
                    <ArrowRight size={16} />
                  </a>
                </div>
              </div>

              {/* Visual Map Preview Glass Card */}
              <div className="lg:col-span-5">
                <a
                  href={VENUE_MAP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block relative overflow-hidden rounded-3xl liquid-glass-card p-5 border-cyan-300/30"
                >
                  <div className="aspect-[4/3] w-full rounded-2xl bg-[#051024]/70 border border-white/15 relative flex flex-col items-center justify-center text-center p-6 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:18px_18px] opacity-20" />
                    <div className="absolute -inset-4 bg-gradient-to-t from-[#040814]/80 via-transparent to-transparent pointer-events-none" />

                    <div className="relative z-10 flex flex-col items-center">
                      <div className="w-16 h-16 rounded-2xl liquid-icon-bubble text-cyan-300 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                        <MapPin size={28} className="group-hover:-translate-y-1 transition-transform" />
                      </div>
                      <p className="text-white font-bold text-base group-hover:text-cyan-200 transition-colors">
                        Tap to View Venue Map
                      </p>
                      <p className="text-xs text-slate-300 mt-1 max-w-[220px]">
                        Opens directly in Google Maps app for seamless driving and walking directions
                      </p>
                      <span className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full liquid-glass-pill text-cyan-200 text-xs font-semibold group-hover:border-cyan-300/60 transition-all">
                        <Navigation size={12} />
                        Start GPS Navigation
                      </span>
                    </div>
                  </div>
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* EVENT PILLARS */}
      <section className="py-16 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-3">What Awaits You</h2>
            <p className="text-slate-300">A day packed with talent, glamour, and celebration</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {EVENT_PILLARS.map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="p-6 rounded-3xl liquid-glass-card group"
              >
                <div className="w-12 h-12 rounded-2xl mb-4 liquid-icon-bubble text-cyan-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <item.icon size={20} />
                </div>
                <h3 className="font-bold text-white text-lg mb-2 group-hover:text-cyan-200 transition-colors">{item.title}</h3>
                <p className="text-slate-300 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* DAY FLOW */}
      <section className="py-16 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-6xl mx-auto">
          <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold mb-2">Day Flow</h2>
            <p className="text-slate-300">A quick look at the rhythm of Ignite 2.O.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {scheduleConfigured && flow.length ? flow.map((item, i) => (
              <motion.div
                key={`${item.time}-${item.title}`}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="p-5 rounded-2xl liquid-glass-card"
              >
                <div className="flex items-start gap-4">
                  <div className="px-3 py-1 rounded-xl liquid-glass-pill text-cyan-200 text-sm font-bold shrink-0">
                    {item.time}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-base mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-300">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            )) : <p className="text-slate-300">{error ? 'Schedule unavailable.' : 'Schedule to be announced.'}</p>}
          </div>
        </div>
      </section>

      {/* FINAL CTA BANNER */}
      <section className="py-20 px-4 relative z-10 scroll-snap-section">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative rounded-3xl overflow-hidden liquid-glass border-cyan-300/35 shadow-[0_25px_70px_rgba(6,182,212,0.22)]"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/35 via-cyan-500/25 to-violet-600/35 pointer-events-none" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_45%),radial-gradient(circle_at_80%_75%,rgba(103,232,249,0.22),transparent_42%)] pointer-events-none" />
            <div className="relative p-10 sm:p-16 text-center">
              <div className="w-16 h-16 rounded-2xl liquid-icon-bubble mx-auto mb-5 flex items-center justify-center text-cyan-200">
                <PartyPopper size={30} />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black mb-4 text-white">Secure Your Spot</h2>
              <p className="text-cyan-50/90 mb-8 text-lg">Limited seats available. Register before they run out.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  to="/register"
                  className="px-8 py-4 rounded-2xl liquid-btn-primary text-white font-bold text-base"
                >
                  Register Now
                </Link>
                <Link
                  to="/my-profile"
                  className="px-8 py-4 rounded-2xl liquid-btn-glass text-white font-semibold text-base"
                >
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
