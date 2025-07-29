const https = require("https");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const csrf = require("csurf");
const dotenv = require("dotenv");
const helmet = require("helmet");
const connectDb = require("./config/db");
const { initSocket } = require("./config/socket");

const AuthRouter = require("./routes/authRoute");
const MessageRouter = require("./routes/messageRoute");
const GroupRouter = require("./routes/groupRoute");
const TipRouter = require("./routes/paymentRoute");
const AdminRouter = require("./routes/adminRoute");

dotenv.config();

const app = express();
connectDb();

// Middleware setup
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use(
  cors({
    origin: "https://localhost:3000", // React frontend
    credentials: true,
  })
);

app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later.",
});
app.use(limiter);

// CSRF protection middleware — using cookies
const csrfProtection = csrf({ cookie: true });
app.use(csrfProtection);

// Route to send CSRF token to frontend
app.get("/api/csrf-token", (req, res) => {
  res.status(200).json({ csrfToken: req.csrfToken() });
});

// API routes
app.use("/api/auth", AuthRouter);
app.use("/api/messages", MessageRouter);
app.use("/api/groups", GroupRouter);
app.use("/api/payments", TipRouter);
app.use("/api", AdminRouter);

// SSL certificate
const httpsOptions = {
  key: fs.readFileSync("D:/chat_app_website_backend_security/ssl/server.key"),
  cert: fs.readFileSync("D:/chat_app_website_backend_security/ssl/server.crt"),
};

// Start HTTPS server with socket.io
const server = https.createServer(httpsOptions, app);
initSocket(server);

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log("Server is running securely on PORT: " + PORT);
});
