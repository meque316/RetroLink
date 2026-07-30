import { Crown, Users } from "lucide-react";
import Avatar from "../profile/Avatar";
import ProfileCard from "../profile/ProfileCard";

function OnlineUsers({
  currentUser,
  onlineUsers,
  uploadingAvatar,
  handleAvatarUpload,
}) {
  return (
    <aside className="hidden h-screen w-80 shrink-0 overflow-y-auto border-l border-zinc-800 bg-[#0c1219] p-5 xl:block [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700">
      <ProfileCard
        currentUser={currentUser}
        uploadingAvatar={uploadingAvatar}
        handleAvatarUpload={handleAvatarUpload}
      />

      <section className="rounded-2xl border border-zinc-800 bg-[#101720] p-4">
        <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-green-400" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-300">
              Usuarios en línea
            </h3>
          </div>
          <span className="rounded-full bg-zinc-900 px-2 py-1 text-xs text-zinc-400">
            {onlineUsers.length}
          </span>
        </div>

        <div className="space-y-1">
          {onlineUsers.length === 0 ? (
            <div className="py-8 text-center">
              <Users size={26} className="mx-auto mb-3 text-zinc-700" />
              <p className="text-sm text-zinc-500">No hay otros usuarios conectados.</p>
            </div>
          ) : (
            onlineUsers.map((user, index) => {
              const isAdmin = user.role === "ADMIN";

              return (
                <div
                  key={user.id || user.socketId || `${user.username}-${index}`}
                  className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-zinc-800/50"
                >
                  <div className="relative shrink-0">
                    <Avatar user={user} size="sm" />
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#101720] bg-green-400" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p
                      className={`flex items-center gap-1.5 truncate font-medium ${
                        isAdmin ? "text-yellow-400" : "text-white"
                      }`}
                    >
                      <span className="truncate">{user.username}</span>
                      {isAdmin && <Crown size={13} className="shrink-0" />}
                    </p>
                    <p className="truncate text-xs text-zinc-500">En línea</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </aside>
  );
}

export default OnlineUsers;
