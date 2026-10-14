/**
 * Waits until WireMock answers its health endpoint, so the suite never starts against a stub
 * that is still booting. Used as the entry step of the acceptance-tests container.
 */
import { testEnvironment } from '../src/config/test-environment';

const MAXIMUM_WAIT_MILLISECONDS = 60_000;
const POLL_INTERVAL_MILLISECONDS = 500;
const healthUrl = `${testEnvironment.weatherProviderStubUrl}/__admin/health`;

async function isHealthy(): Promise<boolean> {
  try {
    return (await fetch(healthUrl)).ok;
  } catch {
    return false;
  }
}

async function waitForStub(): Promise<void> {
  const deadline = Date.now() + MAXIMUM_WAIT_MILLISECONDS;
  while (Date.now() < deadline) {
    if (await isHealthy()) {
      console.warn(`Weather provider stub is ready at ${testEnvironment.weatherProviderStubUrl}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MILLISECONDS));
  }
  console.error(
    `Weather provider stub did not become healthy at ${healthUrl} within ${MAXIMUM_WAIT_MILLISECONDS} ms.`,
  );
  process.exit(1);
}

void waitForStub();
