export default function LiquidBackdrop() {
  return (
    <div
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none"
      aria-hidden="true"
    >
      {/* Deep midnight navy obsidian canvas */}
      <div className="absolute inset-0 bg-[#040814]" />

      {/* Subtle refractive cyan/violet grid */}
      <div className="absolute inset-0 grid-bg opacity-80" />

      {/* Soft atmospheric Liquid Glass gradient aurora orbs */}
      <div
        className="animate-orb-a absolute -top-32 -left-24 w-[34rem] h-[34rem] rounded-full opacity-35 blur-[110px]"
        style={{
          background:
            'radial-gradient(circle at 40% 40%, rgba(34, 211, 238, 0.55), rgba(59, 130, 246, 0.25) 55%, transparent 75%)',
        }}
      />
      <div
        className="animate-orb-b absolute top-1/4 -right-32 w-[38rem] h-[38rem] rounded-full opacity-30 blur-[125px]"
        style={{
          background:
            'radial-gradient(circle at 55% 45%, rgba(139, 92, 246, 0.55), rgba(59, 130, 246, 0.22) 55%, transparent 78%)',
        }}
      />
      <div
        className="animate-orb-a absolute -bottom-40 left-1/3 w-[40rem] h-[30rem] rounded-full opacity-25 blur-[120px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(6, 182, 212, 0.48), rgba(56, 189, 248, 0.2) 55%, transparent 76%)',
        }}
      />

      {/* Subtle vignette to preserve crisp text contrast */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#040814]/25 via-transparent to-[#040814]/60" />
    </div>
  );
}
