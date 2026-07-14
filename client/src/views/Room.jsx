import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import socket from "../socket";

import { Play } from "lucide-react";

import RoomChat from "../components/room/RoomChat";
import PlayersList from "../components/room/PlayersList";
import RoomHeader from "../components/room/RoomHeader";
import RelayStatus from "../components/room/RelayStatus";
import IPSelector from "../components/room/IPSelector";
import GamePathPanel from "../components/room/GamePathPanel";
import MatchInfoPanel from "../components/room/match-info/MatchInfoPanel";

import useRoomSocket from "../hooks/useRoomSocket";
import useRoomRelay from "../hooks/useRoomRelay";
import useGamePath from "../hooks/useGamePath";

function Room({ room, leaveRoom }) {
  const [editingName, setEditingName] =
    useState(false);

  const [newRoomName, setNewRoomName] =
    useState("");

  const [availableIPs, setAvailableIPs] =
    useState([]);

  const [selectedIP, setSelectedIP] =
    useState(null);

  const [
    showIPSelector,
    setShowIPSelector,
  ] = useState(false);

  const [
    isLoadingIPs,
    setIsLoadingIPs,
  ] = useState(false);

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

  const currentUser = JSON.parse(
    localStorage.getItem("user") || "{}"
  );

  const isHostRef = useRef(
    room?.host === socket.id
  );

  const isHost = isHostRef.current;

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

  const isReady = readyPlayers.includes(
    socket.id
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    const loadIPs = async () => {
      if (!isHost) {
        return;
      }

      setIsLoadingIPs(true);

      try {
        const ips =
          await window.retroLink?.getLocalIPs();

        if (ips && ips.length > 0) {
          setAvailableIPs(ips);

          const preferred =
            ips.find(
              (ip) =>
                ip.address.startsWith("26.") ||
                ip.address.startsWith("10.") ||
                ip.address.startsWith(
                  "192.168."
                )
            ) || ips[0];

          setSelectedIP(
            preferred.address
          );

          await window.retroLink?.setHostIP(
            preferred.address
          );
        }
      } catch (error) {
        console.error(
          "[Room] Error loading IPs:",
          error
        );
      } finally {
        setIsLoadingIPs(false);
      }
    };

    loadIPs();
  }, [isHost]);

  const handleIPSelect = async (ip) => {
    setSelectedIP(ip);
    setShowIPSelector(false);

    await window.retroLink?.setHostIP(ip);
  };

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
    <div className="flex h-full items-center justify-center bg-[#0b0f14] p-4 text-white md:p-8">
      <div className="flex h-full max-h-[95vh] w-full max-w-5xl flex-col gap-6 overflow-hidden lg:flex-row">
        <div className="flex-1 overflow-y-auto rounded-3xl border border-zinc-800 bg-[#121821] p-4 md:p-8">
          <RoomHeader
            room={currentRoom}
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
            isLoadingIPs={isLoadingIPs}
            onIPSelect={handleIPSelect}
          />

          {!isHost && (
            <div
              className={`mb-2 inline-block rounded-full px-3 py-1 text-xs ${
                hostIPReceived
                  ? "bg-green-500/10 text-green-400"
                  : "bg-yellow-500/10 text-yellow-400"
              }`}
            >
              {hostIPReceived
                ? `✓ Host IP: ${hostIP}`
                : "⏳ Obteniendo IP del host..."}
            </div>
          )}

          <RelayStatus
            relayStatus={relayStatus}
            relayStep={relayStep}
          />

          <PlayersList
            members={
              currentRoom?.members || []
            }
            hostId={currentRoom?.host}
            readyPlayers={readyPlayers}
          />

          <MatchInfoPanel
            gameId={currentRoom?.gameId}
            gameOptions={
              currentRoom?.gameOptions
            }
          />

          <GamePathPanel
            game={currentRoom?.game}
            gamePath={gamePath}
            onBrowse={handleBrowseGame}
          />

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={toggleReady}
              className={`flex-1 rounded-2xl py-3 font-semibold transition ${
                isReady
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }`}
              type="button"
            >
              {isReady
                ? "Ready ✓"
                : "Ready Up"}
            </button>

            {isHost && (
              <button
                onClick={startMatch}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3 font-semibold transition hover:bg-indigo-700"
                type="button"
              >
                <Play size={18} />
                Start Match
              </button>
            )}
          </div>
        </div>

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
          sendMessage={handleSendMessage}
          insertEmote={insertEmote}
          chatEndRef={chatEndRef}
        />
      </div>
    </div>
  );
}

export default Room;