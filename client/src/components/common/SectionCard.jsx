function SectionCard({
  title,
  description,
  icon: Icon,
  children,
  className = "",
  contentClassName = "",
}) {
  return (
    <section
      className={`overflow-visible rounded-2xl border border-zinc-800 bg-[#111821] ${className}`}
    >
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-4 md:px-5">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400">
            <Icon size={18} />
          </div>
        )}

        <div className="min-w-0">
          <h2 className="font-semibold text-white">
            {title}
          </h2>

          {description && (
            <p className="mt-0.5 text-xs text-zinc-500">
              {description}
            </p>
          )}
        </div>
      </header>

      <div className={`p-4 md:p-5 ${contentClassName}`}>
        {children}
      </div>
    </section>
  );
}

export default SectionCard;