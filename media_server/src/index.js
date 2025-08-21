const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mediasoup = require('mediasoup');
const cors = require('cors');
const os = require('os');

const app = express();
const httpServer = http.createServer(app);
const io = new socketIO.Server(httpServer, {
    cors: {
        origin: "*",
    }
});

app.use(cors());

// --- Mediasoup Setup ---
const workers = [];
let nextWorkerIndex = 0;

const mediaCodecs = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
    },
    {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
            'x-google-start-bitrate': 1000,
        },
    },
];

/**
 * Creates Mediasoup workers based on the number of available CPU cores.
 */
async function createWorkers() {
    const numWorkers = os.cpus().length;
    console.log(`Creating ${numWorkers} mediasoup worker(s)...`);

    for (let i = 0; i < numWorkers; i++) {
        const worker = await mediasoup.createWorker({
            logLevel: 'warn',
        });

        worker.on('died', () => {
            console.error(`mediasoup worker ${worker.pid} has died`);
            setTimeout(() => process.exit(1), 2000);
        });

        const router = await worker.createRouter({ mediaCodecs });
        workers.push({ worker, router });
        console.log(`Worker ${worker.pid} and Router created.`);
    }
}

/**
 * Gets the next available worker in a round-robin fashion.
 * @returns {{worker: mediasoup.types.Worker, router: mediasoup.types.Router}}
 */
function getMediasoupWorker() {
    const workerData = workers[nextWorkerIndex];
    nextWorkerIndex = (nextWorkerIndex + 1) % workers.length;
    console.log(`Assigning new connection to worker ${workerData.worker.pid}`);
    return workerData;
}

// Start the mediasoup workers immediately.
(async () => {
    try {
        await createWorkers();
    } catch (err) {
        console.error('Error creating mediasoup workers:', err);
        process.exit(1);
    }
})();


// --- Socket.IO Connection Handling ---
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // Assign a router to this connection from our pool of workers
    const { router } = getMediasoupWorker();

    // Resources scoped to this specific client
    const transports = new Map();
    const producers = new Map();

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        // Clean up resources for this client
        transports.forEach(transport => transport.close());
    });

    // Client requests router's capabilities
    socket.on('routerRtpCapabilities', (data, callback) => {
        callback(router.rtpCapabilities);
    });

    // Client requests to create a new WebRTC transport
    socket.on('createWebRtcTransport', async (data, callback) => {
        try {
            const webRtcTransport_options = {
                listenIps: [{ ip: '0.0.0.0', announcedIp: '127.0.0.1' }], // ANNOUNCED_IP should be configured
                enableUdp: true,
                enableTcp: true,
                preferUdp: true,
            };

            const transport = await router.createWebRtcTransport(webRtcTransport_options);
            transports.set(transport.id, transport);

            transport.on('dtlsstatechange', (dtlsState) => {
                if (dtlsState === 'closed') {
                    console.log(`Transport ${transport.id} closed.`);
                    transport.close();
                    transports.delete(transport.id);
                }
            });

            callback({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        } catch (error) {
            console.error('Error creating WebRTC transport:', error);
            callback({ error: error.message });
        }
    });

    // Client provides DTLS parameters to connect the transport
    socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
        const transport = transports.get(transportId);
        if (!transport) {
            console.error(`Transport with id ${transportId} not found for connection.`);
            return callback({ error: `Transport with id ${transportId} not found` });
        }

        try {
            await transport.connect({ dtlsParameters });
            callback();
        } catch (error) {
            console.error(`Error connecting transport ${transportId}:`, error);
            callback({ error: error.message });
        }
    });

    // Client requests to produce a media stream
    socket.on('produce', async ({ transportId, kind, rtpParameters, userId }, callback) => {
        const transport = transports.get(transportId);
        if (!transport) {
            console.error(`Transport with id ${transportId} not found for producing.`);
            return callback({ error: `Transport with id ${transportId} not found` });
        }

        try {
            const producer = await transport.produce({
                kind,
                rtpParameters,
                appData: { userId: userId } // appData를 사용하여 userId 저장
            });
            producers.set(producer.id, producer);

            producer.on('transportclose', () => {
                console.log(`Transport for producer ${producer.id} closed`);
                producer.close();
                producers.delete(producer.id);
            });

            console.log(`New producer created with id: ${producer.id} for user ${producer.appData.userId} on transport ${transport.id}`);
            callback({ id: producer.id });
        } catch (error) {
            console.error(`Error producing on transport ${transportId}:`, error);
            callback({ error: error.message });
        }
    });

    socket.on('consume', async ({ transportId, userIds, rtpCapabilities }, callback) => {
        const transport = transports.get(transportId);
        if (!transport) {
            return callback({ error: `Transport with id ${transportId} not found` });
        }
        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return callback({ error: 'userIds must be a non-empty array' });
        }

        const consumerParameters = [];

        // Find all producers for the given userIds
        const allProducers = Array.from(producers.values());
        const producersToConsume = allProducers.filter(p => userIds.includes(p.appData.userId));

        if (producersToConsume.length === 0) {
            return callback({ error: 'No producers found for the given userIds' });
        }

        for (const producer of producersToConsume) {
            if (router.canConsume({ producerId: producer.id, rtpCapabilities })) {
                try {
                    const consumer = await transport.consume({
                        producerId: producer.id,
                        rtpCapabilities,
                        paused: true, // Start paused and resume on the client
                    });

                    consumer.on('transportclose', () => {
                        console.log(`Transport for consumer ${consumer.id} closed`);
                        // You might want to notify the client to remove this consumer
                    });

                    consumer.on('producerclose', () => {
                        console.log(`Producer for consumer ${consumer.id} closed`);
                        // You might want to notify the client to remove this consumer
                    });

                    consumerParameters.push({
                        id: consumer.id,
                        producerId: producer.id,
                        userId: producer.appData.userId,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                    });
                } catch (error) {
                    console.error(`Error creating consumer for producer ${producer.id}:`, error);
                    // Decide if you want to stop or continue
                }
            }
        }

        callback({ consumerParameters });
    });
});

const PORT = 9099;
httpServer.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
