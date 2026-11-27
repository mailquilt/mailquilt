import { Data } from "effect";

/**
 * A delivery of a batch found some of its recipients claimed by a delivery
 * that may still be sending to them, so the batch isn't settled yet. The
 * queue delivers it again later. A delivery that comes before those claims
 * are recorded or have expired (two minutes) fails the same way, so the
 * batch, and its Campaign, can stay unsettled across several retries.
 */
export class BatchStillSending extends Data.TaggedError("BatchStillSending") {}
