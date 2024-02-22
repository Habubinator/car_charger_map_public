const db = require("./dbPool");

class DBController {
    constructor() {
        this.VALUES = {
            STATUS: {
                STATION: [
                    "Online",
                    "Offline",
                    "Service",
                    "Building",
                    "API_ERROR",
                ],
                CONNECTOR: [
                    "Available",
                    "Occupied",
                    "Charging",
                    "Finishing",
                    "Reserved",
                    "Service",
                    "Error",
                ],
            },
            NETWORK: ["Hubject", "eON", "EmBW", "TOKA", "Ionity", "NULL"],
            CONNECTOR: [
                "CCS2",
                "CCS1",
                "GBTDC",
                "Chademo",
                "Type2plug",
                "Type2",
                "Type1",
                "GBTAC",
                "Nacs",
                "CCS1|CCS2",
                "Type2|Type1",
                "Chademo|GBTDC",
            ],
            CONNECTORTYPE: {
                BINARY: {
                    CCS2: `b'1000000000000000'`, //32768
                    CCS1: `b'0100000000000000'`, //16384
                    GBTDC: `b'0010000000000000'`, //8192
                    Chademo: `b'0001000000000000'`, //4096
                    Type2plug: `b'0000100000000000'`, //2048
                    Type2: `b'0000010000000000'`, //1024
                    Type1: `b'0000001000000000'`, //512
                    GBTAC: `b'0000000100000000'`, //256
                    Nacs: `b'0000000010000000'`, //128
                    "CCS1|CCS2": `b'0000000001000000'`, //64
                    "Type2|Type1": `b'0000000000100000'`, //32
                },
                DECIMAL: {
                    CCS2: 32768, // b'1000000000000000'
                    CCS1: 16384, // b'0100000000000000'
                    GBTDC: 8192, // b'0010000000000000'
                    Chademo: 4096, // b'0001000000000000'
                    Type2plug: 2048, // b'0000100000000000'
                    Type2: 1024, // b'0000010000000000'
                    Type1: 512, // b'0000001000000000'
                    GBTAC: 256, // b'0000000100000000'
                    Nacs: 128, // b'0000000010000000'
                    "CCS1|CCS2": 64, // b'0000000001000000'
                    "Type2|Type1": 32, // b'0000000000100000'
                },
            },
        };
    }

    combine(arr) {
        // ініціалізація
        let flag = 0;

        // Проходим по переданному массиву
        arr.forEach((value) => {
            // Проверяем, есть ли переданное значение в CONNECTORTYPE.BINARY
            if (this.VALUES.CONNECTORTYPE.BINARY.hasOwnProperty(value)) {
                // Добавляем соответствующее бинарное значение к бинарному флагу
                flag |= this.VALUES.CONNECTORTYPE.DECIMAL[value];
            }
        });

        return flag;
    }

    toBinary(num) {
        let str = "";
        do {
            str = `${num & 1}${str}`;
            num >>= 1;
        } while (num);
        return `${str}`;
    }

