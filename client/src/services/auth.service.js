const API_URL =
  import.meta.env.VITE_API_URL ||
  "https://retrolink-server.onrender.com";

async function parseResponse(response) {
  const data = await response
    .json()
    .catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.message ||
        "No se pudo completar la solicitud."
    );
  }

  return data;
}

export async function requestPasswordReset(
  email
) {
  const response = await fetch(
    `${API_URL}/api/auth/forgot-password`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        email,
      }),
    }
  );

  return parseResponse(response);
}

export async function validateResetToken(
  token
) {
  const response = await fetch(
    `${API_URL}/api/auth/validate-reset-token`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        token,
      }),
    }
  );

  return parseResponse(response);
}

export async function submitNewPassword({
  token,
  password,
  repeatPassword,
}) {
  const response = await fetch(
    `${API_URL}/api/auth/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        token,
        password,
        repeatPassword,
      }),
    }
  );

  return parseResponse(response);
}