import type { EncodedQueueMessage } from "@repo/db";

/** The Cloudflare Queue binding Campaign batches go through. */
export type QueueBinding = Queue<EncodedQueueMessage>;
