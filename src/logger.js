const fs = require("fs");
const path = require("path");

class Logger {
    constructor() {
        this.logDirectory = "./logs";
        this.ensureLogDirectoryExists();
    }

    ensureLogDirectoryExists() {
        if (!fs.existsSync(this.logDirectory)) {
            fs.mkdirSync(this.logDirectory);
        }
    }

    logError(error, ...loggedItems) {
        if (!loggedItems) {
            loggedItems = [];
        }
        const logFilePath = path.join(this.logDirectory, `${Date.now()}.txt`);
        let logContent = `${new Date().toISOString()} - Error:\n${
            error.stack || error
        }\n\n`;

        loggedItems.forEach((item, index) => {
            logContent += `Logged Item ${index + 1}:\n${JSON.stringify(
                item,
                null,
                2
            )}\n\n`;
        });

        fs.writeFileSync(logFilePath, logContent, { flag: "a" });
    }
}

module.exports = new Logger();
