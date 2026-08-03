import { Resend } from "resend";

const resend = new Resend(
  process.env.RESEND_API_KEY
);

const EMAIL_FROM =
  process.env.EMAIL_FROM ||
  "RetroLink <onboarding@resend.dev>";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendPasswordResetEmail({
  email,
  username,
  resetUrl,
}) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY no está configurada"
    );
  }

  if (!email || !resetUrl) {
    throw new Error(
      "Faltan datos para enviar el correo de recuperación"
    );
  }

  const safeUsername =
    escapeHtml(username || "jugador");

  const safeResetUrl =
    escapeHtml(resetUrl);

  const { data, error } =
    await resend.emails.send({
      from: EMAIL_FROM,
      to: [email],
      subject:
        "Restablece tu contraseña de RetroLink",
      html: `
        <!doctype html>
        <html lang="es">
          <head>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
          </head>

          <body
            style="
              margin: 0;
              padding: 24px;
              background: #0b0f14;
              color: #e4e4e7;
              font-family: Arial, Helvetica, sans-serif;
            "
          >
            <div
              style="
                max-width: 560px;
                margin: 0 auto;
                padding: 32px;
                background: #121821;
                border: 1px solid #27272a;
                border-radius: 18px;
              "
            >
              <h1
                style="
                  margin: 0 0 20px;
                  color: #ffffff;
                  font-size: 26px;
                "
              >
                Restablece tu contraseña
              </h1>

              <p
                style="
                  margin: 0 0 16px;
                  line-height: 1.6;
                "
              >
                Hola ${safeUsername},
              </p>

              <p
                style="
                  margin: 0 0 24px;
                  line-height: 1.6;
                "
              >
                Recibimos una solicitud para cambiar
                la contraseña de tu cuenta de RetroLink.
              </p>

              <p
                style="
                  margin: 0 0 28px;
                  text-align: center;
                "
              >
                <a
                  href="${safeResetUrl}"
                  style="
                    display: inline-block;
                    padding: 14px 22px;
                    background: #4f46e5;
                    color: #ffffff;
                    text-decoration: none;
                    border-radius: 12px;
                    font-weight: bold;
                  "
                >
                  Restablecer contraseña
                </a>
              </p>

              <p
                style="
                  margin: 0 0 16px;
                  line-height: 1.6;
                  color: #a1a1aa;
                  font-size: 14px;
                "
              >
                Este enlace vence en 30 minutos
                y solo puede utilizarse una vez.
              </p>

              <p
                style="
                  margin: 0;
                  line-height: 1.6;
                  color: #a1a1aa;
                  font-size: 14px;
                "
              >
                Si no solicitaste este cambio,
                puedes ignorar este correo.
              </p>
            </div>
          </body>
        </html>
      `,
    });

  if (error) {
    console.error(
      "[Email] Error de Resend:",
      error
    );

    throw new Error(
      error.message ||
        "No se pudo enviar el correo de recuperación"
    );
  }

  console.log(
    "[Email] Correo aceptado por Resend:",
    data?.id
  );

  return data;
}