const axios = require("axios");
const { lookUp } = require("geojson-places");
const fs = require("fs");
class Api {
    constructor() {
        this.logger = require("./../../logger");
        this.progressCounter = 0;
        this.goalCounter = 0;
        this.percentage = 0;
        this.tempPercentage = 0;
        this.apiName;
        this.lookUp = lookUp;
    }

    async get(
        link,
        isTriggered = 0,
        maxRetries = 3,
        timeout = 10000,
        instance = this
    ) {
        try {
            const result = await axios.get(link, { timeout });
            if (result.data) {
                return result.data;
            } else {
                throw new Error("Data is empty");
            }
        } catch (error) {
            if (isTriggered < maxRetries) {
                return await instance.get(
                    link,
                    ++isTriggered,
                    maxRetries,
                    timeout,
                    instance
                );
            } else {
                console.log(`Timeout for link "${link}".`);
                this.logger.logError(
                    `Failed to fetch data from link "${link}".`,
                    error
                );
            }
        }
    }

    async post(
        link,
        body = {},
        isTriggred = 0,
        maxRetries = 3,
        timeout = 10000
    ) {
        try {
            const result = await axios.post(link, body, { timeout });
            if (result.data) {
                return result.data;
            } else {
                throw new Error("Data is empty");
            }
        } catch (error) {
            if (isTriggred < maxRetries) {
                return await this.post(link, body, ++isTriggred);
            } else {
                console.log(`Timeout for link "${link}".`);
                this.logger.logError(
                    `Failed to fetch data from link "${link}".`,
                    error
                );
            }
        }
    }

    async delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    findUnixTime(date) {
        return new Date(date).getTime() / 1000;
    }

    percentageDefault(goal) {
        this.progressCounter = 0;
        this.goalCounter = 0;
        this.percentage = 0;
        this.tempPercentage = 0;
        this.goalCounter = goal;
    }

    percentageProgress() {
        this.progressCounter++;
        this.tempPercentage = Math.floor(
            (this.progressCounter / this.goalCounter) * 100
        );
        if (this.percentage != this.tempPercentage) {
            this.percentage = this.tempPercentage;
            if (this.percentage % 10 === 0 && this.percentage < 100) {
                console.log(
                    `Оновлення даних для ${this.apiName} - ${this.percentage}% [${this.progressCounter}/${this.goalCounter}]`
                );
            } else if (this.percentage >= 100) {
                console.log(`Оновлення даних для ${this.apiName} завершено`);
            }
        }
    }

    readJsonFile(filePath) {
        try {
            const fileContent = fs.readFileSync(filePath, "utf8");
            const jsonObject = JSON.parse(fileContent);
            return jsonObject;
        } catch (error) {
            console.error(`Error reading JSON file: ${error.message}`);
            return null;
        }
    }
}

module.exports = Api;
