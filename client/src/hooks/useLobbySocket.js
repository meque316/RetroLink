import { useEffect, useState } from "react";
import socket, { connectSocket } from "../socket";

export default function useLobbySocket() {
  const [rooms, setRooms] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);

  useEffect(() => {
    connectSocket();

    const handleRoomsList = (updatedRooms) => {
      setRooms(updatedRooms);

      setCurrentRoom((prevRoom) => {
        if (!prevRoom) return null;

        const updatedRoom = updatedRooms.find((room) => room.id === prevRoom.id);
        return updatedRoom || prevRoom;
      });
    };

    const handleUsersOnline = (users) => {
      setOnlineUsers(users);
    };

    socket.on("rooms-list", handleRoomsList);
    socket.on("users-online", handleUsersOnline);

    socket.emit("get-rooms");
    socket.emit("get-users-online");

    return () => {
      socket.off("rooms-list", handleRoomsList);
      socket.off("users-online", handleUsersOnline);
    };
  }, []);

  const joinRoom = (room) => {
    socket.emit("join-room", room.id);
    setCurrentRoom(room);
  };

  const createRoom = async ({ roomName, selectedGame, currentUser, onSuccess }) => {
    const name = roomName.trim() || `${currentUser?.username}'s Room`;

    const roomPayload = {
      name,
      game: selectedGame.name,
      gameId: selectedGame.id,
    };

    try {
      const response = await fetch("https://api.ipify.org?format=json");
      const data = await response.json();

      socket.emit("create-room", {
        ...roomPayload,
        hostPublicIp: data.ip,
      });
    } catch {
      socket.emit("create-room", {
        ...roomPayload,
        hostPublicIp: null,
      });
    }

    if (onSuccess) onSuccess();
  };

  const leaveRoom = () => {
    if (currentRoom) socket.emit("leave-room", currentRoom.id);
    setCurrentRoom(null);
  };

  const disconnectSocket = () => {
    socket.disconnect();
  };

  return {
    rooms,
    onlineUsers,
    currentRoom,
    joinRoom,
    createRoom,
    leaveRoom,
    disconnectSocket,
  };
}