function Avatar({ user, size = "md" }) {
  if (!user) return null;

  const dimensions =
    size === "md"
      ? "w-12 h-12 text-lg"
      : "w-10 h-10 text-sm";

  const isAdmin = user.role === "ADMIN";

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.username}
        className={`${dimensions} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${dimensions} rounded-full flex items-center justify-center font-bold ${
        isAdmin
          ? "bg-yellow-500/10 text-yellow-400"
          : "bg-green-500/10 text-green-400"
      }`}
    >
      {user.username?.charAt(0)?.toUpperCase()}
    </div>
  );
}

export default Avatar;
