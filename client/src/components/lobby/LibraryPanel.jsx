import {
  CheckCircle2,
  FolderOpen,
  Gamepad2,
  Plus,
  Trash2,
} from "lucide-react";

export default function LibraryPanel({
  games = [],
  library = [],
  onAddGame,
  onRemoveGame,
}) {
  /*
   * La biblioteca debe mostrar todos los juegos soportados,
   * no solamente aquellos que ya tengan una ruta configurada.
   */
  const supportedGames = games.filter(
    (game) => game.supported !== false
  );

  /*
   * Combinamos la información del catálogo con la ruta guardada
   * en localStorage.
   */
  const catalogGames = supportedGames.map((game) => {
    const savedGame = library.find(
      (libraryGame) => libraryGame.id === game.id
    );

    return {
      ...game,
      ...savedGame,
      configured: Boolean(savedGame?.exePath),
    };
  });

  const configuredCount = catalogGames.filter(
    (game) => game.configured
  ).length;

  return (
    <>
      <div className="mb-8">
        <h2 className="text-3xl font-semibold text-white">
          Biblioteca
        </h2>

        <p className="mt-1 text-zinc-400">
          {configuredCount}{" "}
          {configuredCount === 1
            ? "juego configurado"
            : "juegos configurados"}
          {" de "}
          {catalogGames.length}
        </p>
      </div>

      {catalogGames.length === 0 ? (
        <div className="rounded-2xl border border-zinc-800 bg-[#11161d] p-8 text-center">
          <Gamepad2
            size={32}
            className="mx-auto mb-3 text-zinc-600"
          />

          <p className="font-medium text-zinc-300">
            No hay juegos disponibles
          </p>

          <p className="mt-1 text-sm text-zinc-500">
            Todavía no existen juegos compatibles en el catálogo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {catalogGames.map((game) => (
            <div
              key={game.id}
              className={`rounded-2xl border bg-[#11161d] p-5 transition ${
                game.configured
                  ? "border-green-500/30"
                  : "border-zinc-800 hover:border-zinc-700"
              }`}
            >
              <div className="mb-4 flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${
                    game.configured
                      ? "border-green-500/30 bg-green-500/10 text-green-400"
                      : "border-zinc-700 bg-zinc-900 text-zinc-500"
                  }`}
                >
                  <Gamepad2 size={22} />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">
                    {game.name ?? game.id}
                  </p>

                  {game.year && (
                    <p className="text-xs text-zinc-500">
                      {game.year}
                    </p>
                  )}
                </div>
              </div>

              {game.configured ? (
                <>
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-green-400">
                    <CheckCircle2 size={14} />
                    Configurado
                  </div>

                  <p
                    className="mb-4 truncate text-xs text-zinc-500"
                    title={game.exePath}
                  >
                    {game.exePath}
                  </p>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => onAddGame(game)}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-800 px-3 py-2 text-sm text-zinc-200 transition hover:bg-zinc-700"
                    >
                      <FolderOpen size={14} />
                      Cambiar ejecutable
                    </button>

                    <button
                      type="button"
                      onClick={() => onRemoveGame(game.id)}
                      className="flex items-center justify-center rounded-xl bg-zinc-800 px-3 py-2 text-zinc-400 transition hover:bg-red-500/20 hover:text-red-400"
                      aria-label={`Eliminar ${game.name ?? game.id}`}
                      title="Eliminar de la biblioteca"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mb-4 text-sm text-zinc-500">
                    Selecciona el ejecutable del juego para agregarlo
                    a tu biblioteca.
                  </p>

                  <button
                    type="button"
                    onClick={() => onAddGame(game)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-green-400"
                  >
                    <Plus size={16} />
                    Agregar juego
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-zinc-800 bg-[#11161d] p-4">
        <p className="text-sm text-zinc-400">
          🎮{" "}
          <span className="font-medium text-green-400">
            Soportados:
          </span>{" "}
          Quake III Arena, Unreal Tournament '99,
          Counter-Strike 1.6 y Carmageddon 2
        </p>

        <p className="mt-1 text-xs text-zinc-500">
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