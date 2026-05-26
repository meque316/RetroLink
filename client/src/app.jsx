import React from "react";
import MainLayout from "./layouts/MainLayout";
import Lobby from "./views/Lobby";

/*
  App ahora solo controla vistas.
  El socket vive en el contexto.
*/
function App() {
  return (
    <MainLayout>
      <Lobby />
    </MainLayout>
  );
}

export default App;
