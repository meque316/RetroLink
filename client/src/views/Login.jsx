import React, {
  useState,
} from "react";

function Login({
  onLoginSuccess,
  goToRegister,
}) {
  const [email, setEmail] =
    useState("");

  const [password,
    setPassword] =
    useState("");

  const [rememberMe,
    setRememberMe] =
    useState(true);

  const [loading,
    setLoading] =
    useState(false);

  const handleSubmit =
    async (e) => {
      e.preventDefault();

      setLoading(true);

      try {
        const response =
          await fetch(
            "http://localhost:4000/api/auth/login",
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
          alert(
            data.message ||
              "Error al iniciar sesión"
          );
          return;
        }

        localStorage.setItem(
          "token",
          data.token
        );

        localStorage.setItem(
          "user",
          JSON.stringify(
            data.user
          )
        );

        onLoginSuccess(
          data.user
        );

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
        <h1 className="text-3xl font-bold mb-6">
          Iniciar sesión
        </h1>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) =>
              setEmail(
                e.target.value
              )
            }
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl"
          />

          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) =>
              setPassword(
                e.target.value
              )
            }
            className="w-full bg-zinc-900 px-4 py-3 rounded-xl"
          />
        </div>

        <label className="flex items-center gap-2 mt-4 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) =>
              setRememberMe(
                e.target.checked
              )
            }
          />
          Mantener sesión iniciada
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 py-3 rounded-2xl font-semibold"
        >
          {loading
            ? "Entrando..."
            : "Entrar"}
        </button>

        <button
          type="button"
          onClick={goToRegister}
          className="w-full mt-4 text-zinc-400 hover:text-white"
        >
          Crear cuenta
        </button>
      </form>
    </div>
  );
}

export default Login;