import { useEffect, useState } from "react";
import socket from "../socket";

export default function useRoomSocket({
  room,
  leaveRoom,
  gamePath,
  isHost,
  hostIP,
  currentUser,
  setMessages,
}) {
  const [currentRoom, setCurrentRoom] = useState(room);
  const [readyPlayers, setReadyPlayers] = useState([]);

  useEffect(() => {
    socket.emit("get-rooms");

    const handleRoomsList = (rooms) => {
      const updatedRoom = rooms.find((r) => r.id === room.id);

      if (!updatedRoom) {
        leaveRoom();
        return;
      }

      setCurrentRoom(updatedRoom);
    };

    const handleReadyState = (playersReady) => {
      setReadyPlayers(playersReady);
    };

    const handleMatchStarted = async () => {
      if (!gamePath) {
        alert(
          "⚠️ No tienes el juego configurado.\nPor favor, selecciona la ruta del ejecutable antes de iniciar la partida."
        );
        return;
      }

      const gameOptions = room.gameOptions || {};

      try {
        if (isHost) {
          await window.retroLink?.launchGame(
            gamePath,
            null,
            room.id,
            true,
            room.game,
            gameOptions,
            []
          );
        } else {
          const ipToUse = hostIP || "127.0.0.1";

          await window.retroLink?.launchGame(
            gamePath,
            ipToUse,
            room.id,
            false,
            room.game,
            gameOptions,
            []
          );
        }
      } catch (error) {
        console.error("[Room] Error launching game:", error);
        alert("Error al lanzar el juego: " + error.message);
      }
    };

    const handleMatchError = (error) => {
      setMessages((prev) => [
        ...prev,
        {
          username: "Sistema",
          message: `❌ ${error.message || "Error al iniciar la partida"}`,
          timestamp: Date.now(),
          isSystem: true,
        },
      ]);

      alert(error.message || "Error al iniciar la partida");
    };

    const handleChatMessage = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    const handlePlayerMissingGame = (data) => {
      if (data.username !== currentUser.username) {
        setMessages((prev) => [
          ...prev,
          {
            username: "Sistema",
            message: `⚠️ ${data.username} no tiene ${data.game} configurado en RetroLink`,
            timestamp: Date.now(),
            isSystem: true,
          },
        ]);
      }
    };

    const handleHostGameClosed = async ({ roomId: closedRoomId }) => {
      if (closedRoomId !== room.id) return;

      await window.retroLink?.killGame();
      socket.emit("toggle-ready", room.id);
    };

    window.retroLink?.onHostGameClosed?.(handleHostGameClosed);

    socket.on("rooms-list", handleRoomsList);
    socket.on("room-ready-state", handleReadyState);
    socket.on("match-started", handleMatchStarted);
    socket.on("match-error", handleMatchError);
    socket.on("room-chat", handleChatMessage);
    socket.on("player-missing-game", handlePlayerMissingGame);

    return () => {
      socket.off("rooms-list", handleRoomsList);
      socket.off("room-ready-state", handleReadyState);
      socket.off("match-started", handleMatchStarted);
      socket.off("match-error", handleMatchError);
      socket.off("room-chat", handleChatMessage);
      socket.off("player-missing-game", handlePlayerMissingGame);

      window.retroLink?.offHostGameClosed?.();
    };
  }, [
    room.id,
    room.game,
    room.gameOptions,
    leaveRoom,
    gamePath,
    isHost,
    hostIP,
    currentUser.username,
    setMessages,
  ]);

  const toggleReady = () => {
    socket.emit("toggle-ready", room.id);
  };

  const startMatch = () => {
    socket.emit("start-match", room.id);
  };

  const sendMessage = (chatInput, setChatInput, setShowEmotes) => {
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

  const saveRoomName = (newRoomName, setEditingName, setNewRoomName) => {
    const name = newRoomName.trim();

    if (!name) {
      setEditingName(false);
      return;
    }

    socket.emit("rename-room", {
      roomId: room.id,
      name,
    });

    setEditingName(false);
    setNewRoomName("");
  };

  const handleLeave = () => {
    socket.emit("leave-room", room.id);
    leaveRoom();
  };

  return {
    currentRoom,
    readyPlayers,
    toggleReady,
    startMatch,
    sendMessage,
    saveRoomName,
    handleLeave,
  };
}