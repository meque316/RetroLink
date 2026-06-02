import React, {
  useEffect,
  useState,
} from "react";

import MainLayout from "./layouts/MainLayout";

import Lobby from "./views/Lobby";
import Login from "./views/Login";
import Register from "./views/Register";

function App() {
  const [user, setUser] =
    useState(null);

  const [view, setView] =
    useState("login");

  /*
  CHECK SAVED SESSION
  */
  useEffect(() => {
    const savedUser =
      localStorage.getItem(
        "user"
      );

    const token =
      localStorage.getItem(
        "token"
      );

    if (
      savedUser &&
      token
    ) {
      setUser(
        JSON.parse(savedUser)
      );

      setView("lobby");
    }
  }, []);

  /*
  LOGIN SUCCESS
  */
  const handleLoginSuccess =
    (userData) => {
      setUser(userData);
      setView("lobby");
    };

  /*
  LOGOUT
  */
  const handleLogout = () => {
    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "user"
    );

    setUser(null);
    setView("login");
  };

  /*
  AUTH VIEWS
  */
  if (view === "login") {
    return (
      <Login
        onLoginSuccess={
          handleLoginSuccess
        }
        goToRegister={() =>
          setView(
            "register"
          )
        }
      />
    );
  }

  if (view === "register") {
    return (
      <Register
        goToLogin={() =>
          setView("login")
        }
      />
    );
  }

  /*
  LOBBY
  */
  return (
    <MainLayout>
      <Lobby
        user={user}
        onLogout={handleLogout}
      />
    </MainLayout>
  );
}

export default App;