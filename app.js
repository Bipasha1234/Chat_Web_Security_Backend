const express = require('express');
const cookieParser =require( "cookie-parser");
const cors = require('cors');
const path = require('path');
const connectDb = require('./config/db');
const CustomerRouter = require('./routes/userRoute');
const AuthRouter = require('./routes/authRoute');
const MessageRouter = require('./routes/messageRoute');
const { app, server } =require( "./config/socket");
const dotenv =require("dotenv");
dotenv.config();
app.use(cookieParser());
connectDb();

// Create HTTP server for WebSocket connection
// const server = http.createServer(app);

// // Initialize socket.io with CORS handling
// const io = socketIo(server, {
//   cors: {
//     origin: "http://localhost:5173", // Adjust this URL for production
//     methods: ["GET", "POST"],
//     credentials: true,
//   },
// });

// io.on('connection', (socket) => {
//   console.log('A user connected:', socket.id);

//   // Handle socket events here
//   socket.on('disconnect', () => {
//     console.log('User disconnected');
//   });
// });

const PORT = process.env.PORT;

// Middleware setup
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
// Routes setup
app.use('/api/user', CustomerRouter);
app.use('/api/auth', AuthRouter);
app.use('/api/messages', MessageRouter);


// Start the server
// const port = 3000;
// server.listen(port, () => {
//   console.log(`Server running at http://localhost:${port}`);
// });



module.exports = app; 

server.listen(PORT, () => {
  console.log("server is running on PORT:" + PORT);
  
});