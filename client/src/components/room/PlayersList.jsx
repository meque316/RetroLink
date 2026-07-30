import {
  Check,
  Clock3,
  Crown,
  Gamepad2,
  Link2,
  UserRound,
} from "lucide-react";

function PlayerRow({
  member,
  index,
  hostId,
  readyPlayers,
  connectionReady,
  gameConfigured,
  currentUser,
  currentUserId,
}) {
  const memberId =
    member?.id ?? member?.socketId ?? member;
  const username =
    member?.username ??
    member?.name ??
    `Player ${index + 1}`;
  const ready = readyPlayers.includes(memberId);
  const isHost = memberId === hostId;
  const initial =
    username?.charAt(0)?.toUpperCase() ??
    index + 1;

  const memberAvatar =
    member?.avatar ??
    member?.avatarUrl ??
    member?.profileImage ??
    (memberId === currentUserId
      ? currentUser?.avatar ?? currentUser?.avatarUrl
      : null);

  return (
    <div className="grid gap-4 rounded-xl border border-zinc-800 bg-[#0b1118] p-4 transition hover:border-zinc-700 md:grid-cols-[minmax(180px,1fr)_repeat(3,minmax(105px,150px))] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative h-11 w-11 shrink-0">
          {memberAvatar ? (
            <img
              src={memberAvatar}
              alt={`Avatar de ${username}`}
              className="h-11 w-11 rounded-xl border border-zinc-800 object-cover"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 font-bold text-zinc-200">
              {initial}
            </div>
          )}

          <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0b1118] bg-green-400" />
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold text-white">
              {username}
            </span>

            {isHost && (
              <span className="flex items-center gap-1 rounded-md border border-sky-500/40 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                <Crown size={11} />
                HOST
              </span>
            )}
          </div>

          <p className="mt-1 text-xs text-zinc-500">
            {memberId === hostId ? "Anfitrión" : "Jugador"}
          </p>
        </div>
      </div>

      <PlayerState
        icon={Gamepad2}
        label="Juego"
        value={gameConfigured ? "OK" : "Falta"}
        ok={gameConfigured}
      />

      <PlayerState
        icon={Link2}
        label="Conexión"
        value={connectionReady ? "P2P" : "..."}
        ok={connectionReady}
      />

      <PlayerState
        icon={ready ? Check : Clock3}
        label="Ready"
        value={ready ? "Sí" : "No"}
        ok={ready}
      />
    </div>
  );
}

function PlayerState({
  icon: Icon,
  label,
  value,
  ok,
}) {
  return (
    <div className="flex items-center gap-2 md:justify-center">
      <Icon
        size={18}
        className={ok ? "text-green-400" : "text-zinc-600"}
      />

      <div>
        <p className="text-xs text-zinc-500">{label}</p>
        <p
          className={`mt-0.5 text-sm font-medium ${
            ok ? "text-green-400" : "text-zinc-500"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function EmptyPlayersState() {
  return (
    <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-[#0b1118] px-4 py-6 text-center">
      <UserRound size={20} className="text-zinc-600" />
      <p className="mt-3 text-sm font-medium text-zinc-300">
        No hay jugadores conectados
      </p>
    </div>
  );
}

function PlayersList({
  members = [],
  hostId,
  readyPlayers = [],
  connectionReady = false,
  gameConfigured = false,
  currentUser = null,
  currentUserId = null,
}) {
  if (members.length === 0) {
    return <EmptyPlayersState />;
  }

  return (
    <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
      {members.map((member, index) => {
        const memberId =
          member?.id ?? member?.socketId ?? member;

        return (
          <PlayerRow
            key={memberId ?? index}
            member={member}
            index={index}
            hostId={hostId}
            readyPlayers={readyPlayers}
            connectionReady={connectionReady}
            gameConfigured={gameConfigured}
            currentUser={currentUser}
            currentUserId={currentUserId}
          />
        );
      })}
    </div>
  );
}

export default PlayersList;
