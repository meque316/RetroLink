import React, { useState, useEffect } from "react";
import logo from "../assets/retrolink-logo.png";

function Login({ onLoginSuccess, goToRegister }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const checkServer = async () => {
      try {
        const res = await fetch(
          "https://retrolink-server.onrender.com/api/health",
          { signal: controller.signal }
        );
        if (isMounted) setServerStatus(res.ok ? "online" : "offline");
      } catch (err) {
        if (isMounted && err.name !== "AbortError") setServerStatus("offline");
      }
    };

    const timeoutId = setTimeout(() => controller.abort(), 5000);
    checkServer();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (serverStatus === "offline") {
      setError("El servidor no está disponible en este momento.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "https://retrolink-server.onrender.com/api/auth/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, rememberMe }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "Error al iniciar sesión");
        return;
      }

      const storage = rememberMe ? localStorage : sessionStorage;
      storage.setItem("token", data.token);
      storage.setItem("user", JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        username: data.user.username,
        role: data.user.role,
        avatar: data.user.avatar || "",
      }));

      onLoginSuccess(data.user);
    } catch (error) {
      console.error(error);
      setError("Error de conexión con el servicio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f14] flex items-center justify-center text-white select-none">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#121821] p-8 rounded-3xl border border-zinc-800 shadow-2xl"
      >
        {/* LOGO */}
        <div className="flex justify-center mb-6">
          <img
            src={logo}
            alt="RetroLink"
            className="h-64 w-auto object-contain drop-shadow-[0_0_15px_rgba(34,197,94,0.15)]"
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
          {serverStatus === "online" && (
            <div className="flex items-center gap-2 text-green-400 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              Servidor conectado
            </div>
          )}
          {serverStatus === "offline" && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              Servidor desconectado (Instancia en Render dormida)
            </div>
          )}
        </div>

        <h1 className="text-3xl font-bold mb-2">Iniciar sesión</h1>
        <p className="text-zinc-400 text-sm mb-6">Ingresa tus credenciales para acceder a RetroLink.</p>

        {error && (
          <div className="mb-4 p-3.5 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm font-medium flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </div>
        )}

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none transition-colors"
          />
          <input
            type="password"
            placeholder="Contraseña"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none transition-colors"
          />
        </div>

        <label className="flex items-center gap-2 mt-4 text-sm text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded bg-zinc-900 border-zinc-700 text-indigo-600 focus:ring-0 cursor-pointer"
          />
          Mantener sesión iniciada
        </label>

        <button
          type="submit"
          disabled={loading || serverStatus === null}
          className={`w-full mt-6 py-3 rounded-2xl font-semibold transition-all ${
            serverStatus === "offline"
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 text-white active:scale-[0.98]"
          }`}
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <button
          type="button"
          onClick={goToRegister}
          className="w-full mt-4 text-zinc-400 hover:text-white text-sm transition-colors"
        >
          ¿No tienes cuenta? <span className="text-indigo-400 underline">Crear cuenta</span>
        </button>
      </form>
    </div>
  );
}

export default Login;
