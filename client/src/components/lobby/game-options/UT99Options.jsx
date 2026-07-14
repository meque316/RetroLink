import {
  UT99_DIFFICULTIES,
  UT99_GAME_TYPES,
  UT99_MAPS,
} from "./gameOptions.constants";

export default function UT99Options({
  gameOptions,
  setGameOptions,
  updateGameOption,
}) {
  const selectedGameType =
    gameOptions?.gameType || "deathmatch";

  const availableMaps =
    UT99_MAPS[selectedGameType] ||
    UT99_MAPS.deathmatch;

  const handleGameTypeChange = (gameType) => {
    const maps =
      UT99_MAPS[gameType] ||
      UT99_MAPS.deathmatch;

    setGameOptions((previousOptions) => ({
      ...previousOptions,
      gameType,
      map: maps[0],
    }));
  };

  return (
    <div className="mt-6 space-y-4 border-t border-zinc-800 pt-5">
      <h3 className="text-sm font-semibold text-green-400">
        Opciones de Unreal Tournament
      </h3>

      <div>
        <label className="mb-2 block text-sm text-zinc-400">
          Tipo de partida
        </label>

        <select
          value={selectedGameType}
          onChange={(event) =>
            handleGameTypeChange(
              event.target.value
            )
          }
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {UT99_GAME_TYPES.map((gameType) => (
            <option
              key={gameType.id}
              value={gameType.id}
            >
              {gameType.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-2 block text-sm text-zinc-400">
          Mapa
        </label>

        <select
          value={
            gameOptions.map ||
            availableMaps[0]
          }
          onChange={(event) =>
            updateGameOption(
              "map",
              event.target.value
            )
          }
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {availableMaps.map((map) => (
            <option key={map} value={map}>
              {map}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Max players
          </label>

          <input
            type="number"
            min="1"
            max="32"
            value={gameOptions.maxPlayers ?? 16}
            onChange={(event) =>
              updateGameOption(
                "maxPlayers",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Frag limit
          </label>

          <input
            type="number"
            min="0"
            max="999"
            value={gameOptions.fragLimit ?? 30}
            onChange={(event) =>
              updateGameOption(
                "fragLimit",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Time limit
          </label>

          <input
            type="number"
            min="0"
            max="999"
            value={gameOptions.timeLimit ?? 20}
            onChange={(event) =>
              updateGameOption(
                "timeLimit",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Min players / bots
          </label>

          <input
            type="number"
            min="0"
            max={gameOptions.maxPlayers || 32}
            value={gameOptions.minPlayers ?? 0}
            onChange={(event) =>
              updateGameOption(
                "minPlayers",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Bot difficulty
          </label>

          <select
            value={gameOptions.difficulty ?? 3}
            onChange={(event) =>
              updateGameOption(
                "difficulty",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {UT99_DIFFICULTIES.map(
              (difficulty) => (
                <option
                  key={difficulty.value}
                  value={difficulty.value}
                >
                  {difficulty.name}
                </option>
              )
            )}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Friendly fire %
          </label>

          <input
            type="number"
            min="0"
            max="100"
            step="5"
            value={gameOptions.friendlyFire ?? 0}
            onChange={(event) =>
              updateGameOption(
                "friendlyFire",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block text-sm text-zinc-400">
          Password
        </label>

        <input
          type="text"
          value={gameOptions.password || ""}
          onChange={(event) =>
            updateGameOption(
              "password",
              event.target.value
            )
          }
          placeholder="Optional"
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>

      <p className="text-xs text-zinc-500">
        Min players completa los espacios vacíos con
        bots hasta alcanzar el número indicado.
      </p>
    </div>
  );
}