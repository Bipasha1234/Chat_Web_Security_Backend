const { Server } = require("socket.io");
const https = require("https");
const fs = require("fs");
const express = require("express");

const app = express();

const httpsOptions = {
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert'),
};

const server = https.createServer(httpsOptions, app);

const io = new Server(server, {
  cors: {
    origin: ["https://localhost:3000"],
    credentials: true,
  },
});

const userSocketMap = {};

function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  const userId = socket.handshake.query.userId;
  if (userId) userSocketMap[userId] = socket.id;

  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

module.exports = { app, io, server, getReceiverSocketId };
