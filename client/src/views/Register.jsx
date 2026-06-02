import React, { useState, useEffect } from "react";

function Register({ goToLogin }) {
  const [form, setForm] = useState({
    email: "",
    nick: "",
    password: "",
    repeatPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);

  useEffect(() => {
    const checkServer = async () => {
      try {
        const res = await fetch(
          "https://retrolink-server.onrender.com/api/health",
          { signal: AbortSignal.timeout(5000) }
        );
        setServerStatus(res.ok ? "online" : "offline");
      } catch {
        setServerStatus("offline");
      }
    };

    checkServer();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(
        "https://retrolink-server.onrender.com/api/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        alert(data.message || "Error al registrarse");
        return;
      }

      alert("Cuenta creada correctamente");
      goToLogin();
    } catch (error) {
      console.error(error);
      alert("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0f14] flex items-center justify-center text-white">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#121821] p-8 rounded-3xl border border-zinc-800"
      >
        {/* SERVER STATUS */}
        <div className="flex items-center gap-2 mb-6">
          {serverStatus === null && (
            <div className="flex items-center gap-2 text-zinc-500 text-xs">
              <div className="w-2 h-2 rounded-full bg-zinc-500 animate-pulse" />
              Checking server...
            </div>
          )}
          {serverStatus === "online" && (
            <div className="flex items-center gap-2 text-green-400 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              Server online
            </div>
          )}
          {serverStatus === "offline" && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              Server offline
            </div>
          )}
        </div>

        <h1 className="text-3xl font-bold mb-6">Crear cuenta</h1>

        <div className="space-y-4">
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl"
          />

          <input
            type="text"
            name="nick"
            placeholder="Nick"
            value={form.nick}
            onChange={handleChange}
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl"
          />

          <input
            type="password"
            name="password"
            placeholder="Contraseña"
            value={form.password}
            onChange={handleChange}
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl"
          />

          <input
            type="password"
            name="repeatPassword"
            placeholder="Repetir contraseña"
            value={form.repeatPassword}
            onChange={handleChange}
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 py-3 rounded-2xl font-semibold"
        >
          {loading ? "Creando..." : "Crear cuenta"}
        </button>

        <button
          type="button"
          onClick={goToLogin}
          className="w-full mt-4 text-zinc-400 hover:text-white"
        >
          Ya tengo cuenta
        </button>
      </form>
    </div>
  );
}

export default Register;
