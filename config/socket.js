const { Server } = require("socket.io");
const https = require("https");
const fs = require("fs");
const express = require("express");

const app = express();

// Load SSL certificate
const privateKey = fs.readFileSync("D:/chat_app_website_security_frontend/react.key", "utf8");
const certificate = fs.readFileSync("D:/chat_app_website_security_frontend/react.crt", "utf8");
const credentials = { key: privateKey, cert: certificate };

// Create HTTPS server
const server = https.createServer(credentials, app);

// Socket setup
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
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

module.exports = { app, io, server, getReceiverSocketId };
