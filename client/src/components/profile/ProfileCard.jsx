import { Camera, Crown } from "lucide-react";
import Avatar from "./Avatar";

function ProfileCard({
  currentUser,
  uploadingAvatar,
  handleAvatarUpload,
}) {
  if (!currentUser) return null;

  return (
    <div className="mb-8 bg-[#121821] rounded-2xl p-4 border border-zinc-800">
      <div className="flex items-center gap-3">
        <div className="relative group shrink-0">
          <Avatar user={currentUser} size="md" />

          <label
            className={`absolute inset-0 rounded-full flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition cursor-pointer ${
              uploadingAvatar ? "opacity-100" : ""
            }`}
          >
            {uploadingAvatar ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera size={14} className="text-white" />
            )}

            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
              disabled={uploadingAvatar}
            />
          </label>
        </div>

        <div className="min-w-0">
          <p className="font-semibold flex items-center gap-2 flex-wrap">
            {currentUser.username}

            {currentUser.role === "ADMIN" && (
              <Crown size={16} className="text-yellow-400" />
            )}
          </p>

          <p className="text-sm text-zinc-400 capitalize truncate">
            {currentUser.role?.toLowerCase()}
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProfileCard;