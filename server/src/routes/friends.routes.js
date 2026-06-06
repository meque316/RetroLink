import express from "express";
import {
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
  getFriends,
} from "../controllers/friends.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/", authenticate, getFriends);
router.post("/request", authenticate, sendFriendRequest);
router.put("/accept/:friendshipId", authenticate, acceptFriendRequest);
router.delete("/:friendshipId", authenticate, removeFriend);

export default router;
