export default function CS16Options({
  gameOptions,
  updateGameOption,
}) {
  return (
    <div className="mt-6 space-y-4 border-t border-zinc-800 pt-5">
      <h3 className="text-sm font-semibold text-green-400">
        Opciones de Counter-Strike 1.6
      </h3>

      <div>
        <label className="mb-2 block text-sm text-zinc-400">
          Mapa
        </label>

        <select
          value={gameOptions.map || "de_dust2"}
          onChange={(event) =>
            updateGameOption(
              "map",
              event.target.value
            )
          }
          className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
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
            Time limit
          </label>

          <input
            type="number"
            min="0"
            max="120"
            value={gameOptions.timeLimit ?? 30}
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
            Start money
          </label>

          <input
            type="number"
            min="800"
            max="16000"
            step="100"
            value={gameOptions.startMoney ?? 800}
            onChange={(event) =>
              updateGameOption(
                "startMoney",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Freeze time
          </label>

          <input
            type="number"
            min="0"
            max="30"
            value={gameOptions.freezeTime ?? 5}
            onChange={(event) =>
              updateGameOption(
                "freezeTime",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm text-zinc-400">
            Buy time
          </label>

          <input
            type="number"
            min="0"
            max="5"
            step="0.25"
            value={gameOptions.buyTime ?? 0.25}
            onChange={(event) =>
              updateGameOption(
                "buyTime",
                Number(event.target.value)
              )
            }
            className="w-full rounded-xl bg-zinc-900 px-4 py-3 text-white focus:outline-none focus:ring-1 focus:ring-green-500"
          />
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

      <div className="grid grid-cols-2 gap-3 pt-2">
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

        <label className="flex items-center gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(
              gameOptions.allTalk
            )}
            onChange={(event) =>
              updateGameOption(
                "allTalk",
                event.target.checked
              )
            }
          />

          All talk
        </label>
      </div>
    </div>
  );
}