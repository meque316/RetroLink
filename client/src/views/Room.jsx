import React, { useEffect, useState } from "react";
import socket from "../socket";
import {
  Crown,
  Play,
  LogOut,
  Radio,
  Pencil,
  Check,
  X,
} from "lucide-react";

function Room({ room, leaveRoom }) {
  const [currentRoom, setCurrentRoom] = useState(room);
  const [readyPlayers, setReadyPlayers] = useState([]);

  /*
  Auto-load exe from Library if available
  */
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

  /*
  RELAY STATE
  null     = conectando
  "ok"     = conectado al relay
  "error"  = falló la conexión
  */
  const [relayStatus, setRelayStatus] = useState(null);

  const [editingName, setEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");

  const isHost = currentRoom?.host === socket.id;
  const isReady = readyPlayers.includes(socket.id);

  /*
  START RELAY
  */
  useEffect(() => {
    const startRelay = async () => {
      setRelayStatus(null);
      const result = await window.retroLink?.startRelay(room.id, isHost);
      setRelayStatus(result?.success ? "ok" : "error");
      console.log("[RetroLink] Relay status:", result);
    };

    startRelay();

    return () => {
      window.retroLink?.stopRelay();
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

    const handleReadyState = (playersReady) => {
      setReadyPlayers(playersReady);
    };

    const handleMatchStarted = async (data) => {
      console.log("La partida comenzó 🚀", data);

      if (!gamePath) {
        console.warn("No game path selected");
        return;
      }

      const connectStr = isHost ? null : "127.0.0.1:27961";
      await window.retroLink?.launchGame(gamePath, connectStr);
    };

    const handleMatchError = (error) => {
      alert(error.message);
    };

    socket.on("rooms-list", handleRoomsList);
    socket.on("room-ready-state", handleReadyState);
    socket.on("match-started", handleMatchStarted);
    socket.on("match-error", handleMatchError);

    return () => {
      socket.off("rooms-list", handleRoomsList);
      socket.off("room-ready-state", handleReadyState);
      socket.off("match-started", handleMatchStarted);
      socket.off("match-error", handleMatchError);
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

  const toggleReady = () => {
    socket.emit("toggle-ready", room.id);
  };

  const startMatch = () => {
    socket.emit("start-match", room.id);
  };

  /*
  RELAY STATUS BANNER
  */
  const renderRelayStatus = () => {
    if (relayStatus === null) {
      return (
        <div className="flex items-center gap-3 bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 mb-4 text-sm text-zinc-400">
          <Radio size={15} className="animate-pulse" />
          Connecting to relay...
        </div>
      );
    }

    if (relayStatus === "ok") {
      return (
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-green-400">
          <Radio size={15} />
          Relay connected — no port forwarding needed
        </div>
      );
    }

    return (
      <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-sm text-red-400">
        <Radio size={15} />
        Relay connection failed — check your internet connection
      </div>
    );
  };

  return (
    <div className="h-full bg-[#0b0f14] text-white flex items-center justify-center p-8">
      <div className="w-full max-w-3xl bg-[#121821] rounded-3xl border border-zinc-800 p-8">

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

            {/* GAME BADGE */}
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

        {/* RELAY STATUS BANNER */}
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

                  <span className="font-medium">
                    {member.username ?? `Player ${index + 1}`}
                  </span>

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
            <p className="text-yellow-400 text-sm mb-3">
              Executable not configured
            </p>
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
              isReady
                ? "bg-green-500 hover:bg-green-600"
                : "bg-zinc-800 hover:bg-zinc-700"
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
    </div>
  );
}

export default Room;
