import React, { useState, useEffect } from "react";
import { Eye, EyeOff, CheckCircle, XCircle, AlertCircle } from "lucide-react";

function Register({ goToLogin }) {
  const [form, setForm] = useState({
    email: "",
    nick: "",
    password: "",
    repeatPassword: "",
  });

  const [loading, setLoading] = useState(false);
  const [serverStatus, setServerStatus] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isValid, setIsValid] = useState(false);
  const [backendError, setBackendError] = useState("");

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

  useEffect(() => {
    const newErrors = {};
    
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Email inválido";
    }
    
    if (form.nick && form.nick.length < 3) {
      newErrors.nick = "El nick debe tener al menos 3 caracteres";
    }
    if (form.nick && form.nick.length > 20) {
      newErrors.nick = "El nick no puede tener más de 20 caracteres";
    }
    if (form.nick && !/^[a-zA-Z0-9_\-]+$/.test(form.nick)) {
      newErrors.nick = "Solo letras, números, guión y guión bajo";
    }
    
    if (form.password && form.password.length < 6) {
      newErrors.password = "La contraseña debe tener al menos 6 caracteres";
    }
    if (form.password && form.password.length > 50) {
      newErrors.password = "La contraseña no puede tener más de 50 caracteres";
    }
    
    if (form.repeatPassword && form.password !== form.repeatPassword) {
      newErrors.repeatPassword = "Las contraseñas no coinciden";
    }
    
    setErrors(newErrors);
    setIsValid(
      Object.keys(newErrors).length === 0 &&
      form.email &&
      form.nick &&
      form.password &&
      form.repeatPassword
    );
  }, [form]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setTouched({ ...touched, [e.target.name]: true });
    setBackendError("");
  };

  const handleBlur = (e) => {
    setTouched({ ...touched, [e.target.name]: true });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBackendError("");
    
    const allTouched = {};
    Object.keys(form).forEach(key => allTouched[key] = true);
    setTouched(allTouched);
    
    if (!isValid) {
      alert("Por favor, corrige los errores antes de continuar");
      return;
    }
    
    setLoading(true);

    try {
      // ✅ ENVIAR EXACTAMENTE LO QUE EL BACKEND ESPERA
      const payload = {
        email: form.email,
        nick: form.nick,           // ← "nick" NO "username"
        password: form.password,
        repeatPassword: form.repeatPassword,  // ← ENVIAR repeatPassword
      };

      console.log("📤 Enviando registro:", payload);

      const response = await fetch(
        "https://retrolink-server.onrender.com/api/auth/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();
      console.log("📥 Respuesta del servidor:", data);

      if (!response.ok) {
        setBackendError(data.message || "Error al registrarse");
        alert(data.message || "Error al registrarse");
        return;
      }

      alert("✅ Cuenta creada correctamente");
      goToLogin();
    } catch (error) {
      console.error("❌ Error:", error);
      setBackendError("Error de conexión con el servidor");
      alert("❌ Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  };

  const renderValidationIcon = (fieldName) => {
    if (!touched[fieldName]) return null;
    if (errors[fieldName]) {
      return <XCircle size={16} className="text-red-400 absolute right-3 top-3.5" />;
    }
    if (form[fieldName]) {
      return <CheckCircle size={16} className="text-green-400 absolute right-3 top-3.5" />;
    }
    return null;
  };

  const getInputClasses = (fieldName) => {
    let classes = "w-full bg-zinc-900 px-4 py-3 rounded-xl pr-10 transition outline-none ";
    if (!touched[fieldName]) {
      classes += "border border-transparent focus:border-zinc-600 ";
    } else if (errors[fieldName]) {
      classes += "border border-red-500 focus:border-red-500 ";
    } else if (form[fieldName]) {
      classes += "border border-green-500 focus:border-green-500 ";
    } else {
      classes += "border border-transparent focus:border-zinc-600 ";
    }
    return classes;
  };

  return (
    <div className="min-h-screen bg-[#0b0f14] flex items-center justify-center text-white p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-[#121821] p-6 md:p-8 rounded-3xl border border-zinc-800"
      >
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

        <h1 className="text-2xl md:text-3xl font-bold mb-6">Crear cuenta</h1>

        {backendError && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {backendError}
          </div>
        )}

        <div className="space-y-4">
          <div className="relative">
            <input
              type="email"
              name="email"
              placeholder="Email"
              value={form.email}
              onChange={handleChange}
              onBlur={handleBlur}
              className={getInputClasses("email")}
            />
            {renderValidationIcon("email")}
            {touched.email && errors.email && (
              <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={12} />
                {errors.email}
              </p>
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              name="nick"
              placeholder="Nick (mínimo 3 caracteres)"
              value={form.nick}
              onChange={handleChange}
              onBlur={handleBlur}
              className={getInputClasses("nick")}
            />
            {renderValidationIcon("nick")}
            {touched.nick && errors.nick && (
              <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={12} />
                {errors.nick}
              </p>
            )}
          </div>

          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Contraseña (mínimo 6 caracteres)"
              value={form.password}
              onChange={handleChange}
              onBlur={handleBlur}
              className={getInputClasses("password")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-3 text-zinc-400 hover:text-white transition"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            {renderValidationIcon("password")}
            {touched.password && errors.password && (
              <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={12} />
                {errors.password}
              </p>
            )}
          </div>

          <div className="relative">
            <input
              type={showRepeatPassword ? "text" : "password"}
              name="repeatPassword"
              placeholder="Repetir contraseña"
              value={form.repeatPassword}
              onChange={handleChange}
              onBlur={handleBlur}
              className={getInputClasses("repeatPassword")}
            />
            <button
              type="button"
              onClick={() => setShowRepeatPassword(!showRepeatPassword)}
              className="absolute right-3 top-3 text-zinc-400 hover:text-white transition"
            >
              {showRepeatPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            {renderValidationIcon("repeatPassword")}
            {touched.repeatPassword && errors.repeatPassword && (
              <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                <AlertCircle size={12} />
                {errors.repeatPassword}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <p className="text-xs text-zinc-400 mb-2">Requisitos:</p>
          <ul className="text-xs space-y-1">
            <li className={`flex items-center gap-2 ${form.password.length >= 6 ? "text-green-400" : "text-zinc-500"}`}>
              {form.password.length >= 6 ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              Contraseña: mínimo 6 caracteres
            </li>
            <li className={`flex items-center gap-2 ${form.password && form.repeatPassword && form.password === form.repeatPassword ? "text-green-400" : "text-zinc-500"}`}>
              {form.password && form.repeatPassword && form.password === form.repeatPassword ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              Contraseñas coinciden
            </li>
            <li className={`flex items-center gap-2 ${form.nick && form.nick.length >= 3 ? "text-green-400" : "text-zinc-500"}`}>
              {form.nick && form.nick.length >= 3 ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
              Nick: mínimo 3 caracteres
            </li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={loading || !isValid}
          className={`w-full mt-6 py-3 rounded-2xl font-semibold transition ${
            loading || !isValid
              ? "bg-zinc-700 text-zinc-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {loading ? "Creando..." : "Crear cuenta"}
        </button>

        <button
          type="button"
          onClick={goToLogin}
          className="w-full mt-4 text-zinc-400 hover:text-white transition text-sm"
        >
          Ya tengo cuenta
        </button>
      </form>
    </div>
  );
}

export default Register;