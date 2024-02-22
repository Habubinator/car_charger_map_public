const db = require("./../database/dbController");
const apisControllers = [
    require("./../requests/apis/api1.js"),
    require("./../requests/apis/api2.js"),
    require("./../requests/apis/api3.js"),
    require("./../requests/apis/api4.js"),
    require("./../requests/apis/api7.js"),
    require("./../requests/apis/api8.js"),
    require("./../requests/apis/api9.js"),
    require("./../requests/apis/api11.js"),
    require("./../requests/apis/api12.js"),
    require("./../requests/apis/api26.js"),
];

class ShopController {
    async test(req, res) {
        try {
            return res.json("WORKING");
        } catch (error) {
            return res.status(500).json({ message: `${error}` });
        }
    }

    async getSquare(req, res) {
        try {
            const {
                centerPoint = { longitude: 0, latitude: 0 },
                radius = 0.1,
                powerRange = { minPower: 0, maxPower: 1000 },
            } = req.body;

            if (centerPoint) {
                if (
                    typeof centerPoint !== "object" ||
                    isNaN(centerPoint.longitude) ||
                    isNaN(centerPoint.latitude)
                ) {
                    return res
                        .status(400)
                        .json({ message: "Invalid centerPoint" });
                }

                if (isNaN(radius)) {
                    return res.status(400).json({ message: "Invalid radius" });
                }

                if (
                    !powerRange ||
                    typeof powerRange !== "object" ||
                    isNaN(powerRange.minPower) ||
                    isNaN(powerRange.maxPower)
                ) {
                    return res
                        .status(400)
                        .json({ message: "Invalid powerRange" });
                }

                const result = await db.getMarkersByRadius(
                    centerPoint,
                    radius,
                    powerRange
                );
                return res.json(result);
            } else {
                return res
                    .status(400)
                    .json({ message: "Invalid input parameters" });
            }
        } catch (error) {
            return res.status(500).json({ message: `${error}` });
        }
    }

    async getData(req, res) {
        try {
            const { markerId } = req.body;

            if (!Number.isInteger(markerId)) {
                return res.status(400).json({ message: "Invalid id" });
            }
            let data = await db.getAllDataByMarkerId(markerId);
            for (const station of data) {
                let api = await db.getApiByID(station["api_id"]);
                let cords = {
                    lon: station["longitude"],
                    lat: station["latitude"],
                };

                apisControllers[station["api_id"] - 1].updateElement(
                    api[0],
                    station["og_api_pk"],
                    station["description_id"],
                    cords
                );
            }
            res.json(data);
        } catch (error) {
            return res.status(500).json({ message: `${error}` });
        }
    }

    async getStatistics(req, res) {
        try {
            const { connectorType } = req.body;

            if (!Number.isInteger(connectorType)) {
                return res.status(400).json({ message: "Invalid type" });
            }

            return res.json(await db.getStationTypeStatisctics(connectorType));
        } catch (error) {
            return res.status(500).json({ message: `${error}` });
        }
    }
}

module.exports = new ShopController();
