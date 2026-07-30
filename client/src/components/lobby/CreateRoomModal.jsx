import { Gamepad2, X } from "lucide-react";

import GameOptionsPanel from "./game-options/GameOptionsPanel";

export default function CreateRoomModal({
  isOpen,
  onClose,
  roomName,
  setRoomName,
  selectedGame,
  setSelectedGame,
  games = [],
  library = [],
  currentUser,
  onCreateRoom,
  isGameSupported,
  gameOptions,
  setGameOptions,
}) {
  if (!isOpen) {
    return null;
  }

  const canCreateRoom =
    selectedGame?.id &&
    isGameSupported(selectedGame.id);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-800 bg-[#121821] p-6 md:p-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            Host a Match
          </h2>

          <button
            onClick={onClose}
            className="text-zinc-500 transition hover:text-white"
            type="button"
            aria-label="Close modal"
          >
            <X size={22} />
          </button>
        </div>

        <div className="mb-6">
          <label className="mb-2 block text-sm text-zinc-400">
            Room name
          </label>

          <input
            type="text"
            placeholder={`${
              currentUser?.username || "Player"
            }'s Room`}
            value={roomName}
            onChange={(event) =>
              setRoomName(event.target.value)
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="mb-8">
          <label className="mb-2 block text-sm text-zinc-400">
            Select game
          </label>

          <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1">
            {games.map((game) => {
              const supported =
                Boolean(game.supported);

              const configured =
                library.some(
                  (libraryGame) =>
                    libraryGame.id ===
                      game.id &&
                    Boolean(
                      libraryGame.exePath
                    )
                );

              const selected =
                selectedGame?.id ===
                  game.id &&
                supported;

              return (
                <button
                  key={game.id}
                  onClick={() => {
                    if (supported) {
                      setSelectedGame(game);
                    }
                  }}
                  disabled={!supported}
                  type="button"
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                    selected
                      ? "border-green-500 bg-green-500/10 text-green-400"
                      : supported
                        ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                        : "cursor-not-allowed border-zinc-800 bg-zinc-900/50 text-zinc-600 opacity-60"
                  }`}
                >
                  <Gamepad2
                    size={16}
                    className="shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium leading-tight">
                      <span className="truncate">
                        {game.name}
                      </span>

                      {!supported && (
                        <span className="rounded-full bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-500">
                          Pronto
                        </span>
                      )}

                      {supported &&
                        configured && (
                          <span className="rounded-full bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">
                            ✓
                          </span>
                        )}
                    </p>

                    <p className="text-xs text-zinc-500">
                      {game.year}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-zinc-500">
            Juegos soportados: Quake III Arena,
            Counter-Strike 1.6, Unreal Tournament y
            Carmageddon 2.
          </p>

          <GameOptionsPanel
            gameId={selectedGame?.id}
            gameOptions={gameOptions}
            setGameOptions={setGameOptions}
          />
        </div>

        <button
          onClick={onCreateRoom}
          disabled={!canCreateRoom}
          type="button"
          className={`w-full rounded-xl py-3 font-semibold transition ${
            canCreateRoom
              ? "bg-green-500 text-black hover:bg-green-400"
              : "cursor-not-allowed bg-zinc-700 text-zinc-500"
          }`}
        >
          Create Room
        </button>
      </div>
    </div>
  );
}
