import React, { useEffect, useRef, useState } from "react";
import Room from "./Room";
import socket from "../socket";

import { Gamepad2, Plus, Search, SlidersHorizontal } from "lucide-react";

import Sidebar from "../components/lobby/Sidebar";
import OnlineUsers from "../components/lobby/OnlineUsers";
import FriendsPanel from "../components/lobby/FriendsPanel";
import LibraryPanel from "../components/lobby/LibraryPanel";
import CreateRoomModal from "../components/lobby/CreateRoomModal";
import LobbyRoomCard from "../components/lobby/LobbyRoomCard";

import useFriends from "../hooks/useFriends";
import useLibrary from "../hooks/useLibrary";
import useAvatar from "../hooks/useAvatar";
import useLobbySocket from "../hooks/useLobbySocket";

const SUPPORTED_GAMES = [
  {
    id: "quake3",
    name: "Quake III Arena",
    year: "1999",
  },
  {
    id: "cs16",
    name: "Counter-Strike 1.6",
    year: "2000",
  },
  {
    id: "ut99",
    name: "Unreal Tournament",
    year: "1999",
  },
  {
    id: "carmageddon2",
    name: "Carmageddon II: Carpocalypse Now",
    year: "1998",
  },
  {
    id: "aom",  
    name: "Age of Mythology",
    year: "2002",
  },
  {
    id: "dow_soulstorm",  // <-- Agregar
    name: "Warhammer 40,000: Dawn of War - Soulstorm",
    year: "2008",
  },
];

const GAMES_IN_DEVELOPMENT = [
  {
    id: "quake2",
    name: "Quake II",
    year: "1997",
  },
  {
    id: "quake1",
    name: "Quake",
    year: "1996",
  },
  {
    id: "ut2004",
    name: "Unreal Tournament 2004",
    year: "2004",
  },
  {
    id: "hl1",
    name: "Half-Life",
    year: "1998",
  },
  {
    id: "doom2",
    name: "Doom II",
    year: "1994",
  },
];

const GAMES = [
  ...SUPPORTED_GAMES.map((game) => ({
    ...game,
    supported: true,
  })),
  ...GAMES_IN_DEVELOPMENT.map((game) => ({
    ...game,
    supported: false,
  })),
];

const DEFAULT_QUAKE3_OPTIONS = {
  map: "q3dm17",
  gameType: "freeForAll",
  maxPlayers: 16,
  fragLimit: 20,
  timeLimit: 15,
  minPlayers: 0,
  botSkill: 3,
  friendlyFire: false,
  password: "",
  hostname: "RetroLink Quake III",
};

const DEFAULT_CS16_OPTIONS = {
  map: "de_dust2",
  maxPlayers: 16,
  timeLimit: 30,
  friendlyFire: false,
  startMoney: 800,
  freezeTime: 5,
  buyTime: 0.25,
  allTalk: false,
  password: "",
};

const DEFAULT_UT99_OPTIONS = {
  map: "DM-Deck16][",
  gameType: "deathmatch",
  maxPlayers: 16,
  fragLimit: 30,
  timeLimit: 20,
  minPlayers: 0,
  difficulty: 3,
  friendlyFire: 0,
  password: "",
  serverName: "RetroLink UT99",
};

const DEFAULT_OPTIONS_BY_GAME = {
  quake3: DEFAULT_QUAKE3_OPTIONS,
  cs16: DEFAULT_CS16_OPTIONS,
  ut99: DEFAULT_UT99_OPTIONS,
  carmageddon2: {},
  aom: {},
  dow_soulstorm: {},  // <-- Agregar
};

const isGameSupported = (gameIdOrName) => {
  if (!gameIdOrName) return false;

  if (
    SUPPORTED_GAMES.some(
      (game) => game.id === gameIdOrName
    )
  ) {
    return true;
  }

  return SUPPORTED_GAMES.some(
    (game) => game.name === gameIdOrName
  );
};

function getDefaultOptionsForGame(gameId) {
  return {
    ...(DEFAULT_OPTIONS_BY_GAME[gameId] || {}),
  };
}

