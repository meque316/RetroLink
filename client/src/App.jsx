import React, {
  useEffect,
  useState,
} from "react";

import MainLayout from "./layouts/MainLayout";

import Lobby from "./views/Lobby";
import Login from "./views/Login";
import Register from "./views/Register";
import ForgotPassword from "./views/ForgotPassword";
import ResetPassword from "./views/ResetPassword";

import {
  clearStoredSession,
  getStoredToken,
  getStoredUser,
  isTokenExpired,
  onSessionExpired,
} from "./utils/auth";

function getInitialAuthView() {
  const params =
    new URLSearchParams(
      window.location.search
    );

  const resetToken =
    params.get("token");

  const isResetPath =
    window.location.pathname.includes(
      "reset-password"
    );

  if (
    isResetPath &&
    resetToken
  ) {
    return {
      view: "reset-password",
      resetToken,
    };
  }

  return {
    view: "login",
    resetToken: "",
  };
}

function App() {
  const initialAuthState =
    getInitialAuthView();

  const [user, setUser] =
    useState(null);

  const [view, setView] =
    useState(
      initialAuthState.view
    );

  const [
    resetToken,
    setResetToken,
  ] = useState(
    initialAuthState.resetToken
  );

  const [
    authMessage,
    setAuthMessage,
  ] = useState("");

  useEffect(() => {
    /*
     * No debemos restaurar una sesión y abrir el
     * Lobby cuando el usuario llegó mediante un
     * enlace de recuperación.
     */
    if (
      initialAuthState.view ===
      "reset-password"
    ) {
      return;
    }

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

  useEffect(() => {
    return onSessionExpired(() => {
      setUser(null);

      setAuthMessage(
        "Tu sesión ha expirado. Inicia sesión nuevamente."
      );

      setView("login");
    });
  }, []);

  const showLogin = () => {
    setResetToken("");
    setAuthMessage("");
    setView("login");

    window.history.replaceState(
      {},
      "",
      "/"
    );
  };

  const handleLoginSuccess =
    (userData) => {
      setAuthMessage("");
      setUser(userData);
      setView("lobby");
    };

  const handleLogout = () => {
    clearStoredSession();

    setUser(null);
    setAuthMessage("");
    setView("login");
  };

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
        goToForgotPassword={() => {
          setAuthMessage("");
          setView(
            "forgot-password"
          );
        }}
      />
    );
  }

  if (view === "register") {
    return (
      <Register
        key="register-view"
        goToLogin={showLogin}
      />
    );
  }

  if (
    view ===
    "forgot-password"
  ) {
    return (
      <ForgotPassword
        key="forgot-password-view"
        goToLogin={showLogin}
      />
    );
  }

  if (
    view ===
    "reset-password"
  ) {
    return (
      <ResetPassword
        key="reset-password-view"
        token={resetToken}
        goToLogin={showLogin}
        requestNewLink={() => {
          setResetToken("");
          setView(
            "forgot-password"
          );

          window.history.replaceState(
            {},
            "",
            "/"
          );
        }}
      />
    );
  }

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
