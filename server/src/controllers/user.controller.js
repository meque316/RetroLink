import prisma from "../prisma.js";

/*
UPDATE AVATAR
*/
export const updateAvatar = async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    const userId = req.user.userId;

    if (!avatarUrl) {
      return res.status(400).json({ message: "Avatar URL requerida" });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatar: avatarUrl },
    });

    return res.json({
      message: "Avatar actualizado",
      avatar: user.avatar,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};
