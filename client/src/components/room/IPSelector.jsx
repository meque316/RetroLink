import {
  Check,
  Network,
  ChevronDown,
} from "lucide-react";

function IPSelector({
  isHost,
  selectedIP,
  availableIPs = [],
  showIPSelector,
  setShowIPSelector,
  isLoadingIPs,
  onIPSelect,
}) {
  if (!isHost) return null;

  const currentIP = selectedIP || availableIPs[0]?.address || "Cargando...";
  const interfaceName =
    availableIPs.find((ip) => ip.address === selectedIP)?.name || "";

  return (
    <div className="relative mb-4">
      <button
        onClick={() => setShowIPSelector(!showIPSelector)}
        className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl text-sm transition w-full justify-between"
        type="button"
      >
        <div className="flex items-center gap-2">
          <Network size={15} className="text-zinc-400" />
          <span className="text-zinc-300">IP:</span>
          <span className="text-green-400 font-mono">{currentIP}</span>

          {interfaceName && (
            <span className="text-xs text-zinc-500">
              ({interfaceName})
            </span>
          )}
        </div>

        <ChevronDown
          size={15}
          className={`text-zinc-500 transition ${
            showIPSelector ? "rotate-180" : ""
          }`}
        />
      </button>

      {showIPSelector && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden z-50 shadow-xl">
          {isLoadingIPs ? (
            <div className="px-4 py-3 text-sm text-zinc-400">
              Cargando interfaces de red...
            </div>
          ) : availableIPs.length === 0 ? (
            <div className="px-4 py-3 text-sm text-yellow-400">
              No se encontraron interfaces de red
            </div>
          ) : (
            availableIPs.map((ip, index) => (
              <button
                key={`${ip.address}-${index}`}
                onClick={() => onIPSelect(ip.address)}
                className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center justify-between hover:bg-zinc-800 ${
                  ip.address === selectedIP
                    ? "bg-green-500/10 text-green-400"
                    : "text-white"
                }`}
                type="button"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono">{ip.address}</span>
                  <span className="text-xs text-zinc-500">{ip.name}</span>
                </div>

                {ip.address === selectedIP && (
                  <Check size={14} className="text-green-400" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default IPSelector;