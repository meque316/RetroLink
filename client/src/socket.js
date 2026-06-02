import { io } from "socket.io-client";

const socket = io("https://retrolink-server.onrender.com", {
  autoConnect: false, 
});

export const connectSocket = () => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  socket.auth = {
    token,
    username: user?.username || "Guest",
    role: user?.role || "USER",
  };

  socket.connect(); // ✅ conecta con credenciales frescas
};

export default socket;