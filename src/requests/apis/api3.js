const database = require("./../../database/dbController");
const ApiTemplate = require("./APIClass");

class Api extends ApiTemplate {
    constructor() {
        super();
        this.apiName = "API3 YSNO";
        this.tarifs;
        this.pk;
    }

    async execute(api) {
        try {
            console.log(`Оновлюю дані для ${this.apiName}`);
            let body = await this.readJsonFile("src/database/api3Body.json");
            let allStations = await this.post(api["link"], body);
            this.tarifs = allStations["tariffs"];

            this.percentageDefault(allStations["locations"].length);

            for (const station of allStations["locations"]) {
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
            let location = this.parseLocation(station["location"]);
            let marker = await database.getMarkerByPK(
                api["api_id"],
                station["id"]
            );
            let cords = {
                lon: location["longitude"],
                lat: location["latitude"],
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
            console.log(station, api, error);
            this.logger.ensureLogDirectoryExists();
            this.logger.logError(error, station, api);
        }
    }

    async createElement(api, cords, station) {
        let station_marker_id = await this.addStationMarker(
            cords["lon"],
            cords["lat"]
        );
        this.pk = station["id"];
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
            this.pk
        );
        this.addStationConnectors(station_description, station["zones"]);

        if (station["location_image"]) {
            this.addPhotos(station_description["description_id"], [
                station["location_image"],
            ]);
        }
    }

    async updateElement(api, station, description_id, cords) {
        if (typeof station === "number") {
            let body = await this.readJsonFile("src/database/api3Body.json");
            let allStations = await this.post(api["link"], body);
            this.tarifs = allStations["tariffs"];
            // Ми не можемо зробити запит по айді бо апі підтримує тільки запити відразу всіх апі.
            for (const tempStation of allStations["locations"]) {
                if (tempStation["id"] == station) {
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

        this.updateStationConnectors(station_description, station["zones"]);

        if (station["location_image"]) {
            this.updatePhotos(station_description["description_id"], [
                station["location_image"],
            ]);
        }
    }

    async addStationMarker(lon, lat) {
        return await database.addStationMarker(lon, lat);
    }

    async addStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        let { minPower, maxPower } = this.findMinMaxPower(
            detailedStation["zones"]
        );
        return await database.addStationDescription(
            station_marker_id,
            this.removeNumbersInSquareBrackets(detailedStation["name"]),
            detailedStation["detailed_description"]
                ? this.formatString(detailedStation["detailed_description"])
                : "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : null,
            "NULL",
            this.hasSmartCharging(detailedStation["zones"]),
            this.hasChargingStationWithReserve(detailedStation["zones"]),
            detailedStation["address"]
                ? this.removeNumbersInSquareBrackets(detailedStation["address"])
                : "NULL",
            "NULL",
            "NULL",
            "NULL",
            detailedStation["workingHours"] ? false : true,
            Math.round(minPower / 1000),
            Math.round(maxPower / 1000),
            Date.now(),
            5,
            this.getStatusPosition(
                this.findUniqueStatuses(detailedStation["zones"])
            ),
            this.getFlags(this.findConnectors(detailedStation["zones"]))
        );
    }

    async updateStationDescription(station_marker_id, detailedStation, cords) {
        let countryData = this.lookUp(cords["lat"], cords["lon"]);
        let { minPower, maxPower } = this.findMinMaxPower(
            detailedStation["zones"]
        );
        await database.updateStationDescription(
            station_marker_id,
            this.removeNumbersInSquareBrackets(detailedStation["name"]),
            detailedStation["detailed_description"]
                ? this.formatString(detailedStation["detailed_description"])
                : "NULL",
            "NULL",
            countryData ? countryData["country_a2"] : null,
            "NULL",
            this.hasSmartCharging(detailedStation["zones"]),
            this.hasChargingStationWithReserve(detailedStation["zones"]),
            detailedStation["address"]
                ? this.removeNumbersInSquareBrackets(detailedStation["address"])
                : "NULL",
            "NULL",
            "NULL",
            "NULL",
            detailedStation["workingHours"] ? false : true,
            Math.round(minPower / 1000),
            Math.round(maxPower / 1000),
            Date.now(),
            5,
            this.getStatusPosition(
                this.findUniqueStatuses(detailedStation["zones"])
            ),
            this.getFlags(this.findConnectors(detailedStation["zones"]))
        );
        return await database.getStationDescByID(station_marker_id);
    }

    async addStationConnectors(station_description, connectors) {
        for (const zone of connectors) {
            for (const evse of zone["evses"]) {
                await this.addOneStationConnector(station_description, evse);
            }
        }
    }

    async addOneStationConnector(station_description, connectorObj) {
        let connectorType = `${connectorObj["connectors"][0].icon}${connectorObj["connectors"][0].format}`;
        let connectorStatus = "active".match(
            connectorObj["connectors"][0]["status"]
        )
            ? 0
            : 1;
        await database.addStationConnector(
            station_description["description_id"],
            this.getTypePosition(connectorType),
            connectorStatus,
            connectorObj["identifier"],
            connectorObj["maxPower"] ? connectorObj["maxPower"] / 1000 : "NULL",
            "NULL",
            this.findPricePerStart(connectorObj["tariffId"]),
            this.findPriceConst(connectorObj["tariffId"]),
            this.findCurrencyCode(connectorObj["tariffId"]),
            this.findFreeMinAfterCharge(connectorObj["tariffId"]),
            this.findPriceAfterCharge(connectorObj["tariffId"])
        );
    }

    async updateStationConnectors(station_description, connectors) {
        if (!connectors) {
            return;
        }

        const existingConnectors = await database.getConnectors(
            station_description["description_id"]
        );
        const connectorOccurrences = {};
        const existingConnectorTypeIds = existingConnectors.map(
            (connector) => connector.connector_type_id
        );

        for (const zone of connectors) {
            for (const evse of zone["evses"]) {
                let connectorType = `${evse["connectors"][0].icon}${evse["connectors"][0].format}`;
                const connectorTypeId = this.getTypePosition(connectorType);

                const existingConnectorsOfType = existingConnectors.filter(
                    (connector) =>
                        connector.connector_type_id === connectorTypeId
                );

                let connectorToUpdate;

                if (existingConnectorsOfType.length > 0) {
                    const occurrences =
                        connectorOccurrences[connectorTypeId] || 0;
                    connectorToUpdate =
                        existingConnectorsOfType[
                            occurrences % existingConnectorsOfType.length
                        ];
                    connectorOccurrences[connectorTypeId] = occurrences + 1;
                } else {
                    await this.addOneStationConnector(
                        station_description,
                        evse
                    );
                    continue;
                }

                let connectorStatus = "active".match(
                    evse["connectors"][0]["status"]
                )
                    ? 0
                    : 1;

                await database.updateConnector(
                    connectorToUpdate["connector_id"],
                    this.getTypePosition(connectorType),
                    connectorStatus,
                    evse["identifier"],
                    evse["maxPower"] ? evse["maxPower"] / 1000 : "NULL",
                    "NULL",
                    this.findPricePerStart(evse["tariffId"]),
                    this.findPriceConst(evse["tariffId"]),
                    this.findCurrencyCode(evse["tariffId"]),
                    this.findFreeMinAfterCharge(evse["tariffId"]),
                    this.findPriceAfterCharge(evse["tariffId"])
                );

                // Видалення існуючого типу конектора зі списку, щоб залишилися лише ті, які не були оновлені
                const index = existingConnectorTypeIds.indexOf(connectorTypeId);
                if (index !== -1) {
                    existingConnectorTypeIds.splice(index, 1);
                }
            }
        }

        // Видалення конекторів, які не були оновлені
        for (const connectorTypeIdToDelete of existingConnectorTypeIds) {
            const connectorsToDelete = existingConnectors.filter(
                (connector) =>
                    connector.connector_type_id === connectorTypeIdToDelete
            );
            for (const connectorToDelete of connectorsToDelete) {
                await database.deleteConnector(
                    connectorToDelete["connector_id"]
                );
            }
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
            type2cable: 4,
            type2socket: 5,
            ccs2cable: 0,
            chademocable: 3,
        };
        return positionMap[type] !== undefined ? positionMap[type] : null;
    }

    findConnectorType(connectorsArr) {
        const positionMap = {
            type2cable: 4,
            type2socket: 5,
            ccs2cable: 0,
            chademocable: 3,
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

    parseLocation(locationStr) {
        let latLon = locationStr.split(",");
        let latitude = +latLon[0];
        let longitude = +latLon[1];
        return { longitude: longitude, latitude: latitude };
    }

    formatString(detailedDescription) {
        // Remove <ul>, <li>, </li>, &nbsp; tags, and the specified text
        let formattedDescription = detailedDescription
            .replace(
                /<\/?ul>|<\/?li>|<\/?strong>|&nbsp;|Увага! У звязку з масовими пошкодженнями електромереж в Україні на станціях може бути відсутнє живлення. Перевіряйте можливість заряджання за допомогою індикації портів в додатку \(зелений колір - доступний, червоний \/ cірий колір - не доступний\) або звертайтесь на гарячу лінію\./g,
                ""
            )
            .replace(/<\/?a[^>]*>/g, "")
            .replace(/<\/?i>/g, "")
            .replace(/<\/?em>/g, "");

        return formattedDescription;
    }

    hasSmartCharging(zones) {
        for (const zone of zones) {
            for (const evse of zone.evses) {
                if (evse.hasSmartCharging === true) {
                    return true;
                }
            }
        }
        return false;
    }

    hasChargingStationWithReserve(zones) {
        for (const zone of zones) {
            for (const evse of zone.evses) {
                if (evse.canReserve === true) {
                    return true;
                }
            }
        }
        return false;
    }

    removeNumbersInSquareBrackets(address) {
        const regex = /\[\d+(?:[\/-]\d+)?\]/g;
        const modifiedAddress = address.replace(regex, "");
        return modifiedAddress.trim();
    }

    findMinMaxPower(zones) {
        if (zones.length === 0) {
            return { minPower: null, maxPower: null };
        }

        let minPower = Infinity;
        let maxPower = -Infinity;

        for (const zone of zones) {
            for (const evse of zone.evses) {
                const power = evse.maxPower;
                if (power < minPower) {
                    minPower = power;
                }
                if (power > maxPower) {
                    maxPower = power;
                }
            }
        }

        return { minPower, maxPower };
    }

    findUniqueStatuses(zones) {
        const uniqueStatuses = new Set();

        for (const zone of zones) {
            for (const evse of zone.evses) {
                uniqueStatuses.add(evse.status);
            }
        }

        return Array.from(uniqueStatuses);
    }

    getStatusPosition(statuses) {
        if (statuses.includes("charging") || statuses.includes("available")) {
            return 0;
        } else if (
            statuses.includes("suspendedEV") ||
            statuses.includes("faulted")
        ) {
            return 1;
        } else if (statuses.includes("preparing")) {
            return 2;
        } else {
            return null;
        }
    }

    findConnectors(zones) {
        const concatenatedValues = [];

        for (const zone of zones) {
            for (const evse of zone.evses) {
                for (const connector of evse.connectors) {
                    const concatenatedValue = `${connector.icon}${connector.format}`;
                    concatenatedValues.push(concatenatedValue);
                }
            }
        }

        return concatenatedValues;
    }

    findPricePerStart(tariffId) {
        const tariff = this.tarifs.find((t) => t.id === tariffId);
        return tariff ? tariff.priceForSession : null;
    }

    findPriceConst(tariffId) {
        const tariff = this.tarifs.find((t) => t.id === tariffId);
        return tariff ? tariff.priceForEnergy : null;
    }

    findCurrencyCode(tariffId) {
        const tariff = this.tarifs.find((t) => t.id === tariffId);
        return tariff ? tariff.currencyCode : null;
    }

    findFreeMinAfterCharge(tariffId) {
        const tariff = this.tarifs.find((t) => t.id === tariffId);
        return tariff ? tariff.regularUseMinutes : null;
    }

    findPriceAfterCharge(tariffId) {
        const tariff = this.tarifs.find((t) => t.id === tariffId);
        return tariff ? tariff.priceForIdle : null;
    }
}

module.exports = new Api();
