const SESSION_EXPIRED_EVENT =
  "retrolink:session-expired";

export function getStoredToken() {
  return (
    localStorage.getItem("token") ||
    sessionStorage.getItem("token")
  );
}

export function getStoredUser() {
  return (
    localStorage.getItem("user") ||
    sessionStorage.getItem("user")
  );
}

export function clearStoredSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");

  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
}

function decodeJwtPayload(token) {
  try {
    const payloadPart = token.split(".")[1];

    if (!payloadPart) {
      return null;
    }

    const normalizedPayload = payloadPart
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const paddedPayload =
      normalizedPayload.padEnd(
        Math.ceil(normalizedPayload.length / 4) * 4,
        "="
      );

    const decodedPayload = decodeURIComponent(
      window
        .atob(paddedPayload)
        .split("")
        .map(
          (character) =>
            `%${character
              .charCodeAt(0)
              .toString(16)
              .padStart(2, "0")}`
        )
        .join("")
    );

    return JSON.parse(decodedPayload);
  } catch (error) {
    console.error(
      "[Auth] No se pudo decodificar el token:",
      error
    );

    return null;
  }
}

export function isTokenExpired(token) {
  if (!token) {
    return true;
  }

  const payload = decodeJwtPayload(token);

  /*
   * Si el token no tiene expiración, dejamos que
   * el servidor determine si continúa siendo válido.
   */
  if (!payload?.exp) {
    return false;
  }

  const currentTimeInSeconds =
    Math.floor(Date.now() / 1000);

  return payload.exp <= currentTimeInSeconds;
}

export function notifySessionExpired() {
  clearStoredSession();

  window.dispatchEvent(
    new CustomEvent(SESSION_EXPIRED_EVENT)
  );
}

export function onSessionExpired(callback) {
  window.addEventListener(
    SESSION_EXPIRED_EVENT,
    callback
  );

  return () => {
    window.removeEventListener(
      SESSION_EXPIRED_EVENT,
      callback
    );
  };
}

export async function authFetch(
  url,
  options = {}
) {
  const token = getStoredToken();

  if (!token || isTokenExpired(token)) {
    notifySessionExpired();

    throw new Error("SESSION_EXPIRED");
  }

  const response = await fetch(url, {
    ...options,

    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    notifySessionExpired();

    throw new Error("SESSION_EXPIRED");
  }

  return response;
}