function Lobby() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeView, setActiveView] = useState("lobby");
  const [showModal, setShowModal] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [roomName, setRoomName] = useState("");
  const pendingCreatedRoomRef = useRef(null);
  const [selectedGame, setSelectedGame] = useState(
    SUPPORTED_GAMES[0]
  );

  const [gameOptions, setGameOptions] = useState(() =>
    getDefaultOptionsForGame(SUPPORTED_GAMES[0].id)
  );

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

  useEffect(() => {
    setGameOptions(
      getDefaultOptionsForGame(selectedGame?.id)
    );
  }, [selectedGame?.id]);

  useEffect(() => {
    const pendingRoom = pendingCreatedRoomRef.current;

    if (!pendingRoom || currentRoom || rooms.length === 0) {
      return;
    }

    const createdRoom = rooms.find((candidate) => {
      const candidateGameId =
        candidate.gameId ?? candidate.game;

      return (
        candidate.host === socket.id &&
        candidate.name === pendingRoom.name &&
        (candidateGameId === pendingRoom.gameId ||
          candidate.game === pendingRoom.gameName)
      );
    });

    if (!createdRoom) {
      return;
    }

    pendingCreatedRoomRef.current = null;
    joinRoom(createdRoom);
  }, [rooms, currentRoom, joinRoom]);

  const handleCreateRoom = () => {
    const expectedRoomName =
      roomName.trim() ||
      `${currentUser?.username || "Player"}'s Room`;

    pendingCreatedRoomRef.current = {
      name: expectedRoomName,
      gameId: selectedGame?.id,
      gameName: selectedGame?.name,
    };

    createRoom({
      roomName,
      selectedGame,
      currentUser,
      gameOptions,

      onSuccess: () => {
        const defaultGame = SUPPORTED_GAMES[0];

        setShowModal(false);
        setRoomName("");
        setSelectedGame(defaultGame);
        setGameOptions(
          getDefaultOptionsForGame(defaultGame.id)
        );
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

  const visibleRooms = rooms.filter((room) => {
    const query = roomSearch.trim().toLowerCase();
    const gameIdentifier = room.gameId || room.game;
    const matchesSearch =
      !query ||
      room.name?.toLowerCase().includes(query) ||
      room.game?.toLowerCase().includes(query);

    const matchesFilter =
      roomFilter === "all" ||
      (roomFilter === "configured" &&
        library.some((game) => game.id === gameIdentifier && game.exePath));

    return matchesSearch && matchesFilter;
  });

  const renderLobby = () => (
    <>
      <header className="mb-6 flex flex-col gap-5 border-b border-zinc-800/80 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-green-400">
            RetroLink
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-white">Lobby</h1>
          <p className="mt-1 text-zinc-400">
            Encuentra una partida o crea una nueva sala.
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
          <label className="relative min-w-0 flex-1 lg:w-72">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
            />
            <input
              type="search"
              value={roomSearch}
              onChange={(event) => setRoomSearch(event.target.value)}
              placeholder="Buscar salas..."
              className="h-12 w-full rounded-xl border border-zinc-800 bg-[#101720] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-green-500/60"
            />
          </label>

          <button
            onClick={() => setShowModal(true)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 font-semibold text-black transition hover:bg-green-400"
            type="button"
          >
            <Plus size={19} />
            Crear sala
          </button>
        </div>
      </header>

      <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-[#0f151d] p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRoomFilter("all")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              roomFilter === "all"
                ? "bg-green-500/15 text-green-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            Todas <span className="ml-1 text-xs opacity-70">{rooms.length}</span>
          </button>

          <button
            type="button"
            onClick={() => setRoomFilter("configured")}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              roomFilter === "configured"
                ? "bg-green-500/15 text-green-400"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
          >
            Mis juegos
          </button>
        </div>

        <div className="flex items-center gap-2 px-2 text-xs text-zinc-500">
          <SlidersHorizontal size={14} />
          {visibleRooms.length} {visibleRooms.length === 1 ? "sala visible" : "salas visibles"}
        </div>
      </section>

      {visibleRooms.length === 0 ? (
        <section className="flex min-h-[360px] flex-col items-center justify-center rounded-3xl border border-dashed border-zinc-700 bg-[#101720]/70 px-6 text-center">
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-green-500/20 bg-green-500/10 text-green-400">
            <Gamepad2 size={36} />
          </div>
          <h2 className="text-2xl font-semibold text-white">
            {rooms.length === 0 ? "No hay salas activas" : "No encontramos salas"}
          </h2>
          <p className="mt-2 max-w-md text-zinc-500">
            {rooms.length === 0
              ? "Sé el primero en crear una sala y reúne a tus amigos."
              : "Prueba con otro nombre o cambia el filtro seleccionado."}
          </p>
          {rooms.length === 0 && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="mt-6 flex items-center gap-2 rounded-xl bg-green-500 px-5 py-3 font-semibold text-black transition hover:bg-green-400"
            >
              <Plus size={18} />
              Crear sala
            </button>
          )}
        </section>
      ) : (
        <div className="space-y-3">
          {visibleRooms.map((room) => (
            <LobbyRoomCard
              key={room.id}
              room={room}
              supported={isGameSupported(room.gameId || room.game)}
              onJoinRoom={joinRoom}
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#090e14] text-white">
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

      <main className="min-h-0 flex-1 overflow-y-auto px-5 py-6 md:px-8 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-700">
        <div className="mx-auto w-full max-w-6xl">
          {activeView === "lobby" && renderLobby()}

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
        </div>
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