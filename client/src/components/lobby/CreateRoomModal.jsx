import { Gamepad2, X } from "lucide-react";

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
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-[#121821] border border-zinc-800 rounded-3xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold">Host a Match</h2>

          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-white transition"
            type="button"
          >
            <X size={22} />
          </button>
        </div>

        <div className="mb-6">
          <label className="text-sm text-zinc-400 mb-2 block">
            Room name
          </label>

          <input
            type="text"
            placeholder={`${currentUser?.username}'s Room`}
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div className="mb-8">
          <label className="text-sm text-zinc-400 mb-2 block">
            Select game
          </label>

          <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {games.map((game) => {
              const isSupported = game.supported;
              const isConfigured = library.some((g) => g.id === game.id);

              return (
                <button
                  key={game.id}
                  onClick={() => isSupported && setSelectedGame(game)}
                  disabled={!isSupported}
                  type="button"
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition text-left ${
                    selectedGame.id === game.id && isSupported
                      ? "border-green-500 bg-green-500/10 text-green-400"
                      : isSupported
                      ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
                      : "border-zinc-800 bg-zinc-900/50 text-zinc-600 cursor-not-allowed opacity-60"
                  }`}
                >
                  <Gamepad2 size={16} className="shrink-0" />

                  <div className="flex-1">
                    <p className="text-sm font-medium leading-tight flex items-center gap-2">
                      {game.name}

                      {!isSupported && (
                        <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
                          Pronto
                        </span>
                      )}

                      {isSupported && isConfigured && (
                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">
                          ✓
                        </span>
                      )}
                    </p>

                    <p className="text-xs text-zinc-500">{game.year}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <p className="text-xs text-zinc-500 mt-3">
            ✅ Juegos soportados: Quake III Arena, Counter-Strike 1.6,
            Carmageddon 2
          </p>
        </div>

        <button
          onClick={onCreateRoom}
          disabled={!isGameSupported(selectedGame.id)}
          type="button"
          className={`w-full py-3 rounded-xl font-semibold transition ${
            isGameSupported(selectedGame.id)
              ? "bg-green-500 hover:bg-green-400 text-black"
              : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
          }`}
        >
          Create Room
        </button>
      </div>
    </div>
  );
}