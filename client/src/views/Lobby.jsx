import React, { useEffect, useState } from "react";
import Room from "./Room";

import {
  Users,
  Wifi,
  Plus,
  Gamepad2,
} from "lucide-react";

import Sidebar from "../components/lobby/Sidebar";
import OnlineUsers from "../components/lobby/OnlineUsers";
import FriendsPanel from "../components/lobby/FriendsPanel";
import LibraryPanel from "../components/lobby/LibraryPanel";
import CreateRoomModal from "../components/lobby/CreateRoomModal";

import useFriends from "../hooks/useFriends";
import useLibrary from "../hooks/useLibrary";
import useAvatar from "../hooks/useAvatar";
import useLobbySocket from "../hooks/useLobbySocket";

const SUPPORTED_GAMES = [
  { id: "quake3", name: "Quake III Arena", year: "1999" },
  { id: "cs16", name: "Counter-Strike 1.6", year: "2000" },
  { id: "carmageddon2", name: "Carmageddon II: Carpocalypse Now", year: "1998" },
];

const GAMES_IN_DEVELOPMENT = [
  { id: "quake2", name: "Quake II", year: "1997" },
  { id: "quake1", name: "Quake", year: "1996" },
  { id: "ut99", name: "Unreal Tournament", year: "1999" },
  { id: "ut2004", name: "Unreal Tournament 2004", year: "2004" },
  { id: "hl1", name: "Half-Life", year: "1998" },
  { id: "doom2", name: "Doom II", year: "1994" },
];

const GAMES = [
  ...SUPPORTED_GAMES.map((g) => ({ ...g, supported: true })),
  ...GAMES_IN_DEVELOPMENT.map((g) => ({ ...g, supported: false })),
];

const DEFAULT_GAME_OPTIONS = {
  map: "de_dust2",
  maxPlayers: 16,
  timeLimit: 30,
  friendlyFire: false,

  // NUEVAS OPCIONES
  startMoney: 800,
  freezeTime: 5,
  buyTime: 0.25,
  allTalk: false,
  password: "",
};

const isGameSupported = (gameIdOrName) => {
  if (SUPPORTED_GAMES.some((g) => g.id === gameIdOrName)) return true;
  return SUPPORTED_GAMES.some((g) => g.name === gameIdOrName);
};

