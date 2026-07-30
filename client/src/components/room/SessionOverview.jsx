import {
  Check,
  CheckCircle2,
  Clock3,
  Gamepad2,
  Link2,
  Users,
} from "lucide-react";

function StatusItem({
  icon: Icon,
  value,
  label,
  ok,
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center text-center">
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full border ${
          ok
            ? "border-green-500/30 bg-green-500/15 text-green-400"
            : "border-zinc-700 bg-zinc-900 text-zinc-500"
        }`}
      >
        <Icon size={22} />
      </div>

      <p
        className={`mt-3 text-lg font-bold ${
          ok ? "text-green-400" : "text-zinc-300"
        }`}
      >
        {value}
      </p>

      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
        {label}
      </p>
    </div>
  );
}

function SessionOverview({
  room,
  readyPlayers = [],
  connectionReady = false,
  gameConfigured = false,
}) {
  const members = room?.members ?? [];
  const playerCount = members.length;
  const readyCount = readyPlayers.length;
  const everyoneReady =
    playerCount > 0 && readyCount >= playerCount;

  const allReady =
    everyoneReady &&
    connectionReady &&
    gameConfigured;

  const gameName =
    room?.game ??
    room?.gameName ??
    room?.gameId ??
    "Juego";

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#111821] shadow-2xl shadow-black/10">
      <header className="border-b border-zinc-800 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
          Estado de la partida
        </p>
      </header>

      <div className="grid gap-6 p-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:p-7">
        <div className="flex items-center gap-5 border-b border-zinc-800 pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-7">
          <div
            className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 ${
              allReady
                ? "border-green-500 text-green-400"
                : "border-yellow-500/60 text-yellow-400"
            }`}
          >
            {allReady ? (
              <Check size={48} strokeWidth={2.5} />
            ) : (
              <Clock3 size={42} />
            )}
          </div>

          <div>
            <h2
              className={`text-2xl font-bold ${
                allReady
                  ? "text-green-400"
                  : "text-yellow-300"
              }`}
            >
              {allReady
                ? "¡Todo listo!"
                : "Preparando..."}
            </h2>

            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              {allReady
                ? "Puedes iniciar la partida."
                : "Esperando que se complete la sesión."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <StatusItem
            icon={Users}
            value={`${playerCount} / ${playerCount || 0}`}
            label="Jugadores conectados"
            ok={playerCount > 0}
          />

          <StatusItem
            icon={CheckCircle2}
            value={`${readyCount} / ${playerCount}`}
            label="Todos ready"
            ok={everyoneReady}
          />

          <StatusItem
            icon={Link2}
            value={connectionReady ? "P2P" : "..."}
            label={
              connectionReady
                ? "Conexión establecida"
                : "Conectando"
            }
            ok={connectionReady}
          />

          <StatusItem
            icon={Gamepad2}
            value={gameName}
            label={
              gameConfigured
                ? "Juego configurado"
                : "Falta configurar"
            }
            ok={gameConfigured}
          />
        </div>
      </div>
    </section>
  );
}

export default SessionOverview;
