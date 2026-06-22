import React, { useEffect, useState, useRef } from "react";
import socket from "../socket";
import {
  Crown,
  Play,
  LogOut,
  Radio,
  Pencil,
  Check,
  X,
  Send,
  Smile,
} from "lucide-react";

const EMOTES = [
  { category: "Gestos", emotes: ["👋","👍","👎","👏","🤝","✌️","🤙","💪","🫡","🙏"] },
  { category: "Caras", emotes: ["😀","😂","😎","😤","😡","😱","🤯","😴","🤔","😏"] },
  { category: "Juegos", emotes: ["🎮","🕹️","🏆","⚔️","🛡️","💣","🔫","🎯","👾","🤖"] },
  { category: "Fuego", emotes: ["🔥","💥","⚡","❄️","☠️","💀","🩸","👻","🌪️","💫"] },
  { category: "Misc", emotes: ["✅","❌","⏳","🚀","💯","🐐","🫠","💤","🎉","👀"] },
];

function Room({ room, leaveRoom }) {
  const [currentRoom, setCurrentRoom] = useState(room);
  const [readyPlayers, setReadyPlayers] = useState([]);

  const getGamePathFromLibrary = () => {
    try {
      const library = JSON.parse(localStorage.getItem("retrolink_library") || "[]");
      const saved = library.find((g) => g.name === room.game);
      return saved?.exePath || "";
    } catch {
      return "";
    }
  };

  const [gamePath, setGamePath] = useState(getGamePathFromLibrary);
  const [relayStatus, setRelayStatus] = useState(null);
  // null = conectando, "signaling" = signaling OK, "ok" = DataChannel abierto, "error" = falló
  const [relayStep, setRelayStep] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  /*
  CHAT STATE
  */
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [showEmotes, setShowEmotes] = useState(false);
  const [emoteCategory, setEmoteCategory] = useState(0);
  const chatEndRef = useRef(null);
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  // CRÍTICO: isHost se fija UNA SOLA VEZ al montar el componente, usando el
  // socket.id actual y el room.host original. NO debe depender de currentRoom,
  // porque currentRoom cambia con cada "rooms-list" recibido (toggle-ready, etc.)
  // y eso causaría que el useEffect de START RELAY se reinicie, matando el
  // bridge WebRTC en medio de la negociación P2P.
  const isHostRef = useRef(room?.host === socket.id);
  const isHost = isHostRef.current;

  const isReady = readyPlayers.includes(socket.id);

  /*
  AUTO SCROLL CHAT
  */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /*
  START RELAY
  */
  useEffect(() => {
    const startRelay = async () => {
      setRelayStatus(null);
      setRelayStep("Iniciando conexión...");
      const result = await window.retroLink?.startRelay(room.id, isHost);
      if (!result?.success) {
        setRelayStatus("error");
        setRelayStep("No se pudo iniciar el bridge");
      }
    };

    startRelay();

    // Escuchar mensajes de estado legibles desde main.js
    window.retroLink?.onBridgeStatus?.((message) => {
      console.log("[Room] Bridge status:", message);
      setRelayStep(message);

      if (message.includes("Conexión establecida")) {
        setRelayStatus("ok");
      } else if (message.includes("cerrada") || message.includes("detenido")) {
        // No marcar error si simplemente se detuvo al desmontar
      }
    });

    return () => {
      window.retroLink?.stopRelay();
      window.retroLink?.offBridgeStatus?.();
    };
  }, [room.id, isHost]);

  /*
  SOCKET EVENTS
  */
  useEffect(() => {
    socket.emit("get-rooms");

    const handleRoomsList = (rooms) => {
      const updatedRoom = rooms.find((r) => r.id === room.id);
      if (!updatedRoom) { leaveRoom(); return; }
      setCurrentRoom(updatedRoom);
    };

    const handleReadyState = (playersReady) => setReadyPlayers(playersReady);

    const handleMatchStarted = async (data) => {
      if (!gamePath) { console.warn("No game path selected"); return; }

      if (isHost) {
        // Host lanza Quake 3 normal — crea la partida desde el menú del juego
        // El bridge escucha en 27962 y reenvía los paquetes a Quake 3 en 27960
        await window.retroLink?.launchGame(gamePath, null, room.id, true, []);
      } else {
        // Cliente conecta al bridge local en 27960
        // El bridge recibe y reenvía via WebRTC al host
        await window.retroLink?.launchGame(gamePath, "127.0.0.1:27960", room.id, false, []);
      }
    };

    const handleMatchError = (error) => alert(error.message);

    const handleChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    window.retroLink?.onHostGameClosed(async ({ roomId: closedRoomId }) => {
      if (closedRoomId !== room.id) return;
      await window.retroLink?.killGame();
      socket.emit("toggle-ready", room.id);
    });

    socket.on("rooms-list", handleRoomsList);
    socket.on("room-ready-state", handleReadyState);
    socket.on("match-started", handleMatchStarted);
    socket.on("match-error", handleMatchError);
    socket.on("room-chat", handleChatMessage);

    return () => {
      socket.off("rooms-list", handleRoomsList);
      socket.off("room-ready-state", handleReadyState);
      socket.off("match-started", handleMatchStarted);
      socket.off("match-error", handleMatchError);
      socket.off("room-chat", handleChatMessage);
      window.retroLink?.offHostGameClosed();
    };
  }, [room.id, leaveRoom, gamePath, isHost]);

  const handleBrowseGame = async () => {
    try {
      const selectedPath = await window.retroLink?.selectGameExe();
      if (selectedPath) setGamePath(selectedPath);
    } catch (error) {
      console.error("Error selecting exe:", error);
    }
  };

  const saveRoomName = () => {
    const name = newRoomName.trim();
    if (!name) { setEditingName(false); return; }
    socket.emit("rename-room", { roomId: room.id, name });
    setEditingName(false);
    setNewRoomName("");
  };

  const handleLeave = () => {
    socket.emit("leave-room", room.id);
    leaveRoom();
  };

  const toggleReady = () => socket.emit("toggle-ready", room.id);
  const startMatch = () => socket.emit("start-match", room.id);

  const sendMessage = () => {
    const text = chatInput.trim();
    if (!text) return;

    socket.emit("room-chat", {
      roomId: room.id,
      message: text,
      username: currentUser.username,
    });

    setChatInput("");
    setShowEmotes(false);
  };

  const insertEmote = (emote) => {
    setChatInput((prev) => prev + emote);
  };

  /*
  RELAY STATUS BANNER
  */
  const renderRelayStatus = () => {
    if (relayStatus === null) {
      return (
        <div className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 mb-4 text-sm text-zinc-400">
          <Radio size={15} className="animate-pulse" />
          <span>{relayStep || "Connecting to relay..."}</span>
        </div>
      );
    }
    if (relayStatus === "ok") {
      return (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-green-400">
          <Radio size={15} />
          P2P connected — ready to play
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
        <div className="flex items-center gap-3">
          <Radio size={15} />
          Connection failed
        </div>
        {relayStep && <p className="text-xs text-red-300 pl-6">{relayStep}</p>}
      </div>
    );
  };

  return (
    <div className="h-full bg-[#0b0f14] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-5xl flex gap-6">

        {/* LEFT — sala principal */}
        <div className="flex-1 bg-[#121821] rounded-3xl border border-zinc-800 p-8">

          {/* HEADER */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <div className="flex items-center gap-3">
                {editingName ? (
                  <>
                    <input
                      autoFocus
                      value={newRoomName}
                      onChange={(e) => setNewRoomName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") saveRoomName(); if (e.key === "Escape") setEditingName(false); }}
                      className="text-2xl font-bold bg-zinc-800 px-3 py-1 rounded-xl focus:outline-none focus:ring-1 focus:ring-green-500 text-white w-64"
                    />
                    <button onClick={saveRoomName} className="text-green-400 hover:text-green-300 transition">
                      <Check size={18} />
                    </button>
                    <button onClick={() => setEditingName(false)} className="text-zinc-500 hover:text-white transition">
                      <X size={18} />
                    </button>
                  </>
                ) : (
                  <>
                    <h1 className="text-3xl font-bold">{currentRoom?.name}</h1>
                    {isHost && (
                      <button
                        onClick={() => { setNewRoomName(currentRoom?.name); setEditingName(true); }}
                        className="text-zinc-500 hover:text-white transition mt-1"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </>
                )}
              </div>

              <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400">
                {currentRoom?.game}
              </span>

              <p className="text-zinc-400 mt-2">Waiting for players...</p>
            </div>

            <button
              onClick={handleLeave}
              className="flex items-center gap-2 bg-zinc-800 hover:bg-red-500 px-4 py-2 rounded-xl transition"
            >
              <LogOut size={16} />
              Leave
            </button>
          </div>

          {renderRelayStatus()}

          {/* PLAYERS LIST */}
          <div className="space-y-4 mb-8">
            {currentRoom?.members?.map((member, index) => {
              const memberId = member.id ?? member;
              const ready = readyPlayers.includes(memberId);
              const host = memberId === currentRoom.host;

              return (
                <div
                  key={memberId}
                  className="bg-[#0d1117] rounded-2xl px-5 py-4 flex justify-between items-center"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 font-bold text-sm">
                      {member.username?.charAt(0)?.toUpperCase() ?? index + 1}
                    </div>
                    <span className="font-medium">{member.username ?? `Player ${index + 1}`}</span>
                    {host && <Crown size={15} className="text-yellow-400" />}
                  </div>
                  <span className={`text-sm font-medium ${ready ? "text-green-400" : "text-zinc-500"}`}>
                    {ready ? "Ready ✓" : "Not Ready"}
                  </span>
                </div>
              );
            })}
          </div>

          {/* GAME PATH */}
          <div className="bg-[#0d1117] rounded-2xl p-5 mb-8 border border-zinc-800">
            <h2 className="text-lg font-semibold mb-2">{currentRoom?.game}</h2>
            <p className="text-sm text-zinc-400 mb-3">Executable Path</p>

            {gamePath ? (
              <>
                <p className="text-green-400 text-sm break-all mb-2">{gamePath}</p>
                <p className="text-xs text-green-500">✓ Ready to launch</p>
              </>
            ) : (
              <p className="text-yellow-400 text-sm mb-3">Executable not configured</p>
            )}

            <button
              onClick={handleBrowseGame}
              className="mt-4 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition"
            >
              Browse
            </button>
          </div>

          {/* ACTIONS */}
          <div className="flex gap-4">
            <button
              onClick={toggleReady}
              className={`flex-1 py-3 rounded-2xl font-semibold transition ${
                isReady ? "bg-green-500 hover:bg-green-600" : "bg-zinc-800 hover:bg-zinc-700"
              }`}
            >
              {isReady ? "Ready ✓" : "Ready Up"}
            </button>

            {isHost && (
              <button
                onClick={startMatch}
                className="flex items-center justify-center gap-2 flex-1 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-semibold transition"
              >
                <Play size={18} />
                Start Match
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — CHAT */}
        <div className="w-80 bg-[#121821] rounded-3xl border border-zinc-800 flex flex-col">

          <div className="p-5 border-b border-zinc-800">
            <h3 className="font-semibold">Room Chat</h3>
          </div>

          {/* MESSAGES */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center mt-4">No messages yet 👾</p>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.username === currentUser.username;
                return (
                  <div key={index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && (
                      <span className="text-xs text-zinc-500 mb-1 px-1">{msg.username}</span>
                    )}
                    <div className={`px-3 py-2 rounded-2xl text-sm max-w-[90%] break-words ${
                      isMe
                        ? "bg-green-500/20 text-green-100 rounded-br-sm"
                        : "bg-zinc-800 text-white rounded-bl-sm"
                    }`}>
                      {msg.message}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* EMOTE PICKER */}
          {showEmotes && (
            <div className="border-t border-zinc-800 bg-[#0d1117] p-3">
              {/* CATEGORY TABS */}
              <div className="flex gap-1 mb-2 overflow-x-auto">
                {EMOTES.map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => setEmoteCategory(i)}
                    className={`text-xs px-2 py-1 rounded-lg whitespace-nowrap transition ${
                      emoteCategory === i
                        ? "bg-green-500/20 text-green-400"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>

              {/* EMOTES GRID */}
              <div className="grid grid-cols-5 gap-1">
                {EMOTES[emoteCategory].emotes.map((emote, i) => (
                  <button
                    key={i}
                    onClick={() => insertEmote(emote)}
                    className="text-xl hover:bg-zinc-700 rounded-lg p-1 transition"
                  >
                    {emote}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* INPUT */}
          <div className="p-4 border-t border-zinc-800">
            <div className="flex gap-2 items-center">
              <button
                onClick={() => setShowEmotes(!showEmotes)}
                className={`p-2 rounded-xl transition ${
                  showEmotes ? "bg-green-500/20 text-green-400" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Smile size={18} />
              </button>

              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                placeholder="Message..."
                className="flex-1 bg-zinc-900 px-3 py-2 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
              />

              <button
                onClick={sendMessage}
                className="p-2 rounded-xl bg-green-500 hover:bg-green-400 text-black transition"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Room;
