import React from "react";
import Header from "../components/Header";

/*
  Layout base de la aplicación.
  Envuelve todas las vistas principales.
*/
function MainLayout({ children }) {
  return (
    <div className="w-screen h-screen flex flex-col bg-black text-white">
      <Header />

      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}

export default MainLayout;
