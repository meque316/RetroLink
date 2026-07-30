import {
  Gamepad2,
  Library,
  LogOut,
  UsersRound,
} from "lucide-react";
import logo from "../../assets/retrolink-logo.png";

const DISCORD_INVITE_URL = "https://discord.gg/rSERkhBgU2";

function DiscordIcon({ size = 19, className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M19.54 5.34A16.3 16.3 0 0 0 15.44 4l-.5 1.02a15.12 15.12 0 0 0-5.88 0L8.55 4a16.46 16.46 0 0 0-4.11 1.35C1.84 9.17 1.14 12.9 1.5 16.58a16.67 16.67 0 0 0 5.03 2.55l1.24-1.7a10.65 10.65 0 0 1-1.94-.93l.48-.37a11.67 11.67 0 0 0 11.38 0l.5.37c-.62.36-1.28.67-1.96.93l1.24 1.7a16.6 16.6 0 0 0 5.03-2.55c.43-4.27-.74-7.96-2.96-11.24ZM8.43 14.3c-1.12 0-2.04-1.03-2.04-2.3s.9-2.3 2.04-2.3c1.14 0 2.06 1.04 2.04 2.3 0 1.27-.9 2.3-2.04 2.3Zm7.14 0c-1.12 0-2.04-1.03-2.04-2.3s.9-2.3 2.04-2.3c1.14 0 2.06 1.04 2.04 2.3 0 1.27-.9 2.3-2.04 2.3Z" />
    </svg>
  );
}

const navItems = [
  { id: "lobby", label: "Lobby", icon: Gamepad2 },
  { id: "friends", label: "Amigos", icon: UsersRound },
  { id: "library", label: "Biblioteca", icon: Library },
];

function Sidebar({
  activeView,
  setActiveView,
  library = [],
  friends = [],
  fetchFriends,
  logout,
}) {
  const pendingRequests = friends.filter(
    (friend) => friend.status === "pending" && !friend.isSender
  ).length;

  const getBadge = (id) => {
    if (id === "library" && library.length > 0) return library.length;
    if (id === "friends" && pendingRequests > 0) return pendingRequests;
    return null;
  };

  const handleNavigation = (id) => {
    setActiveView(id);
    if (id === "friends") fetchFriends?.();
  };

  return (
    <aside className="flex h-full min-h-0 w-60 shrink-0 flex-col overflow-hidden border-r border-zinc-800 bg-[#0c1219]">
      <div className="shrink-0 px-4 pt-5">
        <div className="flex h-20 items-center gap-3 border-b border-zinc-800/80 px-2 pb-5">
          <img
            src={logo}
            alt="RetroLink"
            className="h-16 w-16 object-contain drop-shadow-[0_0_16px_rgba(34,197,94,0.18)]"
          />

          <div>
            <p className="text-xl font-bold tracking-tight text-white">
              RetroLink
            </p>
            <p className="text-xs text-zinc-500">Public beta</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6">
        <nav className="space-y-2">
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activeView === id;
            const badge = getBadge(id);

            return (
              <button
                key={id}
                type="button"
                onClick={() => handleNavigation(id)}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition ${
                  active
                    ? "border border-green-500/20 bg-green-500/10 text-green-400"
                    : "border border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
                }`}
              >
                <Icon size={19} />
                <span className="flex-1 font-medium">{label}</span>

                {badge !== null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      id === "friends"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-green-500/15 text-green-400"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}

          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noreferrer noopener"
            className="flex w-full items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-left text-[#5865F2] transition hover:border-[#5865F2]/20 hover:bg-[#5865F2]/10 hover:text-[#7289da]"
            aria-label="Abrir Discord de RetroLink"
            title="Unirse al Discord de RetroLink"
          >
            <DiscordIcon size={19} />
            <span className="font-medium">Discord</span>
          </a>

          <button
            type="button"
            onClick={logout}
            className="mt-3 flex w-full items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-left text-red-400 transition hover:bg-red-500/10"
          >
            <LogOut size={18} />
            <span className="font-medium">Cerrar sesión</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}

export default Sidebar;
