import {
  createHash,
  randomBytes,
} from "node:crypto";

import bcrypt from "bcrypt";

import prisma from "../prisma.js";

import {
  sendPasswordResetEmail,
} from "./email.service.js";

const RESET_TOKEN_DURATION_MINUTES = 30;

const GENERIC_RESPONSE = {
  message:
    "Si existe una cuenta asociada a ese correo, recibirás instrucciones para restablecer la contraseña.",
};

function normalizeEmail(email = "") {
  return String(email)
    .trim()
    .toLowerCase();
}

function hashResetToken(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

function createResetToken() {
  return randomBytes(32).toString("hex");
}

function createExpirationDate() {
  return new Date(
    Date.now() +
      RESET_TOKEN_DURATION_MINUTES *
        60 *
        1000
  );
}

function createResetUrl(token) {
  const baseUrl =
    process.env.PASSWORD_RESET_URL;

  if (!baseUrl) {
    throw new Error(
      "PASSWORD_RESET_URL no está configurada"
    );
  }

  const separator = baseUrl.includes("?")
    ? "&"
    : "?";

  return `${baseUrl}${separator}token=${encodeURIComponent(
    token
  )}`;
}

export async function requestPasswordReset(
  rawEmail
) {
  const email = normalizeEmail(rawEmail);

  /*
   * La respuesta siempre debe ser neutral para no revelar
   * si una dirección está registrada en RetroLink.
   */
  if (!email) {
    return GENERIC_RESPONSE;
  }

  const user =
    await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

  if (!user) {
    return GENERIC_RESPONSE;
  }

  const resetToken =
    createResetToken();

  const resetTokenHash =
    hashResetToken(resetToken);

  const expiresAt =
    createExpirationDate();

  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      passwordResetTokenHash:
        resetTokenHash,

      passwordResetTokenExpiresAt:
        expiresAt,
    },
  });

  const resetUrl =
    createResetUrl(resetToken);

  try {
    await sendPasswordResetEmail({
      email: user.email,
      username: user.username,
      resetUrl,
    });
  } catch (error) {
    /*
     * Si el envío falla, eliminamos el token para que no
     * quede una recuperación activa que el usuario nunca
     * recibió.
     */
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        passwordResetTokenHash:
          null,

        passwordResetTokenExpiresAt:
          null,
      },
    });

    throw error;
  }

  return GENERIC_RESPONSE;
}

export async function findUserByValidResetToken(
  rawToken
) {
  const token =
    String(rawToken || "").trim();

  if (!token) {
    return null;
  }

  const tokenHash =
    hashResetToken(token);

  return prisma.user.findFirst({
    where: {
      passwordResetTokenHash:
        tokenHash,

      passwordResetTokenExpiresAt: {
        gt: new Date(),
      },
    },

    select: {
      id: true,
      email: true,
      username: true,
    },
  });
}

export async function validatePasswordResetToken(
  rawToken
) {
  const user =
    await findUserByValidResetToken(
      rawToken
    );

  return {
    valid: Boolean(user),
  };
}

export async function resetPassword({
  token,
  password,
}) {
  const user =
    await findUserByValidResetToken(
      token
    );

  if (!user) {
    return {
      success: false,

      status: 400,

      message:
        "El enlace de recuperación es inválido o ha expirado.",
    };
  }

  const hashedPassword =
    await bcrypt.hash(password, 10);

  /*
   * Actualizamos la contraseña y eliminamos el token
   * en una sola operación para impedir su reutilización.
   */
  await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      password: hashedPassword,

      passwordResetTokenHash:
        null,

      passwordResetTokenExpiresAt:
        null,

      passwordChangedAt:
        new Date(),
    },
  });

  return {
    success: true,

    status: 200,

    message:
      "Contraseña restablecida correctamente. Ya puedes iniciar sesión.",
  };
}