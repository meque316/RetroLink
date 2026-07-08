import { Crown } from "lucide-react";

function PlayersList({ members = [], hostId, readyPlayers = [] }) {
  return (
    <div className="space-y-3 mb-6 max-h-48 md:max-h-64 overflow-y-auto pr-2">
      {members.map((member, index) => {
        const memberId = member.id ?? member;
        const ready = readyPlayers.includes(memberId);
        const isHost = memberId === hostId;

        return (
          <div
            key={memberId}
            className="bg-[#0d1117] rounded-2xl px-4 py-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 font-bold text-sm shrink-0">
                {member.username?.charAt(0)?.toUpperCase() ?? index + 1}
              </div>

              <span className="font-medium text-sm md:text-base truncate">
                {member.username ?? `Player ${index + 1}`}
              </span>

              {isHost && <Crown size={15} className="text-yellow-400 shrink-0" />}
            </div>

            <span
              className={`text-xs md:text-sm font-medium ${
                ready ? "text-green-400" : "text-zinc-500"
              }`}
            >
              {ready ? "Ready ✓" : "Not Ready"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default PlayersList;