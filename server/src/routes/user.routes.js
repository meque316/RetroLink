import express from "express";
import { updateAvatar } from "../controllers/user.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.put("/avatar", authenticate, updateAvatar);

export default router;
