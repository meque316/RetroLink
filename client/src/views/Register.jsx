import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  XCircle,
} from "lucide-react";

function Register({
  goToLogin,
}) {
  const [form, setForm] =
    useState({
      email: "",
      nick: "",
      password: "",
      repeatPassword: "",
    });

  const [loading, setLoading] =
    useState(false);

  const [
    serverStatus,
    setServerStatus,
  ] = useState(null);

  const [
    showPassword,
    setShowPassword,
  ] = useState(false);

  const [
    showRepeatPassword,
    setShowRepeatPassword,
  ] = useState(false);

  const [errors, setErrors] =
    useState({});

  const [touched, setTouched] =
    useState({});

  const [isValid, setIsValid] =
    useState(false);

  const [
    backendError,
    setBackendError,
  ] = useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] = useState("");

  const redirectTimeoutRef =
    useRef(null);

  useEffect(() => {
    const controller =
      new AbortController();

    const checkServer = async () => {
      try {
        const timeoutId =
          window.setTimeout(() => {
            controller.abort();
          }, 5000);

        const res = await fetch(
          "https://retrolink-server.onrender.com/api/health",
          {
            signal:
              controller.signal,
          }
        );

        window.clearTimeout(
          timeoutId
        );

        setServerStatus(
          res.ok
            ? "online"
            : "offline"
        );
      } catch {
        setServerStatus("offline");
      }
    };

    checkServer();

    return () => {
      controller.abort();

      if (
        redirectTimeoutRef.current
      ) {
        window.clearTimeout(
          redirectTimeoutRef.current
        );
      }
    };
  }, []);

  useEffect(() => {
    const newErrors = {};

    if (
      form.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        form.email
      )
    ) {
      newErrors.email =
        "Email inválido";
    }

    if (
      form.nick &&
      form.nick.length < 3
    ) {
      newErrors.nick =
        "El nick debe tener al menos 3 caracteres";
    }

    if (
      form.nick &&
      form.nick.length > 20
    ) {
      newErrors.nick =
        "El nick no puede tener más de 20 caracteres";
    }

    if (
      form.nick &&
      !/^[a-zA-Z0-9_\-]+$/.test(
        form.nick
      )
    ) {
      newErrors.nick =
        "Solo letras, números, guión y guión bajo";
    }

    if (
      form.password &&
      form.password.length < 6
    ) {
      newErrors.password =
        "La contraseña debe tener al menos 6 caracteres";
    }

    if (
      form.password &&
      form.password.length > 50
    ) {
      newErrors.password =
        "La contraseña no puede tener más de 50 caracteres";
    }

    if (
      form.repeatPassword &&
      form.password !==
        form.repeatPassword
    ) {
      newErrors.repeatPassword =
        "Las contraseñas no coinciden";
    }

    setErrors(newErrors);

    setIsValid(
      Object.keys(newErrors)
        .length === 0 &&
        Boolean(form.email) &&
        Boolean(form.nick) &&
        Boolean(form.password) &&
        Boolean(
          form.repeatPassword
        )
    );
  }, [form]);

  const handleChange = (e) => {
    const {
      name,
      value,
    } = e.target;

    setForm((previousForm) => ({
      ...previousForm,
      [name]: value,
    }));

    setTouched(
      (previousTouched) => ({
        ...previousTouched,
        [name]: true,
      })
    );

    setBackendError("");
    setSuccessMessage("");
  };

  const handleBlur = (e) => {
    const { name } = e.target;

    setTouched(
      (previousTouched) => ({
        ...previousTouched,
        [name]: true,
      })
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setBackendError("");
    setSuccessMessage("");

    const allTouched = {};

    Object.keys(form).forEach(
      (key) => {
        allTouched[key] = true;
      }
    );

    setTouched(allTouched);

    if (!isValid) {
      setBackendError(
        "Corrige los campos marcados antes de continuar."
      );

      return;
    }

    if (
      serverStatus !== "online"
    ) {
      setBackendError(
        "El servidor no está disponible en este momento."
      );

      return;
    }

    setLoading(true);

    try {
      const payload = {
        email: form.email,
        nick: form.nick,
        password: form.password,
        repeatPassword:
          form.repeatPassword,
      };

      console.log(
        "[Register] Enviando registro:",
        {
          email: payload.email,
          nick: payload.nick,
        }
      );

      const response = await fetch(
        "https://retrolink-server.onrender.com/api/auth/register",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify(payload),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        setBackendError(
          data.message ||
            "Error al registrarse"
        );

        return;
      }

      setSuccessMessage(
        "Cuenta creada correctamente. Regresando al inicio de sesión..."
      );

      /*
       * No usamos alert(), porque en Electron puede
       * provocar que la ventana pierda el foco.
       */
      redirectTimeoutRef.current =
        window.setTimeout(() => {
          goToLogin();
        }, 900);
    } catch (requestError) {
      console.error(
        "[Register] Error:",
        requestError
      );

      setBackendError(
        "Error de conexión con el servidor"
      );
    } finally {
      setLoading(false);
    }
  };

  const renderValidationIcon = (
    fieldName,
    hasPasswordToggle = false
  ) => {
    if (!touched[fieldName]) {
      return null;
    }

    const positionClass =
      hasPasswordToggle
        ? "right-12"
        : "right-3";

    if (errors[fieldName]) {
      return (
        <XCircle
          size={16}
          aria-hidden="true"
          className={`pointer-events-none absolute ${positionClass} top-3.5 text-red-400`}
        />
      );
    }

    if (form[fieldName]) {
      return (
        <CheckCircle
          size={16}
          aria-hidden="true"
          className={`pointer-events-none absolute ${positionClass} top-3.5 text-green-400`}
        />
      );
    }

    return null;
  };

  const getInputClasses = (
    fieldName,
    hasPasswordToggle = false
  ) => {
    let classes =
      "w-full bg-zinc-900 px-4 py-3 rounded-xl transition outline-none ";

    classes += hasPasswordToggle
      ? "pr-20 "
      : "pr-10 ";

    if (!touched[fieldName]) {
      classes +=
        "border border-transparent focus:border-zinc-600 ";
    } else if (
      errors[fieldName]
    ) {
      classes +=
        "border border-red-500 focus:border-red-500 ";
    } else if (
      form[fieldName]
    ) {
      classes +=
        "border border-green-500 focus:border-green-500 ";
    } else {
      classes +=
        "border border-transparent focus:border-zinc-600 ";
    }

    return classes;
  };

  return (
    <div className="h-screen overflow-y-auto bg-[#0b0f14] text-white">
      <div className="min-h-full flex items-start justify-center px-4 py-6 sm:py-8">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md bg-[#121821] p-6 md:p-8 rounded-3xl border border-zinc-800 shadow-2xl"
        >
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
            </div>
          )}
        </div>

        <h1 className="text-2xl md:text-3xl font-bold mb-6">
          Crear cuenta
        </h1>

        {backendError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
            <AlertCircle
              size={16}
              className="shrink-0"
            />

            {backendError}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm flex items-center gap-2">
            <CheckCircle
              size={16}
              className="shrink-0"
            />

            {successMessage}
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <input
              type="email"
              name="email"
              placeholder="Email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={
                loading ||
                Boolean(
                  successMessage
                )
              }
              className={getInputClasses(
                "email"
              )}
            />

            {renderValidationIcon(
              "email"
            )}

            {touched.email &&
              errors.email && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle
                    size={12}
                  />

                  {errors.email}
                </p>
              )}
          </div>

          <div className="relative">
            <input
              type="text"
              name="nick"
              placeholder="Nick (mínimo 3 caracteres)"
              autoComplete="username"
              value={form.nick}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={
                loading ||
                Boolean(
                  successMessage
                )
              }
              className={getInputClasses(
                "nick"
              )}
            />

            {renderValidationIcon(
              "nick"
            )}

            {touched.nick &&
              errors.nick && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle
                    size={12}
                  />

                  {errors.nick}
                </p>
              )}
          </div>

          <div className="relative">
            <input
              type={
                showPassword
                  ? "text"
                  : "password"
              }
              name="password"
              placeholder="Contraseña (mínimo 6 caracteres)"
              autoComplete="new-password"
              value={form.password}
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={
                loading ||
                Boolean(
                  successMessage
                )
              }
              className={getInputClasses(
                "password",
                true
              )}
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
              disabled={
                loading ||
                Boolean(
                  successMessage
                )
              }
              className="absolute right-3 top-3 text-zinc-400 hover:text-white transition disabled:opacity-50"
            >
              {showPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>

            {renderValidationIcon(
              "password",
              true
            )}

            {touched.password &&
              errors.password && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle
                    size={12}
                  />

                  {errors.password}
                </p>
              )}
          </div>

          <div className="relative">
            <input
              type={
                showRepeatPassword
                  ? "text"
                  : "password"
              }
              name="repeatPassword"
              placeholder="Repetir contraseña"
              autoComplete="new-password"
              value={
                form.repeatPassword
              }
              onChange={handleChange}
              onBlur={handleBlur}
              disabled={
                loading ||
                Boolean(
                  successMessage
                )
              }
              className={getInputClasses(
                "repeatPassword",
                true
              )}
            />

            <button
              type="button"
              aria-label={
                showRepeatPassword
                  ? "Ocultar contraseña repetida"
                  : "Mostrar contraseña repetida"
              }
              onClick={() =>
                setShowRepeatPassword(
                  (current) =>
                    !current
                )
              }
              disabled={
                loading ||
                Boolean(
                  successMessage
                )
              }
              className="absolute right-3 top-3 text-zinc-400 hover:text-white transition disabled:opacity-50"
            >
              {showRepeatPassword ? (
                <EyeOff size={18} />
              ) : (
                <Eye size={18} />
              )}
            </button>

            {renderValidationIcon(
              "repeatPassword",
              true
            )}

            {touched.repeatPassword &&
              errors.repeatPassword && (
                <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                  <AlertCircle
                    size={12}
                  />

                  {
                    errors.repeatPassword
                  }
                </p>
              )}
          </div>
        </div>

        <div className="mt-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <p className="text-xs text-zinc-400 mb-2">
            Requisitos:
          </p>

          <ul className="text-xs space-y-1">
            <li
              className={`flex items-center gap-2 ${
                form.password.length >=
                6
                  ? "text-green-400"
                  : "text-zinc-500"
              }`}
            >
              {form.password.length >=
              6 ? (
                <CheckCircle
                  size={12}
                />
              ) : (
                <AlertCircle
                  size={12}
                />
              )}

              Contraseña: mínimo 6
              caracteres
            </li>

            <li
              className={`flex items-center gap-2 ${
                form.password &&
                form.repeatPassword &&
                form.password ===
                  form.repeatPassword
                  ? "text-green-400"
                  : "text-zinc-500"
              }`}
            >
              {form.password &&
              form.repeatPassword &&
              form.password ===
                form.repeatPassword ? (
                <CheckCircle
                  size={12}
                />
              ) : (
                <AlertCircle
                  size={12}
                />
              )}

              Contraseñas coinciden
            </li>

            <li
              className={`flex items-center gap-2 ${
                form.nick &&
                form.nick.length >= 3
                  ? "text-green-400"
                  : "text-zinc-500"
              }`}
            >
              {form.nick &&
              form.nick.length >= 3 ? (
                <CheckCircle
                  size={12}
                />
              ) : (
                <AlertCircle
                  size={12}
                />
              )}

              Nick: mínimo 3
              caracteres
            </li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={
            loading ||
            !isValid ||
            serverStatus !==
              "online" ||
            Boolean(successMessage)
          }
          className={`w-full mt-6 py-3 rounded-2xl font-semibold transition ${
            loading ||
            !isValid ||
            serverStatus !==
              "online" ||
            successMessage
              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98]"
          }`}
        >
          {loading
            ? "Creando..."
            : successMessage
              ? "Cuenta creada"
              : "Crear cuenta"}
        </button>

        <button
          type="button"
          onClick={goToLogin}
          disabled={
            loading ||
            Boolean(successMessage)
          }
          className="w-full mt-4 text-zinc-400 hover:text-white transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Ya tengo cuenta
        </button>
        </form>
      </div>
    </div>
  );
}

export default Register;