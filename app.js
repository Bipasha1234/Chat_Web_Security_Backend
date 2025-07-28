const express = require('express');
const cookieParser =require( "cookie-parser");
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const connectDb = require('./config/db');
const CustomerRouter = require('./routes/userRoute');
const AuthRouter = require('./routes/authRoute');
const MessageRouter = require('./routes/messageRoute');
const { app, server } =require( "./config/socket");
const GroupRouter = require('./routes/groupRoute');
const TipRouter = require('./routes/paymentRoute');
const dotenv =require("dotenv");
dotenv.config();
app.use(cookieParser());
connectDb();

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


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later.',
});
app.use(limiter);


app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));
// Routes setup
app.use('/api/user', CustomerRouter);
app.use('/api/auth', AuthRouter);
app.use('/api/messages', MessageRouter);
app.use('/api/groups', GroupRouter);
app.use('/api/payments', TipRouter);

module.exports = app; 

server.listen(PORT, () => {
  console.log("server is running on PORT:" + PORT);
  
});