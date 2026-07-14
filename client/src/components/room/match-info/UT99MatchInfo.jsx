import {
  UT99_DIFFICULTY_LABELS,
  UT99_GAME_TYPE_LABELS,
} from "./matchInfo.constants";

export default function UT99MatchInfo({
  gameOptions = {},
}) {
  const gameTypeLabel =
    UT99_GAME_TYPE_LABELS[gameOptions.gameType] ||
    gameOptions.gameType ||
    "DeathMatch";

  const difficultyLabel =
    UT99_DIFFICULTY_LABELS[
      Number(gameOptions.difficulty)
    ] ??
    gameOptions.difficulty ??
    "Skilled";

  return (
    <div className="mb-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-sm text-zinc-300">
      <p className="mb-3 font-semibold text-indigo-400">
        Unreal Tournament Match Options
      </p>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <p>
          Mode:{" "}
          <span className="text-white">
            {gameTypeLabel}
          </span>
        </p>

        <p>
          Map:{" "}
          <span className="text-white">
            {gameOptions.map || "Not specified"}
          </span>
        </p>

        <p>
          Max players:{" "}
          <span className="text-white">
            {gameOptions.maxPlayers ?? 16}
          </span>
        </p>

        <p>
          Minimum players / bots:{" "}
          <span className="text-white">
            {gameOptions.minPlayers ?? 0}
          </span>
        </p>

        <p>
          Frag limit:{" "}
          <span className="text-white">
            {gameOptions.fragLimit ?? 0}
          </span>
        </p>

        <p>
          Time limit:{" "}
          <span className="text-white">
            {gameOptions.timeLimit ?? 0} min
          </span>
        </p>

        <p>
          Bot difficulty:{" "}
          <span className="text-white">
            {difficultyLabel}
          </span>
        </p>

        <p>
          Friendly fire:{" "}
          <span className="text-white">
            {gameOptions.friendlyFire ?? 0}%
          </span>
        </p>

        <p>
          Password:{" "}
          <span className="text-white">
            {gameOptions.password
              ? "Enabled"
              : "Disabled"}
          </span>
        </p>
      </div>
    </div>
  );
}