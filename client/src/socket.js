import { io } from "socket.io-client";

const socket = io("http://localhost:4000", {
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