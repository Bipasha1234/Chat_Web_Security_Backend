const https = require("https");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDb = require('./config/db');
const AuthRouter = require('./routes/authRoute');
const MessageRouter = require('./routes/messageRoute');
const GroupRouter = require('./routes/groupRoute');
const TipRouter = require('./routes/paymentRoute');
const AdminRouter = require('./routes/adminRoute');
const dotenv = require("dotenv");
const helmet = require('helmet');
const { initSocket } = require('./config/socket');

dotenv.config();

const app = express();
app.use(cookieParser());
connectDb();

const PORT = process.env.PORT;

// Middleware setup
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use(
  cors({
    origin: "https://localhost:3000",
    credentials: true,
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
});
app.use(limiter);

app.use(helmet());

// Routes setup
app.use('/api/auth', AuthRouter);
app.use('/api/messages', MessageRouter);
app.use('/api/groups', GroupRouter);
app.use('/api/payments', TipRouter);
app.use('/api', AdminRouter);

// SSL Options
const httpsOptions = {
  key: fs.readFileSync('D:/chat_app_website_backend_security/ssl/server.key'),
  cert: fs.readFileSync('D:/chat_app_website_backend_security/ssl/server.crt'),
};

const server = https.createServer(httpsOptions, app);
initSocket(server);  // Initialize socket.io on the same server

server.listen(PORT, () => {
  console.log("Server is running securely on PORT: " + PORT);
});
