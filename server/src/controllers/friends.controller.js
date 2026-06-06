import prisma from "../prisma.js";

/*
SEND FRIEND REQUEST
*/
export const sendFriendRequest = async (req, res) => {
  try {
    const { username } = req.body;
    const userId = req.user.userId;

    const friend = await prisma.user.findUnique({
      where: { username },
    });

    if (!friend) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (friend.id === userId) {
      return res.status(400).json({ message: "No puedes agregarte a ti mismo" });
    }

    // Verificar si ya existe
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId: friend.id },
          { userId: friend.id, friendId: userId },
        ],
      },
    });

    if (existing) {
      return res.status(400).json({ message: "Solicitud ya existe" });
    }

    const friendship = await prisma.friendship.create({
      data: { userId, friendId: friend.id },
      include: {
        friend: {
          select: { id: true, username: true, avatar: true, role: true },
        },
      },
    });

    return res.status(201).json({ message: "Solicitud enviada", friendship });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/*
ACCEPT FRIEND REQUEST
*/
export const acceptFriendRequest = async (req, res) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user.userId;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }

    if (friendship.friendId !== userId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    const updated = await prisma.friendship.update({
      where: { id: friendshipId },
      data: { status: "accepted" },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, role: true },
        },
        friend: {
          select: { id: true, username: true, avatar: true, role: true },
        },
      },
    });

    return res.json({ message: "Solicitud aceptada", friendship: updated });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/*
DECLINE / REMOVE FRIEND
*/
export const removeFriend = async (req, res) => {
  try {
    const { friendshipId } = req.params;
    const userId = req.user.userId;

    const friendship = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      return res.status(404).json({ message: "Amistad no encontrada" });
    }

    if (friendship.userId !== userId && friendship.friendId !== userId) {
      return res.status(403).json({ message: "No autorizado" });
    }

    await prisma.friendship.delete({ where: { id: friendshipId } });

    return res.json({ message: "Amistad eliminada" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

/*
GET FRIENDS LIST
Devuelve amigos aceptados y solicitudes pendientes
*/
export const getFriends = async (req, res) => {
  try {
    const userId = req.user.userId;

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
      },
      include: {
        user: {
          select: { id: true, username: true, avatar: true, role: true },
        },
        friend: {
          select: { id: true, username: true, avatar: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Normalizar para que siempre el "otro" sea el amigo
    const normalized = friendships.map((f) => ({
      id: f.id,
      status: f.status,
      createdAt: f.createdAt,
      isSender: f.userId === userId,
      other: f.userId === userId ? f.friend : f.user,
    }));

    return res.json({ friendships: normalized });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
