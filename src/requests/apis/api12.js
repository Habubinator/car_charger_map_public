const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API12 (Молдова + Румунія)";
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);
            let allStations = await this.post(
                api["link"],
                process.env.API12TOKEN
            );
            allStations = allStations["stations"];
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
                +station["id"]
            );
            let cords = {
                lon: station["lng"],
                lat: station["lat"],
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
        let station_marker_id = await this.addStationMarker(
            cords["lon"],
            cords["lat"]
        );

        if (!station_marker_id) {
            throw new Error("Could not create marker");
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
            +station["id"]
        );

        let { connectors } = this.mergeConnectors(station);
        this.addStationConnectors(station_description, connectors);
    }

    async updateElement(api, station, description_id, cords) {
        if (typeof station === "number") {
            let allStations = await this.post(
                api["link"],
                process.env.API12TOKEN
            );
            allStations = allStations["stations"];

            for (const tempStation of allStations) {
                if (+tempStation["id"] == station) {
                    station = tempStation;
                    break;
                }
            }
        }
        let station_description = await this.updateStationDescription(
            description_id,
            station,
            cords
        );

        if (!station_description) {
            return;
        }

        let { connectors } = this.mergeConnectors(station);
        this.updateStationConnectors(station_description, connectors);
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectors, types } = this.mergeConnectors(detailedStation);
        let minPower = this.findMinPowerPort(connectors);
        let maxPower = this.findMaxPowerPort(connectors);
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["name"],
            "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : "MD",
            "NULL",
            "NULL",
            Boolean(+detailedStation["reservation"]),
            detailedStation["address"],
            "NULL",
            "NULL",
            "NULL",
            true,
            minPower,
            maxPower,
            Date.now(),
            5,
            this.checkStationStatus(connectors),
            this.getFlags(types)
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectors, types } = this.mergeConnectors(detailedStation);
        let minPower = this.findMinPowerPort(connectors);
        let maxPower = this.findMaxPowerPort(connectors);
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["name"],
            "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : "MD",
            "NULL",
            "NULL",
            Boolean(+detailedStation["reservation"]),
            detailedStation["address"],
            "NULL",
            "NULL",
            "NULL",
            true,
            minPower,
            maxPower,
            Date.now(),
            5,
            this.checkStationStatus(connectors),
            this.getFlags(types)
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
            this.getTypePosition(connectorObj["ourType"]),
            this.checkConnectorStatus(connectorObj["status"]),
            "NULL",
            +connectorObj["power_port"] ? +connectorObj["power_port"] : "NULL",
            "NULL",
            0,
            +connectorObj["tarif"] ? +connectorObj["tarif"] : "NULL",
            "MDL",
            15,
            "NULL"
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
            this.getTypePosition(connectorObj["ourType"])
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
                connectorObj["ourType"]
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
                this.getTypePosition(connectorObj["ourType"]),
                this.checkConnectorStatus(connectorObj["status"]),
                "NULL",
                +connectorObj["power_port"]
                    ? +connectorObj["power_port"]
                    : "NULL",
                "NULL",
                0,
                +connectorObj["tarif"] ? +connectorObj["tarif"] : "NULL",
                "MDL",
                15,
                "NULL"
            );
        }
    }

    getTypePosition(type) {
        const positionMap = {
            "Type 2 plug": 4,
            "Type 2 socket": 5,
            "Type 1": 6,
            CCS2: 0,
            Chademo: 3,
            "GBT DC": 2,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            "Type 2 plug": 4,
            "Type 2 socket": 5,
            "Type 1": 6,
            CCS2: 0,
            Chademo: 3,
            "GBT DC": 2,
        };
        const types = new Map();

        for (const connectorTypeNumber of connectorsArr) {
            if (positionMap[connectorTypeNumber] !== undefined) {
                types.set(
                    database.VALUES.CONNECTOR[positionMap[connectorTypeNumber]],
                    null
                );
            } else {
                if (connectorTypeNumber != null) {
                    console.log(
                        `At ${this.apiName}: Cant find a connector type of ${connectorTypeNumber}`
                    );
                    this.logger.ensureLogDirectoryExists();
                    this.logger.logError(
                        `At ${this.apiName}: Cant find a connector type of ${connectorTypeNumber}`
                    );
                }
            }
        }

        return [...types.keys()];
    }

    getFlags(connectorsArr) {
        return database.toBinary(
            database.combine(this.findConnectorType(connectorsArr))
        );
    }

    parseCoordinates(coordinates) {
        if (typeof coordinates !== "string") {
            throw new Error("Invalid input. Coordinates should be a string.");
        }
        const [latitude, longitude] = coordinates.split(",").map(Number);
        if (isNaN(latitude) || isNaN(longitude)) {
            throw new Error("Failed to parse coordinates. Invalid format.");
        }

        return { latitude, longitude };
    }

    mergeConnectors(station) {
        const connectorsArray = [];
        const typesArray = [];

        const typeToOurTypeMap = {
            AC: ["Type 2 plug", "Type 2 socket"],
            "AC T1": ["Type 1", "Type 2 plug"],
            Raption: ["CCS2", "Chademo"],
            DC: ["CCS2", "Chademo", "Type 2 socket"],
            ChDC: ["CCS2", "Chademo", "GBT DC"],
        };

        for (let i = 1; i <= 5; i++) {
            const connectorKey = `connector_${i}`;
            if (station[connectorKey]) {
                const connector = station[connectorKey];
                const stationType = station.type;

                connector.ourType =
                    typeToOurTypeMap[stationType][i - 1] || null;
                connectorsArray.push(connector);
                typesArray.push(connector.ourType);
            }
        }

        return {
            connectors: connectorsArray,
            types: typesArray,
        };
    }

    findMinPowerPort(connectors) {
        if (!connectors || connectors.length === 0) {
            return null;
        }

        return connectors.reduce((minPowerPort, connector) => {
            return Math.min(
                minPowerPort,
                parseFloat(connector.power_port) || minPowerPort
            );
        }, parseFloat(connectors[0].power_port) || null);
    }

    findMaxPowerPort(connectors) {
        if (!connectors || connectors.length === 0) {
            return null;
        }

        return connectors.reduce((maxPowerPort, connector) => {
            return Math.max(
                maxPowerPort,
                parseFloat(connector.power_port) || maxPowerPort
            );
        }, parseFloat(connectors[0].power_port) || null);
    }

    checkStationStatus(connectors) {
        if (!connectors || connectors.length === 0) {
            return 1;
        }
        return connectors.some((connector) => connector.status === "Available")
            ? 0
            : 1;
    }

    checkConnectorStatus(connector) {
        if (!connector) {
            return 1;
        }
        const statusMap = {
            Available: 0,
            Unavailable: 1,
            Charging: 2,
            Finishing: 3,
        };
        const status = connector["status"];

        if (status == null) {
            return 5;
        }
        if (statusMap.hasOwnProperty(status)) {
            return statusMap[status];
        } else {
            console.log(`${this.apiName} connector status - "${status}"`);
            return 6;
        }
    }
}

module.exports = new Api();
