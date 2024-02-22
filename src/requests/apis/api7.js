const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");
const currencySigns = require("./../../database/signsDB.json");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API7 EF";
        this.fast;
        this.currency;
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
                station["pk"]
            );
            let cords = {
                lon: station["longitude"],
                lat: station["latitude"],
            };
            this.fast = station["fast"];
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
        this.currency = detailedStation["currency"];

        database.addPKStationDescApi(
            api["api_id"],
            station_description["description_id"],
            station["pk"]
        );

        this.addStationConnectors(
            station_description,
            detailedStation["connectors"]
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
            throw new Error("Could not update marker");
        }

        let station_description = await this.updateStationDescription(
            description_id,
            detailedStation,
            cords,
            detailedStation["is_fast_charger"]
        );

        if (!station_description) {
            throw new Error("Could not update marker description");
        }
        this.currency = detailedStation["currency"];
        this.updateStationConnectors(
            station_description,
            detailedStation["connectors"]
        );
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        let city = detailedStation["city"] ? detailedStation["city"] : "";
        let street = detailedStation["street"] ? detailedStation["street"] : "";
        let houseNum = detailedStation["houseNumber"]
            ? detailedStation["houseNumber"]
            : "";
        let address = city + " " + street + " " + houseNum;
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["name"],
            "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : null,
            "NULL",
            "NULL",
            detailedStation["enableReservation"],
            address,
            "NULL",
            detailedStation["confirmStart"] == null
                ? !detailedStation["confirmStart"]
                : null,
            Boolean(this.fast),
            true,
            this.findMinPower(detailedStation["connectors"]),
            this.findMaxPower(detailedStation["connectors"]),
            Date.now(),
            5,
            this.checkStationStatus(detailedStation["mode"]),
            detailedStation["connectors"].length
                ? this.getFlags(
                      this.getConnectorTypes(detailedStation["connectors"])
                  )
                : 0
        );
    }

    async updateStationDescription(
        station_marker_id,
        detailedStation,
        cords,
        isFast
    ) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        let city = detailedStation["city"] ? detailedStation["city"] : "";
        let street = detailedStation["street"] ? detailedStation["street"] : "";
        let houseNum = detailedStation["houseNumber"]
            ? detailedStation["houseNumber"]
            : "";
        let address = city + " " + street + " " + houseNum;
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["name"],
            "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : null,
            "NULL",
            "NULL",
            detailedStation["enableReservation"],
            address,
            "NULL",
            detailedStation["confirmStart"] == null
                ? !detailedStation["confirmStart"]
                : null,
            Boolean(isFast),
            true,
            this.findMinPower(detailedStation["connectors"]),
            this.findMaxPower(detailedStation["connectors"]),
            Date.now(),
            5,
            this.checkStationStatus(detailedStation["mode"]),
            detailedStation["connectors"].length
                ? this.getFlags(
                      this.getConnectorTypes(detailedStation["connectors"])
                  )
                : 0
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
            connectorObj["available"] ? 1 : 0,
            connectorObj["pk"] ? `${connectorObj["pk"]}` : "NULL",
            connectorObj["maxPower"] ? connectorObj["maxPower"] : "NULL",
            "NULL",
            0,
            connectorObj["tarif"] ? connectorObj["tarif"] : "NULL",
            currencySigns[this.currency],
            0,
            0
        );
    }

    async updateStationConnectors(station_description, connectors) {
        if (!connectors) return;

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
                connectorObj["available"] ? 1 : 0,
                connectorObj["pk"] ? `${connectorObj["pk"]}` : "NULL",
                connectorObj["maxPower"] ? connectorObj["maxPower"] : "NULL",
                "NULL",
                0,
                connectorObj["tarif"] ? connectorObj["tarif"] : "NULL",
                currencySigns[this.currency],
                0,
                0
            );
        }
    }

    checkStationStatus(statusId) {
        switch (statusId) {
            case "active":
                return 0;
            case "maintenance":
                return 2;
            default:
                return 4;
        }
    }

    getTypePosition(type) {
        const positionMap = {
            "Type 1": 6,
            "Type 2": 5,
            "Type 2 Plug": 4,
            GBTACPlug: 7,
            CcsT2: 0,
            CHAdeMO: 3,
            CCS12: 9,
            Combo: 10,
            GBTDC: 2,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            "Type 1": 6,
            "Type 2": 5,
            "Type 2 Plug": 4,
            GBTACPlug: 7,
            CcsT2: 0,
            CHAdeMO: 3,
            CCS12: 9,
            Combo: 10,
            GBTDC: 2,
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

    findMinPower = (connectors) => {
        if (!connectors || connectors.length === 0) {
            return null;
        }

        return connectors.reduce((minPower, connector) => {
            return connector.maxPower < minPower
                ? connector.maxPower
                : minPower;
        }, connectors[0].maxPower);
    };

    findMaxPower = (connectors) => {
        if (!connectors || connectors.length === 0) {
            return null;
        }

        return connectors.reduce((maxPower, connector) => {
            return connector.maxPower > maxPower
                ? connector.maxPower
                : maxPower;
        }, connectors[0].maxPower);
    };

    getConnectorTypes = (connectors) => {
        if (!connectors || connectors.length === 0) {
            return [];
        }

        return connectors.map((connector) => connector.type);
    };
}

module.exports = new Api();
