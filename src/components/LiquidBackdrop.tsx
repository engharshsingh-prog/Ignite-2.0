export default function LiquidBackdrop() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Pure crisp white Apple Liquid Glass base canvas */}
      <div className="absolute inset-0 bg-gradient-to-b from-white via-[#f9fcff] to-[#f2f8ff]" />

      {/* Subtle refractive cyan/violet hairline grid */}
      <div className="absolute inset-0 grid-bg opacity-65" />

      {/* Soft atmospheric pastel Liquid Glass refraction orbs */}
      <div
        className="animate-orb-a absolute -top-32 -left-24 w-[36rem] h-[36rem] rounded-full opacity-40 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle at 40% 40%, rgba(34, 211, 238, 0.34), rgba(59, 130, 246, 0.14) 55%, transparent 76%)',
        }}
      />
      <div
        className="animate-orb-b absolute top-1/4 -right-32 w-[38rem] h-[38rem] rounded-full opacity-35 blur-[130px]"
        style={{
          background:
            'radial-gradient(circle at 55% 45%, rgba(139, 92, 246, 0.28), rgba(56, 189, 248, 0.14) 55%, transparent 78%)',
        }}
      />
      <div
        className="animate-orb-a absolute -bottom-40 left-1/3 w-[40rem] h-[30rem] rounded-full opacity-35 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.26), rgba(56, 189, 248, 0.12) 55%, transparent 76%)',
        }}
      />

      {/* Luminous pure white soft edge veil */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/55 via-transparent to-white/40" />
    </div>
  );
}
