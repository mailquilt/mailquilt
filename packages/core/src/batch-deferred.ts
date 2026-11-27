import { Data } from "effect";

/**
 * The Provider put off some of a batch's emails (`SendDeferred`), and they
 * were put back in the queue. The queue delivers the batch again later, to
 * try them.
 */
export class BatchDeferred extends Data.TaggedError("BatchDeferred") {}
