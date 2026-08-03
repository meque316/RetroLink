import React, {
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  CheckCircle,
  Mail,
} from "lucide-react";

import logo from "../assets/retrolink-logo.png";

import {
  requestPasswordReset,
} from "../services/auth.service";

function ForgotPassword({
  goToLogin,
}) {
  const [email, setEmail] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const emailInputRef =
    useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    const normalizedEmail =
      email.trim().toLowerCase();

    setError("");
    setSuccessMessage("");

    if (!normalizedEmail) {
      setError(
        "Ingresa tu correo electrónico."
      );

      emailInputRef.current?.focus();
      return;
    }

    setLoading(true);

    try {
      const data =
        await requestPasswordReset(
          normalizedEmail
        );

      setSuccessMessage(
        data.message ||
          "Si existe una cuenta asociada a ese correo, recibirás instrucciones para restablecer tu contraseña."
      );
    } catch (requestError) {
      console.error(
        "[ForgotPassword] Error:",
        requestError
      );

      setError(
        requestError.message ||
          "No se pudo procesar la solicitud."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen max-h-screen overflow-y-auto bg-[#0b0f14] text-white p-4">
      <div className="min-h-full flex items-start sm:items-center justify-center py-6">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-[#121821] p-6 sm:p-8 rounded-3xl border border-zinc-800 shadow-2xl"
        >
          <div className="flex justify-center mb-5">
            <img
              src={logo}
              alt="RetroLink"
              className="h-36 sm:h-44 lg:h-52 w-auto object-contain"
            />
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold mb-2">
            Recuperar contraseña
          </h1>

          <p className="text-zinc-400 text-sm leading-6 mb-6">
            Ingresa el correo asociado a tu
            cuenta. Te enviaremos un enlace
            para crear una nueva contraseña.
          </p>

          {error && (
            <div className="mb-4 p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-4 rounded-xl border border-green-500/30 bg-green-500/10 text-green-400 text-sm flex items-start gap-3">
              <CheckCircle
                size={18}
                className="shrink-0 mt-0.5"
              />

              <span>
                {successMessage}
              </span>
            </div>
          )}

          {!successMessage && (
            <>
              <label
                htmlFor="recovery-email"
                className="block text-sm text-zinc-300 mb-2"
              >
                Correo electrónico
              </label>

              <div className="relative">
                <Mail
                  size={18}
                  className="pointer-events-none absolute left-4 top-3.5 text-zinc-500"
                />

                <input
                  ref={emailInputRef}
                  id="recovery-email"
                  type="email"
                  autoComplete="email"
                  placeholder="correo@ejemplo.com"
                  value={email}
                  onChange={(event) => {
                    setEmail(
                      event.target.value
                    );

                    setError("");
                  }}
                  disabled={loading}
                  className="w-full bg-zinc-900 pl-11 pr-4 py-3 rounded-xl border border-transparent focus:border-indigo-500 focus:outline-none disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={
                  loading ||
                  !email.trim()
                }
                className={`w-full mt-6 py-3 rounded-2xl font-semibold transition-all ${
                  loading ||
                  !email.trim()
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]"
                }`}
              >
                {loading
                  ? "Enviando..."
                  : "Enviar enlace"}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={goToLogin}
            disabled={loading}
            className="w-full mt-5 flex items-center justify-center gap-2 text-zinc-400 hover:text-white text-sm transition disabled:opacity-50"
          >
            <ArrowLeft size={16} />
            Volver al inicio de sesión
          </button>
        </form>
      </div>
    </div>
  );
}

export default ForgotPassword;