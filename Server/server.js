const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();
const connectDB = require("./config/db");

const apiRoutes = require("./routes/api");
const seriesRoutes = require('./routes/seriesRoutes');
const matchRoutes = require('./routes/matchRoutes');
const teamRoutes = require('./routes/teamRoutes')
// const draftRoutes = require("./routes/draftroutes");
const liveRoutes = require('./routes/liveRoutes');
const xpressionRoutes = require("./routes/xpressionRoutes");

const { serverLogger } = require("./modules/logger");

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(cors());

// Connect to MongoDB
connectDB();

// Use API routes
app.use("/api", apiRoutes);
// app.use("/api/draft", draftRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/series', seriesRoutes);
app.use('/api/teams', teamRoutes);
app.use("/api/xpression", xpressionRoutes);

let lastRoom = null; // Store the last room value
let lastRegion = 'GLOBAL'; // Store the last region value
let lastTestMatch = false; // Store the last test match value

const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
  cors: {
    origin: "*", // Adjust in production
    methods: ["GET", "POST"],
  },
});

// Socket.IO events
io.on("connection", (socket) => {
  serverLogger.info(`User connected: ${socket.id}`);

  if (lastRoom) socket.emit('room:sync', lastRoom);
  if (lastRegion) socket.emit('region:sync', lastRegion);
  if (lastTestMatch) socket.emit('testMatch:sync', lastTestMatch);
  socket.on('init', () => {
    if (lastRoom) socket.emit('room:sync', lastRoom);
    if (lastRegion) socket.emit('region:sync', lastRegion);
    if (lastTestMatch) socket.emit('testMatch:sync', lastTestMatch);
  })

  socket.on('room:update', (val) => {
    if (JSON.stringify(val) !== JSON.stringify(lastRoom)) return;

    serverLogger.info(`Room updated: ${JSON.stringify(val)}`);

    lastRoom = val;
    io.emit('room:sync', val);
  })

  socket.on('region:update', (val) => {
    if (JSON.stringify(val) !== JSON.stringify(lastRegion)) return;

    serverLogger.info(`Region updated: ${JSON.stringify(val)}`);

    lastRegion = val;
    io.emit('region:sync', val);
  })

  socket.on('testMatch:update', (val) => {
    if (JSON.stringify(val) !== JSON.stringify(lastTestMatch)) return;

    serverLogger.info(`Test match updated: ${JSON.stringify(val)}`);

    lastTestMatch = val;
    io.emit('testMatch:sync', val);
  })

  socket.on("disconnect", () => {
    serverLogger.info(`Disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 9009;
server.listen(PORT, () => 
  serverLogger.warn(`🚀 Server running on port ${PORT}`)
);
