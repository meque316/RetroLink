import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import logo from "../assets/retrolink-logo.png";

function Login({
  authMessage,
  onLoginSuccess,
  goToRegister,
  goToForgotPassword,
}) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [rememberMe, setRememberMe] =
    useState(true);

  const [loading, setLoading] =
    useState(false);

  const [serverStatus, setServerStatus] =
    useState(null);

  const [error, setError] =
    useState(null);

  const emailInputRef =
    useRef(null);

  /*
   * Recupera explícitamente el foco cuando el Login
   * se monta después de salir del registro o cuando
   * una sesión expirada devuelve al usuario al Login.
   */
  useEffect(() => {
    const focusTimeout =
      window.setTimeout(() => {
        emailInputRef.current?.focus();
      }, 100);

    return () => {
      window.clearTimeout(focusTimeout);
    };
  }, []);

  /*
   * Comprueba si el servidor está disponible.
   */
  useEffect(() => {
    let isMounted = true;

    const controller =
      new AbortController();

    const checkServer = async () => {
      try {
        const res = await fetch(
          "https://retrolink-server.onrender.com/api/health",
          {
            signal:
              controller.signal,
          }
        );

        if (isMounted) {
          setServerStatus(
            res.ok
              ? "online"
              : "offline"
          );
        }
      } catch (err) {
        if (
          isMounted &&
          err.name !== "AbortError"
        ) {
          setServerStatus("offline");
        }
      }
    };

    const timeoutId =
      window.setTimeout(() => {
        controller.abort();
      }, 5000);

    checkServer();

    return () => {
      isMounted = false;

      window.clearTimeout(
        timeoutId
      );

      controller.abort();
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError(null);

    if (serverStatus === "offline") {
      setError(
        "El servidor no está disponible en este momento."
      );

      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "https://retrolink-server.onrender.com/api/auth/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            email,
            password,
            rememberMe,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setError(
          data.message ||
            "Error al iniciar sesión"
        );

        return;
      }

      /*
       * Elimina cualquier sesión anterior para evitar
       * que queden tokens distintos en localStorage
       * y sessionStorage al mismo tiempo.
       */
      localStorage.removeItem(
        "token"
      );

      localStorage.removeItem(
        "user"
      );

      sessionStorage.removeItem(
        "token"
      );

      sessionStorage.removeItem(
        "user"
      );

      const storage = rememberMe
        ? localStorage
        : sessionStorage;

      storage.setItem(
        "token",
        data.token
      );

      storage.setItem(
        "user",
        JSON.stringify({
          id: data.user.id,
          email: data.user.email,
          username:
            data.user.username,
          role: data.user.role,
          avatar:
            data.user.avatar || "",
        })
      );

      onLoginSuccess(data.user);
    } catch (requestError) {
      console.error(
        "[Login] Error:",
        requestError
      );

      setError(
        "Error de conexión con el servicio"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#0b0f14] text-white">
      <div className="min-h-full flex items-start justify-center px-4 py-6 sm:items-center sm:py-8">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-[#121821] p-6 sm:p-8 rounded-3xl border border-zinc-800 shadow-2xl"
        >
          {/* LOGO */}
          <div className="flex justify-center mb-6">
            <img
              src={logo}
              alt="RetroLink"
              className="h-36 sm:h-48 lg:h-56 w-auto object-contain drop-shadow-[0_0_15px_rgba(34,197,94,0.15)]"
            />
          </div>

          {/* SERVER STATUS */}
          <div className="flex items-center gap-2 mb-6">
            {serverStatus === null && (
              <div className="flex items-center gap-2 text-zinc-500 text-xs">
                <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />

                Comprobando servidor...
              </div>
            )}

            {serverStatus ===
              "online" && (
              <div className="flex items-center gap-2 text-green-400 text-xs">
                <div className="w-2 h-2 rounded-full bg-green-400" />

                Servidor conectado
              </div>
            )}

            {serverStatus ===
              "offline" && (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <div className="w-2 h-2 rounded-full bg-red-400" />

                Servidor desconectado
                (instancia en Render
                dormida)
              </div>
            )}
          </div>

          <h1 className="text-3xl font-bold mb-2">
            Iniciar sesión
          </h1>

          <p className="text-zinc-400 text-sm mb-6">
            Ingresa tus credenciales
            para acceder a RetroLink.
          </p>

          {/* SESIÓN EXPIRADA U OTRO AVISO DE AUTENTICACIÓN */}
          {authMessage && (
            <div className="mb-4 p-3.5 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl text-sm font-medium flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l6.518 11.596c.75 1.334-.213 2.985-1.742 2.985H3.48c-1.53 0-2.492-1.651-1.743-2.985L8.257 3.1zM11 14a1 1 0 10-2 0 1 1 0 002 0zm-1-7a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>

              {authMessage}
            </div>
          )}

          {/* ERRORES DEL LOGIN */}
          {error && (
            <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-medium flex items-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>

              {error}
            </div>
          )}

          <div className="space-y-4">
            <input
              ref={emailInputRef}
              type="email"
              placeholder="Email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value
                )
              }
              disabled={loading}
              className="w-full bg-zinc-900 px-4 py-3 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />

            <input
              type="password"
              placeholder="Contraseña"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) =>
                setPassword(
                  event.target.value
                )
              }
              disabled={loading}
              className="w-full bg-zinc-900 px-4 py-3 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>

          {/* RECUPERAR CONTRASEÑA */}
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={
                goToForgotPassword
              }
              disabled={loading}
              className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <label className="flex items-center gap-2 mt-4 text-sm text-zinc-300 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) =>
                setRememberMe(
                  event.target.checked
                )
              }
              disabled={loading}
              className="rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            />

            Mantener sesión iniciada
          </label>

          <button
            type="submit"
            disabled={
              loading ||
              serverStatus === null ||
              serverStatus === "offline"
            }
            className={`w-full mt-6 py-3 rounded-2xl font-semibold transition-all ${
              loading ||
              serverStatus !== "online"
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98]"
            }`}
          >
            {loading
              ? "Entrando..."
              : "Entrar"}
          </button>

          <button
            type="button"
            onClick={goToRegister}
            disabled={loading}
            className="w-full mt-4 text-zinc-400 hover:text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ¿No tienes cuenta?{" "}
            <span className="text-indigo-400 underline">
              Crear cuenta
            </span>
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;