const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API2 AE";
        this.pk;
    }

    async recursiveApiCall(startCoordinates, endCoordinates, link) {
        console.log(`${this.apiName} розпочало прохід по координатам`);
        const resultMap = new Map();
        const getFunction = this.get.bind(this); // Привязываем контекст
        const delay = this.delay.bind(this); // Привязываем контекст

        async function makeRequestAndProcess(start, end) {
            const boundingBox = `nw=${start[0]},${start[1]}&se=${end[0]},${end[1]}`;
            const apiUrl = `${link}?${boundingBox}`;

            const data = await getFunction(apiUrl);

            if (data && data.length > 0) {
                for (const item of data) {
                    resultMap.set(item.id, item);
                }

                // Якщо більше, або рівно 500 значень (апі залімітувало відповідь),
                // розбити на 4 квадрати
                if (data.length >= 500) {
                    const middleX = (start[0] + end[0]) / 2;
                    const middleY = (start[1] + end[1]) / 2;

                    await delay(3000);
                    await makeRequestAndProcess(start, [middleX, middleY]);
                    await delay(3000);
                    await makeRequestAndProcess(
                        [middleX, start[1]],
                        [end[0], middleY]
                    );
                    await delay(3000);
                    await makeRequestAndProcess(
                        [start[0], middleY],
                        [middleX, end[1]]
                    );
                    await delay(3000);
                    await makeRequestAndProcess([middleX, middleY], end);
                    await delay(3000);
                }
            }
        }

        await makeRequestAndProcess(startCoordinates, endCoordinates);

        // Map, щоб не тригерити на дублікати зайвий раз затримку в 5 секунд
        const resultArray = Array.from(resultMap.values());
        console.log(
            `${this.apiName} завершило прохід по координатам. Переходимо до оновлення бд.`
        );
        return resultArray;
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);
            const startCoordinates = [90, -180];
            const endCoordinates = [-90, 180];
            const apiLink = api["link"];

            let allStations = await this.recursiveApiCall(
                startCoordinates,
                endCoordinates,
                apiLink
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
            let cords = station["geo"];
            let marker = await database.getMarkerByPK(
                api["api_id"],
                station["id"]
            );
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
            this.logger.logError(error);
        }
    }

    async createElement(api, cords, station) {
        let detailed_link = api["detailed_link"].replace("{id}", station["id"]);
        let detailedStation = await this.get(detailed_link);
        if (!detailedStation) {
            return;
        }
        this.pk = station["id"];
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

        await database.addPKStationDescApi(
            api["api_id"],
            station_description["description_id"],
            this.pk
        );

        await this.addStationConnectors(
            station_description,
            detailedStation["connectors"],
            station
        );
    }

    async updateElement(api, station, description_id, cords) {
        let detailed_link;
        if (typeof station === "number") {
            detailed_link = api["detailed_link"].replace("{id}", station);
        } else {
            detailed_link = api["detailed_link"].replace("{id}", station["id"]);
        }

        let detailedStation = await this.get(detailed_link);

        let station_description = await this.updateStationDescription(
            description_id,
            detailedStation,
            cords
        );

        if (!station_description) {
            return;
        }

        await this.updateStationConnectors(
            station_description,
            detailedStation["connectors"]
        );
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["address"],
            "NULL",
            detailedStation["country"]
                ? detailedStation["country"]
                : countryData
                ? countryData["country_a2"]
                : "NULL",
            detailedStation["ownerEmail"],
            false,
            !detailedStation["servicesRestrictions"]["isConnectorRentDisabled"],
            detailedStation["address"],
            this.findUnixTime(detailedStation["lastOperationTimeUtc"]),
            detailedStation["isGuestChargingSessionEnabled"]
                ? detailedStation["isGuestChargingSessionEnabled"]
                : "NULL",
            "NULL",
            "NULL",
            this.findKW(this.getMinAmpers(detailedStation["connectors"]), 450),
            this.findKW(this.getMaxAmpers(detailedStation["connectors"]), 450),
            Date.now(),
            5,
            this.findStationStatus(detailedStation["conn"]),
            this.getFlags(detailedStation["connectors"])
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["name"],
            detailedStation["address"],
            "NULL",
            detailedStation["country"]
                ? detailedStation["country"]
                : countryData
                ? countryData["country_a2"]
                : "NULL",
            detailedStation["ownerEmail"],
            false,
            !detailedStation["servicesRestrictions"]["isConnectorRentDisabled"],
            detailedStation["address"],
            this.findUnixTime(detailedStation["lastOperationTimeUtc"]),
            detailedStation["isGuestChargingSessionEnabled"]
                ? detailedStation["isGuestChargingSessionEnabled"]
                : "NULL",
            "NULL",
            "NULL",
            this.findKW(this.getMinAmpers(detailedStation["connectors"]), 450),
            this.findKW(this.getMaxAmpers(detailedStation["connectors"]), 450),
            Date.now(),
            5,
            this.findStationStatus(detailedStation["conn"]),
            this.getFlags(detailedStation["connectors"])
        );
        return await database.getStationDescByID(station_marker_id);
    }

    async addStationConnectors(
        station_description,
        connectors,
        detailedStation
    ) {
        for (const connectorObj of connectors) {
            await database.addStationConnector(
                station_description["description_id"],
                this.getTypePosition(connectorObj["type"]),
                this.findConnectorStatus(connectorObj["status"]),
                detailedStation["controllers"]
                    ? detailedStation["controllers"][0]["rawValue"]
                    : "NULL",
                this.findKW(
                    connectorObj["maxOutputA"],
                    this.getVolts(this.getTypePosition(connectorObj["type"]))
                ),
                connectorObj["maxOutputA"],
                connectorObj["rates"]["rent"]["price"],
                connectorObj["rates"]["energy"]["price"],
                connectorObj["rates"]["energy"]["currencyCode"],
                0,
                connectorObj["rates"]["parking"]["price"]
            );
        }
    }

    async updateStationConnectors(station_description, connectors) {
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
            const connectorStatusId = this.findConnectorStatus(
                connectorObj["status"]
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
                await database.addStationConnector(
                    station_description["description_id"],
                    connectorTypeId,
                    connectorStatusId,
                    "NULL",
                    this.findKW(
                        connectorObj["maxOutputA"],
                        this.getVolts(
                            this.getTypePosition(connectorObj["type"])
                        )
                    ),
                    connectorObj["maxOutputA"],
                    connectorObj["rates"]["rent"]["price"],
                    connectorObj["rates"]["energy"]["price"],
                    connectorObj["rates"]["energy"]["currencyCode"],
                    0,
                    connectorObj["rates"]["parking"]["price"]
                );
                continue;
            }

            await database.updateConnector(
                connectorToUpdate["connector_id"],
                connectorTypeId,
                connectorStatusId,
                "NULL",
                this.findKW(
                    connectorObj["maxOutputA"],
                    this.getVolts(this.getTypePosition(connectorObj["type"]))
                ),
                connectorObj["maxOutputA"],
                connectorObj["rates"]["rent"]["price"],
                connectorObj["rates"]["energy"]["price"],
                connectorObj["rates"]["energy"]["currencyCode"],
                0,
                connectorObj["rates"]["parking"]["price"]
            );
        }
    }

    getTypePosition(type) {
        const typePositions = {
            1: 3,
            2: 1,
            3: 0,
            4: 9,
            26: 2,
            5: 6,
            6: 5,
            8: 5,
            9: 4,
            25: 7,
        };
        return typePositions[type] ?? null;
    }

    findConnectorType(connectorsArr) {
        const typePositions = {
            1: 3,
            2: 1,
            3: 0,
            4: 9,
            26: 2,
            5: 6,
            6: 5,
            8: 5,
            9: 4,
            25: 7,
        };
        const types = new Map();

        for (const connectorObj of connectorsArr) {
            if (
                connectorObj &&
                connectorObj.type &&
                typePositions[connectorObj.type] !== undefined
            ) {
                const position = typePositions[connectorObj.type];
                types.set(database.VALUES.CONNECTOR[position], null);
            } else {
                console.log(
                    `At ${this.apiName}: Cant find a connector type of ${connectorObj.type}`
                );
                this.logger.ensureLogDirectoryExists();
                this.logger.logError(
                    `At ${this.apiName}: Cant find a connector type of ${connectorObj.type}`
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

    findConnectorStatus(status) {
        switch (status) {
            case 1:
                return 0;
            case 2:
                return 1;
            case 3:
                return 2;
            case 4:
                return 3;
            case 9:
                return 6;
            case 8:
                return 6;
            default:
                // console.log("Unexpected status value - " + status);
                return 6;
        }
    }

    findStationStatus(connectorArr) {
        for (const connectorObj of connectorArr) {
            if (connectorObj["status"] != 9 && connectorObj["status"] != 8) {
                return 0;
            }
        }
        return 1;
    }

    findKW(ampers, volts) {
        if (isNaN(ampers) || isNaN(volts)) {
            console.log("Amp in FindKW: " + ampers);
            console.log("Volts in FindKW: " + volts);
            throw new Error("Invalid input. Please provide numeric values.");
        }
        const energyInKWh = Math.ceil((ampers * volts * 1) / 1000);

        return energyInKWh;
    }

    getVolts(connectorType) {
        if (connectorType == 5) {
            return 230 * 3;
        }
        return 450;
    }

    // Функція для знаходження мінімального значення maxOutputA
    getMinAmpers(connectors) {
        if (!connectors || connectors.length === 0) {
            return 1;
        }

        let minValue = connectors[0].maxOutputA;

        for (let i = 0; i < connectors.length; i++) {
            const connector = connectors[i];
            if (connector.maxOutputA < minValue) {
                minValue = connector.maxOutputA;
            }
        }

        return minValue;
    }

    // Функція для знаходження максимального значення maxOutputA
    getMaxAmpers(connectors) {
        if (!connectors || connectors.length === 0) {
            return 1;
        }

        let maxValue = connectors[0].maxOutputA;

        for (let i = 0; i < connectors.length; i++) {
            const connector = connectors[i];
            if (connector.maxOutputA > maxValue) {
                maxValue = connector.maxOutputA;
            }
        }

        return maxValue;
    }
}

module.exports = new Api();
