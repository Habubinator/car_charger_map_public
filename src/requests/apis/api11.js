const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API11 (greenway польща)";
        this.pk;
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);

            let allStations = await this.get(api["link"]);
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
                station["location_id"]
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
            station["location_id"]
        );

        let detailedStation = await this.get(detailed_link);
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
            station["location_id"]
        );

        this.addStationConnectors(
            station_description,
            this.createConnectorArray(detailedStation["devices"])
        );

        this.addPhotos(
            station_description["description_id"],
            detailedStation["photos"].map((photo) => photo.path)
        );
    }

    async updateElement(api, station, description_id, cords) {
        let detailed_link;
        if (typeof station === "number") {
            detailed_link = api["detailed_link"].replace("{id}", station);
        } else {
            detailed_link = api["detailed_link"].replace(
                "{id}",
                station["location_id"]
            );
        }

        let detailedStation = await this.get(detailed_link);

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
            this.createConnectorArray(detailedStation["devices"])
        );

        this.updatePhotos(
            station_description["description_id"],
            detailedStation["photos"].map((photo) => photo.path)
        );
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectorsTypes, minMaxPower, maxMaxPower } =
            this.analyzeConnectors(detailedStation["devices"]);
        let address = `${detailedStation["city"]} ${detailedStation["street"]} ${detailedStation["house_number"]}`;
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["access_instructions"],
            "NULL",
            countryData ? countryData["country_a2"] : "PL",
            "NULL",
            "NULL",
            false,
            address,
            "NULL",
            "NULL",
            "NULL",
            detailedStation["twenty_four_seven"] != null
                ? detailedStation["twenty_four_seven"]
                : detailedStation["opening_hours"].every(
                      (slot) => slot.is_open === true
                  ),
            minMaxPower,
            maxMaxPower,
            Date.now(),
            5,
            this.getStationStatus(detailedStation["availability"]),
            this.getFlags(connectorsTypes)
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectorsTypes, minMaxPower, maxMaxPower } =
            this.analyzeConnectors(detailedStation["devices"]);
        let address = `${detailedStation["city"]} ${detailedStation["street"]} ${detailedStation["house_number"]}`;
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["access_instructions"],
            "NULL",
            countryData ? countryData["country_a2"] : "PL",
            "NULL",
            "NULL",
            false,
            address,
            "NULL",
            "NULL",
            "NULL",
            detailedStation["twenty_four_seven"] != null
                ? detailedStation["twenty_four_seven"]
                : detailedStation["opening_hours"].every(
                      (slot) => slot.is_open === true
                  ),
            minMaxPower,
            maxMaxPower,
            Date.now(),
            5,
            this.getStationStatus(detailedStation["availability"]),
            this.getFlags(connectorsTypes)
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
            this.getTypePosition(connectorObj["type"]),
            this.checkConnectorStatus(connectorObj["status"]),
            connectorObj["code"],
            connectorObj["max_power"] ? connectorObj["max_power"] : "NULL",
            connectorObj["max_current"] ? connectorObj["max_current"] : "NULL",
            0,
            connectorObj["price"]
                ? connectorObj["price"]["priceKwh_float"]
                : "NULL",
            connectorObj["price"] ? connectorObj["price"]["currency"] : "NULL",
            connectorObj["price"]
                ? connectorObj["price"]["postponeMinutes"]
                : 0,
            connectorObj["price"]
                ? connectorObj["price"]["priceMinute_float"]
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
            this.getTypePosition(connectorObj["type"])
        );

        for (const existingConnector of existingConnectors) {
            const connectorTypeId = existingConnector.connector_type_id;
            if (!connectorTypesInApi.includes(connectorTypeId)) {
                database.deleteConnector(existingConnector["connector_id"]);
            }
        }

        const connectorOccurrences = {};

        for (const connectorObj of connectors) {
            const connectorTypeId = this.getTypePosition(connectorObj["type"]);

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
                this.getTypePosition(connectorObj["type"]),
                this.checkConnectorStatus(connectorObj["status"]),
                connectorObj["code"],
                connectorObj["max_power"] ? connectorObj["max_power"] : "NULL",
                connectorObj["max_current"]
                    ? connectorObj["max_current"]
                    : "NULL",
                0,
                connectorObj["price"]
                    ? connectorObj["price"]["priceKwh_float"]
                    : "NULL",
                connectorObj["price"]
                    ? connectorObj["price"]["currency"]
                    : "NULL",
                connectorObj["price"]
                    ? connectorObj["price"]["postponeMinutes"]
                    : 0,
                connectorObj["price"]
                    ? connectorObj["price"]["priceMinute_float"]
                    : "NULL"
            );
        }
    }

    async addPhotos(descriptionId, photoArray) {
        for (const photo of photoArray) {
            await database.addImage(descriptionId, photo);
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

    getTypePosition(type) {
        const positionMap = {
            ConnectorType_CHAdeMO: 3,
            ConnectorType_CCS: 1,
            ConnectorType_Type2Cable: 5,
            ConnectorType_Type2Socket: 4,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            ConnectorType_CHAdeMO: 3,
            ConnectorType_CCS: 1,
            ConnectorType_Type2Cable: 5,
            ConnectorType_Type2Socket: 4,
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

    analyzeConnectors(devices) {
        let connectors = [];
        let minMaxPower = +Infinity;
        let maxMaxPower = -Infinity;
        let availableConnectorExists = false;

        devices.forEach((device) => {
            device.connectors.forEach((connector) => {
                // Додаємо тип конектора до масиву
                connectors.push(connector.type);

                // Оновлюємо minMaxPower та maxMaxPower
                if (connector.max_power !== null) {
                    minMaxPower = Math.min(minMaxPower, connector.max_power);
                    maxMaxPower = Math.max(maxMaxPower, connector.max_power);
                }

                // Перевіряємо наявність доступних конекторів
                if (connector.availability === "available") {
                    availableConnectorExists = true;
                }
            });
        });

        return {
            connectorsTypes: [...new Set(connectors)], // Видаляємо дублікати за допомогою Set
            minMaxPower: minMaxPower,
            maxMaxPower: maxMaxPower,
            availableConnectorExists: availableConnectorExists,
        };
    }

    getStationStatus(status) {
        switch (status) {
            case "available":
                return 0;
            case "occupied":
                return 0;
            case "offline":
                return 1;
            case "maintenance":
                return 2;
            default:
                console.log(
                    `At ${this.apiName} - can't find station status - ${status}`
                );
                return 4;
        }
    }
    checkConnectorStatus(status) {
        switch (status) {
            case "ConnectorStatus_Available":
                return 0;
            case "ConnectorStatus_Occupied":
                return 1;
            case "ConnectorStatus_Suspended_EV":
                return 2;
            case "ConnectorStatus_Finishing":
                return 3;
            case "ConnectorStatus_Preparing":
                return 5;
            case "ConnectorStatus_In_Fault":
                return 6;
            case "ConnectorStatus_Unavailable":
                return 6;
            case "ConnectorStatus_Out_Of_Communication":
                return 6;
            default:
                console.log(
                    `${this.apiName} - connector status was - ${status}`
                );
                return 6;
        }
    }

    createConnectorArray(devices) {
        let allConnectors = [];

        // Проходимось по кожному пристрою
        devices.forEach((device) => {
            // Додаємо всі конектори з поточного пристрою до загального масиву
            allConnectors.push(...device["connectors"]);
        });

        return allConnectors;
    }
}

module.exports = new Api();
