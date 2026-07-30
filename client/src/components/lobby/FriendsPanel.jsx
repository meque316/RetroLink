import {
    UserPlus,
    UserCheck,
    UserX,
} from "lucide-react";

export default function FriendsPanel({
    friends = [],
    onlineUsers = [],
    friendRequest,
    setFriendRequest,
    friendLoading,
    friendError,
    setFriendError,
    sendFriendRequest,
    acceptFriend,
    removeFriend,
}) {
    const pendingReceived = friends.filter(
        (f) => f.status === "pending" && !f.isSender
    );

    const pendingSent = friends.filter(
        (f) => f.status === "pending" && f.isSender
    );

    const acceptedFriends = friends.filter(
        (f) => f.status === "accepted"
    );

    return (
        <>
            <div className="mb-8">
                <h2 className="text-3xl font-semibold">Friends</h2>
                <p className="text-zinc-400 mt-1">
                    Add and manage your friends
                </p>
            </div>

            <div className="bg-[#11161d] border border-zinc-800 rounded-2xl p-5 mb-6">
                <p className="text-sm text-zinc-400 mb-3">
                    Add friend by username
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        placeholder="Username..."
                        value={friendRequest}
                        onChange={(e) => {
                            setFriendRequest(e.target.value);
                            setFriendError("");
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") sendFriendRequest();
                        }}
                        className="flex-1 bg-zinc-900 px-4 py-3 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500"
                    />

                    <button
                        onClick={sendFriendRequest}
                        disabled={friendLoading}
                        className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 text-black px-5 py-3 rounded-xl font-semibold transition disabled:opacity-50"
                    >
                        <UserPlus size={16} />
                        {friendLoading ? "Sending..." : "Add"}
                    </button>
                </div>

                {friendError && (
                    <p className="text-red-400 text-sm mt-2">
                        {friendError}
                    </p>
                )}
            </div>

            <div className="space-y-4">
                {pendingReceived.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-sm text-zinc-400 mb-3 uppercase tracking-wider">
                            Pending Requests
                        </h3>

                        <div className="space-y-3">
                            {pendingReceived.map((f) => (
                                <FriendRequestCard
                                    key={f.id}
                                    friend={f}
                                    onAccept={acceptFriend}
                                    onRemove={removeFriend}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {pendingSent.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-sm text-zinc-400 mb-3 uppercase tracking-wider">
                            Sent Requests
                        </h3>

                        <div className="space-y-3">
                            {pendingSent.map((f) => (
                                <SentRequestCard
                                    key={f.id}
                                    friend={f}
                                />
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <h3 className="text-sm text-zinc-400 mb-3 uppercase tracking-wider">
                        Friends ({acceptedFriends.length})
                    </h3>

                    {acceptedFriends.length === 0 ? (
                        <div className="bg-[#11161d] border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500">
                            No friends yet. Add someone! 👾
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {acceptedFriends.map((f) => {
                                const isOnline = onlineUsers.some(
                                    (u) => u.username === f.other.username
                                );

                                return (
                                    <FriendCard
                                        key={f.id}
                                        friend={f}
                                        isOnline={isOnline}
                                        onRemove={removeFriend}
                                    />
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

function FriendAvatar({ user, borderClass = "" }) {
    return (
        <div
            className={`w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 font-bold shrink-0 overflow-hidden ${borderClass}`}
        >
            {user?.avatar ? (
                <img
                    src={user.avatar}
                    className="w-10 h-10 rounded-full object-cover"
                    alt={user.username}
                />
            ) : (
                user?.username?.charAt(0)?.toUpperCase()
            )}
        </div>
    );
}

function FriendRequestCard({ friend, onAccept, onRemove }) {
    return (
        <div className="bg-[#11161d] border border-yellow-500/20 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <FriendAvatar user={friend.other} />

                <p className="font-medium truncate">
                    {friend.other.username}
                </p>
            </div>

            <div className="flex gap-2 w-full sm:w-auto justify-end">
                <button
                    onClick={() => onAccept(friend.id)}
                    className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-green-500/10 hover:bg-green-500/20 text-green-400 text-sm transition flex-1 sm:flex-none"
                >
                    <UserCheck size={14} />
                    Accept
                </button>

                <button
                    onClick={() => onRemove(friend.id)}
                    className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition"
                >
                    <UserX size={14} />
                </button>
            </div>
        </div>
    );
}

function SentRequestCard({ friend }) {
    return (
        <div className="bg-[#11161d] border border-zinc-800 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <FriendAvatar user={friend.other} />

                <p className="font-medium truncate">
                    {friend.other.username}
                </p>
            </div>

            <span className="text-xs text-zinc-500">
                Pending...
            </span>
        </div>
    );
}

function FriendCard({ friend, isOnline, onRemove }) {
    return (
        <div className="bg-[#11161d] border border-zinc-800 rounded-2xl px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative shrink-0">
                    <FriendAvatar user={friend.other} />

                    <div
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#11161d] ${
                            isOnline ? "bg-green-400" : "bg-zinc-600"
                        }`}
                    />
                </div>

                <div className="min-w-0">
                    <p className="font-medium truncate">
                        {friend.other.username}
                    </p>

                    <p className="text-xs text-zinc-500">
                        {isOnline ? "Online" : "Offline"}
                    </p>
                </div>
            </div>

            <button
                onClick={() => onRemove(friend.id)}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 transition"
            >
                <UserX size={14} />
            </button>
        </div>
    );
}
