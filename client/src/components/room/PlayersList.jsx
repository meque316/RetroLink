import {
  Check,
  Clock3,
  Crown,
  UserRound,
} from "lucide-react";

function PlayerRow({
  member,
  index,
  hostId,
  readyPlayers,
}) {
  const memberId = member?.id ?? member;
  const username =
    member?.username ?? `Player ${index + 1}`;

  const ready =
    readyPlayers.includes(memberId);

  const isHost =
    memberId === hostId;

  const initial =
    username?.charAt(0)?.toUpperCase() ??
    index + 1;

  return (
    <div className="group rounded-xl border border-zinc-800 bg-[#0b1118] p-3 transition hover:border-zinc-700 hover:bg-[#0e151e]">
      <div className="flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-sm font-bold text-zinc-200">
            {initial}
          </div>

          <span
            className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0b1118] ${
              ready
                ? "bg-green-400"
                : "bg-zinc-600"
            }`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">
              {username}
            </span>

            {isHost && (
              <Crown
                size={15}
                className="shrink-0 text-yellow-400"
              />
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              {isHost ? "Host" : "Player"}
            </span>

            <span className="h-1 w-1 rounded-full bg-zinc-700" />

            <span
              className={`flex items-center gap-1 text-[11px] font-medium ${
                ready
                  ? "text-green-400"
                  : "text-zinc-500"
              }`}
            >
              {ready ? (
                <Check size={12} />
              ) : (
                <Clock3 size={12} />
              )}

              {ready
                ? "Ready"
                : "Waiting"}
            </span>
          </div>
        </div>

        <div
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
            ready
              ? "border-green-500/20 bg-green-500/10 text-green-400"
              : "border-zinc-800 bg-zinc-900 text-zinc-500"
          }`}
        >
          {ready ? (
            <Check size={13} />
          ) : (
            <Clock3 size={13} />
          )}

          {ready ? "READY" : "WAITING"}
        </div>
      </div>
    </div>
  );
}

function EmptyPlayersState() {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-[#0b1118] px-4 py-6 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-500">
        <UserRound size={18} />
      </div>

      <p className="text-sm font-medium text-zinc-300">
        No players connected
      </p>

      <p className="mt-1 text-xs text-zinc-500">
        Waiting for players to join the room.
      </p>
    </div>
  );
}

function PlayersList({
  members = [],
  hostId,
  readyPlayers = [],
}) {
  if (members.length === 0) {
    return <EmptyPlayersState />;
  }

  return (
    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
      {members.map((member, index) => {
        const memberId =
          member?.id ?? member;

        return (
          <PlayerRow
            key={memberId ?? index}
            member={member}
            index={index}
            hostId={hostId}
            readyPlayers={readyPlayers}
          />
        );
      })}
    </div>
  );
}

export default PlayersList;