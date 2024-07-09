import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const API_DELAY = 1000; // 1 second delay between API calls
const BATCH_SIZE = 10; // Reduced batch size
const USER_AGENT = "Foodshare/1.0 (https://foodshare.club)";
const FUNCTION_TIMEOUT = 25000; // 25 seconds, slightly less than the Edge Function limit

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, maxRetries = 3, initialDelay = 1000): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT
        }
      });
      
      if (response.ok) return response;
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : initialDelay * Math.pow(2, i);
        console.log(`Rate limited. Waiting for ${delayMs}ms before retrying.`);
        await delay(delayMs);
        continue;
      }
      
      throw new Error(`HTTP error! status: ${response.status}`);
    } catch (err) {
      console.error(`Attempt ${i + 1} failed: ${err}`);
      if (i === maxRetries - 1) throw err;
    }
    const delayMs = initialDelay * Math.pow(2, i);
    console.log(`Waiting for ${delayMs}ms before retrying.`);
    await delay(delayMs);
  }
  throw new Error(`Failed to fetch after ${maxRetries} retries`);
}

async function geocodeAddress(addressString: string): Promise<any> {
  console.log(`Geocoding address: ${addressString}`);
  const encodedAddress = encodeURIComponent(addressString);
  const url = `${NOMINATIM_BASE_URL}?q=${encodedAddress}&format=json&addressdetails=1&limit=1`;
  
  try {
    const nominatimResponse = await fetchWithRetry(url);
    
    const contentType = nominatimResponse.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error("Received non-JSON response from Nominatim API");
      return [];
    }
    
    const result = await nominatimResponse.json();
    console.log(`Geocoding result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    console.error("Error querying Nominatim API:", error);
    return [];
  }
}

async function processAddress(supabase: any, address: any) {
  console.log("Processing address for profile_id:", address.profile_id);

  if (!address.generated_full_address) {
    console.log("No generated_full_address for profile_id:", address.profile_id);
    return { profile_id: address.profile_id, status: "error", message: "No generated_full_address available" };
  }

  let geocodeData = await geocodeAddress(address.generated_full_address);

  if (geocodeData.length === 0) {
    console.log("No coordinates found for the address");
    return { 
      profile_id: address.profile_id,
      status: "not_found",
      address: address.generated_full_address,
      message: "Nominatim could not find coordinates for this address"
    };
  }

  const { lat, lon } = geocodeData[0];
  console.log(`Coordinates found: lat=${lat}, lon=${lon}`);

  // Check if coordinates have actually changed
  if (lat === address.lat && lon === address.long) {
    console.log("Coordinates have not changed");
    return { 
      profile_id: address.profile_id,
      status: "unchanged",
      address: address.generated_full_address,
      coordinates: { lat, long: lon }
    };
  }

  const { error: updateError } = await supabase
    .from('address')
    .update({ lat, long: lon })
    .eq('profile_id', address.profile_id);

  if (updateError) {
    console.error("Error updating coordinates:", updateError.message);
    return { profile_id: address.profile_id, status: "error", error: updateError.message };
  }

  console.log("Coordinates updated successfully");
  return { 
    profile_id: address.profile_id,
    status: "updated",
    address: address.generated_full_address,
    oldCoordinates: { lat: address.lat, long: address.long },
    newCoordinates: { lat, long: lon }
  };
}

async function processBatch(supabase: any, lastProcessedId: string, lastProcessedTimestamp: string | null) {
  const startTime = Date.now();
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  let query = supabase
    .from('address')
    .select('profile_id, generated_full_address, lat, long, country, updated_at', { count: 'exact' })
    .gt('profile_id', lastProcessedId)
    .order('profile_id')
    .limit(BATCH_SIZE);

  if (lastProcessedTimestamp) {
    query = query.or(`updated_at.gt.${lastProcessedTimestamp}`);
  }

  const { data: addresses, error: fetchError, count } = await query;

  if (fetchError) {
    console.error("Error fetching addresses:", fetchError.message);
    throw new Error(fetchError.message);
  }

  const results = [];
  for (const addr of addresses) {
    if (Date.now() - startTime > FUNCTION_TIMEOUT) {
      console.log("Approaching timeout, stopping batch processing");
      break;
    }
    results.push(await processAddress(supabase, addr));
    await delay(API_DELAY); // Ensure we don't exceed Nominatim's rate limit
  }

  const newLastProcessedId = results.length > 0 ? addresses[results.length - 1].profile_id : lastProcessedId;
  const newLastProcessedTimestamp = results.length > 0 ? addresses[results.length - 1].updated_at : lastProcessedTimestamp;
  const isComplete = results.length < addresses.length || (addresses.length < BATCH_SIZE && (!newLastProcessedTimestamp || newLastProcessedTimestamp < fiveMinutesAgo));

  return { results, newLastProcessedId, newLastProcessedTimestamp, isComplete, totalCount: count };
}

serve(async (req) => {
  console.log("Function started - Geocoding addresses");

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
    return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { address, isBatch, lastProcessedId = '00000000-0000-0000-0000-000000000000', lastProcessedTimestamp = null } = await req.json();

    if (address) {
      // Process single address (for webhook/trigger use)
      console.log("Processing single address from webhook");
      const result = await processAddress(supabase, address);
      return new Response(JSON.stringify(result), { status: 200 });
    } else if (isBatch) {
      // Process batch
      let isComplete = false;
      let results = [];
      let newLastProcessedId = lastProcessedId;
      let newLastProcessedTimestamp = lastProcessedTimestamp;
      let totalCount = 0;

      while (!isComplete) {
        const batchResult = await processBatch(supabase, newLastProcessedId, newLastProcessedTimestamp);
        results = results.concat(batchResult.results);
        newLastProcessedId = batchResult.newLastProcessedId;
        newLastProcessedTimestamp = batchResult.newLastProcessedTimestamp;
        isComplete = batchResult.isComplete;
        totalCount = batchResult.totalCount;

        if (!isComplete) {
          console.log("Batch processed, continuing with next batch");
        }
      }

      // Trigger next batch if there are more addresses to process
      if (results.length === BATCH_SIZE) {
        await fetch(req.url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ isBatch: true, lastProcessedId: newLastProcessedId, lastProcessedTimestamp: newLastProcessedTimestamp })
        });
      }

      return new Response(JSON.stringify({ 
        message: isComplete ? "All addresses processed" : "Batch processed, next batch triggered",
        processedCount: results.length,
        totalCount,
        lastProcessedId: newLastProcessedId,
        lastProcessedTimestamp: newLastProcessedTimestamp,
        isComplete,
        results 
      }), { status: 200 });
    } else {
      // Invalid request
      return new Response(JSON.stringify({ error: "Invalid request. Specify 'address' for single processing or 'isBatch' for batch processing." }), { status: 400 });
    }
  } catch (error) {
    console.error("Unexpected error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});