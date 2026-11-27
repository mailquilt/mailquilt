import { NodeDns } from "@effect/platform-node";
import { dnsWithDevRecords } from "@repo/core";
import { Config, Duration } from "effect";

const LOOKUP_TIMEOUT = Duration.seconds(5);

const TRIES = 2;

/**
 * Sending Domain checks' DNS on Node: the system's name servers, or those
 * `DNS_SERVERS` lists, separated by commas, such as `1.1.1.1,8.8.8.8`; or
 * `DEV_DNS_RECORDS` when set. Each lookup waits up to 5 seconds a try, and
 * tries twice.
 */
export const DnsFromEnv = dnsWithDevRecords(
  NodeDns.layerConfig({
    nameServers: Config.String("DNS_SERVERS").pipe(
      Config.map((servers) =>
        servers
          .split(",")
          .map((server) => server.trim())
          .filter((server) => server !== "")
      ),
      Config.withDefault([])
    ),
    timeout: Config.succeed(LOOKUP_TIMEOUT),
    tries: Config.succeed(TRIES),
  })
);
