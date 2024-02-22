const Router = require("express");
const controller = require("../controllers/apiController");
const router = new Router();

// Test route to check if all is working | Check ping ms
router.get("/test", controller.test);

// Route to get all needed markers in certain radius
router.get("/getMarkers", controller.getSquare);

// Routre to get data about certain marker by its id
router.get("/getData", controller.getData);

// Routre to get statisctics about usage of certain markers
router.get("/getStatistics", controller.getStatistics);

module.exports = router;
