import { LogOut } from "lucide-react";
import logo from "../../assets/retrolink-logo.png";

function Sidebar({
  activeView,
  setActiveView,
  library = [],
  friends = [],
  fetchFriends,
  logout,
}) {
  const pendingRequests = friends.filter(
    (f) => f.status === "pending" && !f.isSender
  ).length;

  return (
    <aside className="w-64 h-screen shrink-0 border-r border-zinc-800 bg-[#0d1117] overflow-y-auto p-6">
      <div className="flex justify-center mb-8">
        <img
          src={logo}
          alt="RetroLink"
          className="h-32 w-auto object-contain drop-shadow-[0_0_15px_rgba(34,197,94,0.15)]"
        />
      </div>

      <nav className="space-y-4">
        <button
          type="button"
          onClick={() => setActiveView("lobby")}
          className={`w-full text-left px-4 py-3 rounded-xl transition ${
            activeView === "lobby"
              ? "bg-green-500/10 text-green-400"
              : "text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          Lobby
        </button>

        <button
          type="button"
          onClick={() => setActiveView("library")}
          className={`w-full text-left px-4 py-3 rounded-xl transition ${
            activeView === "library"
              ? "bg-green-500/10 text-green-400"
              : "text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          Library

          {library.length > 0 && (
            <span className="ml-2 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
              {library.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView("friends");
            fetchFriends?.();
          }}
          className={`w-full text-left px-4 py-3 rounded-xl transition ${
            activeView === "friends"
              ? "bg-green-500/10 text-green-400"
              : "text-zinc-300 hover:bg-zinc-800"
          }`}
        >
          Friends

          {pendingRequests > 0 && (
            <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">
              {pendingRequests}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={logout}
          className="w-full text-left px-4 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition flex items-center gap-2 font-semibold"
        >
          <LogOut size={16} />
          Logout
        </button>
      </nav>
    </aside>
  );
}

export default Sidebar;