import React, { useEffect, useState, useRef } from "react";
import socket from "../socket";

import { Play } from "lucide-react";

import RoomChat from "../components/room/RoomChat";
import PlayersList from "../components/room/PlayersList";
import RoomHeader from "../components/room/RoomHeader";
import RelayStatus from "../components/room/RelayStatus";
import IPSelector from "../components/room/IPSelector";
import GamePathPanel from "../components/room/GamePathPanel";

import useRoomSocket from "../hooks/useRoomSocket";
import useRoomRelay from "../hooks/useRoomRelay";
import useGamePath from "../hooks/useGamePath";

function Room({ room, leaveRoom }) {
  const [editingName, setEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  const [availableIPs, setAvailableIPs] = useState([]);
  const [selectedIP, setSelectedIP] = useState(null);
  const [showIPSelector, setShowIPSelector] = useState(false);
  const [isLoadingIPs, setIsLoadingIPs] = useState(false);

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);
  const [emoteCategory, setEmoteCategory] = useState(0);

  const chatEndRef = useRef(null);
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const isHostRef = useRef(room?.host === socket.id);
  const isHost = isHostRef.current;

  const { gamePath, handleBrowseGame } = useGamePath(room);

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

  const isReady = readyPlayers.includes(socket.id);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loadIPs = async () => {
      if (!isHost) return;

      setIsLoadingIPs(true);

      try {
        const ips = await window.retroLink?.getLocalIPs();

        if (ips && ips.length > 0) {
          setAvailableIPs(ips);

          const preferred =
            ips.find(
              (ip) =>
                ip.address.startsWith("26.") ||
                ip.address.startsWith("10.") ||
                ip.address.startsWith("192.168.")
            ) || ips[0];

          setSelectedIP(preferred.address);
          await window.retroLink?.setHostIP(preferred.address);
        }
      } catch (error) {
        console.error("[Room] Error loading IPs:", error);
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
    saveRoomName(newRoomName, setEditingName, setNewRoomName);
  };

  const handleSendMessage = () => {
    sendMessage(chatInput, setChatInput, setShowEmotes);
  };

  const insertEmote = (emote) => {
    setChatInput((prev) => prev + emote);
  };

  return (
    <div className="h-full bg-[#0b0f14] text-white flex items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-5xl flex flex-col lg:flex-row gap-6 h-full max-h-[95vh] overflow-hidden">
        <div className="flex-1 bg-[#121821] rounded-3xl border border-zinc-800 p-4 md:p-8 overflow-y-auto">
          <RoomHeader
            room={currentRoom}
            isHost={isHost}
            editingName={editingName}
            setEditingName={setEditingName}
            newRoomName={newRoomName}
            setNewRoomName={setNewRoomName}
            saveRoomName={handleSaveRoomName}
            onLeave={handleLeave}
          />

          <IPSelector
            isHost={isHost}
            selectedIP={selectedIP}
            availableIPs={availableIPs}
            showIPSelector={showIPSelector}
            setShowIPSelector={setShowIPSelector}
            isLoadingIPs={isLoadingIPs}
            onIPSelect={handleIPSelect}
          />

          {!isHost && (
            <div
              className={`text-xs px-3 py-1 rounded-full mb-2 inline-block ${
                hostIPReceived
                  ? "text-green-400 bg-green-500/10"
                  : "text-yellow-400 bg-yellow-500/10"
              }`}
            >
              {hostIPReceived
                ? `✓ Host IP: ${hostIP}`
                : "⏳ Obteniendo IP del host..."}
            </div>
          )}

          <RelayStatus relayStatus={relayStatus} relayStep={relayStep} />

          <PlayersList
            members={currentRoom?.members || []}
            hostId={currentRoom?.host}
            readyPlayers={readyPlayers}
          />

          {currentRoom?.gameOptions && currentRoom?.gameId === "cs16" && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-4 text-sm text-zinc-300">
              <p className="text-green-400 font-semibold mb-2">
                CS 1.6 Match Options
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <p>
                  Map:{" "}
                  <span className="text-white">
                    {currentRoom.gameOptions.map}
                  </span>
                </p>

                <p>
                  Max players:{" "}
                  <span className="text-white">
                    {currentRoom.gameOptions.maxPlayers}
                  </span>
                </p>

                <p>
                  Time limit:{" "}
                  <span className="text-white">
                    {currentRoom.gameOptions.timeLimit} min
                  </span>
                </p>

                <p>
                  Friendly fire:{" "}
                  <span className="text-white">
                    {currentRoom.gameOptions.friendlyFire ? "On" : "Off"}
                  </span>
                </p>
              </div>
            </div>
          )}

          <GamePathPanel
            game={currentRoom?.game}
            gamePath={gamePath}
            onBrowse={handleBrowseGame}
          />

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={toggleReady}
              className={`flex-1 py-3 rounded-2xl font-semibold transition ${
                isReady
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-zinc-800 hover:bg-zinc-700"
              }`}
              type="button"
            >
              {isReady ? "Ready ✓" : "Ready Up"}
            </button>

            {isHost && (
              <button
                onClick={startMatch}
                className="flex items-center justify-center gap-2 flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-semibold transition"
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
          setEmoteCategory={setEmoteCategory}
          sendMessage={handleSendMessage}
          insertEmote={insertEmote}
          chatEndRef={chatEndRef}
        />
      </div>
    </div>
  );
}

export default Room;