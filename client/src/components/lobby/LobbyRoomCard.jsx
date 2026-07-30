import {
  ArrowRight,
  Gamepad2,
  Globe2,
  LockKeyhole,
  Map,
  Users,
} from "lucide-react";

const GAME_META = {
  quake3: { short: "Q3", accent: "text-red-400", surface: "from-red-500/20" },
  cs16: { short: "CS", accent: "text-sky-400", surface: "from-sky-500/20" },
  ut99: { short: "UT", accent: "text-amber-400", surface: "from-amber-500/20" },
  carmageddon2: { short: "C2", accent: "text-orange-400", surface: "from-orange-500/20" },
};

function getPlayerCount(players) {
  if (Array.isArray(players)) return players.length;
  if (Number.isFinite(Number(players))) return Number(players);
  return 0;
}

function getGameDetails(room) {
  const options = room.gameOptions || {};
  const details = [];

  if (options.map) details.push({ icon: Map, label: options.map });
  if (options.gameType) details.push({ icon: Gamepad2, label: options.gameType });

  return details.slice(0, 2);
}

export default function LobbyRoomCard({ room, supported, onJoinRoom }) {
  const gameId = room.gameId || room.game;
  const meta = GAME_META[gameId] || {
    short: "RL",
    accent: "text-green-400",
    surface: "from-green-500/20",
  };

  const playerCount = getPlayerCount(room.players);
  const maxPlayers = Number(room.gameOptions?.maxPlayers || room.maxPlayers || 16);
  const details = getGameDetails(room);

  return (
    <article
      className={`group rounded-2xl border bg-[#101720] p-4 transition duration-200 md:p-5 ${
        supported
          ? "border-zinc-800 hover:-translate-y-0.5 hover:border-green-500/50 hover:shadow-[0_18px_50px_rgba(0,0,0,0.22)]"
          : "border-zinc-800/70 opacity-60"
      }`}
    >
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div
            className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-zinc-700 bg-gradient-to-br ${meta.surface} to-zinc-950 font-black tracking-tight ${meta.accent}`}
          >
            <span className="text-2xl">{meta.short}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-lg font-semibold text-white md:text-xl">
                {room.game || "Juego sin nombre"}
              </h3>

              {!supported && (
                <span className="rounded-full border border-yellow-500/20 bg-yellow-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-yellow-400">
                  No soportado
                </span>
              )}
            </div>

            <p className="mt-1 truncate font-medium text-green-400">
              {room.name}
            </p>

            {details.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {details.map(({ icon: Icon, label }) => (
                  <span
                    key={`${Icon.displayName || Icon.name}-${label}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-900/70 px-2.5 py-1 text-xs text-zinc-300"
                  >
                    <Icon size={12} className="text-zinc-500" />
                    {label}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 border-t border-zinc-800/80 pt-4 text-sm sm:grid-cols-3">
              <div className="flex items-center gap-2 text-zinc-300">
                <Users size={16} className="text-zinc-500" />
                <span>
                  <strong className="font-semibold text-white">{playerCount}</strong>
                  <span className="text-zinc-500"> / {maxPlayers}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 text-zinc-300">
                <Globe2 size={16} className="text-zinc-500" />
                <span>P2P</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_12px_rgba(74,222,128,0.6)]" />
                <span className="text-zinc-300">Esperando jugadores</span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={!supported}
          onClick={() => supported && onJoinRoom(room)}
          className={`flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-6 font-semibold transition xl:w-44 ${
            supported
              ? "bg-green-500 text-black hover:bg-green-400"
              : "cursor-not-allowed border border-zinc-700 bg-zinc-900 text-zinc-600"
          }`}
        >
          {supported ? (
            <>
              Entrar
              <ArrowRight size={18} />
            </>
          ) : (
            <>
              <LockKeyhole size={16} />
              No disponible
            </>
          )}
        </button>
      </div>
    </article>
  );
}
