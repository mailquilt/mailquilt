import { Data } from "effect";

/**
 * A delivery of a batch found some of its recipients claimed by a delivery
 * that may still be sending to them, so the batch isn't settled yet. The
 * queue delivers it again later, by when they've been recorded or their
 * claim has expired.
 */
export class BatchStillSending extends Data.TaggedError("BatchStillSending") {}
