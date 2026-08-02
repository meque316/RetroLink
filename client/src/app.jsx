import React, {
  useEffect,
  useState,
} from "react";

import MainLayout from "./layouts/MainLayout";

import Lobby from "./views/Lobby";
import Login from "./views/Login";
import Register from "./views/Register";

import {
  clearStoredSession,
  getStoredToken,
  getStoredUser,
  isTokenExpired,
  onSessionExpired,
} from "./utils/auth";

function App() {
  const [user, setUser] =
    useState(null);

  const [view, setView] =
    useState("login");

  const [
    authMessage,
    setAuthMessage,
  ] = useState("");

  /*
   * CHECK SAVED SESSION
   */
  useEffect(() => {
    const savedUser =
      getStoredUser();

    const token =
      getStoredToken();

    if (!savedUser || !token) {
      return;
    }

    if (isTokenExpired(token)) {
      clearStoredSession();

      setAuthMessage(
        "Tu sesión ha expirado. Inicia sesión nuevamente."
      );

      setView("login");
      return;
    }

    try {
      setUser(
        JSON.parse(savedUser)
      );

      setView("lobby");
    } catch (error) {
      console.error(
        "[App] Sesión guardada inválida:",
        error
      );

      clearStoredSession();

      setUser(null);
      setView("login");
    }
  }, []);

  /*
   * GLOBAL SESSION EXPIRATION
   *
   * authFetch dispara este evento cuando detecta
   * un token vencido o una respuesta HTTP 401.
   */
  useEffect(() => {
    return onSessionExpired(() => {
      setUser(null);

      setAuthMessage(
        "Tu sesión ha expirado. Inicia sesión nuevamente."
      );

      setView("login");
    });
  }, []);

  /*
   * LOGIN SUCCESS
   */
  const handleLoginSuccess =
    (userData) => {
      setAuthMessage("");
      setUser(userData);
      setView("lobby");
    };

  /*
   * LOGOUT
   */
  const handleLogout = () => {
    clearStoredSession();

    setUser(null);
    setAuthMessage("");
    setView("login");
  };

  /*
   * AUTH VIEWS
   */
  if (view === "login") {
    return (
      <Login
        key="login-view"
        authMessage={
          authMessage
        }
        onLoginSuccess={
          handleLoginSuccess
        }
        goToRegister={() => {
          setAuthMessage("");
          setView("register");
        }}
      />
    );
  }

  if (view === "register") {
    return (
      <Register
        key="register-view"
        goToLogin={() => {
          setAuthMessage("");
          setView("login");
        }}
      />
    );
  }

  /*
   * LOBBY
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