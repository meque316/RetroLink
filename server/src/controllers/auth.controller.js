import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import prisma from "../prisma.js";

import {
  requestPasswordReset,
  resetPassword as resetUserPassword,
  validatePasswordResetToken,
} from "../services/password-reset.service.js";

/*
 * Helpers
 */

function normalizeEmail(email = "") {
  return String(email)
    .trim()
    .toLowerCase();
}

function validateNewPassword({
  password,
  repeatPassword,
}) {
  if (!password || !repeatPassword) {
    return "La contraseña y su confirmación son obligatorias.";
  }

  if (password !== repeatPassword) {
    return "Las contraseñas no coinciden.";
  }

  if (password.length < 6) {
    return "La contraseña debe tener al menos 6 caracteres.";
  }

  if (password.length > 50) {
    return "La contraseña no puede tener más de 50 caracteres.";
  }

  return null;
}

/*
 * REGISTER
 */

export const register = async (
  req,
  res
) => {
  try {
    const {
      email: rawEmail,
      nick,
      password,
      repeatPassword,
    } = req.body;

    const email =
      normalizeEmail(rawEmail);

    const normalizedNick =
      String(nick || "").trim();

    if (
      !email ||
      !normalizedNick ||
      !password ||
      !repeatPassword
    ) {
      return res.status(400).json({
        message:
          "Todos los campos son obligatorios",
      });
    }

    if (
      password !== repeatPassword
    ) {
      return res.status(400).json({
        message:
          "Las contraseñas no coinciden",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message:
          "La contraseña debe tener al menos 6 caracteres",
      });
    }

    if (password.length > 50) {
      return res.status(400).json({
        message:
          "La contraseña no puede tener más de 50 caracteres",
      });
    }

    const existingUser =
      await prisma.user.findFirst({
        where: {
          OR: [
            {
              email,
            },
            {
              username:
                normalizedNick,
            },
          ],
        },
      });

    if (existingUser) {
      return res.status(400).json({
        message:
          "Email o nick ya registrado",
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        password,
        10
      );

    await prisma.user.create({
      data: {
        email,

        username:
          normalizedNick,

        password:
          hashedPassword,
      },
    });

    return res.status(201).json({
      message:
        "Usuario creado correctamente",
    });
  } catch (error) {
    console.error(
      "[Auth] Error registrando usuario:",
      error
    );

    return res.status(500).json({
      message:
        "Error interno del servidor",
    });
  }
};

/*
 * LOGIN
 */

export const login = async (
  req,
  res
) => {
  try {
    const {
      email: rawEmail,
      password,
      rememberMe,
    } = req.body;

    const email =
      normalizeEmail(rawEmail);

    if (!email || !password) {
      return res.status(400).json({
        message:
          "Email y contraseña requeridos",
      });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          email,
        },
      });

    if (!user) {
      return res.status(400).json({
        message:
          "Credenciales inválidas",
      });
    }

    const isValid =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!isValid) {
      return res.status(400).json({
        message:
          "Credenciales inválidas",
      });
    }

    if (
      !process.env.JWT_SECRET
    ) {
      console.error(
        "[Auth] JWT_SECRET no está configurado"
      );

      return res.status(500).json({
        message:
          "Error de configuración del servidor",
      });
    }

    const token = jwt.sign(
      {
        userId: user.id,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: rememberMe
          ? "30d"
          : "1d",
      }
    );

    return res.json({
      token,

      user: {
        id: user.id,
        email: user.email,
        username:
          user.username,
        role: user.role,
        avatar:
          user.avatar || "",
      },
    });
  } catch (error) {
    console.error(
      "[Auth] Error iniciando sesión:",
      error
    );

    return res.status(500).json({
      message:
        "Error interno del servidor",
    });
  }
};

/*
 * FORGOT PASSWORD
 *
 * POST /api/auth/forgot-password
 *
 * Body:
 * {
 *   "email": "usuario@correo.com"
 * }
 */

export const forgotPassword =
  async (req, res) => {
    try {
      const { email } =
        req.body;

      /*
       * Incluso si el correo no existe, devolvemos
       * exactamente el mismo mensaje.
       */
      const result =
        await requestPasswordReset(
          email
        );

      return res
        .status(200)
        .json(result);
    } catch (error) {
      console.error(
        "[Auth] Error solicitando recuperación:",
        error
      );

      /*
       * No entregamos detalles internos de Resend,
       * Prisma o configuración al cliente.
       */
      return res.status(500).json({
        message:
          "No se pudo procesar la solicitud en este momento.",
      });
    }
  };

/*
 * VALIDATE RESET TOKEN
 *
 * POST /api/auth/validate-reset-token
 *
 * Body:
 * {
 *   "token": "..."
 * }
 */

export const validateResetToken =
  async (req, res) => {
    try {
      const { token } =
        req.body;

      const result =
        await validatePasswordResetToken(
          token
        );

      if (!result.valid) {
        return res.status(400).json({
          valid: false,

          message:
            "El enlace de recuperación es inválido o ha expirado.",
        });
      }

      return res.status(200).json({
        valid: true,
      });
    } catch (error) {
      console.error(
        "[Auth] Error validando token de recuperación:",
        error
      );

      return res.status(500).json({
        valid: false,

        message:
          "No se pudo validar el enlace en este momento.",
      });
    }
  };

/*
 * RESET PASSWORD
 *
 * POST /api/auth/reset-password
 *
 * Body:
 * {
 *   "token": "...",
 *   "password": "...",
 *   "repeatPassword": "..."
 * }
 */

export const resetPassword =
  async (req, res) => {
    try {
      const {
        token,
        password,
        repeatPassword,
      } = req.body;

      if (!token) {
        return res.status(400).json({
          message:
            "El token de recuperación es obligatorio.",
        });
      }

      const validationError =
        validateNewPassword({
          password,
          repeatPassword,
        });

      if (validationError) {
        return res.status(400).json({
          message:
            validationError,
        });
      }

      const result =
        await resetUserPassword({
          token,
          password,
        });

      return res
        .status(result.status)
        .json({
          message:
            result.message,
        });
    } catch (error) {
      console.error(
        "[Auth] Error restableciendo contraseña:",
        error
      );

      return res.status(500).json({
        message:
          "No se pudo restablecer la contraseña en este momento.",
      });
    }
  };