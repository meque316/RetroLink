import { Send, Smile } from "lucide-react";

const EMOTES = [
  {
    category: "Gestos",
    emotes: ["👋", "👍", "👎", "👏", "🤝", "✌️", "🤙", "💪", "🫡", "🙏"],
  },
  {
    category: "Caras",
    emotes: ["😀", "😂", "😎", "😤", "😡", "😱", "🤯", "😴", "🤔", "😏"],
  },
  {
    category: "Juegos",
    emotes: ["🎮", "🕹️", "🏆", "⚔️", "🛡️", "💣", "🔫", "🎯", "👾", "🤖"],
  },
  {
    category: "Fuego",
    emotes: ["🔥", "💥", "⚡", "❄️", "☠️", "💀", "🩸", "👻", "🌪️", "💫"],
  },
  {
    category: "Misc",
    emotes: ["✅", "❌", "⏳", "🚀", "💯", "🐐", "🫠", "💤", "🎉", "👀"],
  },
];

function RoomChat({
  messages = [],
  currentUser,
  chatInput,
  setChatInput,
  showEmotes,
  setShowEmotes,
  emoteCategory,
  setEmoteCategory,
  sendMessage,
  insertEmote,
  chatEndRef,
}) {
  const renderMessage = (msg, index) => {
    if (msg.isSystem) {
      return (
        <div key={index} className="flex justify-center">
          <div className="text-xs text-zinc-500 bg-zinc-800/50 px-3 py-1 rounded-full">
            {msg.message}
          </div>
        </div>
      );
    }

    const isMe = msg.username === currentUser.username;

    return (
      <div
        key={index}
        className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
      >
        {!isMe && (
          <span className="text-xs text-zinc-500 mb-1 px-1">
            {msg.username}
          </span>
        )}

        <div
          className={`px-3 py-2 rounded-2xl text-sm max-w-[90%] break-words ${
            isMe
              ? "bg-green-500/20 text-green-100 rounded-br-sm"
              : "bg-zinc-800 text-white rounded-bl-sm"
          }`}
        >
          {msg.message}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full lg:w-80 bg-[#121821] rounded-3xl border border-zinc-800 flex flex-col h-[300px] lg:h-auto lg:max-h-[90vh]">
      <div className="p-4 border-b border-zinc-800">
        <h3 className="font-semibold">Room Chat</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 ? (
          <p className="text-zinc-600 text-sm text-center mt-4">
            No messages yet 👾
          </p>
        ) : (
          messages.map((msg, index) => renderMessage(msg, index))
        )}

        <div ref={chatEndRef} />
      </div>

      {showEmotes && (
        <div className="border-t border-zinc-800 bg-[#0d1117] p-2">
          <div className="flex gap-1 mb-2 overflow-x-auto">
            {EMOTES.map((cat, i) => (
              <button
                key={cat.category}
                onClick={() => setEmoteCategory(i)}
                className={`text-xs px-2 py-1 rounded-lg whitespace-nowrap transition ${
                  emoteCategory === i
                    ? "bg-green-500/20 text-green-400"
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                {cat.category}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-5 gap-1">
            {EMOTES[emoteCategory].emotes.map((emote, i) => (
              <button
                key={`${emote}-${i}`}
                onClick={() => insertEmote(emote)}
                className="text-lg hover:bg-zinc-700 rounded-lg p-1 transition"
              >
                {emote}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 border-t border-zinc-800">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setShowEmotes(!showEmotes)}
            className={`p-2 rounded-xl transition ${
              showEmotes
                ? "bg-green-500/20 text-green-400"
                : "text-zinc-500 hover:text-white hover:bg-zinc-800"
            }`}
          >
            <Smile size={18} />
          </button>

          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage();
            }}
            placeholder="Message..."
            className="flex-1 bg-zinc-900 px-3 py-2 rounded-xl text-sm text-white placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-green-500 min-w-0"
          />

          <button
            onClick={sendMessage}
            className="p-2 rounded-xl bg-green-500 hover:bg-green-400 text-black transition shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default RoomChat;