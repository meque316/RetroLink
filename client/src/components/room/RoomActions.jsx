import {
  Check,
  Clock3,
  LockKeyhole,
  Play,
} from "lucide-react";

function getBlockedReason({
  gameConfigured,
  connectionReady,
  everyoneReady,
}) {
  if (!gameConfigured) {
    return "Configura la ruta del juego para continuar.";
  }

  if (!connectionReady) {
    return "Esperando que la conexión multijugador se establezca.";
  }

  if (!everyoneReady) {
    return "Esperando que todos los jugadores estén ready.";
  }

  return "La partida está lista para comenzar.";
}

function RoomActions({
  isReady,
  isHost,
  canStartMatch,
  everyoneReady,
  connectionReady,
  gameConfigured,
  onToggleReady,
  onStartMatch,
}) {
  const blockedReason = getBlockedReason({
    gameConfigured,
    connectionReady,
    everyoneReady,
  });

  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#111821] p-4 md:p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
        Acciones
      </h2>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onToggleReady}
          type="button"
          className={`flex min-h-24 flex-1 flex-col items-center justify-center gap-2 rounded-xl border px-5 py-4 font-semibold transition ${
            isReady
              ? "border-green-500/30 bg-green-500/10 text-green-400 hover:bg-green-500/15"
              : "border-zinc-700 bg-[#0b1118] text-white hover:border-zinc-600 hover:bg-zinc-900"
          }`}
        >
          <span className="flex items-center gap-2 text-lg">
            {isReady ? (
              <Check size={21} />
            ) : (
              <Clock3 size={20} />
            )}

            {isReady ? "Listo" : "Marcarme listo"}
          </span>

          <span className="text-xs font-normal text-zinc-500">
            {isReady
              ? "Estás listo para jugar"
              : "Confirma cuando estés preparado"}
          </span>
        </button>

        {isHost && (
          <button
            onClick={onStartMatch}
            disabled={!canStartMatch}
            type="button"
            className={`flex min-h-24 flex-1 flex-col items-center justify-center gap-2 rounded-xl border px-5 py-4 font-semibold transition ${
              canStartMatch
                ? "border-green-400/50 bg-green-600 text-white shadow-lg shadow-green-950/30 hover:bg-green-500"
                : "cursor-not-allowed border-zinc-800 bg-zinc-900/70 text-zinc-600"
            }`}
          >
            <span className="flex items-center gap-2 text-lg">
              <Play size={21} fill="currentColor" />
              Iniciar partida
            </span>

            <span
              className={`text-xs font-normal ${
                canStartMatch
                  ? "text-green-100/80"
                  : "text-zinc-600"
              }`}
            >
              El host inicia cuando todos estén listos
            </span>
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center justify-center gap-2 text-center text-xs text-zinc-500">
        {!canStartMatch && isHost && (
          <LockKeyhole size={14} />
        )}
        {isHost
          ? blockedReason
          : "Espera a que el host inicie la partida."}
      </div>
    </section>
  );
}

export default RoomActions;
