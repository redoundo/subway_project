import { Device } from 'mediasoup-client';
import io from 'socket.io-client';

// It's recommended to move this to a configuration file or environment variable
export const SERVER_URLS= {
  "BACKEND_SERVER_URL": 'http://localhost:8000',
  "MEDIA_SERVER_URL": 'http://localhost:9099',
}

/**
 * Manages WebSocket connection, and Mediasoup publishing/subscribing logic.
 * This class is designed to be used within a React component's lifecycle
 * or a state management store like Zustand.
 */
class WebsocketManager {
  constructor() {
    /** @type {import('socket.io-client').Socket | null} */
    this.mediaSocket = null;
    /** @type {import('socket.io-client').Socket | null} */
    this.backendSocket = null;
    /** @type {import('mediasoup-client/lib/Device').Device | null} */
    this.device = null;
    /** @type {import('mediasoup-client/lib/Transport').Transport | null} */
    this.sendTransport = null;
    /** @type {import('mediasoup-client/lib/Transport').Transport | null} */
    this.recvTransport = null;
    /** @type {import('mediasoup-client/lib/Producer').Producer | null} */
    this.videoProducer = null;
    /** @type {import('mediasoup-client/lib/Producer').Producer | null} */
    this.audioProducer = null;
    /** @type {Map<string, import('mediasoup-client/lib/Consumer').Consumer>} */
    this.consumers = new Map();
  }

  /**
   * Establishes a connection to the WebSocket server.
   * @param {string} url
   * @returns {Promise<void>}
   */
  async connect(url) {
    return new Promise((resolve, reject) => {
      let socket = io(url, {transports: ['websocket']});

      if (url === SERVER_URLS.BACKEND_SERVER_URL) this.backendSocket = socket;
      else this.mediaSocket = socket;

      socket.on('connect', () => {
        console.log('Socket connected successfully.');
        resolve();
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err);
        reject(err);
      });
    });
  }

  /**
   * Disconnects from the WebSocket server and cleans up all resources.
   */
  disconnect() {
    if (this.mediaSocket) {
      this.mediaSocket.disconnect();
      this.mediaSocket = null;
      console.log('mediaSocket disconnected.');
    }
    if (this.backendSocket){
      this.backendSocket.disconnect();
      this.backendSocket = null;
      console.log('backendSocket disconnected.');
    }
    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }
    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }
    this.videoProducer = null;
    this.audioProducer = null;
    this.consumers.clear();
  }

  /**
   * Sends a request to the server via WebSocket and waits for a response.
   * @param {string} type - The event type to emit.
   * @param {object} [data={}] - The payload to send.
   * @returns {Promise<any>}
   */
  signal(type, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.mediaSocket) {
        return reject('No mediaSocket connection.');
      }
      this.mediaSocket.emit(type, data, (response) => {
        if (response && response.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Initializes the Mediasoup device. This must be called before publishing or subscribing.
   */
  async loadDevice() {
    if (this.device && this.device.loaded) return;
    if (!this.mediaSocket) throw new Error('Socket not connected. Call connect() first.');

    try {
      const routerRtpCapabilities = await this.signal('routerRtpCapabilities');
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities });
    } catch (err) {
      console.error('Failed to load mediasoup device:', err);
      throw err;
    }
  }

  /**
   * Prompts the user for webcam and microphone access.
   * @returns {Promise<MediaStream>} The user's media stream.
   */
  async startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      return stream;
    } catch (err) {
      console.error('Error starting webcam:', err);
      throw err;
    }
  }

  /**
   * Publishes the user's audio and video stream to the Mediasoup server.
   * @param {MediaStream} stream - The local media stream to publish.
   */
  async publish(stream) {
    if (!this.device || !this.device.loaded) {
      await this.loadDevice();
    }

    try {
      const transportInfo = await this.signal('createWebRtcTransport');
      this.sendTransport = this.device.createSendTransport(transportInfo);

      this.sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.signal('connectTransport', {
            transportId: this.sendTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });

      this.sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { id } = await this.signal('produce', {
            transportId: this.sendTransport.id,
            kind,
            rtpParameters,
          });
          callback({ id });
        } catch (error) {
          errback(error);
        }
      });

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if (audioTrack) {
        this.audioProducer = await this.sendTransport.produce({ track: audioTrack });
      }
      if (videoTrack) {
        this.videoProducer = await this.sendTransport.produce({ track: videoTrack });
      }

      console.log('Successfully published media.');
      return {
        audioProducerId: this.audioProducer ? this.audioProducer.id : null,
        videoProducerId: this.videoProducer ? this.videoProducer.id : null,
      };
    } catch (err) {
      console.error('Error publishing stream:', err);
      throw err;
    }
  }

  /**
   * Subscribes to a remote producer's stream (for proctors).
   * @param {Array<string>} userIds - The ID of the examinee to subscribe to.
   * @returns {Promise<{ consumer: import('mediasoup-client/lib/Consumer').Consumer, stream: MediaStream }>}
   */
  async subscribe(userIds) {
    if (!this.device || !this.device.loaded) {
      await this.loadDevice();
    }

    if (!this.recvTransport) {
      const transportInfo = await this.signal('createWebRtcTransport');
      this.recvTransport = this.device.createRecvTransport(transportInfo);

      this.recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.signal('connectTransport', {
            transportId: this.recvTransport.id,
            dtlsParameters,
          });
          callback();
        } catch (error) {
          errback(error);
        }
      });
    }

    try {
      const consumerInfos = await this.signal('consume', {
        transportId: this.recvTransport.id,
        userIds,
        rtpCapabilities: this.device.rtpCapabilities,
      });
      const returnMap = new Map();
      for(const consumerInfo of consumerInfos){
        const { id, kind, rtpParameters } = consumerInfo;
        const userId = userIds[consumerInfos.indexOf(consumerInfo)];
        const consumer = await this.recvTransport.consume({
          id,
          userId,
          kind,
          rtpParameters,
        });
          this.consumers.set(consumer.id, consumer);

          const stream = new MediaStream();
          stream.addTrack(consumer.track);

          console.log(`Successfully subscribed to producer ${userId}.`);
          returnMap.set(userId, {consumer, stream});
      }
      return returnMap;
    } catch (err) {
      console.error(`Error subscribing to producer ${producerId}:`, err);
      throw err;
    }
  }
}

// Export a singleton instance to be shared across the application
const websocketManager = new WebsocketManager();
export default websocketManager;
