import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import prisma from "../prisma.js";

/*
REGISTER
*/
export const register = async (req, res) => {
  try {
    const {
      email,
      nick,
      password,
      repeatPassword,
    } = req.body;

    if (
      !email ||
      !nick ||
      !password ||
      !repeatPassword
    ) {
      return res.status(400).json({
        message: "Todos los campos son obligatorios",
      });
    }

    if (password !== repeatPassword) {
      return res.status(400).json({
        message: "Las contraseñas no coinciden",
      });
    }

    const existingUser =
      await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { username: nick },
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
      await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        username: nick,
        password: hashedPassword,
      },
    });

    return res.status(201).json({
      message:
        "Usuario creado correctamente",
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};

/*
LOGIN
*/
export const login = async (req, res) => {
  try {
    const {
      email,
      password,
      rememberMe,
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message:
          "Email y contraseña requeridos",
      });
    }

    const user =
      await prisma.user.findUnique({
        where: { email },
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
        username: user.username,
        role: user.role,
      },
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Server error",
    });
  }
};