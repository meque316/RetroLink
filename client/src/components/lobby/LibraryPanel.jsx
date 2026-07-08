import {
  Gamepad2,
  FolderOpen,
  Trash2,
} from "lucide-react";

export default function LibraryPanel({
  games = [],
  library = [],
  onAddGame,
  onRemoveGame,
}) {
  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold">Library</h2>
        <p className="text-zinc-400 mt-1">Your configured games</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {games.map((game) => {
          const saved = library.find((g) => g.id === game.id);
          const isSupported = game.supported;

          return (
            <div
              key={game.id}
              className={`bg-[#11161d] border rounded-2xl p-5 transition ${
                saved
                  ? "border-green-500/30"
                  : isSupported
                  ? "border-zinc-800"
                  : "border-zinc-800/50"
              } ${!isSupported ? "opacity-60" : ""}`}
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-zinc-900 border border-zinc-700 flex items-center justify-center text-green-400 shrink-0">
                  <Gamepad2 size={22} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold flex items-center gap-2 flex-wrap">
                    {game.name}

                    {!isSupported && (
                      <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
                        Pronto
                      </span>
                    )}
                  </p>

                  <p className="text-xs text-zinc-500">{game.year}</p>
                </div>
              </div>

              {saved ? (
                <>
                  <p className="text-xs text-green-400 mb-1">
                    ✓ Configurado
                  </p>

                  <p className="text-xs text-zinc-500 break-all mb-4 line-clamp-1">
                    {saved.exePath}
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => onAddGame(game)}
                      disabled={!isSupported}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                        isSupported
                          ? "bg-zinc-800 hover:bg-zinc-700"
                          : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                      }`}
                    >
                      <FolderOpen size={14} />
                      {isSupported ? "Change" : "No disponible"}
                    </button>

                    <button
                      onClick={() => onRemoveGame(game.id)}
                      className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => onAddGame(game)}
                  disabled={!isSupported}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm transition ${
                    isSupported
                      ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                      : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"
                  }`}
                >
                  <FolderOpen size={14} />
                  {isSupported ? "Add to Library" : "Próximamente"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-[#11161d] border border-zinc-800 rounded-2xl">
        <p className="text-sm text-zinc-400">
          🎮{" "}
          <span className="text-green-400 font-medium">
            Soportados:
          </span>{" "}
          Quake III Arena, Counter-Strike 1.6, Carmageddon 2
        </p>

        <p className="text-xs text-zinc-500 mt-1">
          🚧 <span className="text-yellow-500">En desarrollo:</span>{" "}
          Quake II, Quake, Unreal Tournament, UT2004, Half-Life, Doom II
        </p>
      </div>
    </>
  );
}