import React, { createContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

/*
  Contexto global de la aplicación.
  Maneja:
  - socket único
  - estado de conexión
  - usuario (futuro)
*/
export const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socketInstance = io("http://localhost:4000");

    socketInstance.on("connect", () => {
      console.log("Socket conectado:", socketInstance.id);
      setConnected(true);
    });

    socketInstance.on("disconnect", () => {
      console.log("Socket desconectado");
      setConnected(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return (
    <AppContext.Provider
      value={{
        socket,
        connected
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
