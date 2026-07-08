import {
  LogOut,
  Pencil,
  Check,
  X,
} from "lucide-react";

function RoomHeader({
  room,
  isHost,
  editingName,
  setEditingName,
  newRoomName,
  setNewRoomName,
  saveRoomName,
  onLeave,
}) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
      <div className="w-full sm:w-auto">
        <div className="flex items-center gap-3 flex-wrap">
          {editingName ? (
            <>
              <input
                autoFocus
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRoomName();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="text-xl md:text-2xl font-bold bg-zinc-800 px-3 py-1 rounded-xl focus:outline-none focus:ring-1 focus:ring-green-500 text-white w-full sm:w-64"
              />

              <button
                onClick={saveRoomName}
                className="text-green-400 hover:text-green-300 transition"
                type="button"
              >
                <Check size={18} />
              </button>

              <button
                onClick={() => setEditingName(false)}
                className="text-zinc-500 hover:text-white transition"
                type="button"
              >
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <h1 className="text-2xl md:text-3xl font-bold break-all">
                {room?.name}
              </h1>

              {isHost && (
                <button
                  onClick={() => {
                    setNewRoomName(room?.name || "");
                    setEditingName(true);
                  }}
                  className="text-zinc-500 hover:text-white transition mt-1"
                  type="button"
                >
                  <Pencil size={16} />
                </button>
              )}
            </>
          )}
        </div>

        <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400">
          {room?.game}
        </span>

        <p className="text-zinc-400 text-sm mt-2">
          Waiting for players...
        </p>
      </div>

      <button
        onClick={onLeave}
        className="flex items-center gap-2 bg-zinc-800 hover:bg-red-500 px-4 py-2 rounded-xl transition w-full sm:w-auto justify-center"
        type="button"
      >
        <LogOut size={16} />
        Leave
      </button>
    </div>
  );
}

export default RoomHeader;