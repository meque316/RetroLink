import React from "react";
import { useApp } from "../hooks/useApp";

/*
  Header principal.
  Muestra el estado real de conexión.
*/
function Header() {
  const { connected } = useApp();

  return (
    <header className="h-14 px-6 flex items-center justify-between bg-zinc-900 border-b border-zinc-800">
      <span className="text-lg font-semibold text-white">
        RetroLink
      </span>

      <span
        className={`text-sm ${
          connected ? "text-green-400" : "text-red-400"
        }`}
      >
        {connected ? "Conectado" : "Desconectado"}
      </span>
    </header>
  );
}

export default Header;
