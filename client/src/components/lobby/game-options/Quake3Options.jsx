import {
  QUAKE3_BOT_SKILLS,
  QUAKE3_GAME_TYPES,
  QUAKE3_MAPS,
} from "./gameOptions.constants";

export default function Quake3Options({
  gameOptions,
  setGameOptions,
  updateGameOption,
}) {
  const selectedGameType =
    gameOptions?.gameType || "freeForAll";

  const availableMaps =
    QUAKE3_MAPS[selectedGameType] ||
    QUAKE3_MAPS.freeForAll;

  const handleGameTypeChange = (gameType) => {
    const maps =
      QUAKE3_MAPS[gameType] ||
      QUAKE3_MAPS.freeForAll;

    setGameOptions((previousOptions) => ({
      ...previousOptions,
      gameType,
      map: maps[0],
    }));
  };

  return (
    <div className="mt-6 space-y-4 border-t border-zinc-800 pt-5">
      <h3 className="text-sm font-semibold text-green-400">
        Opciones de Quake III Arena
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
          {QUAKE3_GAME_TYPES.map((gameType) => (
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
            min="2"
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
            Frag limit
          </label>

          <input
            type="number"
            min="0"
            max="999"
            value={gameOptions.fragLimit ?? 20}
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
            value={gameOptions.timeLimit ?? 15}
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
            Bot skill
          </label>

          <select
            value={gameOptions.botSkill ?? 3}
            onChange={(event) =>
              updateGameOption(
                "botSkill",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          >
            {QUAKE3_BOT_SKILLS.map((skill) => (
              <option
                key={skill.value}
                value={skill.value}
              >
                {skill.name}
              </option>
            ))}
          </select>
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
      </div>

      <label className="flex items-center gap-3 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={Boolean(
            gameOptions.friendlyFire
          )}
          onChange={(event) =>
            updateGameOption(
              "friendlyFire",
              event.target.checked
            )
          }
        />

        Friendly fire
      </label>

      <p className="text-xs text-zinc-500">
        Min players mantiene esa cantidad de
        participantes agregando bots cuando sea
        necesario.
      </p>
    </div>
  );
}