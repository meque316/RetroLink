import {
  Check,
  Clock3,
  Play,
} from "lucide-react";

function RoomActions({
  isReady,
  isHost,
  onToggleReady,
  onStartMatch,
}) {
  return (
    <section className="rounded-2xl border border-zinc-800 bg-[#111821] p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onToggleReady}
          type="button"
          className={`flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold transition ${
            isReady
              ? "bg-green-500 text-black hover:bg-green-400"
              : "border border-zinc-700 bg-zinc-800 text-white hover:border-zinc-600 hover:bg-zinc-700"
          }`}
        >
          {isReady ? (
            <>
              <Check size={18} />
              Ready
            </>
          ) : (
            <>
              <Clock3 size={18} />
              Ready Up
            </>
          )}
        </button>

        {isHost && (
          <button
            onClick={onStartMatch}
            type="button"
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-500"
          >
            <Play size={18} />
            Start Match
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-zinc-500">
        {isHost
          ? "The host can start the match when everyone is ready."
          : "Mark yourself as ready and wait for the host to start."}
      </p>
    </section>
  );
}

export default RoomActions;