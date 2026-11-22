import { EventEmitter } from 'events';
import Redis from 'ioredis';

export type RealtimeEventType =
  | 'SYNC_STATE'
  | 'POST_CREATED'
  | 'POST_UPDATED'
  | 'CHAT_CREATED'
  | 'SALON_CREATED'
  | 'LIVE_CREATED'
  | 'LIVE_UPDATED'
  | 'LIVE_ENDED'
  | 'LIVE_REACTION'
  | 'LIVE_INVITE_RECEIVED'
  | 'LIVE_USER_BLOCKED'
  | 'FRIEND_UPDATED'
  | 'FRIEND_NEW_MEDIA'
  | 'ONLINE_USERS'
  | 'PRESENCE_COUNT'
  | 'USER_UPDATED'
  | 'MEDIA_FEED_UPDATED'
  | 'PLATFORM_KEYS_UPDATED';

export interface RealtimeEnvelope {
  type: RealtimeEventType;
  payload: unknown;
  originNodeId: string;
  ts: number;
}

const CHANNEL = 'evasion:realtime:v1';
const NODE_ID = `node_${process.pid}_${Math.random().toString(36).slice(2, 8)}`;

class RealtimePubSub {
  private localBus = new EventEmitter();
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private mode: 'redis' | 'local' = 'local';

  constructor() {
    this.localBus.setMaxListeners(100);
    let redisUrl = (process.env.REDIS_URL || '').trim();
    if (redisUrl) {
      if (redisUrl.startsWith('redis://') && (redisUrl.includes('upstash.io') || redisUrl.includes('tls=true'))) {
        redisUrl = redisUrl.replace('redis://', 'rediss://');
      }
      try {
        this.pub = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          enableReadyCheck: true,
        });
        this.sub = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: true,
          enableReadyCheck: true,
        });

        this.pub.on('error', (err) => {
          console.warn('[PubSub] Redis pub warning:', err.message);
        });
        this.sub.on('error', (err) => {
          console.warn('[PubSub] Redis sub warning:', err.message);
        });

        void Promise.all([this.pub.connect(), this.sub.connect()])
          .then(async () => {
            if (!this.sub) return;
            await this.sub.subscribe(CHANNEL);
            this.mode = 'redis';
            this.sub.on('message', (_chan, raw) => {
              try {
                const parsed = JSON.parse(raw) as RealtimeEnvelope;
                if (parsed && parsed.type) {
                  this.localBus.emit('event', parsed);
                }
              } catch {
                // ignore malformed pubsub frame
              }
            });
            console.log('📡 ÉVASION Redis Pub/Sub connected');
          })
          .catch((err) => {
            console.warn('[PubSub] Falling back to local EventEmitter:', err?.message || err);
            this.mode = 'local';
          });
      } catch (err) {
        console.warn('[PubSub] Redis init skipped, using local bus:', err);
        this.mode = 'local';
      }
    }
  }

  public getMode(): 'redis' | 'local' {
    return this.mode;
  }

  public getNodeId(): string {
    return NODE_ID;
  }

  public publish(type: RealtimeEventType, payload: unknown): void {
    const envelope: RealtimeEnvelope = {
      type,
      payload,
      originNodeId: NODE_ID,
      ts: Date.now(),
    };

    if (this.mode === 'redis' && this.pub) {
      void this.pub.publish(CHANNEL, JSON.stringify(envelope)).catch(() => {
        this.localBus.emit('event', envelope);
      });
      return;
    }

    this.localBus.emit('event', envelope);
  }

  public subscribe(listener: (event: RealtimeEnvelope) => void): () => void {
    this.localBus.on('event', listener);
    return () => {
      this.localBus.off('event', listener);
    };
  }
}

export const realtimePubSub = new RealtimePubSub();
