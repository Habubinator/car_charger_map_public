// IMPORTANT! Якщо змінюєте (видаляєте звістно) якесь апі з бд, тоді, будь-ласка, зробіть це й тут
const apisControllers = [
    require("./apis/api1.js"),
    require("./apis/api2.js"),
    require("./apis/api3.js"),
    require("./apis/api4.js"),
    require("./apis/api7.js"),
    require("./apis/api8.js"),
    require("./apis/api9.js"),
    require("./apis/api11.js"),
    require("./apis/api12.js"),
    require("./apis/api26.js"),
];
const database = require("./../database/dbController.js");
const logger = require("./../logger");

async function checkAllApi() {
    try {
        let apis = await database.getApi();
        if (apis) {
            const executePromises = [];

            for (const api of apis) {
                if (true) {
                    // api["next_update"] < Date.now()
                    let executePromise =
                        apisControllers[api["api_id"] - 1].execute(api);
                    executePromises.push(executePromise);
                }
            }
            Promise.all(executePromises);
        } else {
            throw new Error("Could not start search");
        }
    } catch (error) {
        console.log(error);
        logger.ensureLogDirectoryExists();
        logger.logError(error);
    }
}

module.exports = checkAllApi;
