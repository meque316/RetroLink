import { useState } from "react";

const API_URL = "https://retrolink-server.onrender.com";

export default function useFriends() {
  const [friends, setFriends] = useState([]);
  const [friendRequest, setFriendRequest] = useState("");
  const [friendLoading, setFriendLoading] = useState(false);
  const [friendError, setFriendError] = useState("");

  const fetchFriends = async () => {
    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_URL}/api/friends`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      setFriends(data.friendships || []);
    } catch (error) {
      console.error("Error fetching friends:", error);
    }
  };

  const sendFriendRequest = async () => {
    if (!friendRequest.trim()) return;

    setFriendLoading(true);
    setFriendError("");

    const token = localStorage.getItem("token");

    try {
      const res = await fetch(`${API_URL}/api/friends/request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: friendRequest.trim() }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setFriendError(data.message || "Error al enviar la solicitud");
        return;
      }

      setFriendRequest("");
      fetchFriends();
    } catch {
      setFriendError("Connection error");
    } finally {
      setFriendLoading(false);
    }
  };

  const acceptFriend = async (friendshipId) => {
    const token = localStorage.getItem("token");

    try {
      await fetch(`${API_URL}/api/friends/accept/${friendshipId}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });

      fetchFriends();
    } catch (error) {
      console.error("Error accepting friend:", error);
    }
  };

  const removeFriend = async (friendshipId) => {
    const token = localStorage.getItem("token");

    try {
      await fetch(`${API_URL}/api/friends/${friendshipId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      fetchFriends();
    } catch (error) {
      console.error("Error removing friend:", error);
    }
  };

  return {
    friends,
    friendRequest,
    setFriendRequest,
    friendLoading,
    friendError,
    setFriendError,
    fetchFriends,
    sendFriendRequest,
    acceptFriend,
    removeFriend,
  };
}