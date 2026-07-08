import { useState } from "react";

const API_URL = "https://retrolink-server.onrender.com";

const CLOUDINARY_CLOUD_NAME = "davmgvs7u";
const CLOUDINARY_UPLOAD_PRESET = "retrolink_avatars";

export default function useAvatar(currentUser, setCurrentUser) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const MAX_SIZE_MB = 5;

    if (!file.type.startsWith("image/")) {
      alert("El archivo debe ser una imagen");
      return;
    }

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`La imagen no puede superar los ${MAX_SIZE_MB}MB`);
      return;
    }

    setUploadingAvatar(true);

    try {
      const formData = new FormData();

      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

      const cloudRes = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const cloudData = await cloudRes.json();

      if (!cloudRes.ok || !cloudData.secure_url) {
        throw new Error("Cloudinary upload failed");
      }

      const avatarUrl = cloudData.secure_url;
      const token = localStorage.getItem("token");

      await fetch(`${API_URL}/api/user/avatar`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ avatarUrl }),
      });

      const updatedUser = {
        ...currentUser,
        avatar: avatarUrl,
      };

      localStorage.setItem("user", JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
    } catch (error) {
      console.error("Error uploading avatar:", error);
      alert("Error al subir el avatar");
    } finally {
      setUploadingAvatar(false);
    }
  };

  return {
    uploadingAvatar,
    handleAvatarUpload,
  };
}