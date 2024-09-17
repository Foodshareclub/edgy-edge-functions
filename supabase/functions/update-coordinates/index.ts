import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const API_DELAY = 1000; // 1 second delay between API calls
const USER_AGENT = "Foodshare/1.0 (https://foodshare.club)";

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
  // Remove apartment numbers and other details that might confuse the geocoder
  const simplifiedAddress = addressString.replace(/\b(apt\.?|apartment|unit|#)\s*[\w-]+,?/gi, '').trim();
  const encodedAddress = encodeURIComponent(simplifiedAddress);
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

async function updateCoordinates(supabase: any, address: any) {
  console.log("Updating coordinates for profile_id:", address.profile_id);

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

serve(async (req) => {
  console.log("Function started - Updating coordinates");

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables");
    return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const { address } = await req.json();

    if (address) {
      console.log("Updating coordinates for single address");
      const result = await updateCoordinates(supabase, address);
      return new Response(JSON.stringify(result), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "Invalid request. Address data is required." }), { status: 400 });
    }
  } catch (error) {
    console.error("Unexpected error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});