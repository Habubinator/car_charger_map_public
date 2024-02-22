const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API26 Charge";
        this.pk;
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);
            let allStations = await this.post(api["link"], {
                connectorTypes: [
                    "Type 2",
                    "Type 2",
                    "CSS Combo 2",
                    "CCS Combo 1",
                    "CHAdeMO",
                    "GB/T AC",
                    "GB/T DC",
                ],
            });
            allStations = allStations.filter(
                (obj) => obj.pk !== 1 && obj.online !== false
            );

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
                station["pk"]
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
        let detailed_link = api["detailed_link"].replace("{id}", station["pk"]);

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
            station["pk"]
        );

        this.addStationConnectors(
            station_description,
            detailedStation["connectors"]
        );

        this.addPhotos(
            station_description["description_id"],
            this.filterAndMergeImages(detailedStation)
        );
    }

    async updateElement(api, station, description_id, cords) {
        let detailed_link;
        if (typeof station === "number") {
            detailed_link = api["detailed_link"].replace("{id}", station);
        } else {
            detailed_link = api["detailed_link"].replace("{id}", station["pk"]);
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
            detailedStation["connectors"]
        );

        this.updatePhotos(
            station_description["description_id"],
            this.filterAndMergeImages(detailedStation)
        );
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectorsTypes, minMaxPower, maxMaxPower } =
            this.analyzeConnectors(detailedStation["connectors"]);
        let address = `${
            detailedStation["city"] ? detailedStation["city"] : ""
        } ${detailedStation["street"] ? detailedStation["street"] : ""} ${
            detailedStation["houseNumber"] ? detailedStation["houseNumber"] : ""
        }`;
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["description"]
                ? detailedStation["description"]
                : "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : "UA",
            detailedStation["phone"] ? detailedStation["phone"] : "NULL",
            "NULL",
            false,
            address,
            "NULL",
            "private".match(detailedStation["mode"]) ? true : false,
            "NULL",
            "NULL",
            minMaxPower,
            maxMaxPower,
            Date.now(),
            5,
            this.getStationStatus(detailedStation["mode"]),
            this.getFlags(connectorsTypes)
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectorsTypes, minMaxPower, maxMaxPower } =
            this.analyzeConnectors(detailedStation["connectors"]);
        let address = `${
            detailedStation["city"] ? detailedStation["city"] : ""
        } ${detailedStation["street"] ? detailedStation["street"] : ""} ${
            detailedStation["houseNumber"] ? detailedStation["houseNumber"] : ""
        }`;
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["description"]
                ? detailedStation["description"]
                : "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : "UA",
            detailedStation["phone"] ? detailedStation["phone"] : "NULL",
            "NULL",
            false,
            address,
            "NULL",
            "private".match(detailedStation["mode"]) ? true : false,
            "NULL",
            "NULL",
            minMaxPower,
            maxMaxPower,
            Date.now(),
            5,
            this.getStationStatus(detailedStation["mode"]),
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
            `${connectorObj["pk"]} - ${connectorObj["type"]}`,
            connectorObj["maxPower"] ? connectorObj["maxPower"] : "NULL",
            "NULL",
            0,
            connectorObj["tarif"] ? connectorObj["tarif"] : "NULL",
            "UAH",
            0,
            0
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
                `${connectorObj["pk"]} - ${connectorObj["type"]}`,
                connectorObj["maxPower"] ? connectorObj["maxPower"] : "NULL",
                "NULL",
                0,
                connectorObj["tarif"] ? connectorObj["tarif"] : "NULL",
                "UAH",
                0,
                0
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
            "Type 1": 6,
            "Type 2": 5,
            "CCS Combo 2": 0,
            "CCS Combo 1": 1,
            CHAdeMO: 3,
            "GB/T AC": 7,
            "GB/T DC": 2,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            "Type 1": 6,
            "Type 2": 5,
            "CCS Combo 2": 0,
            "CCS Combo 1": 1,
            CHAdeMO: 3,
            "GB/T AC": 7,
            "GB/T DC": 2,
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

    analyzeConnectors(connectors) {
        let connectorsTypes = [];
        let minMaxPower = +Infinity;
        let maxMaxPower = -Infinity;
        let availableConnectorExists = false;

        connectors.forEach((connector) => {
            // Додаємо тип конектора до масиву
            connectorsTypes.push(connector.type);

            // Оновлюємо minMaxPower та maxMaxPower
            if (connector.maxPower !== null) {
                minMaxPower = Math.min(minMaxPower, connector.maxPower);
                maxMaxPower = Math.max(maxMaxPower, connector.maxPower);
            }

            // Перевіряємо наявність доступних конекторів
            if (connector.available === true) {
                availableConnectorExists = true;
            }
        });

        return {
            connectorsTypes: [...new Set(connectorsTypes)], // Видаляємо дублікати за допомогою Set
            minMaxPower: minMaxPower,
            maxMaxPower: maxMaxPower,
            availableConnectorExists: availableConnectorExists,
        };
    }

    getStationStatus(status) {
        switch (status) {
            case "active":
                return 0;
            case "private":
                return 0;
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
            case "Available":
                return 0;
            case "Charging":
                return 1;
            case "Preparing":
                return 2;
            case "Finishing":
                return 3;
            case "Unavailable":
                return 5;
            case "Faulted":
                return 6;
            case null:
                return 6;
            default:
                console.log(
                    `${this.apiName} - connector status was - ${status}`
                );
                return 6;
        }
    }

    filterAndMergeImages(station) {
        let imageUrls = [];

        if (station.img_one !== null) {
            imageUrls.push(station.img_one);
        }

        if (station.img_two !== null) {
            imageUrls.push(station.img_two);
        }

        if (station.img_three !== null) {
            imageUrls.push(station.img_three);
        }

        return imageUrls;
    }
}

module.exports = new Api();
