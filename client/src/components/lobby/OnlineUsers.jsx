import { Crown } from "lucide-react";
import Avatar from "../profile/Avatar";
import ProfileCard from "../profile/ProfileCard";

function OnlineUsers({
  currentUser,
  onlineUsers,
  uploadingAvatar,
  handleAvatarUpload,
}) {
  return (
    <aside className="w-72 border-l border-zinc-800 bg-[#0d1117] p-6 h-screen shrink-0 overflow-y-auto hidden lg:block [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-zinc-900 [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full">
      <ProfileCard
        currentUser={currentUser}
        uploadingAvatar={uploadingAvatar}
        handleAvatarUpload={handleAvatarUpload}
      />

      <h3 className="text-lg font-semibold mb-6">
        Players Online ({onlineUsers.length})
      </h3>

      <div className="space-y-4 pb-6">
        {onlineUsers.length === 0 ? (
          <p className="text-zinc-500 text-sm">No users online</p>
        ) : (
          onlineUsers.map((user, index) => {
            const isAdmin = user.role === "ADMIN";

            return (
              <div
                key={index}
                className="flex items-center gap-3 bg-[#121821] rounded-xl px-4 py-3"
              >
                <Avatar user={user} size="sm" />

                <div className="flex-1 min-w-0">
                  <p
                    className={`font-medium flex items-center gap-1 ${
                      isAdmin ? "text-yellow-400" : "text-white"
                    } truncate`}
                  >
                    {user.username}

                    {isAdmin && (
                      <Crown
                        size={13}
                        className="text-yellow-400 shrink-0"
                      />
                    )}
                  </p>

                  <p className="text-xs text-zinc-400 capitalize truncate">
                    {user.role?.toLowerCase()}
                  </p>
                </div>

                <div className="w-3 h-3 rounded-full bg-green-400 shrink-0" />
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

export default OnlineUsers;