function Lobby() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("lobby");
  const [showModal, setShowModal] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [selectedGame, setSelectedGame] = useState(SUPPORTED_GAMES[0]);
  const [gameOptions, setGameOptions] = useState(DEFAULT_GAME_OPTIONS);

  const {
    rooms,
    onlineUsers,
    currentRoom,
    joinRoom,
    createRoom,
    leaveRoom,
    disconnectSocket,
  } = useLobbySocket();

  const {
    library,
    handleAddGame,
    handleRemoveGame,
  } = useLibrary();

  const {
    friends,
    friendRequest,
    setFriendRequest,
    friendLoading,
    friendError,
    setFriendError,
    fetchFriends,
    sendFriendRequest,
    acceptFriend,
    removeFriend,
  } = useFriends();

  const {
    uploadingAvatar,
    handleAvatarUpload,
  } = useAvatar(currentUser, setCurrentUser);

  useEffect(() => {
    const savedUser = localStorage.getItem("user");

    if (savedUser) {
      try {
        setCurrentUser(JSON.parse(savedUser));
      } catch (error) {
        console.error("Error parsing user:", error);
      }
    }

    fetchFriends();
  }, []);

  const handleCreateRoom = () => {
    createRoom({
      roomName,
      selectedGame,
      currentUser,
      gameOptions,
      onSuccess: () => {
        setShowModal(false);
        setRoomName("");
        setSelectedGame(SUPPORTED_GAMES[0]);
        setGameOptions(DEFAULT_GAME_OPTIONS);
      },
    });
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    disconnectSocket();
    window.location.reload();
  };

  if (currentRoom) {
    return (
      <Room
        key={currentRoom.id}
        room={currentRoom}
        leaveRoom={leaveRoom}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-[#0b0f14] text-white flex">
      <CreateRoomModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        roomName={roomName}
        setRoomName={setRoomName}
        selectedGame={selectedGame}
        setSelectedGame={setSelectedGame}
        games={GAMES}
        library={library}
        currentUser={currentUser}
        onCreateRoom={handleCreateRoom}
        isGameSupported={isGameSupported}
        gameOptions={gameOptions}
        setGameOptions={setGameOptions}
      />

      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        library={library}
        friends={friends}
        fetchFriends={fetchFriends}
        logout={logout}
      />

      <main className="flex-1 min-h-0 p-8 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-thumb]:rounded-full">
        {activeView === "lobby" && (
          <>
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-3xl font-semibold">Game Rooms</h2>
                <p className="text-zinc-400 mt-1">
                  Join or host retro multiplayer sessions
                </p>
              </div>

              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-black px-5 py-3 rounded-xl font-semibold transition"
              >
                <Plus size={18} />
                Host Match
              </button>
            </div>

            <div className="space-y-5">
              {rooms.length === 0 ? (
                <div className="bg-[#11161d] border border-zinc-800 rounded-2xl p-10 text-center text-zinc-500">
                  No active rooms. Create one 🚀
                </div>
              ) : (
                rooms.map((room) => {
                  const gameIdentifier = room.gameId || room.game;
                  const isSupported = isGameSupported(gameIdentifier);

                  return (
                    <div
                      key={room.id}
                      className={`bg-[#11161d] border rounded-2xl p-5 hover:border-green-500 transition flex flex-col sm:flex-row items-center justify-between gap-6 ${
                        isSupported
                          ? "border-zinc-800"
                          : "border-zinc-800/50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-5 w-full sm:w-auto">
                        <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-green-500/20 to-zinc-900 border border-zinc-700 flex items-center justify-center text-green-400 shrink-0">
                          <Gamepad2 size={34} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl font-semibold flex items-center gap-2 flex-wrap">
                            {room.name}

                            {!isSupported && (
                              <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-0.5 rounded-full">
                                No soportado
                              </span>
                            )}
                          </h3>

                          <span className="inline-block mt-2 text-xs px-3 py-1 rounded-full bg-green-500/10 text-green-400">
                            {room.game}
                          </span>

                          {room.gameOptions && room.gameId === "cs16" && (
                            <p className="text-xs text-zinc-500 mt-2">
                              {room.gameOptions.map} · {room.gameOptions.maxPlayers} players
                            </p>
                          )}

                          <div className="flex flex-wrap gap-4 text-zinc-400 text-sm mt-4">
                            <div className="flex items-center gap-2">
                              <Users size={16} />
                              {room.players} player(s)
                            </div>

                            <div className="flex items-center gap-2">
                              <Wifi size={16} />
                              P2P Ready
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => isSupported && joinRoom(room)}
                        disabled={!isSupported}
                        className={`px-5 py-2 rounded-xl font-semibold transition w-full sm:w-auto ${
                          isSupported
                            ? "bg-green-500 hover:bg-green-400 text-black"
                            : "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                        }`}
                      >
                        {isSupported ? "Join Room" : "No disponible"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {activeView === "friends" && (
          <FriendsPanel
            friends={friends}
            onlineUsers={onlineUsers}
            friendRequest={friendRequest}
            setFriendRequest={setFriendRequest}
            friendLoading={friendLoading}
            friendError={friendError}
            setFriendError={setFriendError}
            sendFriendRequest={sendFriendRequest}
            acceptFriend={acceptFriend}
            removeFriend={removeFriend}
          />
        )}

        {activeView === "library" && (
          <LibraryPanel
            games={GAMES}
            library={library}
            onAddGame={handleAddGame}
            onRemoveGame={handleRemoveGame}
          />
        )}
      </main>

      <OnlineUsers
        currentUser={currentUser}
        onlineUsers={onlineUsers}
        uploadingAvatar={uploadingAvatar}
        handleAvatarUpload={handleAvatarUpload}
      />
    </div>
  );
}

export default Lobby;