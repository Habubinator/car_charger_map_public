require("dotenv").config();
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const checkAllApi = require("./requests/requestController");
const logger = require("./logger");
const PORT = process.env.SERVER_PORT || 5000;
const router = require("./routers/router");

const app = express(); // Create an Express app

const limiter = rateLimit({
    windowMs: process.env.THROTTLING_WINDOW_IN_S * 1000,
    limit: process.env.THROTTLING_MAX_REQUESTS, // Limit each IP
    standardHeaders: "draft-7", // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
});

app.use(limiter);
app.use(express.json()); // Parse incoming requests with JSON payloads
app.use("/api", router); // Set up routes for '/api' using the Router

const start = async () => {
    try {
        // Start the server and listen on the defined port
        app.listen(PORT, () => {
            console.log("Сервер працює на порті " + PORT);
        });
        checkAllApi().then(() => setTimeout(checkAllApi, 36000000));
    } catch (error) {
        console.log(error);
        logger.ensureLogDirectoryExists();
        logger.logError(error);
    }
};

start(); // Start the server
