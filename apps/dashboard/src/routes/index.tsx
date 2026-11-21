import { Surface, Text } from "@cloudflare/kumo";
import { createFileRoute } from "@tanstack/react-router";

import { HealthStatus } from "../health/health-status.tsx";

const Home = () => (
  <Surface className="flex flex-col gap-4 rounded-lg p-6">
    <Text as="h1" variant="heading" size="lg">
      Status
    </Text>
    <HealthStatus />
  </Surface>
);

export const Route = createFileRoute("/")({ component: Home });
