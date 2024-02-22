const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API8 UGV";
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
                station["Id"]
            );
            let cords = {
                lon: station["Longitude"],
                lat: station["Latitude"],
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
        let detailed_link = api["detailed_link"].replace("{id}", station["Id"]);

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
            station["Id"]
        );

        this.addStationConnectors(
            station_description,
            detailedStation["Ports"]
        );
    }

    async updateElement(api, station, description_id, cords) {
        let detailed_link;
        if (typeof station === "number") {
            detailed_link = api["detailed_link"].replace("{id}", station);
        } else {
            detailed_link = api["detailed_link"].replace("{id}", station["Id"]);
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
            detailedStation["Ports"]
        );
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectorsTypes, minMaxPower, maxMaxPower, fastChargeExists } =
            this.analyzePorts(detailedStation["Ports"]);
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["Name"],
            detailedStation["Description"],
            "NULL",
            countryData
                ? countryData["country_a2"]
                : detailedStation["Country"],
            typeof detailedStation["Phones"] != "object"
                ? detailedStation["Phones"]
                : "NULL",
            "NULL",
            this.checkReservationTariffExistence(detailedStation["Ports"]),
            detailedStation["Address"],
            "NULL",
            "Public".match(detailedStation["AccessType"]) ? true : false,
            fastChargeExists,
            "00:00 - 24:00".match(detailedStation["OpenHours"]) ? true : false,
            minMaxPower,
            maxMaxPower,
            Date.now(),
            5,
            this.getStationStatus(detailedStation["Status"]),
            this.getFlags(connectorsTypes)
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(+cords["lat"], +cords["lon"]);
        let { connectorsTypes, minMaxPower, maxMaxPower, fastChargeExists } =
            this.analyzePorts(detailedStation["Ports"]);
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["Name"],
            detailedStation["Description"],
            "NULL",
            countryData
                ? countryData["country_a2"]
                : detailedStation["Country"],
            typeof detailedStation["Phones"] != "object"
                ? detailedStation["Phones"]
                : "NULL",
            "NULL",
            this.checkReservationTariffExistence(detailedStation["Ports"]),
            detailedStation["Address"],
            "NULL",
            "Public".match(detailedStation["AccessType"]) ? true : false,
            fastChargeExists,
            "00:00 - 24:00".match(detailedStation["OpenHours"]) ? true : false,
            minMaxPower,
            maxMaxPower,
            Date.now(),
            5,
            this.getStationStatus(detailedStation["Status"]),
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
            this.getTypePosition(
                `${connectorObj.PortType}-${connectorObj.PowerSupply}`
            ),
            this.checkConnectorStatus(connectorObj["Status"]),
            connectorObj["Name"],
            connectorObj["MaxPower"] ? connectorObj["MaxPower"] : "NULL",
            connectorObj["Current"] ? connectorObj["Current"] : "NULL",
            0,
            connectorObj["Tariff"]["Price"]
                ? connectorObj["Tariff"]["Price"]
                : "NULL",
            connectorObj["Tariff"]["Currency"]
                ? connectorObj["Tariff"]["Currency"]
                : "NULL",
            connectorObj["Tariff"]["DelayBeforeIdle"]
                ? connectorObj["Tariff"]["DelayBeforeIdle"]
                : 0,
            connectorObj["IdleTariff"]["Price"]
                ? connectorObj["IdleTariff"]["Price"]
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
            this.getTypePosition(
                `${connectorObj.PortType}-${connectorObj.PowerSupply}`
            )
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
                `${connectorObj.PortType}-${connectorObj.PowerSupply}`
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
                this.getTypePosition(
                    `${connectorObj.PortType}-${connectorObj.PowerSupply}`
                ),
                this.checkConnectorStatus(connectorObj["Status"]),
                connectorObj["Name"],
                connectorObj["MaxPower"] ? connectorObj["MaxPower"] : "NULL",
                connectorObj["Current"] ? connectorObj["Current"] : "NULL",
                0,
                connectorObj["Tariff"]["Price"]
                    ? connectorObj["Tariff"]["Price"]
                    : "NULL",
                connectorObj["Tariff"]["Currency"]
                    ? connectorObj["Tariff"]["Currency"]
                    : "NULL",
                connectorObj["Tariff"]["DelayBeforeIdle"]
                    ? connectorObj["Tariff"]["DelayBeforeIdle"]
                    : 0,
                connectorObj["IdleTariff"]["Price"]
                    ? connectorObj["IdleTariff"]["Price"]
                    : "NULL"
            );
        }
    }

    getTypePosition(type) {
        const positionMap = {
            "CCS-DC": 1,
            "CHAdeMO-DC": 3,
            "Type2-AC3": 5,
            "Type2-AC1": 5,
            "Shuko-AC1": 4,
            "J1772-AC1": 6,
            "J1772AndType2-AC1": 10,
            "J1772AndType2-AC3": 10,
            "GBT-AC1": 7,
            "CHAdeMO_GB_T-DC": 11,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            "CCS-DC": 1,
            "CHAdeMO-DC": 3,
            "Type2-AC3": 5,
            "Type2-AC1": 5,
            "Shuko-AC1": 4,
            "J1772-AC1": 6,
            "J1772AndType2-AC1": 10,
            "J1772AndType2-AC3": 10,
            "GBT-AC1": 7,
            "CHAdeMO_GB_T-DC": 11,
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

    analyzePorts(Ports) {
        let connectors = [];
        let minMaxPower = Infinity;
        let maxMaxPower = -Infinity;
        let fastChargeExists = false;

        Ports.forEach((port) => {
            // Добавляем тип коннектора в массив
            let type = `${port.PortType}-${port.PowerSupply}`;
            connectors.push(type);

            // Обновляем значения minMaxPower и maxMaxPower
            if (port.MaxPower !== null) {
                minMaxPower = Math.min(minMaxPower, port.MaxPower);
                maxMaxPower = Math.max(maxMaxPower, port.MaxPower);
            }
            // Проверяем наличие быстрой зарядки
            if (port.Level === "FastCharging") {
                fastChargeExists = true;
            }
        });

        return {
            connectorsTypes: [...new Set(connectors)], // Удаляем дубликаты с помощью Set
            minMaxPower: minMaxPower,
            maxMaxPower: maxMaxPower,
            fastChargeExists: fastChargeExists,
        };
    }

    getStationStatus(status) {
        switch (status) {
            case "Available":
                return 0;
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
            case "Occupied":
                return 1;
            case "CablePlugged":
                return 2;
            case "ChargingDone":
                return 3;
            case "Disabled":
                return 6;
            case "Failed":
                return 6;
            case "Unknown":
                return 6;
            default:
                console.log(
                    `${this.apiName} - connector status was - ${status}`
                );
                return 6;
        }
    }

    checkReservationTariffExistence(Ports) {
        for (const port of Ports) {
            if (port.ReservationTariff !== null) {
                return true;
            }
        }
        return false;
    }
}

module.exports = new Api();
