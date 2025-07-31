const { Server } = require("socket.io");

const userSocketMap = {};
let ioInstance = null; // <-- holds the global io reference

function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: ["https://localhost:4000"],
      credentials: true,
    },
  });

  ioInstance = io; // save for use in other files

  io.on("connection", (socket) => {
    const userId = socket.handshake.query.userId;
    if (userId) {
      userSocketMap[userId] = socket.id;
    }

    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    socket.on("disconnect", () => {
      delete userSocketMap[userId];
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
  });

  return io;
}

// Export this to access the `io` instance anywhere
function getIO() {
  return ioInstance;
}

module.exports = {
  initSocket,
  getReceiverSocketId,
  getIO,
};
