const { Server } = require("socket.io");

const userSocketMap = {};

function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: ["https://localhost:3000"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    // console.log("A user connected", socket.id);

    const userId = socket.handshake.query.userId;
    if (userId) userSocketMap[userId] = socket.id;

    io.emit("getOnlineUsers", Object.keys(userSocketMap));

    socket.on("disconnect", () => {
      // console.log("A user disconnected", socket.id);
      delete userSocketMap[userId];
      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    });
  });

  return io;
}

module.exports = { initSocket, getReceiverSocketId };
