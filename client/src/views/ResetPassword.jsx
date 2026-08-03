import React, {
  useEffect,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react";

import logo from "../assets/retrolink-logo.png";

import {
  submitNewPassword,
  validateResetToken,
} from "../services/auth.service";

function ResetPassword({
  token,
  goToLogin,
  requestNewLink,
}) {
  const [status, setStatus] =
    useState("validating");

  const [password, setPassword] =
    useState("");

  const [
    repeatPassword,
    setRepeatPassword,
  ] = useState("");

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    showRepeatPassword,
    setShowRepeatPassword,
  ] = useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    let active = true;

    const checkToken = async () => {
      if (!token) {
        setStatus("invalid");
        return;
      }

      try {
        await validateResetToken(
          token
        );

        if (active) {
          setStatus("valid");
        }
      } catch (validationError) {
        console.error(
          "[ResetPassword] Token inválido:",
          validationError
        );

        if (active) {
          setStatus("invalid");
        }
      }
    };

    checkToken();

    return () => {
      active = false;
    };
  }, [token]);

  const passwordsMatch =
    password &&
    repeatPassword &&
    password === repeatPassword;

  const passwordIsValid =
    password.length >= 6 &&
    password.length <= 50;

  const formIsValid =
    passwordIsValid &&
    passwordsMatch;

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");

    if (!formIsValid) {
      setError(
        "Revisa que las contraseñas coincidan y tengan entre 6 y 50 caracteres."
      );

      return;
    }

    setLoading(true);

    try {
      await submitNewPassword({
        token,
        password,
        repeatPassword,
      });

      setStatus("success");

      /*
       * Eliminamos el token de la URL para evitar
       * conservarlo en el historial visible.
       */
      window.history.replaceState(
        {},
        "",
        window.location.pathname
      );
    } catch (requestError) {
      console.error(
        "[ResetPassword] Error:",
        requestError
      );

      setError(
        requestError.message ||
          "No se pudo cambiar la contraseña."
      );

      if (
        requestError.message
          ?.toLowerCase()
          .includes("expirado") ||
        requestError.message
          ?.toLowerCase()
          .includes("inválido")
      ) {
        setStatus("invalid");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen max-h-screen overflow-y-auto bg-[#0b0f14] text-white p-4">
      <div className="min-h-full flex items-start sm:items-center justify-center py-6">
        <div className="w-full max-w-md bg-[#121821] p-6 sm:p-8 rounded-3xl border border-zinc-800 shadow-2xl">
          <div className="flex justify-center mb-5">
            <img
              src={logo}
              alt="RetroLink"
              className="h-36 sm:h-44 lg:h-52 w-auto object-contain"
            />
          </div>

          {status === "validating" && (
            <div className="py-8 text-center">
              <LoaderCircle
                size={34}
                className="mx-auto mb-4 animate-spin text-indigo-400"
              />

              <h1 className="text-2xl font-bold mb-2">
                Validando enlace
              </h1>

              <p className="text-zinc-400 text-sm">
                Espera un momento...
              </p>
            </div>
          )}

          {status === "invalid" && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-red-500/10 flex items-center justify-center">
                <AlertCircle
                  size={30}
                  className="text-red-400"
                />
              </div>

              <h1 className="text-2xl font-bold mb-3">
                Enlace no válido
              </h1>

              <p className="text-zinc-400 text-sm leading-6 mb-6">
                Este enlace puede haber expirado,
                ya fue utilizado o no es válido.
              </p>

              <button
                type="button"
                onClick={requestNewLink}
                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-semibold transition"
              >
                Solicitar otro enlace
              </button>

              <button
                type="button"
                onClick={goToLogin}
                className="w-full mt-4 text-zinc-400 hover:text-white text-sm transition"
              >
                Volver al Login
              </button>
            </div>
          )}

          {status === "success" && (
            <div className="text-center">
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-green-500/10 flex items-center justify-center">
                <CheckCircle
                  size={30}
                  className="text-green-400"
                />
              </div>

              <h1 className="text-2xl font-bold mb-3">
                Contraseña actualizada
              </h1>

              <p className="text-zinc-400 text-sm leading-6 mb-6">
                Tu contraseña se cambió
                correctamente. Ya puedes iniciar
                sesión con tus nuevas credenciales.
              </p>

              <button
                type="button"
                onClick={goToLogin}
                className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 font-semibold transition"
              >
                Ir al inicio de sesión
              </button>
            </div>
          )}

          {status === "valid" && (
            <form
              onSubmit={handleSubmit}
            >
              <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                Nueva contraseña
              </h1>

              <p className="text-zinc-400 text-sm leading-6 mb-6">
                Elige una nueva contraseña para
                tu cuenta de RetroLink.
              </p>

              {error && (
                <div className="mb-4 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-zinc-300 mb-2">
                    Nueva contraseña
                  </label>

                  <div className="relative">
                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      autoComplete="new-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(
                          event.target.value
                        );

                        setError("");
                      }}
                      disabled={loading}
                      className="w-full bg-zinc-900 px-4 pr-12 py-3 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                    />

                    <button
                      type="button"
                      aria-label={
                        showPassword
                          ? "Ocultar contraseña"
                          : "Mostrar contraseña"
                      }
                      onClick={() =>
                        setShowPassword(
                          (current) =>
                            !current
                        )
                      }
                      className="absolute right-3 top-3 text-zinc-400 hover:text-white"
                    >
                      {showPassword ? (
                        <EyeOff
                          size={18}
                        />
                      ) : (
                        <Eye
                          size={18}
                        />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-zinc-300 mb-2">
                    Confirmar contraseña
                  </label>

                  <div className="relative">
                    <input
                      type={
                        showRepeatPassword
                          ? "text"
                          : "password"
                      }
                      autoComplete="new-password"
                      value={repeatPassword}
                      onChange={(event) => {
                        setRepeatPassword(
                          event.target.value
                        );

                        setError("");
                      }}
                      disabled={loading}
                      className="w-full bg-zinc-900 px-4 pr-12 py-3 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                    />

                    <button
                      type="button"
                      aria-label={
                        showRepeatPassword
                          ? "Ocultar confirmación"
                          : "Mostrar confirmación"
                      }
                      onClick={() =>
                        setShowRepeatPassword(
                          (current) =>
                            !current
                        )
                      }
                      className="absolute right-3 top-3 text-zinc-400 hover:text-white"
                    >
                      {showRepeatPassword ? (
                        <EyeOff
                          size={18}
                        />
                      ) : (
                        <Eye
                          size={18}
                        />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-zinc-900/50 border border-zinc-800 text-xs space-y-2">
                <p
                  className={
                    passwordIsValid
                      ? "text-green-400"
                      : "text-zinc-500"
                  }
                >
                  • Entre 6 y 50 caracteres
                </p>

                <p
                  className={
                    passwordsMatch
                      ? "text-green-400"
                      : "text-zinc-500"
                  }
                >
                  • Las contraseñas coinciden
                </p>
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  !formIsValid
                }
                className={`w-full mt-6 py-3 rounded-2xl font-semibold transition-all ${
                  loading ||
                  !formIsValid
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]"
                }`}
              >
                {loading
                  ? "Actualizando..."
                  : "Cambiar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;