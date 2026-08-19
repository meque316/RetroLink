import {
  ChevronDown,
  FolderOpen,
  Gamepad2,
  Link2,
  Network,
  Settings2,
} from "lucide-react";
import { useState } from "react";

import RelayStatus from "./RelayStatus";
import IPSelector from "./IPSelector";
import GamePathPanel from "./GamePathPanel";
import MatchInfoPanel from "./match-info/MatchInfoPanel";

function SummaryRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 border-t border-zinc-800 px-4 py-3 first:border-t-0">
      <Icon size={17} className="mt-0.5 shrink-0 text-zinc-500" />
      <div className="min-w-0">
        <p className="text-sm text-zinc-300">{label}</p>
        <p className="mt-1 break-all text-xs text-zinc-500">
          {value}
        </p>
      </div>
    </div>
  );
}

function AdvancedRoomSettings({
  room,
  gamePath,
  onBrowseGame,
  relayStatus,
  relayStep,
  isHost,
  selectedIP,
  availableIPs,
  showIPSelector,
  setShowIPSelector,
  isLoadingIPs,
  onIPSelect,
  hostIP,
  hostIPReceived,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [showTechnical, setShowTechnical] =
    useState(false);

  const map =
    room?.gameOptions?.map ?? "Predeterminado";
  const maxPlayers =
    room?.gameOptions?.maxplayers ??
    room?.gameOptions?.maxPlayers ??
    room?.maxPlayers ??
    "—";

  const connectionLabel =
    relayStatus === "ok"
      ? relayStep?.toLowerCase().includes("relay")
        ? "Relay activo"
        : "P2P / WebRTC"
      : relayStatus === "error"
        ? "Error de conexión"
        : "Conectando...";

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#111821]">
      <button
        onClick={() => setIsOpen((value) => !value)}
        type="button"
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-zinc-900/40"
      >
        <span className="text-sm font-semibold uppercase tracking-[0.12em] text-zinc-300">
          Configuración avanzada
        </span>

        <ChevronDown
          size={18}
          className={`text-zinc-500 transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {!isOpen && (
        <div className="border-t border-zinc-800">
          <SummaryRow
            icon={Settings2}
            label="Ajustes de partida"
            value={`Mapa: ${map} · Máx. jugadores: ${maxPlayers}`}
          />
          <SummaryRow
            icon={FolderOpen}
            label="Ruta del juego"
            value={gamePath || "No configurada"}
          />
          <SummaryRow
            icon={Link2}
            label="Detalles de conexión"
            value={connectionLabel}
          />
        </div>
      )}

      {isOpen && (
        <div className="space-y-4 border-t border-zinc-800 p-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Gamepad2 size={16} />
              Ajustes de partida
            </div>
            <MatchInfoPanel
              gameId={room?.gameId}
              gameOptions={room?.gameOptions}
              isHost={isHost}
            />
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <FolderOpen size={16} />
              Instalación
            </div>
            <GamePathPanel
              game={room?.game}
              gamePath={gamePath}
              onBrowse={onBrowseGame}
            />
          </div>

          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-300">
              <Network size={16} />
              Red
            </div>

            <IPSelector
              isHost={isHost}
              selectedIP={selectedIP}
              availableIPs={availableIPs}
              showIPSelector={showIPSelector}
              setShowIPSelector={setShowIPSelector}
              isLoadingIPs={isLoadingIPs}
              onIPSelect={onIPSelect}
            />

            {!isHost && (
              <div className="rounded-xl border border-zinc-800 bg-[#0b1118] px-4 py-3 text-xs text-zinc-400">
                Host IP: {hostIPReceived ? hostIP : "Esperando..."}
              </div>
            )}
          </div>

          <button
            onClick={() =>
              setShowTechnical((value) => !value)
            }
            type="button"
            className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-[#0b1118] px-4 py-3 text-sm text-zinc-300 transition hover:border-zinc-700"
          >
            Mostrar detalles técnicos
            <ChevronDown
              size={16}
              className={`transition ${
                showTechnical ? "rotate-180" : ""
              }`}
            />
          </button>

          {showTechnical && (
            <RelayStatus
              relayStatus={relayStatus}
              relayStep={relayStep}
            />
          )}
        </div>
      )}
    </section>
  );
}

export default AdvancedRoomSettings;
