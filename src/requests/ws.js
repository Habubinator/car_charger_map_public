const WebSocket = require("ws");

const API1CONNECT = `CONNECT
accept-version:1.2
heart-beat:10000,10000

\u0000`;

const API1SUBSCRIBE = `SUBSCRIBE
destination:/user/location/get_by_area_v31_answer
${process.env.API1_WEBSOCKET_ID}

\u0000`;

const API1SEND = `SEND
destination:/app/locations.get_by_area_v31
content-length:207

{
  "far_left": {
    "latitude": 57.92424568038614,
    "longitude": 19.032737240195274
  },
  "near_right": {
    "latitude": 42.22993342661437,
    "longitude": 33.88693280518055
  },
  "zoom": 6.090909
}\u0000`;

class WebSocketClient {
    constructor(url, maxRetries = 3, timeout = 20000) {
        this.url = url;
        this.ws = new WebSocket(url);
        this.retries = 0;
        this.maxRetries = maxRetries;
        this.timeout = timeout;
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws.addEventListener("open", resolve);
            this.ws.addEventListener("error", reject);
        });
    }

    async send(message) {
        return this.ws.send(message);
    }

    async receive() {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(0);

            const onDataReceived = async (event) => {
                const data = event.data; // Отримуємо дані з події повідомлення
                buffer = Buffer.concat([buffer, Buffer.from(data)]);
                const nullByteIndex = buffer.indexOf("\u0000");
                if (nullByteIndex !== -1) {
                    const bufferString = buffer
                        .slice(0, nullByteIndex)
                        .toString();
                    const jsonStartIndex = bufferString.indexOf("[");
                    const jsonEndIndex = bufferString.lastIndexOf("]");
                    if (
                        jsonStartIndex !== -1 &&
                        jsonEndIndex !== -1 &&
                        jsonStartIndex < jsonEndIndex
                    ) {
                        const jsonString = bufferString.substring(
                            jsonStartIndex,
                            jsonEndIndex + 1
                        );
                        try {
                            const parsedMessage = JSON.parse(jsonString);
                            resolve(parsedMessage);
                        } catch (error) {
                            console.error("Помилка парсингу JSON: ", error);
                        }
                    }
                    buffer = buffer.slice(nullByteIndex + 1);
                }
            };

            const onError = (error) => {
                console.error("Помилка WebSocket: ", error);
                reject(error);
            };

            const onClose = () => {
                console.log("З'єднання по WebSocket припинено успішно.");
                reject();
            };

            this.ws.addEventListener("message", onDataReceived);
            this.ws.addEventListener("error", onError);
            this.ws.addEventListener("close", onClose);

            const cleanup = () => {
                this.ws.removeEventListener("message", onDataReceived);
                this.ws.removeEventListener("error", onError);
                this.ws.removeEventListener("close", onClose);
            };

            setTimeout(() => {
                cleanup();
                reject(
                    new Error(
                        "З'єднання по WebSocket припинено, пам'ять очищено"
                    )
                );
            }, this.timeout);
        });
    }

    async getAPI1() {
        await this.connect();
        await this.send(API1CONNECT);
        await this.send(API1SUBSCRIBE);
        await this.send(API1SEND);

        // Тут чекаємо на друге повідомлення що є масивом
        const result = await this.receive();

        // Закриваємо з'єднання
        this.ws.close();

        return result;
    }
}

module.exports = WebSocketClient;
