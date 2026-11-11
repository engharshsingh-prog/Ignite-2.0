import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Instagram,
  MessageCircle,
  Mail,
  Sparkles,
  Waves,
  ArrowUpRight,
  Compass,
  Building2,
  Users,
  Droplets,
} from 'lucide-react';

interface Ripple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  speed: number;
  lineWidth: number;
  isClick: boolean;
}

interface Bubble {
  x: number;
  y: number;
  r: number;
  vy: number;
  wobbleAmp: number;
  wobbleSpeed: number;
  phase: number;
  alpha: number;
}

interface GlowParticle {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  alpha: number;
  hue: string;
  phase: number;
}

export default function SiteFooter() {
  const whatsappLink = String(import.meta.env.VITE_EVENT_WHATSAPP_URL || '').trim();
  const instagramLink = String(
    import.meta.env.VITE_EVENT_INSTAGRAM_URL || 'https://www.instagram.com/theignite2.0/?hl=en'
  ).trim();

  const footerRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [inView, setInView] = useState(false);

  const ripplesRef = useRef<Ripple[]>([]);
  const pointerRef = useRef<{ x: number; y: number; active: boolean; lastRippleTime: number }>({
    x: -500,
    y: -500,
    active: false,
    lastRippleTime: 0,
  });

  // Intersection Observer for Footer Entrance Animation & Visibility-aware loop
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -20px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Interactive Water Canvas: Bubbles, Glowing Particles, Hover Ripples & Click Ripples
  useEffect(() => {
    const footer = footerRef.current;
    const canvas = canvasRef.current;
    if (!footer || !canvas) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = footer.clientWidth;
    let height = footer.clientHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resizeCanvas = () => {
      if (!footer || !canvas) return;
      width = footer.clientWidth;
      height = footer.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(footer);

    // Seed floating bubbles & bioluminescent motes proportional to footer width
    const bubbleCount = width < 640 ? 14 : 24;
    const bubbles: Bubble[] = Array.from({ length: bubbleCount }, () => ({
      x: Math.random() * Math.max(width, 320),
      y: 70 + Math.random() * Math.max(height - 70, 180),
      r: 2 + Math.random() * 5.5,
      vy: 0.28 + Math.random() * 0.55,
      wobbleAmp: 0.25 + Math.random() * 0.6,
      wobbleSpeed: 0.015 + Math.random() * 0.025,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.16 + Math.random() * 0.3,
    }));

    const particleCount = width < 640 ? 16 : 28;
    const hues = ['34, 211, 238', '56, 189, 248', '139, 92, 246', '165, 243, 252'];
    const particles: GlowParticle[] = Array.from({ length: particleCount }, (_, idx) => ({
      x: Math.random() * Math.max(width, 320),
      y: 80 + Math.random() * Math.max(height - 80, 160),
      r: 1.1 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 0.28,
      vy: -0.08 - Math.random() * 0.22,
      alpha: 0.22 + Math.random() * 0.35,
      hue: hues[idx % hues.length],
      phase: Math.random() * Math.PI * 2,
    }));

    let rafId = 0;
    let isVisibleInViewport = true;

    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        isVisibleInViewport = entry.isIntersecting;
      },
      { threshold: 0 }
    );
    visibilityObserver.observe(footer);

    let tick = 0;
    const render = () => {
      rafId = requestAnimationFrame(render);
      if (document.hidden || !isVisibleInViewport) return;

      tick += 1;
      ctx.clearRect(0, 0, width, height);

      // 1. Subtle interactive underwater refraction halo around pointer
      if (pointerRef.current.active) {
        const { x, y } = pointerRef.current;
        const grad = ctx.createRadialGradient(x, y, 4, x, y, 165);
        grad.addColorStop(0, 'rgba(103, 232, 249, 0.15)');
        grad.addColorStop(0.45, 'rgba(56, 189, 248, 0.07)');
        grad.addColorStop(1, 'rgba(34, 211, 238, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, 165, 0, Math.PI * 2);
        ctx.fill();
      }

      // 2. Glowing ambient water motes
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.phase += 0.025;

        if (p.y < 52) {
          p.y = height - 6;
          p.x = Math.random() * width;
        }
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        const pulse = p.alpha * (0.65 + 0.35 * Math.sin(p.phase));
        ctx.fillStyle = `rgba(${p.hue}, ${pulse})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Floating translucent bubbles with specular highlights
      for (let i = 0; i < bubbles.length; i += 1) {
        const b = bubbles[i];
        b.y -= b.vy;
        b.phase += b.wobbleSpeed;
        const bx = b.x + Math.sin(b.phase) * b.wobbleAmp * 8;

        if (b.y < 54) {
          b.y = height + b.r;
          b.x = Math.random() * width;
        }

        // Glass bubble rim
        ctx.strokeStyle = `rgba(165, 243, 252, ${b.alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(bx, b.y, b.r, 0, Math.PI * 2);
        ctx.stroke();

        // Inner aqua fill
        ctx.fillStyle = `rgba(34, 211, 238, ${b.alpha * 0.25})`;
        ctx.fill();

        // Top-left specular reflection dot
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(b.alpha * 1.9, 0.78)})`;
        ctx.beginPath();
        ctx.arc(bx - b.r * 0.34, b.y - b.r * 0.34, Math.max(0.8, b.r * 0.26), 0, Math.PI * 2);
        ctx.fill();
      }

      // 4. Water Ripples (hover & click generated)
      const ripples = ripplesRef.current;
      for (let i = ripples.length - 1; i >= 0; i -= 1) {
        const r = ripples[i];
        r.radius += r.speed;
        const progress = r.radius / r.maxRadius;
        const fade = Math.max(0, (1 - progress) * r.alpha);

        if (progress >= 1 || fade <= 0.005) {
          ripples.splice(i, 1);
          continue;
        }

        // Primary water ring
        ctx.strokeStyle = r.isClick
          ? `rgba(165, 243, 252, ${fade})`
          : `rgba(103, 232, 249, ${fade})`;
        ctx.lineWidth = r.lineWidth * (1 - progress * 0.4);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Secondary trailing harmonic ring on click ripples
        if (r.isClick && r.radius > 14) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${fade * 0.45})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius - 11, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Gentle ambient ripple occasionally on wave surface
      if (tick % 190 === 0 && ripples.length < 10) {
        ripples.push({
          x: Math.random() * width,
          y: 90 + Math.random() * Math.max(height - 100, 80),
          radius: 4,
          maxRadius: 65 + Math.random() * 45,
          alpha: 0.25,
          speed: 1.05,
          lineWidth: 1.1,
          isClick: false,
        });
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
    };
  }, []);

  const handlePointerMove = (e: React.MouseEvent<HTMLElement>) => {
    const footer = footerRef.current;
    if (!footer) return;
    const rect = footer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    pointerRef.current.x = x;
    pointerRef.current.y = y;
    pointerRef.current.active = true;

    const now = performance.now();
    if (now - pointerRef.current.lastRippleTime > 75) {
      pointerRef.current.lastRippleTime = now;
      if (ripplesRef.current.length < 24) {
        ripplesRef.current.push({
          x,
          y,
          radius: 3,
          maxRadius: 58,
          alpha: 0.36,
          speed: 1.45,
          lineWidth: 1.25,
          isClick: false,
        });
      }
    }
  };

  const handlePointerLeave = () => {
    pointerRef.current.active = false;
  };

  const handleFooterClick = (e: React.MouseEvent<HTMLElement>) => {
    const footer = footerRef.current;
    if (!footer) return;
    const rect = footer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (ripplesRef.current.length < 28) {
      ripplesRef.current.push({
        x,
        y,
        radius: 4,
        maxRadius: 155,
        alpha: 0.72,
        speed: 2.35,
        lineWidth: 2,
        isClick: true,
      });
    }
  };

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/register', label: 'Register' },
    { to: '/gallery', label: 'Gallery' },
    { to: '/hall-of-fame', label: 'Hall of Fame' },
    { to: '/management-team', label: 'Management Team' },
    { to: '/my-profile', label: 'My Profile' },
  ];

  return (
    <footer
      ref={footerRef}
      onMouseMove={handlePointerMove}
      onMouseLeave={handlePointerLeave}
      onClick={handleFooterClick}
      className={`relative mt-16 overflow-hidden transition-all duration-1000 ease-out ${
        inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      {/* ================================================================== */}
      {/* 1. SVG DEFINITIONS FOR WATER GRADIENTS & LIQUID REFRACTION FILTER  */}
      {/* ================================================================== */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <linearGradient id="waterWaveBackGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.24)" />
            <stop offset="35%" stopColor="rgba(6, 182, 212, 0.30)" />
            <stop offset="70%" stopColor="rgba(139, 92, 246, 0.24)" />
            <stop offset="100%" stopColor="rgba(59, 130, 246, 0.24)" />
          </linearGradient>

          <linearGradient id="waterWaveMidGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.26)" />
            <stop offset="50%" stopColor="rgba(56, 189, 248, 0.34)" />
            <stop offset="100%" stopColor="rgba(34, 211, 238, 0.26)" />
          </linearGradient>

          <linearGradient id="waterWaveFrontGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(103, 232, 249, 0.34)" />
            <stop offset="45%" stopColor="rgba(14, 165, 233, 0.22)" />
            <stop offset="100%" stopColor="rgba(6, 24, 52, 0.65)" />
          </linearGradient>

          <linearGradient id="waterCrestStrokeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.15)" />
            <stop offset="25%" stopColor="rgba(165, 243, 252, 0.72)" />
            <stop offset="50%" stopColor="rgba(255, 255, 255, 0.85)" />
            <stop offset="75%" stopColor="rgba(103, 232, 249, 0.7)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.15)" />
          </linearGradient>

          {/* Subtle liquid water refraction filter for decorative glint layer */}
          <filter id="liquid-water-refract" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.032"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* ================================================================== */}
      {/* 2. MULTI-LAYER SEAMLESS ANIMATED WATER WAVES AT TOP OF FOOTER      */}
      {/* ================================================================== */}
      <div
        className="relative w-full h-24 sm:h-28 overflow-hidden pointer-events-none select-none -mb-px"
        aria-hidden="true"
      >
        {/* Wave Layer 1: Deep Slow Aqua/Blue Swell */}
        <svg
          className="absolute bottom-0 left-0 w-[200%] h-full animate-wave-slow"
          viewBox="0 0 2400 140"
          preserveAspectRatio="none"
        >
          <path
            fill="url(#waterWaveBackGrad)"
            d="M 0 54 C 150 18, 150 18, 300 54 C 450 90, 450 90, 600 54 C 750 18, 750 18, 900 54 C 1050 90, 1050 90, 1200 54 C 1350 18, 1350 18, 1500 54 C 1650 90, 1650 90, 1800 54 C 1950 18, 1950 18, 2100 54 C 2250 90, 2250 90, 2400 54 L 2400 140 L 0 140 Z"
          />
        </svg>

        {/* Wave Layer 2: Mid Counter-Flowing Cyan Ripple Wave */}
        <svg
          className="absolute bottom-0 left-0 w-[200%] h-full animate-wave-mid opacity-90"
          viewBox="0 0 2400 140"
          preserveAspectRatio="none"
        >
          <path
            fill="url(#waterWaveMidGrad)"
            d="M 0 64 C 100 36, 100 36, 200 64 C 300 92, 300 92, 400 64 C 500 36, 500 36, 600 64 C 700 92, 700 92, 800 64 C 900 36, 900 36, 1000 64 C 1100 92, 1100 92, 1200 64 C 1300 36, 1300 36, 1400 64 C 1500 92, 1500 92, 1600 64 C 1700 36, 1700 36, 1800 64 C 1900 92, 1900 92, 2000 64 C 2100 36, 2100 36, 2200 64 C 2300 92, 2300 92, 2400 64 L 2400 140 L 0 140 Z"
          />
        </svg>

        {/* Wave Layer 3: Front Glossy Specular Crest Wave */}
        <svg
          className="absolute bottom-0 left-0 w-[200%] h-full animate-wave-fast"
          viewBox="0 0 2400 140"
          preserveAspectRatio="none"
        >
          <path
            fill="url(#waterWaveFrontGrad)"
            d="M 0 70 C 90 42, 190 42, 280 68 C 390 96, 490 90, 600 66 C 710 40, 810 52, 920 74 C 1030 92, 1110 88, 1200 70 C 1290 42, 1390 42, 1480 68 C 1590 96, 1690 90, 1800 66 C 1910 40, 2010 52, 2120 74 C 2230 92, 2310 88, 2400 70 L 2400 140 L 0 140 Z"
          />
          <path
            fill="none"
            stroke="url(#waterCrestStrokeGrad)"
            strokeWidth="2.5"
            d="M 0 70 C 90 42, 190 42, 280 68 C 390 96, 490 90, 600 66 C 710 40, 810 52, 920 74 C 1030 92, 1110 88, 1200 70 C 1290 42, 1390 42, 1480 68 C 1590 96, 1690 90, 1800 66 C 1910 40, 2010 52, 2120 74 C 2230 92, 2310 88, 2400 70"
          />
        </svg>
      </div>

      {/* ================================================================== */}
      {/* 3. LIQUID GLASS WATER BODY & CAUSTIC REFLECTIONS                   */}
      {/* ================================================================== */}
      <div
        className="relative px-4 pt-6 pb-12 sm:px-6 text-sm text-slate-200 backdrop-blur-2xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(6, 24, 52, 0.72) 0%, rgba(7, 36, 72, 0.62) 45%, rgba(4, 15, 36, 0.88) 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(165, 243, 252, 0.28), 0 -10px 45px rgba(6, 182, 212, 0.16)',
        }}
      >
        {/* Underwater Animated Caustic Gradients & Refraction Layer (Non-interactive) */}
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden"
          aria-hidden="true"
        >
          {/* Refracted caustic light pools */}
          <div
            className="animate-caustics absolute -top-12 -left-16 w-[34rem] h-[22rem] rounded-full blur-3xl"
            style={{
              filter: 'url(#liquid-water-refract)',
              background:
                'radial-gradient(circle, rgba(34, 211, 238, 0.24) 0%, rgba(56, 189, 248, 0.1) 55%, transparent 78%)',
            }}
          />
          <div
            className="animate-caustics absolute -bottom-16 right-0 w-[36rem] h-[22rem] rounded-full blur-3xl"
            style={{
              animationDelay: '-5.5s',
              background:
                'radial-gradient(circle, rgba(59, 130, 246, 0.24) 0%, rgba(139, 92, 246, 0.14) 52%, transparent 78%)',
            }}
          />

          {/* Diagonal sweeping liquid glass light streak */}
          <div
            className="animate-light-streak absolute top-0 bottom-0 w-72 pointer-events-none"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(165, 243, 252, 0.08) 45%, rgba(255, 255, 255, 0.12) 50%, rgba(165, 243, 252, 0.06) 55%, transparent 100%)',
            }}
          />
        </div>

        {/* Interactive Water Ripples, Bubbles & Glowing Particles Canvas */}
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 w-full h-full z-[1]"
          aria-hidden="true"
        />

        {/* ================================================================ */}
        {/* 4. FOOTER CONTENT (CRISPLY LAYERED OVER WATER SURFACE)           */}
        {/* ================================================================ */}
        <div className="relative z-10 max-w-7xl mx-auto">
          <div className="rounded-3xl liquid-glass px-6 py-7 md:px-9 md:py-9 border-cyan-300/20 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            {/* Top Brand & Quick Navigation Strip */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pb-6 mb-7 border-b border-cyan-200/15">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl liquid-icon-bubble p-0.5 ring-1 ring-cyan-300/40 shrink-0 overflow-hidden">
                  <img
                    src="/logo.jpg"
                    alt="Ignite 2.O"
                    className="w-full h-full object-cover rounded-[14px]"
                  />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-black text-2xl tracking-tight text-white">
                      Ignite{' '}
                      <span className="bg-gradient-to-r from-cyan-300 via-sky-300 to-violet-300 bg-clip-text text-transparent">
                        2.O
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-400/15 text-cyan-200 border border-cyan-300/30">
                      <Waves size={11} /> Liquid Experience
                    </span>
                  </div>
                  <p className="text-xs text-cyan-100/70 mt-0.5">
                    Unified Campus Celebration • Batch 2026
                  </p>
                </div>
              </div>

              {/* Navigation Links */}
              <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-2">
                {navLinks.map((nav) => (
                  <Link
                    key={nav.to}
                    to={nav.to}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold text-cyan-50/90 hover:text-white bg-white/[0.06] hover:bg-cyan-400/20 border border-white/10 hover:border-cyan-300/45 transition-all hover:-translate-y-0.5 shadow-sm"
                  >
                    {nav.label}
                  </Link>
                ))}
              </nav>
            </div>

            {/* Main 3-Column Preserved Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
              {/* Column 1: Institution */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md hover:border-cyan-300/30 transition-colors">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full liquid-icon-bubble flex items-center justify-center text-cyan-300">
                    <Building2 size={15} />
                  </div>
                  <p className="text-xs uppercase tracking-widest text-cyan-200/80 font-bold">
                    Institution
                  </p>
                </div>
                <p className="text-white font-semibold leading-relaxed">
                  Engineering Department, Institute of Engineering and Technology
                </p>
                <p className="text-cyan-100/70 mt-1.5 leading-relaxed">
                  Deen Dayal Upadhyaya Gorakhpur University, Gorakhpur
                </p>
              </div>

              {/* Column 2: Organizers & Social Bubbles */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md hover:border-cyan-300/30 transition-colors">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full liquid-icon-bubble flex items-center justify-center text-sky-300">
                    <Users size={15} />
                  </div>
                  <p className="text-xs uppercase tracking-widest text-cyan-200/80 font-bold">
                    Organizers
                  </p>
                </div>

                <p className="text-slate-100">
                  Ignite Team | Tech Team:{' '}
                  <span className="text-cyan-300 font-semibold">Code Dynamics</span>
                </p>
                <p className="mt-1.5 text-slate-200">
                  Guided by:{' '}
                  <a
                    href="https://teamparadox.in"
                    target="_blank"
                    rel="noreferrer"
                    className="text-cyan-300 hover:text-white font-semibold hover:underline inline-flex items-center gap-0.5 transition-colors"
                  >
                    Teamparadox.in
                    <ArrowUpRight size={13} />
                  </a>
                </p>

                {/* Social Media Icons Inside Circular Glass Bubbles */}
                <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-2.5">
                  <span className="text-xs text-cyan-100/70 mr-1">Event Socials:</span>
                  <a
                    href={instagramLink || 'https://www.instagram.com/theignite2.0/?hl=en'}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Instagram"
                    className="group inline-flex items-center gap-2 pr-3 pl-1 py-1 rounded-full liquid-glass-pill hover:border-pink-300/50 transition-all hover:-translate-y-0.5"
                  >
                    <span className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500/35 to-purple-500/35 border border-pink-300/40 flex items-center justify-center text-pink-200 group-hover:scale-110 transition-transform shadow-inner">
                      <Instagram size={14} />
                    </span>
                    <span className="text-xs font-semibold text-pink-200 group-hover:text-white">
                      Instagram
                    </span>
                  </a>

                  {whatsappLink && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="WhatsApp"
                      className="group inline-flex items-center gap-2 pr-3 pl-1 py-1 rounded-full liquid-glass-pill hover:border-emerald-300/50 transition-all hover:-translate-y-0.5"
                    >
                      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500/35 to-cyan-500/35 border border-emerald-300/40 flex items-center justify-center text-emerald-200 group-hover:scale-110 transition-transform shadow-inner">
                        <MessageCircle size={14} />
                      </span>
                      <span className="text-xs font-semibold text-emerald-200 group-hover:text-white">
                        WhatsApp
                      </span>
                    </a>
                  )}
                </div>
              </div>

              {/* Column 3: Contact */}
              <div className="p-5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md hover:border-cyan-300/30 transition-colors">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-8 h-8 rounded-full liquid-icon-bubble flex items-center justify-center text-violet-300">
                    <Compass size={15} />
                  </div>
                  <p className="text-xs uppercase tracking-widest text-cyan-200/80 font-bold">
                    Contact
                  </p>
                </div>

                <div className="space-y-1.5 text-slate-200">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-cyan-100/70">Developer:</span>
                    <a
                      href="mailto:j74117204@gmail.com"
                      className="text-cyan-300 hover:text-white transition-colors hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      <Mail size={12} /> j74117204@gmail.com
                    </a>
                  </p>
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="text-cyan-100/70">Support:</span>
                    <a
                      href="mailto:vy502847@gmail.com"
                      className="text-cyan-300 hover:text-white transition-colors hover:underline inline-flex items-center gap-1 font-medium"
                    >
                      <Mail size={12} /> vy502847@gmail.com
                    </a>
                  </p>
                </div>

                <p className="mt-3 pt-3 border-t border-white/10 text-xs text-cyan-100/75 leading-relaxed">
                  <a
                    href="mailto:vy502847@gmail.com?subject=Ignite%202.O%20Feedback"
                    className="text-cyan-300 hover:text-white font-semibold hover:underline"
                  >
                    Send feedback
                  </a>{' '}
                  with roll number/enrolment number and screenshot for faster support.
                </p>
              </div>
            </div>

            {/* Bottom Copyright Bar */}
            <div className="mt-7 pt-5 border-t border-cyan-200/15 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-cyan-100/70">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white/90">&copy; 2026 Ignite 2.O. All rights reserved.</p>
                <span className="hidden sm:inline text-cyan-300/40">&bull;</span>
                <span className="inline-flex items-center gap-1 text-[11px] text-cyan-200/80 bg-cyan-400/10 border border-cyan-300/20 px-2.5 py-0.5 rounded-full">
                  <Droplets size={11} className="text-cyan-300" />
                  Move or click water for ripples
                </span>
              </div>

              <p className="flex flex-wrap items-center gap-1">
                <span>Guided by</span>
                <a
                  href="https://teamparadox.in"
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-300 hover:text-white hover:underline font-semibold inline-flex items-center gap-0.5"
                >
                  Teamparadox.in
                  <Sparkles size={11} className="text-cyan-300" />
                </a>
                <span>&bull; Designed for a smooth and secure registration experience.</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
