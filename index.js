const path = require("path");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const formatMessage = require("./utils/messages");
const redis = require("redis");
//const { createAdapter } = require("@socket.io/redis-adapter");
const createAdapter = require("@socket.io/redis-adapter").createAdapter;
require("dotenv").config();
const { createClient } = redis;
const app = express();
const server = http.createServer(app);
const io = socketio(server);
const {
    userJoin,
    getCurrentUser,
    userLeave,
    getRoomUsers,
} = require("./utils/users");

// Set static folder
app.use(express.static(path.join(__dirname, "public")));

const botName = "ChatCord Bot";

const redisClientOptions = {
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT)
    }
};

(async () => {
    const pubClient = redis.createClient(redisClientOptions);
    pubClient.on('error', (err) => console.error('Redis PubClient Error', err));
    await pubClient.connect();

    const subClient = pubClient.duplicate();
    subClient.on('error', (err) => console.error('Redis SubClient Error', err));
    await subClient.connect();

    io.adapter(createAdapter(pubClient, subClient));
})();


// Run when client connects
io.on("connection", (socket) => {
    console.log(io.of("/").adapter);
    socket.on("joinRoom", ({ username, room }) => {
        const user = userJoin(socket.id, username, room);

        socket.join(user.room);

        // Welcome current user
        socket.emit("message", formatMessage(botName, "Welcome to ChatCord!"));

        // Broadcast when a user connects
        socket.broadcast
            .to(user.room)
            .emit(
                "message",
                formatMessage(botName, `${user.username} has joined the chat`)
            );

        // Send users and room info
        io.to(user.room).emit("roomUsers", {
            room: user.room,
            users: getRoomUsers(user.room),
        });
    });

    // Listen for chatMessage
    socket.on("chatMessage", (msg) => {
        const user = getCurrentUser(socket.id);

        io.to(user.room).emit("message", formatMessage(user.username, msg));
    });

    // Runs when client disconnects
    socket.on("disconnect", () => {
        const user = userLeave(socket.id);

        if (user) {
            io.to(user.room).emit(
                "message",
                formatMessage(botName, `${user.username} has left the chat`)
            );

            // Send users and room info
            io.to(user.room).emit("roomUsers", {
                room: user.room,
                users: getRoomUsers(user.room),
            });
        }
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

