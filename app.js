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
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

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
// Middleware to sanitize data
app.use(mongoSanitize());

app.use(xss());   // Apply xss-clean middleware

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

app.post('/refresh-token', async (req, res) => {
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) return res.status(401).json({ message: 'No refresh token' });

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    // Find user and check if refreshToken exists in DB
    const user = await Credential.findById(decoded.userId);
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      return res.status(403).json({ message: 'Refresh token invalid or revoked' });
    }

    // Generate new access token
    const newAccessToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.cookie('accessToken', newAccessToken, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 3600000 });

    res.json({ accessToken: newAccessToken });
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired refresh token' });
  }
});




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
