import {
  CheckCircle2,
  FolderOpen,
  Gamepad2,
  TriangleAlert,
} from "lucide-react";

function GamePathPanel({
  game,
  gamePath,
  onBrowse,
}) {
  const configured = Boolean(gamePath);

  return (
    <div className="space-y-4">
      <div
        className={`rounded-xl border p-4 ${
          configured
            ? "border-green-500/20 bg-green-500/10"
            : "border-yellow-500/20 bg-yellow-500/10"
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              configured
                ? "bg-green-500/10 text-green-400"
                : "bg-yellow-500/10 text-yellow-400"
            }`}
          >
            {configured ? (
              <CheckCircle2 size={20} />
            ) : (
              <TriangleAlert size={20} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3
              className={`text-sm font-semibold ${
                configured
                  ? "text-green-300"
                  : "text-yellow-300"
              }`}
            >
              {configured
                ? "Game Ready"
                : "Installation Required"}
            </h3>

            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              {configured
                ? "RetroLink has a valid executable configured for this game."
                : "RetroLink cannot launch this game until an executable is selected."}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-[#0b1118] p-4">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-400">
            <Gamepad2 size={18} />
          </div>

          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Game
            </p>

            <p className="font-semibold text-white">
              {game}
            </p>
          </div>
        </div>

        <div className="mb-2">
          <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
            Executable
          </p>

          {configured ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-3">
              <p className="break-all font-mono text-xs text-green-300">
                {gamePath}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/40 px-3 py-5 text-center">
              <p className="text-sm text-zinc-500">
                No executable selected
              </p>
            </div>
          )}
        </div>

        <button
          onClick={onBrowse}
          type="button"
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
            configured
              ? "border border-zinc-700 bg-zinc-800 hover:border-zinc-600 hover:bg-zinc-700"
              : "bg-indigo-600 hover:bg-indigo-500"
          }`}
        >
          <FolderOpen size={17} />

          {configured
            ? "Change Installation"
            : "Browse Executable"}
        </button>
      </div>
    </div>
  );
}

export default GamePathPanel;