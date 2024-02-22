const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API9 TOKA";
        this.isPublic;
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);
            let allStations = await this.post(api["link"]);
            this.percentageDefault(allStations.length);

            for (const station of allStations) {
                this.executeOne(station, api);
                await this.delay(process.env.UPDATE_PING_INTERVAL_MS);
            }

            database.updateApi(api["api_id"], api["update_interval_ms"]);
        } catch (error) {
            console.error(error.message);
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
                lon: +station["Lng"],
                lat: +station["Lat"],
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
            this.mergeObjectsAndAddDowntimeRate(
                detailedStation["Ports"],
                detailedStation["Prices"]
            )
        );

        this.addPhotos(
            station_description["description_id"],
            detailedStation["Photos"]
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
            this.mergeObjectsAndAddDowntimeRate(
                detailedStation["Ports"],
                detailedStation["Prices"]
            )
        );

        this.updatePhotos(
            station_description["description_id"],
            detailedStation["Photos"]
        );
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        return await database.addStationDescription(
            station_marker_id,
            detailedStation["Title"],
            detailedStation["Description"],
            "NULL",
            countryData ? countryData["country_a2"] : null,
            "NULL",
            "NULL",
            "NULL",
            detailedStation["Address"],
            "NULL",
            this.isPublic ? this.isPublic : "NULL",
            "NULL",
            true,
            this.findMinPower(detailedStation["Ports"]),
            this.findMaxPower(detailedStation["Ports"]),
            Date.now(),
            5,
            this.checkStationStatus(detailedStation["Ports"]),
            this.getFlags(this.getTitlesFromPorts(detailedStation["Ports"]))
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        await database.updateStationDescription(
            station_marker_id,
            detailedStation["Title"],
            detailedStation["Description"],
            "NULL",
            countryData ? countryData["country_a2"] : null,
            "NULL",
            "NULL",
            "NULL",
            detailedStation["Address"],
            "NULL",
            this.isPublic ? this.isPublic : "NULL",
            "NULL",
            true,
            this.findMinPower(detailedStation["Ports"]),
            this.findMaxPower(detailedStation["Ports"]),
            Date.now(),
            5,
            this.checkStationStatus(detailedStation["Ports"]),
            this.getFlags(this.getTitlesFromPorts(detailedStation["Ports"]))
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
            this.getTypePosition(connectorObj["Title"]),
            this.checkPortStatus(connectorObj["Status"]),
            `${connectorObj["Title"]} - ${connectorObj["Id"]}`,
            connectorObj["Power"] ? connectorObj["Power"] : "NULL",
            "NULL",
            0,
            connectorObj["Price"] ? connectorObj["Price"] : "NULL",
            "UAH",
            connectorObj["DowntimeRate"]
                ? connectorObj["DowntimeRate"]["FreeMinutes"]
                : "NULL",
            connectorObj["DowntimeRate"]
                ? connectorObj["DowntimeRate"]["Rate"]
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
            this.getTypePosition(connectorObj["Title"])
        );

        for (const existingConnector of existingConnectors) {
            const connectorTypeId = existingConnector.connector_type_id;
            if (!connectorTypesInApi.includes(connectorTypeId)) {
                database.deleteConnector(existingConnector["connector_id"]);
            }
        }
        const connectorOccurrences = {};

        for (const connectorObj of connectors) {
            const connectorTypeId = this.getTypePosition(connectorObj["Title"]);

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
                this.getTypePosition(connectorObj["Title"]),
                this.checkPortStatus(connectorObj["Status"]),
                `${connectorObj["Title"]} - ${connectorObj["Id"]}`,
                connectorObj["Power"] ? connectorObj["Power"] : "NULL",
                "NULL",
                0,
                connectorObj["Price"] ? connectorObj["Price"] : "NULL",
                "UAH",
                connectorObj["DowntimeRate"]
                    ? connectorObj["DowntimeRate"]["FreeMinutes"]
                    : "NULL",
                connectorObj["DowntimeRate"]
                    ? connectorObj["DowntimeRate"]["Rate"]
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
            "Type 1": 6,
            "Type 2 Plug": 4,
            "Type 2": 5,
            "Type 2/Type 1": 10,
            CHAdeMO: 3,
            "CCS 2": 0,
            "CCS 1": 1,
            "CCS 2/CCS 1": 9,
            "GB/T DC": 2,
            "GB/T AC Plug": 7,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            "Type 1": 6,
            "Type 2 Plug": 4,
            "Type 2": 5,
            "Type 2/Type 1": 10,
            CHAdeMO: 3,
            "CCS 2": 0,
            "CCS 1": 1,
            "CCS 2/CCS 1": 9,
            "GB/T DC": 2,
            "GB/T AC Plug": 7,
        };
        const types = new Map();

        for (const connectorTypeNumber of connectorsArr) {
            if (positionMap[connectorTypeNumber] !== undefined) {
                types.set(
                    database.VALUES.CONNECTOR[positionMap[connectorTypeNumber]],
                    null
                );
            } else {
                throw new Error(
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

    findMinPower(ports) {
        if (!ports || ports.length === 0) return 0;
        return ports.reduce(
            (minPower, port) => (port.Power < minPower ? port.Power : minPower),
            ports[0].Power
        );
    }

    findMaxPower(ports) {
        if (!ports || ports.length === 0) return 0;
        return ports.reduce(
            (maxPower, port) => (port.Power > maxPower ? port.Power : maxPower),
            ports[0].Power
        );
    }

    mergeObjectsAndAddDowntimeRate(ports, prices) {
        if (!ports || !prices) {
            return [];
        }

        const mergedObjects = ports.map((port) => {
            const matchingPrice = prices.find(
                (price) => price.PortId === port.Id
            );

            if (matchingPrice) {
                return {
                    ...port,
                    ...matchingPrice,
                };
            } else {
                return port;
            }
        });

        return mergedObjects;
    }

    checkStationStatus(ports) {
        if (!ports || ports.length === 0) {
            return 1;
        }

        const hasStatusZero = ports.some((port) => port.Status === 0);

        return hasStatusZero ? 0 : 1;
    }

    checkPortStatus(status) {
        return status === 0 ? 0 : 1;
    }

    getTitlesFromPorts(ports) {
        if (!ports || ports.length === 0) {
            return [];
        }

        return ports.map(function (port) {
            return port.Title;
        });
    }
}

module.exports = new Api();
