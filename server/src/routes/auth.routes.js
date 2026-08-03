import express from "express";

import {
  forgotPassword,
  login,
  register,
  resetPassword,
  validateResetToken,
} from "../controllers/auth.controller.js";

const router =
  express.Router();

/*
 * Registro e inicio de sesión
 */
router.post(
  "/register",
  register
);

router.post(
  "/login",
  login
);

/*
 * Recuperación de contraseña
 */
router.post(
  "/forgot-password",
  forgotPassword
);

router.post(
  "/validate-reset-token",
  validateResetToken
);

router.post(
  "/reset-password",
  resetPassword
);

export default router;