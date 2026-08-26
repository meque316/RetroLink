// client/src/components/room/Room.jsx

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Info,
  LogOut,
  Users,
} from "lucide-react";

import socket from "../socket";

import RoomChat from "../components/room/RoomChat";
import PlayersList from "../components/room/PlayersList";
import RoomHeader from "../components/room/RoomHeader";
import RoomActions from "../components/room/RoomActions";
import SessionOverview from "../components/room/SessionOverview";
import AdvancedRoomSettings from "../components/room/AdvancedRoomSettings";
import ConnectionInfo from "../components/room/ConnectionInfo";

import useRoomSocket from "../hooks/useRoomSocket";
import useRoomRelay from "../hooks/useRoomRelay";
import useGamePath from "../hooks/useGamePath";
import useHostIPSelector from "../hooks/useHostIPSelector";

function getStoredUser() {
  try {
    return JSON.parse(
      localStorage.getItem("user") || "{}"
    );
  } catch (error) {
    console.error(
      "[Room] Invalid stored user:",
      error
    );

    return {};
  }
}

function Room({ room, leaveRoom }) {
  const [editingName, setEditingName] =
    useState(false);
  const [newRoomName, setNewRoomName] =
    useState("");
  const [messages, setMessages] =
    useState([]);
  const [chatInput, setChatInput] =
    useState("");
  const [showEmotes, setShowEmotes] =
    useState(false);
  const [emoteCategory, setEmoteCategory] =
    useState(0);

  const [clientPort, setClientPort] = useState(null);

  const chatEndRef = useRef(null);
  const currentUser = getStoredUser();
  const isHost = room?.host === socket.id;

  const {
    gamePath,
    handleBrowseGame,
  } = useGamePath(room);

  const {
    relayStatus,
    relayStep,
    hostIP,
    hostIPReceived,
  } = useRoomRelay({ room, isHost });

  const {
    currentRoom,
    readyPlayers,
    toggleReady,
    startMatch,
    sendMessage,
    saveRoomName,
    handleLeave,
  } = useRoomSocket({
    room,
    leaveRoom,
    gamePath,
    isHost,
    hostIP,
    currentUser,
    setMessages,
  });

  const {
    availableIPs,
    selectedIP,
    showIPSelector,
    setShowIPSelector,
    isLoadingIPs,
    handleIPSelect,
  } = useHostIPSelector(isHost);

  // ===== NUEVO: Obtener puerto por defecto según el juego =====
  const getDefaultPort = (gameId) => {
    const ports = {
      dow_soulstorm: 6112,
      aom: 2300,
      swgb: 2300,
      quake3: 27960,
      cs16: 27015,
      ut99: 7777,
      carmageddon2: 2300,
    };
    return ports[gameId] || 6112;
  };
  // ===== FIN NUEVO =====

  // ===== ACTIVE ROOM - DEFINIR ANTES DE USARLO =====
  const activeRoom = currentRoom ?? room;
  const members = activeRoom?.members ?? [];
  const playerCount = members.length;
  const readyCount = readyPlayers.length;
  const isReady = readyPlayers.includes(socket.id);

  const isGameConfigured = Boolean(gamePath);
  const isConnectionReady = relayStatus === "ok";
  const everyoneReady =
    playerCount > 0 && readyCount >= playerCount;

  const canStartMatch =
    isHost &&
    isGameConfigured &&
    isConnectionReady &&
    everyoneReady;

  // ===== MODIFICADO: Obtener y escuchar el puerto del cliente con gameId =====
  // AHORA activeRoom YA ESTÁ DEFINIDO
  useEffect(() => {
    const getPort = async () => {
      try {
        const gameId = activeRoom?.gameId || activeRoom?.game;
        const port = await window.retroLink?.getClientPort?.(gameId);
        if (port) {
          setClientPort(port);
          console.log('[Room] Puerto del cliente:', port);
        }
      } catch (error) {
        console.error('[Room] Error obteniendo puerto:', error);
      }
    };

    getPort();

    const handlePortUpdate = (event) => {
      console.log('[Room] Evento de puerto recibido:', event.detail);
      setClientPort(event.detail);
    };

    window.addEventListener('client-port-update', handlePortUpdate);

    return () => {
      window.removeEventListener('client-port-update', handlePortUpdate);
    };
  }, [activeRoom?.gameId, activeRoom?.game]); // <-- Dependencias primitivas, evita loop por referencia de objeto
  // ===== FIN MODIFICADO =====

  // ===== NUEVO: Función Test Game =====
  const handleTestGame = async () => {
    try {
      console.log('[Room] 🧪 Iniciando Test Game...');

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          username: 'Sistema',
          message: '🧪 Iniciando modo Test Game...',
          isSystem: true,
        },
      ]);

      const result = await window.retroLink?.testGame?.(activeRoom?.id);

      if (result?.success) {
        console.log('[Room] ✅ Test Game iniciado correctamente');
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            username: 'Sistema',
            message: `✅ Test Game: ${result.message || 'Cliente simulado conectado'}`,
            isSystem: true,
          },
        ]);
      } else {
        console.error('[Room] ❌ Error en Test Game:', result?.error);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            username: 'Sistema',
            message: `❌ Error en Test Game: ${result?.error || 'Error desconocido'}`,
            isSystem: true,
          },
        ]);
      }
    } catch (error) {
      console.error('[Room] Error en Test Game:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          username: 'Sistema',
          message: `❌ Error en Test Game: ${error.message}`,
          isSystem: true,
        },
      ]);
    }
  };
  // ===== FIN NUEVO =====

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  const handleSaveRoomName = () => {
    saveRoomName(
      newRoomName,
      setEditingName,
      setNewRoomName
    );
  };

  const handleSendMessage = () => {
    sendMessage(
      chatInput,
      setChatInput,
      setShowEmotes
    );
  };

  const insertEmote = (emote) => {
    setChatInput(
      (previousValue) => previousValue + emote
    );
  };

  const defaultPort = getDefaultPort(activeRoom?.gameId || activeRoom?.game);

  return (
    <div className="h-full overflow-y-auto bg-[#080c11] text-white">
      <div className="mx-auto flex min-h-full w-full max-w-[1540px] flex-col gap-4 p-4 md:p-6 xl:p-8">
        <RoomHeader
          room={activeRoom}
          isHost={isHost}
          editingName={editingName}
          setEditingName={setEditingName}
          newRoomName={newRoomName}
          setNewRoomName={setNewRoomName}
          saveRoomName={handleSaveRoomName}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="flex min-w-0 flex-col gap-4">
            <SessionOverview
              room={activeRoom}
              readyPlayers={readyPlayers}
              connectionReady={isConnectionReady}
              gameConfigured={isGameConfigured}
            />

            {/* ===== MODIFICADO: Pasar hostIP a ConnectionInfo ===== */}
            <ConnectionInfo
              gameId={activeRoom?.gameId || activeRoom?.game}
              clientPort={clientPort || defaultPort}
              hostIP={isHost ? '127.0.0.1' : hostIPReceived}
            />
            {/* ===== FIN MODIFICADO ===== */}

            <section
              className={`rounded-2xl border px-5 py-4 ${
                canStartMatch
                  ? "border-green-500/30 bg-green-500/10"
                  : "border-zinc-800 bg-[#111821]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    canStartMatch
                      ? "bg-green-500/15 text-green-400"
                      : "bg-zinc-900 text-zinc-500"
                  }`}
                >
                  <Users size={19} />
                </div>

                <div>
                  <p
                    className={`font-semibold ${
                      canStartMatch
                        ? "text-green-300"
                        : "text-zinc-200"
                    }`}
                  >
                    {canStartMatch
                      ? "Todos los jugadores están conectados y listos."
                      : "Preparando la sesión multijugador"}
                  </p>

                  <p className="mt-1 text-sm text-zinc-400">
                    {canStartMatch
                      ? "El host puede iniciar la partida cuando quiera."
                      : "RetroLink habilitará el inicio cuando se complete la preparación."}
                  </p>
                </div>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-[#111821]">
              <header className="border-b border-zinc-800 px-5 py-4">
                <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-300">
                  Jugadores ({playerCount})
                </h2>
              </header>

              <div className="p-3 md:p-4">
                <PlayersList
                  members={members}
                  hostId={activeRoom?.host}
                  readyPlayers={readyPlayers}
                  connectionReady={isConnectionReady}
                  gameConfigured={isGameConfigured}
                  currentUser={currentUser}
                  currentUserId={socket.id}
                />
              </div>
            </section>

            <RoomActions
              isReady={isReady}
              isHost={isHost}
              canStartMatch={canStartMatch}
              everyoneReady={everyoneReady}
              connectionReady={isConnectionReady}
              gameConfigured={isGameConfigured}
              onToggleReady={toggleReady}
              onStartMatch={startMatch}
              onTestGame={handleTestGame}
            />
          </main>

          <aside className="flex min-h-[520px] flex-col gap-4 xl:min-h-0">
            <div className="min-h-[360px] flex-1">
              <RoomChat
                messages={messages}
                currentUser={currentUser}
                chatInput={chatInput}
                setChatInput={setChatInput}
                showEmotes={showEmotes}
                setShowEmotes={setShowEmotes}
                emoteCategory={emoteCategory}
                setEmoteCategory={setEmoteCategory}
                sendMessage={handleSendMessage}
                insertEmote={insertEmote}
                chatEndRef={chatEndRef}
              />
            </div>

            <AdvancedRoomSettings
              room={activeRoom}
              gamePath={gamePath}
              onBrowseGame={handleBrowseGame}
              relayStatus={relayStatus}
              relayStep={relayStep}
              isHost={isHost}
              selectedIP={selectedIP}
              availableIPs={availableIPs}
              showIPSelector={showIPSelector}
              setShowIPSelector={setShowIPSelector}
              isLoadingIPs={isLoadingIPs}
              onIPSelect={handleIPSelect}
              hostIP={hostIP}
              hostIPReceived={hostIPReceived}
            />
          </aside>
        </div>

        <footer className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#111821] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-zinc-400">
            <Info
              size={18}
              className="mt-0.5 shrink-0 text-sky-400"
            />
            <span>
              Asegúrate de que todos tengan el juego correctamente configurado.
            </span>
          </div>

          <button
            onClick={handleLeave}
            type="button"
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-500/40 px-5 text-sm font-semibold text-red-400 transition hover:bg-red-500/10"
          >
            <LogOut size={17} />
            Abandonar sala
          </button>
        </footer>
      </div>
    </div>
  );
}

export default Room;