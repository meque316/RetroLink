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
  AlertTriangle,
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
  const [relayStatus, setRelayStatus] = useState("Conectando al servidor de señales...");
  const [isP2PConnected, setIsP2PConnected] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
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

  const isHost = currentRoom?.host === socket.id;
  const isReady = readyPlayers.includes(socket.id);

  /*
  AUTO SCROLL CHAT
  */
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /*
  START RELAY & LISTEN TO ELECTRON IPC EVENTS
  */
  useEffect(() => {
    const startRelay = async () => {
      setErrorMessage(null);
      setIsP2PConnected(false);
      setRelayStatus("Iniciando puente local...");

      const result = await window.retroLink?.startRelay(room.id, isHost);
      if (!result?.success) {
        setRelayStatus("Error crítico");
        setErrorMessage(result?.error || "No se pudo inicializar la librería nativa de red.");
      }
    };

    startRelay();

    // Escuchar las actualizaciones detalladas desde main.js
    if (window.retroLink?.onBridgeStatusUpdate) {
      window.retroLink.onBridgeStatusUpdate((statusMsg) => {
        setRelayStatus(statusMsg);
        
        // Validar si la conexión llegó a su estado de éxito ideal
        if (statusMsg.includes("¡Conexión establecida!")) {
          setIsP2PConnected(true);
        } else {
          setIsP2PConnected(false);
        }
      });
    }

    return () => {
      window.retroLink?.stopRelay();
      if (window.retroLink?.offBridgeStatusUpdate) {
        window.retroLink.offBridgeStatusUpdate();
      }
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
      setErrorMessage(null);
      if (!gamePath) { 
        setErrorMessage("Cancelado: El ejecutable del juego no está configurado."); 
        return; 
      }

      try {
        if (isHost) {
          await window.retroLink?.launchGame(gamePath, null, room.id, true, []);
        } else {
          await window.retroLink?.launchGame(gamePath, "127.0.0.1:27961", room.id, false, []);
        }
      } catch (err) {
        setErrorMessage("Error al ejecutar el archivo binario del juego.");
      }
    };

    const handleMatchError = (error) => {
      setErrorMessage(error.message || "Error reportado por el servidor de emparejamiento.");
    };

    const handleChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    window.retroLink?.onHostGameClosed(async ({ roomId: closedRoomId }) => {
      if (closedRoomId !== room.id) return;
      await window.retroLink?.killGame();
      setErrorMessage("El anfitrión ha cerrado el juego o se ha desconectado.");
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
      if (selectedPath) {
        setGamePath(selectedPath);
        setErrorMessage(null);
        // Guardar automáticamente en la librería local para comodidad del usuario
        const library = JSON.parse(localStorage.getItem("retrolink_library") || "[]");
        const filtered = library.filter((g) => g.name !== room.game);
        filtered.push({ name: room.game, exePath: selectedPath });
        localStorage.setItem("retrolink_library", JSON.stringify(filtered));
      }
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

  const toggleReady = () => {
    if (!gamePath) {
      setErrorMessage("Debes configurar la ruta de tu juego antes de marcarte como Listo.");
      return;
    }
    setErrorMessage(null);
    socket.emit("toggle-ready", room.id);
  };
  
  const startMatch = () => {
    if (!isP2PConnected) {
      setErrorMessage("No puedes iniciar la partida hasta que el canal P2P esté enlazado con éxito.");
      return;
    }
    // Validar que todos en la sala estén en estado Ready
    const membersIds = currentRoom?.members?.map(m => m.id ?? m) || [];
    const allReady = membersIds.every(id => readyPlayers.includes(id));
    
    if (!allReady) {
      setErrorMessage("No se puede iniciar: Hay jugadores en la sala que no están listos.");
      return;
    }

    setErrorMessage(null);
    socket.emit("start-match", room.id);
  };

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
  DYNAMIC RELAY STATUS BANNER
  */
  const renderRelayStatus = () => {
    const isError = relayStatus.toLowerCase().includes("error") || relayStatus.toLowerCase().includes("cerrada");
    const isSuccess = relayStatus.includes("¡Conexión establecida!");

    if (isSuccess) {
      return (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-green-400">
          <Radio size={15} className="text-green-400" />
          <span>{relayStatus}</span>
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
          <Radio size={15} className="text-red-400" />
          <span>{relayStatus}</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 bg-zinc-800/80 border border-zinc-700 rounded-xl px-4 py-3 mb-4 text-sm text-zinc-400">
        <Radio size={15} className="animate-pulse text-indigo-400" />
        <span>{relayStatus}</span>
      </div>
    );
  };

  return (
    <div className="h-full bg-[#0b0f14] text-white flex items-center justify-center p-8 select-none">
      <div className="w-full max-w-5xl flex gap-6">

        {/* LEFT — sala principal */}
        <div className="flex-1 bg-[#121821] rounded-3xl border border-zinc-800 p-8 flex flex-col justify-between">
          <div>
            {/* HEADER */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <div className="flex items-center gap-3">
                  {editingName ? (
                    <>
                      <input
                        autoFocus
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveRoomName(); if (e.key === "Escape") setEditingName(false); }}
                        className="text-2xl font-bold bg-zinc-800 px-3 py-1 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-white w-64"
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

                <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 font-medium">
                  {currentRoom?.game}
                </span>
              </div>

              <button
                onClick={handleLeave}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-red-500 text-sm px-4 py-2 rounded-xl transition font-medium"
              >
                <LogOut size={16} />
                Salir de la sala
              </button>
            </div>

            {renderRelayStatus()}

            {/* ERROR BANNER DISPLAY */}
            {errorMessage && (
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-6 text-sm text-red-400 animate-fadeIn">
                <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">Aviso:</span> {errorMessage}
                </div>
              </div>
            )}

            {/* PLAYERS LIST */}
            <div className="space-y-3 mb-6">
              {currentRoom?.members?.map((member, index) => {
                const memberId = member.id ?? member;
                const ready = readyPlayers.includes(memberId);
                const host = memberId === currentRoom.host;

                return (
                  <div
                    key={memberId}
                    className="bg-[#0d1117] rounded-2xl px-5 py-3.5 flex justify-between items-center border border-zinc-900"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-bold text-sm">
                        {member.username?.charAt(0)?.toUpperCase() ?? index + 1}
                      </div>
                      <span className="font-medium text-sm">{member.username ?? `Jugador ${index + 1}`}</span>
                      {host && <Crown size={14} className="text-yellow-500 fill-yellow-500/20" />}
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ${ready ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-500"}`}>
                      {ready ? "Listo ✓" : "Esperando"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* GAME PATH */}
            <div className="bg-[#0d1117] rounded-2xl p-5 mb-6 border border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-300 mb-1">Ruta del ejecutable (.exe)</h2>
              {gamePath ? (
                <div className="mt-2">
                  <p className="text-green-400 text-xs font-mono break-all bg-green-500/5 p-2 rounded-lg border border-green-500/10">{gamePath}</p>
                </div>
              ) : (
                <p className="text-yellow-500/90 text-xs mt-1">El binario del juego no está configurado en tu biblioteca.</p>
              )}
              <button
                onClick={handleBrowseGame}
                className="mt-3 text-xs px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 font-medium transition"
              >
                Buscar archivo
              </button>
            </div>
          </div>

          {/* ACTIONS */}
          <div className="flex gap-4">
            <button
              onClick={toggleReady}
              disabled={!gamePath}
              className={`flex-1 py-3.5 rounded-2xl font-semibold text-sm transition ${
                !gamePath 
                  ? "bg-zinc-900 text-zinc-600 cursor-not-allowed" 
                  : isReady 
                    ? "bg-green-600 hover:bg-green-700 text-white" 
                    : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              }`}
            >
              {!gamePath ? "Configura el ejecutable" : isReady ? "Listo ✓ (Presiona para cambiar)" : "Marcar como Listo"}
            </button>

            {isHost && (
              <button
                onClick={startMatch}
                disabled={!isP2PConnected}
                className={`flex items-center justify-center gap-2 flex-1 py-3.5 rounded-2xl font-semibold text-sm transition ${
                  isP2PConnected 
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.99]" 
                    : "bg-zinc-900 text-zinc-600 cursor-not-allowed"
                }`}
              >
                <Play size={16} />
                {isP2PConnected ? "Iniciar Partida" : "Esperando Túnel P2P..."}
              </button>
            )}
          </div>
        </div>

        {/* RIGHT — CHAT */}
        <div className="w-80 bg-[#121821] rounded-3xl border border-zinc-800 flex flex-col h-[600px]">
          <div className="p-4 border-b border-zinc-800">
            <h3 className="font-semibold text-sm text-zinc-300">Chat de la Sala</h3>
          </div>

          {/* MESSAGES */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <p className="text-zinc-600 text-xs text-center mt-4">No hay mensajes. ¡Usa emojis para comunicarte! 👾</p>
            ) : (
              messages.map((msg, index) => {
                const isMe = msg.username === currentUser.username;
                return (
                  <div key={index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && (
                      <span className="text-[11px] text-zinc-500 mb-0.5 px-1">{msg.username}</span>
                    )}
                    <div className={`px-3 py-1.5 rounded-2xl text-xs max-w-[90%] break-words ${
                      isMe
                        ? "bg-indigo-600/20 text-indigo-100 rounded-br-sm border border-indigo-500/10"
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
            <div className="border-t border-zinc-800 bg-[#0d1117] p-3 animate-fadeIn">
              <div className="flex gap-1 mb-2 overflow-x-auto no-scrollbar">
                {EMOTES.map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => setEmoteCategory(i)}
                    className={`text-[10px] font-medium px-2 py-1 rounded-md whitespace-nowrap transition ${
                      emoteCategory === i
                        ? "bg-indigo-500/20 text-indigo-400"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-5 gap-1 max-h-24 overflow-y-auto">
                {EMOTES[emoteCategory].emotes.map((emote, i) => (
                  <button
                    key={i}
                    onClick={() => insertEmote(emote)}
                    className="text-lg hover:bg-zinc-800 rounded-lg p-0.5 transition"
                  >
                    {emote}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* INPUT */}
          <div className="p-3 border-t border-zinc-800">
            <div className="flex gap-1.5 items-center">
              <button
                onClick={() => setShowEmotes(!showEmotes)}
                className={`p-2 rounded-xl transition ${
                  showEmotes ? "bg-indigo-500/20 text-indigo-400" : "text-zinc-500 hover:text-white hover:bg-zinc-800"
                }`}
              >
                <Smile size={16} />
              </button>

              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                placeholder="Escribe un mensaje..."
                className="flex-1 bg-zinc-900 px-3 py-1.5 rounded-xl text-xs text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />

              <button
                onClick={sendMessage}
                className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

export default Room;


