// Test script for Google Routes API v2 transit mode
// Run: deno run --allow-net --allow-env scripts/test-transit.ts

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
const ROUTES_API = "https://routes.googleapis.com/directions/v2:computeRoutes";

if (!GOOGLE_MAPS_API_KEY) {
  console.error("GOOGLE_MAPS_API_KEY not set. Pass it as env var:");
  console.error("   GOOGLE_MAPS_API_KEY=xxx deno run --allow-net --allow-env scripts/test-transit.ts");
  Deno.exit(1);
}

const FIELD_MASK = [
  "routes.legs.duration",
  "routes.legs.steps.transitDetails",
  "routes.legs.steps.startLocation",
  "routes.legs.steps.endLocation",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.localizedValues",
  "routes.legs.steps.navigationInstruction",
  "routes.legs.stepsOverview",
  "routes.localizedValues",
  "routes.travelAdvisory",
  "routes.legs.localizedValues",
].join(",");

interface TestCase {
  name: string;
  origin: string;
  destination: string;
  transitPreferences?: Record<string, unknown>;
}

const tests: TestCase[] = [
  { name: "Shin-Osaka → Kyoto (Shinkansen)", origin: "Shin-Osaka Station", destination: "Kyoto Station" },
  { name: "Shinjuku → Tokyo Station", origin: "Shinjuku Station, Tokyo", destination: "Tokyo Station" },
  { name: "Osaka → Namba", origin: "Osaka Station", destination: "Namba Station, Osaka" },
  {
    name: "Namba → Kansai Airport (TRAIN, LESS_WALKING)",
    origin: "Namba Station, Osaka",
    destination: "Kansai International Airport",
    transitPreferences: { routingPreference: "LESS_WALKING", allowedTravelModes: ["TRAIN"] },
  },
  { name: "Shibuya → Asakusa", origin: "Shibuya Station, Tokyo", destination: "Asakusa Station, Tokyo" },
  { name: "Flinders St → Melbourne Airport", origin: "Flinders Street Station, Melbourne", destination: "Melbourne Airport" },
  {
    name: "Lisbon Airport → Basilica (from Google docs example)",
    origin: "Humberto Delgado Airport, Portugal",
    destination: "Basílica of Estrela, Praça da Estrela, 1200-667 Lisboa, Portugal",
    transitPreferences: { routingPreference: "LESS_WALKING", allowedTravelModes: ["TRAIN"] },
  },
];

for (const t of tests) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${t.name}`);
  console.log(`  ${t.origin} → ${t.destination}`);
  console.log("=".repeat(60));

  const body: Record<string, unknown> = {
    origin: { address: t.origin },
    destination: { address: t.destination },
    travelMode: "TRANSIT",
    computeAlternativeRoutes: true,
  };

  if (t.transitPreferences) {
    body.transitPreferences = t.transitPreferences;
  }

  try {
    const resp = await fetch(ROUTES_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();

    if (data.error) {
      console.log(`  ERROR: ${data.error.message} (${data.error.status})`);
      continue;
    }

    console.log(`  Routes returned: ${data.routes?.length ?? 0}`);

    for (let i = 0; i < (data.routes?.length ?? 0); i++) {
      const route = data.routes[i];
      const leg = route.legs?.[0];
      if (!leg) continue;

      console.log(`\n  --- Route ${i + 1} ---`);
      console.log(`  Duration: ${route.localizedValues?.duration?.text ?? leg.duration}`);

      if (route.travelAdvisory?.transitFare) {
        const fare = route.travelAdvisory.transitFare;
        console.log(`  Fare: ${fare.currencyCode} ${fare.units ?? "0"}.${String(fare.nanos ?? 0).padStart(2, "0")}`);
      }
      if (route.localizedValues?.transitFare?.text) {
        console.log(`  Fare (localised): ${route.localizedValues.transitFare.text}`);
      }

      for (const s of leg.steps ?? []) {
        if (s.travelMode === "WALK") {
          console.log(`    Walk: ${s.localizedValues?.distance?.text ?? "?"} (${s.localizedValues?.staticDuration?.text ?? "?"})`);
          if (s.navigationInstruction?.instructions) {
            console.log(`      ${s.navigationInstruction.instructions}`);
          }
        } else if (s.travelMode === "TRANSIT" && s.transitDetails) {
          const td = s.transitDetails;
          const line = td.transitLine;
          const lineName = line?.nameShort || line?.name || "?";
          const vehicleType = line?.vehicle?.type || "?";
          const depStop = td.stopDetails?.departureStop?.name || "?";
          const arrStop = td.stopDetails?.arrivalStop?.name || "?";
          const depTime = td.localizedValues?.departureTime?.time?.text || td.stopDetails?.departureTime || "?";
          const arrTime = td.localizedValues?.arrivalTime?.time?.text || td.stopDetails?.arrivalTime || "?";
          const headsign = td.headsign || "";
          console.log(`    ${lineName} (${vehicleType}) ${headsign}`);
          console.log(`       ${depTime} ${depStop} → ${arrTime} ${arrStop} (${td.stopCount ?? "?"} stops)`);
          if (line?.agencies?.length) {
            console.log(`       Agency: ${line.agencies[0].name}`);
          }
        }
      }

      if (leg.stepsOverview?.multiModalSegments) {
        console.log(`  Overview: ${leg.stepsOverview.multiModalSegments.map((s: any) => s.travelMode).join(" → ")}`);
      }
    }
  } catch (e) {
    console.error(`  FETCH ERROR: ${(e as Error).message}`);
  }
}

console.log("\nAll tests complete.");
