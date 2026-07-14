export default function CS16MatchInfo({
  gameOptions = {},
}) {
  return (
    <div className="mb-4 rounded-2xl border border-green-500/20 bg-green-500/10 p-4 text-sm text-zinc-300">
      <p className="mb-3 font-semibold text-green-400">
        CS 1.6 Match Options
      </p>

      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
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
          Time limit:{" "}
          <span className="text-white">
            {gameOptions.timeLimit ?? 0} min
          </span>
        </p>

        <p>
          Start money:{" "}
          <span className="text-white">
            ${gameOptions.startMoney ?? 800}
          </span>
        </p>

        <p>
          Freeze time:{" "}
          <span className="text-white">
            {gameOptions.freezeTime ?? 0} sec
          </span>
        </p>

        <p>
          Buy time:{" "}
          <span className="text-white">
            {gameOptions.buyTime ?? 0} min
          </span>
        </p>

        <p>
          Friendly fire:{" "}
          <span className="text-white">
            {gameOptions.friendlyFire ? "On" : "Off"}
          </span>
        </p>

        <p>
          All talk:{" "}
          <span className="text-white">
            {gameOptions.allTalk ? "On" : "Off"}
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