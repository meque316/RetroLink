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
  const configuredGames = library.map((savedGame) => {
    const catalogGame = games.find(
      (game) => game.id === savedGame.id
    );

    return {
      ...catalogGame,
      ...savedGame,
    };
  });

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold">Library</h2>

        <p className="text-zinc-400 mt-1">
          {configuredGames.length}{" "}
          {configuredGames.length === 1
            ? "juego configurado"
            : "juegos configurados"}
        </p>
      </div>

      {configuredGames.length === 0 ? (
        <div className="bg-[#11161d] border border-zinc-800 rounded-2xl p-8 text-center">
          <Gamepad2
            size={32}
            className="mx-auto text-zinc-600 mb-3"
          />

          <p className="font-medium text-zinc-300">
            Tu biblioteca está vacía
          </p>

          <p className="text-sm text-zinc-500 mt-1">
            Agrega un juego compatible para comenzar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configuredGames.map((game) => (
            <div
              key={game.id}
              className="bg-[#11161d] border border-green-500/30 rounded-2xl p-5 transition"
            >
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-zinc-900 border border-zinc-700 flex items-center justify-center text-green-400 shrink-0">
                  <Gamepad2 size={22} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold">
                    {game.name ?? game.id}
                  </p>

                  {game.year && (
                    <p className="text-xs text-zinc-500">
                      {game.year}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-xs text-green-400 mb-1">
                ✓ Configurado
              </p>

              <p className="text-xs text-zinc-500 break-all mb-4 line-clamp-1">
                {game.exePath}
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  onClick={() => onAddGame(game)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-sm bg-zinc-800 hover:bg-zinc-700 transition"
                >
                  <FolderOpen size={14} />
                  Cambiar ejecutable
                </button>

                <button
                  onClick={() => onRemoveGame(game.id)}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition"
                  aria-label={`Eliminar ${game.name ?? game.id}`}
                  title="Eliminar de la biblioteca"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-[#11161d] border border-zinc-800 rounded-2xl">
        <p className="text-sm text-zinc-400">
          🎮{" "}
          <span className="text-green-400 font-medium">
            Soportados:
          </span>{" "}
          Quake III Arena, Unreal Tournament '99, Counter-Strike
          1.6 y Carmageddon 2
        </p>

        <p className="text-xs text-zinc-500 mt-1">
          🚧{" "}
          <span className="text-yellow-500">
            En desarrollo:
          </span>{" "}
          Quake II, Quake, UT2004, Half-Life y Doom II
        </p>
      </div>
    </>
  );
}