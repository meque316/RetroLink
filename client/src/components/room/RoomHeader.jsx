import {
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
}) {
  return (
    <header className="rounded-2xl border border-zinc-800 bg-[#111821] px-4 py-4 shadow-2xl shadow-black/20 md:px-6 md:py-5">
      <div className="flex min-w-0 items-center gap-3">
        {editingName ? (
          <>
            <input
              autoFocus
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveRoomName();
                if (event.key === "Escape") setEditingName(false);
              }}
              className="min-w-0 flex-1 rounded-xl bg-zinc-800 px-3 py-2 text-xl font-bold text-white focus:outline-none focus:ring-1 focus:ring-green-500 md:text-2xl"
            />

            <button
              onClick={saveRoomName}
              className="shrink-0 text-green-400 transition hover:text-green-300"
              type="button"
              aria-label="Guardar nombre de la sala"
            >
              <Check size={19} />
            </button>

            <button
              onClick={() => setEditingName(false)}
              className="shrink-0 text-zinc-500 transition hover:text-white"
              type="button"
              aria-label="Cancelar edición"
            >
              <X size={19} />
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-green-400">
                Sala
              </p>

              <div className="mt-1 flex min-w-0 items-center gap-3">
                <h1 className="truncate text-2xl font-bold text-white md:text-3xl">
                  {room?.name}
                </h1>

                {isHost && (
                  <button
                    onClick={() => {
                      setNewRoomName(room?.name || "");
                      setEditingName(true);
                    }}
                    className="shrink-0 text-zinc-500 transition hover:text-white"
                    type="button"
                    aria-label="Editar nombre de la sala"
                  >
                    <Pencil size={16} />
                  </button>
                )}
              </div>

              <p className="mt-2 text-sm text-zinc-400">
                {room?.game}
              </p>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

export default RoomHeader;
