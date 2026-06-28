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
  Network,
  ChevronDown,
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

  // ✅ Usar room.game para buscar en la librería
  const getGamePathFromLibrary = () => {
    try {
      const library = JSON.parse(localStorage.getItem("retrolink_library") || "[]");
      const saved = library.find((g) => g.id === room.game);
      return saved?.exePath || "";
    } catch {
      return "";
    }
  };

  const [gamePath, setGamePath] = useState(getGamePathFromLibrary);
  const [relayStatus, setRelayStatus] = useState(null);
  const [relayStep, setRelayStep] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  
  const [hostIP, setHostIP] = useState(null);
  const [hostIPReceived, setHostIPReceived] = useState(false);
  
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
  const isReady = readyPlayers.includes(socket.id);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const loadIPs = async () => {
      if (isHost) {
        setIsLoadingIPs(true);
        try {
          const ips = await window.retroLink?.getLocalIPs();
          if (ips && ips.length > 0) {
            setAvailableIPs(ips);
            const preferred = ips.find(ip => 
              ip.address.startsWith('26.') || 
              ip.address.startsWith('10.') ||
              ip.address.startsWith('192.168.')
            ) || ips[0];
            setSelectedIP(preferred.address);
            await window.retroLink?.setHostIP(preferred.address);
            console.log("[Room] Auto-selected IP:", preferred.address);
          }
        } catch (error) {
          console.error("[Room] Error loading IPs:", error);
        }
        setIsLoadingIPs(false);
      }
    };
    loadIPs();
  }, [isHost]);

  /*
  ✅ REPORTAR JUEGOS CONFIGURADOS AL SERVIDOR
  */
  useEffect(() => {
    const reportGames = () => {
      try {
        const library = JSON.parse(localStorage.getItem("retrolink_library") || "[]");
        console.log("[Room] Reportando juegos configurados:", library);
        
        library.forEach(game => {
          const hasGame = !!game.exePath;
          socket.emit("report-game-config", { 
            gameId: game.id, 
            hasGame: hasGame 
          });
          console.log(`[Room] Reportando ${game.id}: ${hasGame ? '✅ configurado' : '❌ no configurado'}`);
        });
      } catch (e) {
        console.error("[Room] Error reporting games:", e);
      }
    };
    
    // Reportar al conectar y cuando cambie la librería
    reportGames();
    
    // Escuchar cambios en localStorage (cuando se agrega un juego)
    const handleStorageChange = (e) => {
      if (e.key === "retrolink_library") {
        console.log("[Room] Librería actualizada, reportando cambios...");
        reportGames();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  /*
  START RELAY - ✅ CON MEJOR MANEJO DE ESTADOS
  */
  useEffect(() => {
    let isMounted = true;

    const startRelay = async () => {
      if (!isMounted) return;
      
      setRelayStatus(null);
      setRelayStep("Iniciando conexión...");
      
      try {
        const result = await window.retroLink?.startRelay(room.id, isHost);
        
        if (!isMounted) return;
        
        if (!result?.success) {
          setRelayStatus("error");
          setRelayStep("No se pudo iniciar el bridge: " + (result?.error || "Error desconocido"));
        } else {
          // ✅ El bridge se inició correctamente
          setRelayStep(isHost ? "Esperando jugadores..." : "Conectando al host...");
        }
      } catch (error) {
        if (!isMounted) return;
        setRelayStatus("error");
        setRelayStep("Error al iniciar el bridge: " + error.message);
      }
    };

    startRelay();

    // ✅ Manejador de estado del bridge
    const handleBridgeStatus = (message) => {
      if (!isMounted) return;
      
      console.log("[Room] Bridge status:", message);
      setRelayStep(message);

      // ✅ Detectar diferentes estados de conexión
      const lowerMsg = message.toLowerCase();
      
      if (lowerMsg.includes("conexión establecida") || 
          lowerMsg.includes("listos para jugar") ||
          lowerMsg.includes("conectado") ||
          lowerMsg.includes("conexión p2p establecida")) {
        setRelayStatus("ok");
      } else if (lowerMsg.includes("error") || 
                 lowerMsg.includes("falló") ||
                 lowerMsg.includes("ocupado")) {
        setRelayStatus("error");
      } else if (lowerMsg.includes("esperando jugadores")) {
        setRelayStatus(null);
      }
    };

    // ✅ Manejador de "bridge ready" (cuando la conexión P2P está lista)
    const handleBridgeReady = (data) => {
      if (!isMounted) return;
      
      console.log("[Room] Bridge ready:", data);
      setRelayStatus("ok");
      setRelayStep("¡Conexión P2P establecida! Listos para jugar.");
    };

    // ✅ Manejador de IP del host
    const handleHostIP = (data) => {
      if (!isMounted) return;
      
      console.log("[Room] Host IP received:", data.hostIP);
      setHostIP(data.hostIP);
      setHostIPReceived(true);
    };

    // ✅ Manejador de "player-missing-game" - cuando alguien no tiene el juego
    const handlePlayerMissingGame = (data) => {
      if (!isMounted) return;
      
      console.log("[Room] Player missing game:", data);
      // Mostrar notificación en el chat o alerta
      if (data.username !== currentUser.username) {
        // Mostrar en el chat que alguien no tiene el juego
        setMessages((prev) => [...prev, {
          username: "Sistema",
          message: `⚠️ ${data.username} no tiene ${data.game} configurado en RetroLink`,
          timestamp: Date.now(),
          isSystem: true
        }]);
      }
    };

    // ✅ Registrar listeners
    window.retroLink?.onBridgeStatus?.(handleBridgeStatus);
    window.retroLink?.onBridgeReady?.(handleBridgeReady);
    window.retroLink?.onHostIPReceived?.(handleHostIP);
    
    // Listener de socket para cuando alguien no tiene el juego
    socket.on("player-missing-game", handlePlayerMissingGame);

    return () => {
      isMounted = false;
      window.retroLink?.stopRelay();
      window.retroLink?.offBridgeStatus?.();
      window.retroLink?.offBridgeReady?.();
      window.retroLink?.offHostIPReceived?.();
      socket.off("player-missing-game", handlePlayerMissingGame);
    };
  }, [room.id, isHost, currentUser.username]);

  const handleIPSelect = async (ip) => {
    setSelectedIP(ip);
    setShowIPSelector(false);
    await window.retroLink?.setHostIP(ip);
    console.log("[Room] Manually selected IP:", ip);
  };

  /*
  SOCKET EVENTS & GAME LAUNCHER
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
      console.log("[Room] 🎮 Match started!", { gamePath, isHost, hostIP });
      
      if (!gamePath) { 
        console.warn("[Room] No game path selected"); 
        alert("⚠️ No tienes el juego configurado.\nPor favor, selecciona la ruta del ejecutable antes de iniciar la partida.");
        return; 
      }

      try {
        if (isHost) {
          console.log("[Room] Launching as HOST");
          await window.retroLink?.launchGame(gamePath, null, room.id, true, null, []);
        } else {
          const ipToUse = hostIP || '127.0.0.1';
          console.log(`[Room] Launching as CLIENT, connecting to: ${ipToUse}`);
          await window.retroLink?.launchGame(gamePath, ipToUse, room.id, false, null, []);
        }
      } catch (error) {
        console.error("[Room] Error launching game:", error);
        alert("Error al lanzar el juego: " + error.message);
      }
    };

    const handleMatchError = (error) => {
      console.error("[Room] Match error:", error);
      
      // ✅ Mostrar el error en el chat también
      setMessages((prev) => [...prev, {
        username: "Sistema",
        message: `❌ ${error.message || "Error al iniciar la partida"}`,
        timestamp: Date.now(),
        isSystem: true
      }]);
      
      alert(error.message || "Error al iniciar la partida");
    };

    const handleChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    // ✅ Listener para cuando el host cierra el juego
    const handleHostGameClosed = async ({ roomId: closedRoomId }) => {
      if (closedRoomId !== room.id) return;
      console.log("[Room] Host game closed");
      await window.retroLink?.killGame();
      socket.emit("toggle-ready", room.id);
    };

    window.retroLink?.onHostGameClosed?.(handleHostGameClosed);

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
      window.retroLink?.offHostGameClosed?.();
    };
  }, [room.id, leaveRoom, gamePath, isHost, hostIP]);

  const handleBrowseGame = async () => {
    try {
      const selectedPath = await window.retroLink?.selectGameExe();
      if (selectedPath) {
        setGamePath(selectedPath);
        // ✅ Guardar en localStorage para futuras sesiones
        try {
          const library = JSON.parse(localStorage.getItem("retrolink_library") || "[]");
          const existing = library.find((g) => g.id === room.game);
          if (existing) {
            existing.exePath = selectedPath;
          } else {
            library.push({ id: room.game, exePath: selectedPath });
          }
          localStorage.setItem("retrolink_library", JSON.stringify(library));
          
          // ✅ Reportar al servidor que ahora tiene el juego
          socket.emit("report-game-config", { 
            gameId: room.game, 
            hasGame: true 
          });
          console.log(`[Room] Reportado ${room.game} como configurado`);
          
        } catch (e) {
          console.error("Error saving game path:", e);
        }
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

  const renderRelayStatus = () => {
    if (relayStatus === null) {
      return (
        <div className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 mb-4 text-sm text-zinc-400">
          <Radio size={15} className="animate-pulse" />
          <span>{relayStep || "Conectando..."}</span>
        </div>
      );
    }
    if (relayStatus === "ok") {
      return (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-green-400">
          <Radio size={15} className="text-green-400" />
          <span className="font-medium">{relayStep || "✅ Conexión P2P establecida"}</span>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
        <div className="flex items-center gap-3">
          <Radio size={15} />
          <span className="font-medium">❌ Connection failed</span>
        </div>
        {relayStep && <p className="text-xs text-red-300 pl-6">{relayStep}</p>}
      </div>
    );
  };

  const renderIPSelector = () => {
    if (!isHost) return null;
    
    const currentIP = selectedIP || availableIPs[0]?.address || 'Cargando...';
    const interfaceName = availableIPs.find(ip => ip.address === selectedIP)?.name || '';
    
    return (
      <div className="relative mb-4">
        <button
          onClick={() => setShowIPSelector(!showIPSelector)}
          className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-xl text-sm transition w-full justify-between"
        >
          <div className="flex items-center gap-2">
            <Network size={15} className="text-zinc-400" />
            <span className="text-zinc-300">IP:</span>
            <span className="text-green-400 font-mono">{currentIP}</span>
            {interfaceName && (
              <span className="text-xs text-zinc-500">({interfaceName})</span>
            )}
          </div>
          <ChevronDown size={15} className={`text-zinc-500 transition ${showIPSelector ? 'rotate-180' : ''}`} />
        </button>
        
        {showIPSelector && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden z-50 shadow-xl">
            {isLoadingIPs ? (
              <div className="px-4 py-3 text-sm text-zinc-400">Cargando interfaces de red...</div>
            ) : availableIPs.length === 0 ? (
              <div className="px-4 py-3 text-sm text-yellow-400">No se encontraron interfaces de red</div>
            ) : (
              availableIPs.map((ip, index) => (
                <button
                  key={index}
                  onClick={() => handleIPSelect(ip.address)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition flex items-center justify-between hover:bg-zinc-800 ${
                    ip.address === selectedIP ? 'bg-green-500/10 text-green-400' : 'text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{ip.address}</span>
                    <span className="text-xs text-zinc-500">{ip.name}</span>
                  </div>
                  {ip.address === selectedIP && <Check size={14} className="text-green-400" />}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  };

  // ✅ Renderizar mensaje de sistema (para errores de juego)
  const renderMessage = (msg, index) => {
    if (msg.isSystem) {
      return (
        <div key={index} className="flex justify-center">
          <div className="text-xs text-zinc-500 bg-zinc-800/50 px-3 py-1 rounded-full">
            {msg.message}
          </div>
        </div>
      );
    }
    
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

          {renderIPSelector()}

          {!isHost && (
            <div className={`text-xs px-3 py-1 rounded-full mb-2 inline-block ${
              hostIPReceived ? 'text-green-400 bg-green-500/10' : 'text-yellow-400 bg-yellow-500/10'
            }`}>
              {hostIPReceived ? `✓ Host IP: ${hostIP}` : '⏳ Obteniendo IP del host...'}
            </div>
          )}

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
              <p className="text-yellow-400 text-sm mb-3">⚠️ Executable not configured</p>
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

          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {messages.length === 0 ? (
              <p className="text-zinc-600 text-sm text-center mt-4">No messages yet 👾</p>
            ) : (
              messages.map((msg, index) => renderMessage(msg, index))
            )}
            <div ref={chatEndRef} />
          </div>

          {showEmotes && (
            <div className="border-t border-zinc-800 bg-[#0d1117] p-3">
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