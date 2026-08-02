import { useState } from "react";

import {
  authFetch,
  getStoredToken,
} from "../utils/auth";

const API_URL =
  "https://retrolink-server.onrender.com";

export default function useFriends() {
  const [friends, setFriends] =
    useState([]);

  const [
    friendRequest,
    setFriendRequest,
  ] = useState("");

  const [
    friendLoading,
    setFriendLoading,
  ] = useState(false);

  const [
    friendError,
    setFriendError,
  ] = useState("");

  const fetchFriends = async () => {
    /*
     * No hacemos la petición si todavía no existe
     * una sesión. Esto evita un 401 innecesario al
     * montar componentes antes de iniciar sesión.
     */
    if (!getStoredToken()) {
      setFriends([]);
      return;
    }

    try {
      const response = await authFetch(
        `${API_URL}/api/friends`
      );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data =
        await response.json();

      setFriends(
        data.friendships || []
      );
    } catch (error) {
      if (
        error.message ===
        "SESSION_EXPIRED"
      ) {
        return;
      }

      console.error(
        "[Friends] Error obteniendo amigos:",
        error
      );
    }
  };

  const sendFriendRequest =
    async () => {
      const username =
        friendRequest.trim();

      if (!username) {
        return;
      }

      setFriendLoading(true);
      setFriendError("");

      try {
        const response =
          await authFetch(
            `${API_URL}/api/friends/request`,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body: JSON.stringify({
                username,
              }),
            }
          );

        const data =
          await response
            .json()
            .catch(() => ({}));

        if (!response.ok) {
          setFriendError(
            data.message ||
              "No se pudo enviar la solicitud."
          );

          return;
        }

        setFriendRequest("");

        await fetchFriends();
      } catch (error) {
        if (
          error.message ===
          "SESSION_EXPIRED"
        ) {
          return;
        }

        console.error(
          "[Friends] Error enviando solicitud:",
          error
        );

        setFriendError(
          "Error de conexión con el servidor."
        );
      } finally {
        setFriendLoading(false);
      }
    };

  const acceptFriend = async (
    friendshipId
  ) => {
    try {
      const response =
        await authFetch(
          `${API_URL}/api/friends/accept/${friendshipId}`,
          {
            method: "PUT",
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      await fetchFriends();
    } catch (error) {
      if (
        error.message ===
        "SESSION_EXPIRED"
      ) {
        return;
      }

      console.error(
        "[Friends] Error aceptando amistad:",
        error
      );
    }
  };

  const removeFriend = async (
    friendshipId
  ) => {
    try {
      const response =
        await authFetch(
          `${API_URL}/api/friends/${friendshipId}`,
          {
            method: "DELETE",
          }
        );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      await fetchFriends();
    } catch (error) {
      if (
        error.message ===
        "SESSION_EXPIRED"
      ) {
        return;
      }

      console.error(
        "[Friends] Error eliminando amistad:",
        error
      );
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