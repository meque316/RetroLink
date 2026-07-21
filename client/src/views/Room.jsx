import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  Gamepad2,
  Radio,
  Settings2,
  Users,
} from "lucide-react";

import socket from "../socket";

import SectionCard from "../components/common/SectionCard";

import RoomChat from "../components/room/RoomChat";
import PlayersList from "../components/room/PlayersList";
import RoomHeader from "../components/room/RoomHeader";
import RelayStatus from "../components/room/RelayStatus";
import IPSelector from "../components/room/IPSelector";
import GamePathPanel from "../components/room/GamePathPanel";
import RoomActions from "../components/room/RoomActions";
import SessionOverview from "../components/room/SessionOverview";

import MatchInfoPanel from "../components/room/match-info/MatchInfoPanel";

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

function Room({
  room,
  leaveRoom,
}) {
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

  const [
    emoteCategory,
    setEmoteCategory,
  ] = useState(0);

  const chatEndRef = useRef(null);

  const currentUser = getStoredUser();

  /*
   * Se mantiene basado en la sala recibida por props
   * para no cambiar el contrato actual de los hooks.
   */
  const isHost =
    room?.host === socket.id;

  const {
    gamePath,
    handleBrowseGame,
  } = useGamePath(room);

  const {
    relayStatus,
    relayStep,
    hostIP,
    hostIPReceived,
  } = useRoomRelay({
    room,
    isHost,
  });

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

  const activeRoom =
    currentRoom ?? room;

  const members =
    activeRoom?.members ?? [];

  const readyCount =
    readyPlayers.length;

  const isReady =
    readyPlayers.includes(socket.id);

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
      (previousValue) =>
        previousValue + emote
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#080c11] text-white">
      <div className="mx-auto flex min-h-full w-full max-w-[1500px] flex-col gap-4 p-4 md:p-6 xl:p-8">
        <div className="rounded-2xl border border-zinc-800 bg-[#111821] px-4 py-4 shadow-2xl shadow-black/20 md:px-6 md:py-5">
          <RoomHeader
            room={activeRoom}
            isHost={isHost}
            editingName={editingName}
            setEditingName={setEditingName}
            newRoomName={newRoomName}
            setNewRoomName={setNewRoomName}
            saveRoomName={
              handleSaveRoomName
            }
            onLeave={handleLeave}
          />
        </div>

        <SessionOverview
          room={activeRoom}
          readyPlayers={readyPlayers}
        />

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="grid min-w-0 auto-rows-min grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard
              title="Match"
              description="Configuración de la partida"
              icon={Gamepad2}
              className="lg:col-span-2"
            >
              <MatchInfoPanel
                gameId={activeRoom?.gameId}
                gameOptions={
                  activeRoom?.gameOptions
                }
              />
            </SectionCard>

            <SectionCard
              title={`Players (${members.length})`}
              description={`${readyCount} jugador${
                readyCount === 1
                  ? ""
                  : "es"
              } listo${
                readyCount === 1
                  ? ""
                  : "s"
              }`}
              icon={Users}
            >
              <PlayersList
                members={members}
                hostId={activeRoom?.host}
                readyPlayers={readyPlayers}
              />
            </SectionCard>

            <SectionCard
              title="Connection"
              description="Estado de la red y del bridge"
              icon={Radio}
            >
              <div className="space-y-4">
                <IPSelector
                  isHost={isHost}
                  selectedIP={selectedIP}
                  availableIPs={availableIPs}
                  showIPSelector={
                    showIPSelector
                  }
                  setShowIPSelector={
                    setShowIPSelector
                  }
                  isLoadingIPs={
                    isLoadingIPs
                  }
                  onIPSelect={
                    handleIPSelect
                  }
                />

                {!isHost && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      hostIPReceived
                        ? "border-green-500/20 bg-green-500/10 text-green-400"
                        : "border-yellow-500/20 bg-yellow-500/10 text-yellow-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider">
                        Host IP
                      </span>

                      <span className="font-mono text-xs">
                        {hostIPReceived
                          ? hostIP
                          : "Waiting..."}
                      </span>
                    </div>
                  </div>
                )}

                <RelayStatus
                  relayStatus={relayStatus}
                  relayStep={relayStep}
                />
              </div>
            </SectionCard>

            <SectionCard
              title="Game Installation"
              description="Ejecutable utilizado para iniciar el juego"
              icon={Settings2}
              className="lg:col-span-2"
            >
              <GamePathPanel
                game={activeRoom?.game}
                gamePath={gamePath}
                onBrowse={
                  handleBrowseGame
                }
              />
            </SectionCard>

            <div className="lg:col-span-2">
              <RoomActions
                isReady={isReady}
                isHost={isHost}
                onToggleReady={toggleReady}
                onStartMatch={startMatch}
              />
            </div>
          </main>

          <aside className="min-h-[420px] xl:min-h-0">
            <RoomChat
              messages={messages}
              currentUser={currentUser}
              chatInput={chatInput}
              setChatInput={setChatInput}
              showEmotes={showEmotes}
              setShowEmotes={setShowEmotes}
              emoteCategory={emoteCategory}
              setEmoteCategory={
                setEmoteCategory
              }
              sendMessage={
                handleSendMessage
              }
              insertEmote={insertEmote}
              chatEndRef={chatEndRef}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}

export default Room;