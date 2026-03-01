// Quick test script for Google Directions API transit mode in Japan
// Run: deno run --allow-net --allow-env scripts/test-transit.ts

const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
const DIRECTIONS_API = "https://maps.googleapis.com/maps/api/directions/json";

if (!GOOGLE_MAPS_API_KEY) {
  console.error("❌ GOOGLE_MAPS_API_KEY not set. Pass it as env var:");
  console.error("   GOOGLE_MAPS_API_KEY=xxx deno run --allow-net --allow-env scripts/test-transit.ts");
  Deno.exit(1);
}

interface TestCase {
  name: string;
  origin: string;
  destination: string;
}

const tests: TestCase[] = [
  { name: "Shin-Osaka → Kyoto (Shinkansen)", origin: "Shin-Osaka Station", destination: "Kyoto Station" },
  { name: "Shinjuku → Tokyo Station", origin: "Shinjuku Station, Tokyo", destination: "Tokyo Station" },
  { name: "Osaka → Namba", origin: "Osaka Station", destination: "Namba Station, Osaka" },
  { name: "Namba → Kansai Airport", origin: "Namba Station, Osaka", destination: "Kansai International Airport" },
  { name: "Shibuya → Asakusa", origin: "Shibuya Station, Tokyo", destination: "Asakusa Station, Tokyo" },
];

for (const t of tests) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`TEST: ${t.name}`);
  console.log(`  ${t.origin} → ${t.destination}`);
  console.log("=".repeat(60));

  const params = new URLSearchParams({
    origin: t.origin,
    destination: t.destination,
    mode: "transit",
    departure_time: "now",
    alternatives: "true",
    key: GOOGLE_MAPS_API_KEY,
  });

  try {
    const resp = await fetch(`${DIRECTIONS_API}?${params}`);
    const data = await resp.json();

    console.log(`Status: ${data.status}`);

    if (data.status !== "OK") {
      console.log(`Error: ${data.error_message ?? "none"}`);
      console.log(`Routes: ${data.routes?.length ?? 0}`);
      continue;
    }

    console.log(`Routes returned: ${data.routes.length}`);

    for (let i = 0; i < data.routes.length; i++) {
      const route = data.routes[i];
      const leg = route.legs[0];
      console.log(`\n  --- Route ${i + 1} ---`);
      console.log(`  Duration: ${leg.duration?.text}`);
      console.log(`  Depart: ${leg.departure_time?.text ?? "N/A"}`);
      console.log(`  Arrive: ${leg.arrival_time?.text ?? "N/A"}`);
      console.log(`  From: ${leg.start_address}`);
      console.log(`  To: ${leg.end_address}`);

      const transitLegs = (leg.steps ?? []).filter(
        (s: any) => s.travel_mode === "TRANSIT"
      );
      for (const s of transitLegs) {
        const td = s.transit_details;
        if (td) {
          const line = td.line?.short_name || td.line?.name || "?";
          const vehicle = td.line?.vehicle?.type || "?";
          const depStop = td.departure_stop?.name || "?";
          const arrStop = td.arrival_stop?.name || "?";
          const depTime = td.departure_time?.text || "?";
          const arrTime = td.arrival_time?.text || "?";
          const headsign = td.headsign || "";
          console.log(`    🚆 ${line} (${vehicle}) ${headsign}`);
          console.log(`       ${depTime} ${depStop} → ${arrTime} ${arrStop} (${s.duration?.text}, ${td.num_stops} stops)`);
        }
      }
    }
  } catch (e) {
    console.error(`  FETCH ERROR: ${(e as Error).message}`);
  }
}

console.log("\n✅ All tests complete.");
