const variants = {
  green: "bg-emerald-50 text-emerald-700 border border-emerald-100",
  red: "bg-rose-50 text-rose-700 border border-rose-100",
  blue: "bg-sky-50 text-sky-700 border border-sky-100",
  yellow: "bg-amber-50 text-amber-700 border border-amber-100",
  gray: "bg-slate-100 text-slate-600 border border-slate-200",
}

export default function Badge({ label, variant = "gray" }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] ${variants[variant]}`}>
      {label}
    </span>
  )
}
