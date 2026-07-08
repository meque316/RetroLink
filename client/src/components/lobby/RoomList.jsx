export default function RoomList({ rooms = [], onJoinRoom, onLeaveRoom, currentRoom }) {
    return (
        <section className="lobby-section">
            <div className="section-header">
                <h2>Salas disponibles</h2>
                <span>{rooms.length} salas</span>
            </div>

            <div className="room-list">
                {rooms.length === 0 ? (
                    <p className="empty-message">No hay salas disponibles por ahora.</p>
                ) : (
                    rooms.map((room) => {
                        const isCurrentRoom = currentRoom?.id === room.id;

                        return (
                            <div key={room.id} className="room-card">
                                <div className="room-info">
                                    <h3>{room.name}</h3>

                                    <p>
                                        {room.players?.length || 0}/{room.maxPlayers || 4} jugadores
                                    </p>

                                    {room.game && (
                                        <span className="room-game">
                                            {room.game}
                                        </span>
                                    )}
                                </div>

                                <div className="room-actions">
                                    {isCurrentRoom ? (
                                        <button
                                            className="btn btn-danger"
                                            onClick={() => onLeaveRoom(room.id)}
                                        >
                                            Salir
                                        </button>
                                    ) : (
                                        <button
                                            className="btn btn-primary"
                                            onClick={() => onJoinRoom(room.id)}
                                        >
                                            Unirse
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </section>
    );
}