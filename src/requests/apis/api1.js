const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");
const WebSocketClient = require("./../ws");
class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API1 TOU";
        this.pk;
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);

            // Якщо будуть помилки з ws, тоді обов'язково поставити заглушку та пофіксити
            // let allStations = await this.readJsonFile("src/database/api1.json");

            const wsClient = new WebSocketClient(api["link"]);
            let allStations = await wsClient.getAPI1();
            this.percentageDefault(allStations.length);

            for (const station of allStations) {
                this.executeOne(station, api);
                await this.delay(process.env.UPDATE_PING_INTERVAL_MS);
            }

            database.updateApi(api["api_id"], api["update_interval_ms"]);
        } catch (error) {
            console.log(error);
            this.logger.ensureLogDirectoryExists();
            this.logger.logError(error);
        }
    }

    async executeOne(station, api) {
        try {
            this.percentageProgress();
            let marker = await database.getMarkerByPK(
                api["api_id"],
                station["locationId"]
            );
            let cords = {
                lon: station["longitude"],
                lat: station["latitude"],
            };
            if (marker) {
                if (marker.length > 0) {
                    await this.updateElement(
                        api,
                        station,
                        marker[0]["description_id"],
                        cords
                    );
                    return;
                }
            }
            await this.createElement(api, cords, station);
            return;
        } catch (error) {
            console.log(error);
            this.logger.ensureLogDirectoryExists();
            this.logger.logError(error, station, api);
        }
    }

    async createElement(api, cords, station) {
        let detailed_link = api["detailed_link"].replace(
            "{id}",
            station["locationId"]
        );
        let comments_link = api["comments_link"].replace(
            "{id}",
            station["locationId"]
        );

        let detailedStation = await this.get(detailed_link);
        let comments = await this.get(comments_link);
        this.pk = station["locationId"];
        if (!detailedStation) {
            return;
        }

        let station_marker_id = await this.addStationMarker(
            cords["lon"],
            cords["lat"]
        );

        if (!station_marker_id) {
            throw new Error("Could not create marker");
        }

        let station_description = await this.addStationDescription(
            station_marker_id,
            detailedStation,
            cords
        );

        if (!station_description) {
            throw new Error("Could not create marker description");
        }

        database.addPKStationDescApi(
            api["api_id"],
            station_description["description_id"],
            this.pk
        );

        this.addStationConnectors(
            station_description,
            detailedStation["chargers"]
        );

        this.addPhotos(
            station_description["description_id"],
            detailedStation["photo"]
        );

        this.addComments(
            station_description["description_id"],
            comments["data"]["comments"]
        );
    }

    async updateElement(api, station, description_id, cords) {
        let detailed_link;
        let comments_link;
        if (typeof station === "number") {
            detailed_link = api["detailed_link"].replace("{id}", station);
            comments_link = api["comments_link"].replace("{id}", station);
        } else {
            detailed_link = api["detailed_link"].replace(
                "{id}",
                station["locationId"]
            );
            comments_link = api["comments_link"].replace(
                "{id}",
                station["locationId"]
            );
        }

        let detailedStation = await this.get(detailed_link);
        let comments = await this.get(comments_link);

        if (!detailedStation) {
            return;
        }

        let station_description = await this.updateStationDescription(
            description_id,
            detailedStation,
            cords
        );

        if (!station_description) {
            return;
        }

        this.updateStationConnectors(
            station_description,
            detailedStation["chargers"]
        );

        this.updatePhotos(
            station_description["description_id"],
            detailedStation["photo"]
        );

        this.updateComments(
            station_description["description_id"],
            comments["data"]["comments"]
        );
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        const powerDesc = this.findMinMaxPowerDesc(detailedStation["chargers"]);
        const connectorsArray = detailedStation.chargers
            ? detailedStation.chargers.reduce((acc, charger) => {
                  if (charger.connectors && Array.isArray(charger.connectors)) {
                      acc.push(...charger.connectors);
                  }
                  return acc;
              }, [])
            : [];
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["title"],
            detailedStation["additional_info"],
            detailedStation["categories"]
                ? detailedStation["categories"][0]
                : "NULL",
            countryData ? countryData["country_a2"] : null,
            detailedStation["location_phone"],
            detailedStation["specialRequestReception"],
            detailedStation["mcReservation"],
            detailedStation["address"],
            "NULL",
            "NULL",
            detailedStation["chargers"]
                ? detailedStation.chargers.some((charger) =>
                      charger.activationTypes.includes("FAST_TRACK")
                  )
                : "NULL",
            detailedStation.working_hours.every(
                (day) => day.openTime === 0 && day.closeTime === 86400
            ),
            powerDesc.minPowerDesc,
            powerDesc.maxPowerDesc,
            Date.now(),
            5,
            this.checkStationStatus(detailedStation["status"]),
            this.getFlags(connectorsArray)
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        const powerDesc = this.findMinMaxPowerDesc(detailedStation["chargers"]);
        const connectorsArray = detailedStation.chargers
            ? detailedStation.chargers.reduce((acc, charger) => {
                  if (charger.connectors && Array.isArray(charger.connectors)) {
                      acc.push(...charger.connectors);
                  }
                  return acc;
              }, [])
            : [];
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["title"] ? detailedStation["title"] : null,
            detailedStation["additional_info"],
            detailedStation["categories"]
                ? detailedStation["categories"][0]
                : "NULL",
            countryData ? countryData["country_a2"] : null,
            detailedStation["location_phone"],
            detailedStation["specialRequestReception"],
            detailedStation["mcReservation"],
            detailedStation["address"],
            "NULL",
            "NULL",
            detailedStation["chargers"]
                ? detailedStation.chargers.some((charger) =>
                      charger.activationTypes.includes("FAST_TRACK")
                  )
                : "NULL",
            detailedStation.working_hours.every(
                (day) => day.openTime === 0 && day.closeTime === 86400
            ),
            powerDesc.minPowerDesc,
            powerDesc.maxPowerDesc,
            Date.now(),
            5,
            this.checkStationStatus(detailedStation["status"]),
            this.getFlags(connectorsArray)
        );
        return await database.getStationDescByID(station_marker_id);
    }

    async addStationConnectors(station_description, connectors) {
        for (const connectorObj of connectors) {
            await this.addOneStationConnector(
                station_description,
                connectorObj
            );
        }
    }

    async addOneStationConnector(station_description, connectorObj) {
        await database.addStationConnector(
            station_description["description_id"],
            this.getTypePosition(connectorObj["connectors"][0]),
            this.checkStationStatus(connectorObj["status"]),
            "NULL",
            connectorObj["power_desc"] ? connectorObj["power_desc"] : "NULL",
            "NULL",
            0,
            connectorObj["tariffs"]
                ? connectorObj["tariffs"][0]["charge_cost"]
                : "NULL",
            connectorObj["tariffs"]
                ? connectorObj["tariffs"][0]["currency"]["name"]
                : "NULL",
            0,
            connectorObj["tariffs"]
                ? connectorObj["tariffs"][0]["downtime_cost"]
                : "NULL"
        );
    }

    async updateStationConnectors(station_description, connectors) {
        if (!connectors) {
            return;
        }

        const existingConnectors = await database.getConnectors(
            station_description["description_id"]
        );

        const connectorTypesInApi = connectors.map((connectorObj) =>
            this.getTypePosition(connectorObj["connectors"][0])
        );

        for (const existingConnector of existingConnectors) {
            const connectorTypeId = existingConnector.connector_type_id;
            if (!connectorTypesInApi.includes(connectorTypeId)) {
                database.deleteConnector(existingConnector["connector_id"]);
            }
        }

        const connectorOccurrences = {};

        for (const connectorObj of connectors) {
            const connectorTypeId = this.getTypePosition(
                connectorObj["connectors"][0]
            );

            const existingConnectorsOfType = existingConnectors.filter(
                (connector) => connector.connector_type_id === connectorTypeId
            );

            let connectorToUpdate;

            if (existingConnectorsOfType.length > 0) {
                const occurrences = connectorOccurrences[connectorTypeId] || 0;
                connectorToUpdate =
                    existingConnectorsOfType[
                        occurrences % existingConnectorsOfType.length
                    ];
                connectorOccurrences[connectorTypeId] = occurrences + 1;
            } else {
                await this.addOneStationConnector(
                    station_description,
                    connectorObj
                );
                continue;
            }

            await database.updateConnector(
                connectorToUpdate["connector_id"],
                this.getTypePosition(connectorObj["connectors"][0]),
                this.checkStationStatus(connectorObj["status"]),
                "NULL",
                connectorObj["power_desc"]
                    ? connectorObj["power_desc"]
                    : "NULL",
                "NULL",
                0,
                connectorObj["tariffs"]
                    ? connectorObj["tariffs"][0]["charge_cost"]
                    : "NULL",
                connectorObj["tariffs"]
                    ? connectorObj["tariffs"][0]["currency"]["name"]
                    : "NULL",
                0,
                connectorObj["tariffs"]
                    ? connectorObj["tariffs"][0]["downtime_cost"]
                    : "NULL"
            );
        }
    }

    async addPhotos(descriptionId, photoArray) {
        for (const photo of photoArray) {
            await database.addImage(descriptionId, photo);
        }
    }

    async addComments(descriptionId, commentArray) {
        for (const comment of commentArray) {
            let data = comment["comment"];
            await database.addComment(
                descriptionId,
                "NULL",
                data["user_name"],
                data["rating"],
                data["description"]
            );
        }
    }

    async updatePhotos(descriptionId, photoArray) {
        const existPhotos = await database.getImagesByDescriptionId(
            descriptionId
        );

        for (const photo of photoArray) {
            let isPhotoExists = existPhotos.some(
                (existingPhoto) => existingPhoto.image_href === photo
            );
            if (!isPhotoExists) {
                await database.addImage(descriptionId, photo);
            }
        }
    }

    async updateComments(descriptionId, commentArray) {
        const existComments = await database.getCommentsByDescriptionId(
            descriptionId
        );

        for (const comment of commentArray) {
            let data = comment["comment"];
            let isCommentExist = existComments.some(
                (existingComment) =>
                    existingComment.comment_text === data["description"]
            );
            if (!isCommentExist) {
                await database.addComment(
                    descriptionId,
                    "NULL",
                    data["user_name"],
                    data["rating"],
                    data["description"]
                );
            }
        }
    }

    checkStationStatus(statusId) {
        switch (statusId) {
            case 1:
            case 2:
            case 3:
                return 0;
            default:
                return 4;
        }
    }

    //plugType = { "GBT DC": 34, "CCS 1": 5, "CCS 2": 6,
    //"Chademo": 16, "Type 2 socket": 2, "Type 2 plug": 18,
    //"Type 1": 19, "GBT AC": 33, "NACS": 14,}
    /*
            34: 2,
            5: 1,
            6: 0,
            16: 3,
            22: 4,
            18: 5,
            19: 6,
            33: 7,
            14: 8,
            2: 5,
            4: 3, 
            */
    getTypePosition(type) {
        const positionMap = {
            // "GBT DC": 34,
            34: 2,
            // "CCS 1": 5,
            5: 1,
            // "CCS 2": 6,
            6: 0,
            // "Chademo": 16,
            16: 3,
            // "Type 2 plug": 18,
            18: 4,
            // "Type 1": 19,
            19: 6,
            // "GBT AC": 33,
            33: 7,
            // "NACS": 14,
            14: 8,
            // "Type 2 socket": 2,
            2: 5,
            // "Chademo"
            4: 3,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            // "GBT DC": 34,
            34: 2,
            // "CCS 1": 5,
            5: 1,
            // "CCS 2": 6,
            6: 0,
            // "Chademo": 16,
            16: 3,
            // "Type 2 plug": 18,
            18: 4,
            // "Type 1": 19,
            19: 6,
            // "GBT AC": 33,
            33: 7,
            // "NACS": 14,
            14: 8,
            // "Type 2 socket": 2,
            2: 5,
            // "Chademo"
            4: 3,
        };
        const types = new Map();

        for (const connectorTypeNumber of connectorsArr) {
            if (positionMap[connectorTypeNumber] !== undefined) {
                types.set(
                    database.VALUES.CONNECTOR[positionMap[connectorTypeNumber]],
                    null
                );
            } else {
                console.log(
                    `At ${this.apiName}: Cant find a connector type of ${connectorTypeNumber}`
                );
                this.logger.ensureLogDirectoryExists();
                this.logger.logError(
                    `At ${this.apiName}: Cant find a connector type of ${connectorTypeNumber}`
                );
            }
        }

        return [...types.keys()];
    }

    getFlags(connectorsArr) {
        return database.toBinary(
            database.combine(this.findConnectorType(connectorsArr))
        );
    }

    findMinMaxPowerDesc(chargers) {
        if (!chargers || !Array.isArray(chargers) || chargers.length === 0) {
            return { minPowerDesc: 0, maxPowerDesc: 0 };
        }

        const powerDescs = chargers.map((charger) => charger.power_desc || 0);

        const minPowerDesc = powerDescs.reduce(
            (min, curr) => Math.min(min, curr),
            Infinity
        );
        const maxPowerDesc = powerDescs.reduce(
            (max, curr) => Math.max(max, curr),
            -Infinity
        );

        return { minPowerDesc, maxPowerDesc };
    }
}

module.exports = new Api();
