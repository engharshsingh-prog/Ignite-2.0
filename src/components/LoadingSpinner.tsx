export default function LoadingSpinner({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="relative w-14 h-14 p-1.5 rounded-full liquid-glass-pill flex items-center justify-center">
        <div className="w-full h-full rounded-full border-4 border-cyan-500/20 border-t-cyan-600 border-r-violet-600 animate-spin" />
      </div>
      <p className="text-slate-700 text-sm font-medium tracking-wide">{text}</p>
    </div>
  );
}
