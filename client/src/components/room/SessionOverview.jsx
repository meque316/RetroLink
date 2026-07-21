import {
  CheckCircle2,
  Clock3,
  Crown,
  Gamepad2,
  Users,
} from "lucide-react";

function OverviewItem({
  icon: Icon,
  label,
  value,
  valueClassName = "text-white",
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-800 bg-[#0b1118] px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-indigo-400">
        <Icon size={17} />
      </div>

      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
          {label}
        </p>

        <p
          className={`mt-1 truncate text-sm font-semibold ${valueClassName}`}
          title={String(value)}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function getMemberId(member) {
  return member?.id ?? member?.socketId ?? member;
}

function getMemberName(member, index = 0) {
  return (
    member?.username ??
    member?.name ??
    `Player ${index + 1}`
  );
}

function SessionOverview({
  room,
  readyPlayers = [],
}) {
  const members = room?.members ?? [];
  const hostId = room?.host;

  const hostIndex = members.findIndex(
    (member) => getMemberId(member) === hostId
  );

  const hostMember =
    hostIndex >= 0
      ? members[hostIndex]
      : null;

  const hostName = hostMember
    ? getMemberName(hostMember, hostIndex)
    : "Waiting...";

  const playerCount = members.length;
  const readyCount = readyPlayers.length;

  const maxPlayers =
    room?.gameOptions?.maxplayers ??
    room?.gameOptions?.maxPlayers ??
    room?.maxPlayers ??
    null;

  const gameName =
    room?.game ??
    room?.gameName ??
    room?.gameId ??
    "Unknown game";

  const everyoneReady =
    playerCount > 0 &&
    readyCount >= playerCount;

  const nobodyReady =
    readyCount === 0;

  let sessionStatus = "Waiting for players";
  let statusIcon = Clock3;
  let statusValueClass =
    "text-yellow-300";

  if (everyoneReady) {
    sessionStatus = "Ready to start";
    statusIcon = CheckCircle2;
    statusValueClass =
      "text-green-300";
  } else if (!nobodyReady) {
    sessionStatus = "Players preparing";
    statusIcon = Clock3;
    statusValueClass =
      "text-yellow-300";
  }

  const StatusIcon = statusIcon;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#111821]">
      <header className="flex flex-col gap-3 border-b border-zinc-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400">
            Session
          </p>

          <h2 className="mt-1 text-base font-semibold text-white">
            Match overview
          </h2>
        </div>

        <div
          className={`flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
            everyoneReady
              ? "border-green-500/20 bg-green-500/10 text-green-400"
              : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
          }`}
        >
          <StatusIcon size={14} />
          {sessionStatus}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 md:p-5 xl:grid-cols-5">
        <OverviewItem
          icon={Gamepad2}
          label="Game"
          value={gameName}
        />

        <OverviewItem
          icon={Crown}
          label="Host"
          value={hostName}
          valueClassName="text-yellow-300"
        />

        <OverviewItem
          icon={Users}
          label="Players"
          value={
            maxPlayers
              ? `${playerCount} / ${maxPlayers}`
              : playerCount
          }
        />

        <OverviewItem
          icon={CheckCircle2}
          label="Ready"
          value={`${readyCount} / ${playerCount}`}
          valueClassName={
            everyoneReady
              ? "text-green-300"
              : "text-white"
          }
        />

        <OverviewItem
          icon={StatusIcon}
          label="Status"
          value={sessionStatus}
          valueClassName={statusValueClass}
        />
      </div>
    </section>
  );
}

export default SessionOverview;