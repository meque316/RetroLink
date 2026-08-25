// client/src/components/room/match-info/DOWMatchInfo.jsx

export default function DOWMatchInfo({ gameOptions }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-[#0f151d] p-4">
      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-zinc-500">
          Warhammer 40,000: Dawn of War - Soulstorm
        </span>
      </div>
      <p className="text-sm text-zinc-400">
        El lobby del juego se encarga de la configuración.
      </p>
    </div>
  );
}