    //Вираховує координати в метри
    calculateHaversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000; // Радіус землі
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) *
                Math.cos(lat2 * (Math.PI / 180)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return distance;
    }

    async addStationMarker(longitude, latitude) {
        try {
            await db.promise().query(`
                INSERT INTO station_marker (longitude, latitude)
                VALUES (${longitude}, ${latitude});
            `);

            // Execute a separate SELECT statement to get the last inserted ID
            const selectQuery =
                "SELECT * FROM station_marker WHERE station_id = LAST_INSERT_ID();";
            const result = await db.promise().query(selectQuery);
            return await result[0][0]["station_id"];
        } catch (error) {
            if (error.code === "ER_DUP_ENTRY") {
                // Handle duplicate entry error
                console.error("Duplicate entry error:", error.message);
                // You can also extract additional information from the error message, like the key and value causing the duplicate
                const match = error.message.match(/for key '(.+?)'/);
                if (match) {
                    const duplicateKey = match[1];
                    console.error("Duplicate key:", duplicateKey);
                }
            } else {
                // Handle other types of errors
                console.error("SQL Error:", error.message);
            }
            return null;
        }
    }

    async addStationDescription(
        stationId,
        stationName,
        descriptionString,
        locationType,
        countryCode,
        supportPhone,
        isSupportCharging,
        isSupportReservation,
        locationName,
        lastCharging,
        isPublic,
        isFastCharger,
        isOpen24x7,
        minPowerKW,
        maxPowerKW,
        lastStatusUpdate,
        networkId,
        stationStatusId,
        station_flags
    ) {
        const query = `
        INSERT INTO station_description (
            station_id, station_name, description_string, location_type, country_code, 
            support_phone, is_support_charging, is_support_reservation, location_name, 
            last_charging, is_public, is_fast_charger, is_open_24x7, min_power_kw, 
            max_power_kw, last_status_update, network_id, status_id, station_flags
        )
        VALUES (
            ${stationId}, '${this.fixStr(
            stationName ? stationName.trim() : "null"
        )}', '${this.fixStr(this.truncateString(descriptionString, 600))}', 
            '${this.fixStr(locationType)}', '${this.fixStr(countryCode)}', 
            '${this.fixStr(
                supportPhone
            )}', ${isSupportCharging}, ${isSupportReservation}, 
            '${this.fixStr(
                locationName
            )}', ${lastCharging}, ${isPublic}, ${isFastCharger}, 
            ${isOpen24x7}, ${minPowerKW}, ${maxPowerKW}, ${lastStatusUpdate}, ${networkId}, 
            ${stationStatusId}, b'${station_flags}'
        );
    `;

        await db.promise().query(query);

        // Execute a separate SELECT statement to get the last inserted ID
        const selectQuery =
            "SELECT * FROM station_description WHERE description_id = LAST_INSERT_ID();";
        const result = (await db.promise().query(selectQuery))[0][0];
        return result;
    }

    async addStationDescApi(apiId, descriptionId) {
        const query = `
        INSERT INTO station_desc_api (api_id, description_id)
        VALUES (${apiId}, ${descriptionId})
        `;
        db.promise().query(query);
    }

    async addPKStationDescApi(apiId, descriptionId, og_api_pk) {
        const query = `
        INSERT INTO station_desc_api (api_id, description_id, og_api_pk)
        VALUES (${apiId}, ${descriptionId}, ${og_api_pk})
        `;
        db.promise().query(query);
    }

    async addStationConnector(
        descriptionId,
        connectorTypeId,
        connectorStatusId,
        connectorName,
        powerKW,
        currentAmp,
        pricePerStart,
        price,
        currency,
        freeMinAfterCharging,
        pricePerMinAfterCharging
    ) {
        const query = `
        INSERT INTO station_connector (
            description_id, connector_type_id, connector_status_id, connector_name, power_kw, current_amp, 
            price_per_start, price, currency, free_min_after_charging, price_per_min_after_charging
        )
        VALUES (
            ${descriptionId}, ${connectorTypeId}, ${connectorStatusId}, '${this.fixStr(
            connectorName
        )}', ${powerKW}, ${currentAmp}, 
            ${pricePerStart}, ${price}, '${this.fixStr(
            currency
        )}', ${freeMinAfterCharging}, ${pricePerMinAfterCharging}
        )
    `;

        db.promise().query(query);
    }

    async getApi() {
        const result = (
            await db.promise().query("SELECT * FROM api_source")
        )[0];
        return result;
    }

    async getApiByID(api_id) {
        const result = (
            await db
                .promise()
                .query(`SELECT * FROM api_source WHERE api_id = ${api_id}`)
        )[0];
        return result;
    }

    async updateApi(apiId, update_interval_ms) {
        const currentTimestamp = Date.now();
        const lastUpdate = currentTimestamp;
        const nextUpdate = currentTimestamp + update_interval_ms;

        // Оновлюємо рядок у таблиці
        db.promise().query(
            `UPDATE api_source SET last_update = ${lastUpdate}, next_update = ${nextUpdate} WHERE api_id = ${apiId}`
        );
    }

    async updateStationDescription(
        description_id,
        newStationName,
        newDescriptionString,
        newLocationType,
        newCountryCode,
        newSupportPhone,
        newIsSupportCharging,
        newIsSupportReservation,
        newLocationName,
        newLastCharging,
        newIsPublic,
        newIsFastCharger,
        newIsOpen24x7,
        newMinPowerKW,
        newMaxPowerKW,
        newLastStatusUpdate,
        newNetworkId,
        newStationStatusId,
        newStationFlags
    ) {
        const query = `
        UPDATE station_description
        SET
            station_name = '${this.fixStr(
                newStationName ? newStationName.trim() : null
            )}',
            description_string = '${this.fixStr(
                this.truncateString(newDescriptionString, 600)
            )}',
            location_type = '${this.fixStr(newLocationType)}',
            country_code = '${this.fixStr(newCountryCode)}',
            support_phone = '${this.fixStr(newSupportPhone)}',
            is_support_charging = ${newIsSupportCharging},
            is_support_reservation = ${newIsSupportReservation},
            location_name = '${this.fixStr(newLocationName)}',
            last_charging = ${newLastCharging},
            is_public = ${newIsPublic},
            is_fast_charger = ${newIsFastCharger},
            is_open_24x7 = ${newIsOpen24x7},
            min_power_kw = ${newMinPowerKW},
            max_power_kw = ${newMaxPowerKW},
            last_status_update = ${newLastStatusUpdate},
            network_id = ${newNetworkId},
            status_id = ${newStationStatusId},
            station_flags = b'${newStationFlags}'
        WHERE
            description_id = ${description_id};
    `;

        await db.promise().query(query);
    }

    async getStationDescByID(stationId) {
        const selectQuery = `
        SELECT *
        FROM station_description
        WHERE station_id = ${stationId};
    `;
        const result = (await db.promise().query(selectQuery))[0][0];
        return result;
    }

    async getConnectors(stationDescriptionId) {
        const query = `
            SELECT *
            FROM station_connector
            WHERE description_id = ${stationDescriptionId}
            ORDER BY description_id
        `;
        const checkResult = await db.promise().query(query);
        return checkResult[0];
    }

    async deleteConnector(connector_id) {
        const query = `DELETE FROM station_connector
                    WHERE connector_id = ${connector_id};`;
        await db.promise().query(query);
    }

    async updateConnector(
        connector_id,
        connectorTypeId,
        connectorStatusId,
        connectorName,
        powerKW,
        currentAmp,
        pricePerStart,
        price,
        currency,
        freeMinAfterCharging,
        pricePerMinAfterCharging
    ) {
        const query = `
            UPDATE station_connector
            SET
                connector_status_id = ${connectorStatusId},
                connector_type_id = ${connectorTypeId},
                connector_name = '${this.fixStr(connectorName)}',
                power_kw = ${powerKW},
                current_amp = ${currentAmp},
                price_per_start = ${pricePerStart},
                price = ${price},
                currency = '${this.fixStr(currency)}',
                free_min_after_charging = ${freeMinAfterCharging},
                price_per_min_after_charging = ${pricePerMinAfterCharging}
            WHERE
                connector_id = ${connector_id};
        `;
        await db.promise().query(query);
    }

    async executeQuery(query) {
        const result = db.promise().query(query);
        return result;
    }

    fixStr(inputString) {
        if (inputString) {
            return inputString.replace(/'/g, "''");
        }
        return "NULL";
    }

    async getMarker(longitude, latitude) {
        const query = `SELECT sm.* FROM station_marker AS sm
                   JOIN station_description AS sd ON sm.station_id = sd.station_id
                   WHERE ST_Contains(ST_Envelope(ST_Buffer(POINT(${longitude}, ${latitude}), 0.000009)), POINT(sm.longitude, sm.latitude))`;
        const result = await db.promise().query(query);
        return result[0];
    }

    async getMarkerByPK(api_id, marker_pk) {
        const query = `SELECT sm.*, sda.*
                    FROM station_marker sm
                    JOIN station_description sd ON sm.station_id = sd.station_id
                    JOIN station_desc_api sda ON sd.station_id = sda.description_id
                    WHERE sda.api_id = ${api_id} AND sda.og_api_pk = ${marker_pk}
                    `;
        const result = await db.promise().query(query);
        return result[0];
    }

    async getMarkersByRadius(centerPoint, radius, powerRange) {
        const query = `SELECT DISTINCT sm.* FROM station_marker AS sm
                   JOIN station_description AS sd ON sm.station_id = sd.station_id
                   WHERE ST_Contains(ST_Envelope(ST_Buffer(POINT(${centerPoint.longitude}, ${centerPoint.latitude}), ${radius})), POINT(sm.longitude, sm.latitude))
                     AND sd.min_power_kw <= ${powerRange.maxPower}
                     AND sd.max_power_kw >= ${powerRange.minPower}`;
        const result = await db.promise().query(query);
        return result[0];
    }

    async getStationTypeStatisctics(connectorType) {
        const query = `
        SELECT
            sd.country_code,
            sc.connector_type_id,
            COUNT(DISTINCT sd.station_id) AS station_count
        FROM
            station_description sd
        JOIN
            station_connector sc ON sd.description_id = sc.description_id
        ${connectorType ? `WHERE sc.connector_type_id = ${connectorType}` : ""}
        GROUP BY
            sd.country_code, sc.connector_type_id;
        `;
        const result = await db.promise().query(query);
        // Перетворення результату у вигляд об'єкта
        const transformedResult = result[0].reduce((acc, row) => {
            const { country_code, connector_type_id, station_count } = row;

            // Перевірка, чи вже існує запис для цієї країни у вихідному об'єкті
            if (!acc[country_code]) {
                acc[country_code] = [];
            }

            // Додавання нового об'єкта до масиву для даної країни
            acc[country_code].push({
                connector_type_id,
                station_count,
            });

            return acc;
        }, {});

        return transformedResult;
    }

    async getAllDataByMarkerId(markerId) {
        const query = `SELECT 
    sm.station_id AS station_id,
    sm.longitude AS longitude,
    sm.latitude AS latitude,
    JSON_OBJECT(
        'station_description', JSON_OBJECT(
            'description_id', sd.description_id,
            'station_id', sd.station_id,
            'station_name', sd.station_name,
            'description_string', sd.description_string,
            'location_type', sd.location_type,
            'country_code', sd.country_code,
            'support_phone', sd.support_phone,
            'is_support_charging', sd.is_support_charging,
            'is_support_reservation', sd.is_support_reservation,
            'location_name', sd.location_name,
            'last_charging', sd.last_charging,
            'is_public', sd.is_public,
            'is_fast_charger', sd.is_fast_charger,
            'is_open_24x7', sd.is_open_24x7,
            'min_power_kw', sd.min_power_kw,
            'max_power_kw', sd.max_power_kw,
            'last_status_update', sd.last_status_update,
            'status_id', sd.status_id,
            'network_id', sd.network_id,
            'station_flags', sd.station_flags
        ),
        'comments', 
        (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'comment_id', c.comment_id,
                'description_id', c.description_id,
                'comment_href', c.comment_href,
                'author_name',c.author_name,
                'rating', c.rating,
                'comment_text', c.comment_text
            )
        ) FROM comments c WHERE c.description_id = sd.description_id),
        'images', 
        (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'image_id', i.image_id,
                'image_href', i.image_href
            )
        ) FROM images i WHERE i.description_id = sd.description_id),
        'connectors', 
        (SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
                'connector_id', sc.connector_id,
                'description_id', sc.description_id,
                'connector_type_id', sc.connector_type_id,
                'connector_status_id', sc.connector_status_id,
                'connector_name', sc.connector_name,
                'power_kw', sc.power_kw,
                'current_amp', sc.current_amp,
                'price_per_start', sc.price_per_start,
                'price', sc.price,
                'currency', sc.currency,
                'free_min_after_charging', sc.free_min_after_charging,
                'price_per_min_after_charging', sc.price_per_min_after_charging
            )
        ) FROM station_connector sc WHERE sc.description_id = sd.description_id)
    ) AS data,
    sda.*
FROM 
    station_marker AS sm
JOIN 
    station_description AS sd ON sm.station_id = sd.station_id
JOIN 
    station_desc_api AS sda ON sd.station_id = sda.description_id
WHERE 
    sm.station_id = ${markerId};`;
        const result = await db.promise().query(query);
        return result[0];
    }

    async addComment(
        descriptionId,
        commentHref,
        authorName,
        rating,
        commentText
    ) {
        const query = `
        INSERT INTO comments (description_id, comment_href, author_name, rating, comment_text)
        VALUES (${descriptionId}, '${this.fixStr(commentHref)}', '${this.fixStr(
            authorName
        )}', ${rating}, '${this.truncateString(
            this.fixStr(commentText),
            600
        )}');
    `;
        await db.promise().query(query);
    }

    async updateComment(
        commentId,
        descriptionId,
        commentHref,
        authorName,
        rating,
        commentText
    ) {
        const query = `
        UPDATE comments
        SET
            description_id = ${descriptionId},
            comment_href = '${this.fixStr(commentHref)}',
            author_name = '${this.fixStr(authorName)}',
            rating = ${rating},
            comment_text = '${this.truncateString(
                this.fixStr(commentText),
                600
            )}'
        WHERE comment_id = ${commentId};
        `;

        await db.promise().query(query);
    }

    async addImage(descriptionId, imageHref) {
        const query = `
        INSERT INTO images (description_id, image_href)
        VALUES (${descriptionId}, '${imageHref}');
    `;
        await db.promise().query(query);
    }

    async updateImage(imageId, descriptionId, imageHref) {
        const query = `
        UPDATE images
        SET
            description_id = ${descriptionId},
            image_href = '${imageHref}'
        WHERE image_id = ${imageId};
        `;

        await db.promise().query(query);
    }

    async getCommentsByDescriptionId(descriptionId) {
        const query = `
        SELECT *
        FROM comments
        WHERE description_id = ${descriptionId};
    `;

        const result = await db.promise().query(query);
        return result[0];
    }

    async getImagesByDescriptionId(descriptionId) {
        const query = `
        SELECT *
        FROM images
        WHERE description_id = ${descriptionId};
    `;

        const result = await db.promise().query(query);
        return result[0];
    }

    truncateString(inputString, maxLength = 255) {
        if (inputString) {
            if (inputString.length > maxLength) {
                return inputString.substring(0, maxLength);
            } else {
                return inputString;
            }
        }
        return null;
    }

    async getDescByApi(station_id, api_id) {
        const query = `
        SELECT sd.*
            FROM station_description sd
            LEFT JOIN station_desc_api sda ON sd.description_id = sda.description_id
            WHERE sd.station_id = ${station_id}
            AND sda.api_id = ${api_id};
    `;

        const result = await db.promise().query(query);
        return result[0];
    }
}

module.exports = new DBController();
