const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API4 ICAR";
        this.price;
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);
            let allStations = await this.get(api["link"]);
            if (allStations["116"]) {
                delete allStations["116"];
            }

            this.percentageDefault(Object.keys(allStations).length);
            for (const station in allStations) {
                if (Object.hasOwnProperty.call(allStations, station)) {
                    const stationObj = allStations[station];
                    stationObj.ourPk = +station;
                    this.executeOne(stationObj, api);
                    await this.delay(process.env.UPDATE_PING_INTERVAL_MS);
                }
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
                station.ourPk
            );
            let cords = {
                lon: station["longitude"],
                lat: station["latitude"],
            };
            this.price = station["product_data"]["prices"][1]["price"];

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
        let station_marker_id = await this.addStationMarker(
            cords["lon"],
            cords["lat"]
        );

        if (!station_marker_id) {
            throw new Error("Could not create marker");
        }

        if (!station) {
            return;
        }

        let station_description = await this.addStationDescription(
            station_marker_id,
            station,
            cords
        );

        if (!station_description) {
            throw new Error("Could not create marker description");
        }

        database.addPKStationDescApi(
            api["api_id"],
            station_description["description_id"],
            station.ourPk
        );

        this.addStationConnectors(station_description, station["connectors"]);

        if (station["main_pair"].length) {
            this.addPhotos(station_description["description_id"], [
                station["main_pair"]["detailed"]["image_path"],
            ]);
        }
    }

    async updateElement(api, station, description_id, cords) {
        if (typeof station === "number") {
            let allStations = await this.get(api["link"]);
            for (const tempStation in allStations) {
                if (Object.hasOwnProperty.call(allStations, tempStation)) {
                    if (+tempStation == station) {
                        station = allStations[tempStation];
                        this.price =
                            station["product_data"]["prices"][1]["price"];
                        break;
                    }
                }
            }
        }
        if (!station) {
            return;
        }

        let station_description = await this.updateStationDescription(
            description_id,
            station,
            cords
        );

        if (!station_description) {
            return;
        }

        this.updateStationConnectors(
            station_description,
            station["connectors"]
        );

        if (station["main_pair"].length) {
            this.updatePhotos(station_description["description_id"], [
                station["main_pair"]["detailed"]["image_path"],
            ]);
        }
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = !detailedStation["country"]
            ? this.lookUp(cords["lat"], cords["lon"])
            : detailedStation["country"];
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["description"] &&
                !"<div> </div>".match(detailedStation["description"])
                ? detailedStation["description"]
                : "NULL",
            "NULL",
            detailedStation["country"]
                ? detailedStation["country"]
                : countryData["country_a2"],
            detailedStation["pickup_phone"]
                ? detailedStation["pickup_phone"]
                : "NULL",
            "NULL",
            "NULL",
            detailedStation["pickup_address"],
            "NULL",
            true,
            "NULL",
            true,
            this.findMinConnectorPower(detailedStation["connectors"]),
            this.findMaxConnectorPower(detailedStation["connectors"]),
            Date.now(),
            5,
            "Available".match(detailedStation["chargePointStatus"]) ? 0 : 1,
            this.getFlags(this.getConnectorTypes(detailedStation["connectors"]))
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = !detailedStation["country"]
            ? this.lookUp(cords["lat"], cords["lon"])
            : detailedStation["country"];
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["description"] &&
                !"<div> </div>".match(detailedStation["description"])
                ? detailedStation["description"]
                : "NULL",
            "NULL",
            detailedStation["country"]
                ? detailedStation["country"]
                : countryData["country_a2"],
            detailedStation["pickup_phone"]
                ? detailedStation["pickup_phone"]
                : "NULL",
            "NULL",
            "NULL",
            detailedStation["pickup_address"],
            "NULL",
            true,
            "NULL",
            true,
            this.findMinConnectorPower(detailedStation["connectors"]),
            this.findMaxConnectorPower(detailedStation["connectors"]),
            Date.now(),
            5,
            "Available".match(detailedStation["chargePointStatus"]) ? 0 : 1,
            this.getFlags(this.getConnectorTypes(detailedStation["connectors"]))
        );
        return await database.getStationDescByID(station_marker_id);
    }

    async addStationConnectors(station_description, connectors) {
        for (const key in connectors) {
            if (connectors.hasOwnProperty(key)) {
                const connector = connectors[key];
                await this.addOneStationConnector(
                    station_description,
                    connector
                );
            }
        }
    }

    async addOneStationConnector(station_description, connectorObj) {
        await database.addStationConnector(
            station_description["description_id"],
            this.getTypePosition(connectorObj["connector_type"]),
            this.getConnectorStatus(connectorObj["connector_status"]),
            connectorObj["connector_name"]
                ? connectorObj["connector_name"]
                : "NULL",
            connectorObj["connector_power"],
            "NULL",
            0,
            this.price,
            "UAH",
            0,
            0
        );
    }

    async updateStationConnectors(station_description, connectors) {
        if (!connectors || !Array.isArray(connectors)) {
            return;
        }

        const existingConnectors = await database.getConnectors(
            station_description["description_id"]
        );

        const connectorOccurrences = {};

        const connectorTypesInApi = connectors.map((connectorObj) =>
            this.getTypePosition(connectorObj["connector_type"])
        );

        for (const existingConnector of existingConnectors) {
            const connectorTypeId = existingConnector.connector_type_id;
            if (!connectorTypesInApi.includes(connectorTypeId)) {
                database.deleteConnector(existingConnector["connector_id"]);
            }
        }

        for (const connectorObj of connectors) {
            const connectorTypeId = this.getTypePosition(
                connectorObj["connector_type"]
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
                station_description["description_id"],
                this.getTypePosition(connectorObj["connector_type"]),
                this.getConnectorStatus(connectorObj["connector_status"]),
                connectorObj["connector_name"]
                    ? connectorObj["connector_name"]
                    : "NULL",
                connectorObj["connector_power"],
                "NULL",
                0,
                this.price,
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
            gbt_dc: 2,
            ccs_type2: 0,
            chademo: 3,
            type1: 6,
            type2: 5,
            gbt_ac: 7,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            gbt_dc: 2,
            ccs_type2: 0,
            chademo: 3,
            type1: 6,
            type2: 5,
            gbt_ac: 7,
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

    // Функція для знаходження найменшого connector_power
    findMinConnectorPower = (connectors) => {
        if (connectors) {
            let obj = Object.values(connectors);
            return obj.reduce((minPower, connector) => {
                const power = parseInt(connector.connector_power, 10);
                return !isNaN(power) && power < minPower ? power : minPower;
            }, Infinity);
        }
    };

    // Функція для знаходження найбільшого connector_power
    findMaxConnectorPower = (connectors) => {
        return Object.values(connectors).reduce((maxPower, connector) => {
            const power = parseInt(connector.connector_power, 10);
            return !isNaN(power) && power > maxPower ? power : maxPower;
        }, -Infinity);
    };

    getConnectorTypes(connectors) {
        const connectorTypes = [];

        for (const key in connectors) {
            if (connectors.hasOwnProperty(key)) {
                const connector = connectors[key];
                const connectorType = connector.connector_type;

                if (connectorType) {
                    connectorTypes.push(connectorType);
                }
            }
        }

        return connectorTypes;
    }

    getConnectorStatus(type) {
        const positionMap = {
            Available: 0,
            Charging: 2,
            Finishing: 3,
        };
        return positionMap[type] !== undefined ? positionMap[type] : 6;
    }
}

module.exports = new Api();
