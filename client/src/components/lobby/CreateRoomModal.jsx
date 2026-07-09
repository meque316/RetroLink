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
  gameOptions,
  setGameOptions,
}) {
  if (!isOpen) return null;

  const updateGameOption = (key, value) => {
    setGameOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

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

          {selectedGame?.id === "cs16" && (
            <div className="mt-6 border-t border-zinc-800 pt-5 space-y-4">
              <h3 className="text-sm font-semibold text-green-400">
                Opciones de Counter-Strike 1.6
              </h3>

              <div>
                <label className="text-sm text-zinc-400 mb-2 block">
                  Mapa
                </label>

                <select
                  value={gameOptions.map}
                  onChange={(e) => updateGameOption("map", e.target.value)}
                  className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                >
                  <option value="de_dust2">de_dust2</option>
                  <option value="de_inferno">de_inferno</option>
                  <option value="de_nuke">de_nuke</option>
                  <option value="de_train">de_train</option>
                  <option value="de_aztec">de_aztec</option>
                  <option value="de_cbble">de_cbble</option>
                  <option value="cs_assault">cs_assault</option>
                  <option value="cs_office">cs_office</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Max players
                  </label>

                  <input
                    type="number"
                    min="2"
                    max="32"
                    value={gameOptions.maxPlayers}
                    onChange={(e) =>
                      updateGameOption("maxPlayers", Number(e.target.value))
                    }
                    className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Time limit
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="120"
                    value={gameOptions.timeLimit}
                    onChange={(e) =>
                      updateGameOption("timeLimit", Number(e.target.value))
                    }
                    className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Start money
                  </label>

                  <input
                    type="number"
                    min="800"
                    max="16000"
                    step="100"
                    value={gameOptions.startMoney}
                    onChange={(e) =>
                      updateGameOption("startMoney", Number(e.target.value))
                    }
                    className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Freeze time
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={gameOptions.freezeTime}
                    onChange={(e) =>
                      updateGameOption("freezeTime", Number(e.target.value))
                    }
                    className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Buy time
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="5"
                    step="0.25"
                    value={gameOptions.buyTime}
                    onChange={(e) =>
                      updateGameOption("buyTime", Number(e.target.value))
                    }
                    className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>

                <div>
                  <label className="text-sm text-zinc-400 mb-2 block">
                    Password
                  </label>

                  <input
                    type="text"
                    value={gameOptions.password}
                    onChange={(e) =>
                      updateGameOption("password", e.target.value)
                    }
                    placeholder="Optional"
                    className="w-full bg-zinc-900 px-4 py-3 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={gameOptions.friendlyFire}
                    onChange={(e) =>
                      updateGameOption("friendlyFire", e.target.checked)
                    }
                  />

                  Friendly fire
                </label>

                <label className="flex items-center gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={gameOptions.allTalk}
                    onChange={(e) =>
                      updateGameOption("allTalk", e.target.checked)
                    }
                  />

                  All talk
                </label>
              </div>
            </div>
          )}
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