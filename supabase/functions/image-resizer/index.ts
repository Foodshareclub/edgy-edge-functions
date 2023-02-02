// import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
// import { BufReader } from "https://deno.land/std@0.131.0/io/bufio.ts";
// import { readLine } from "https://deno.land/std@0.131.0/io/util.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";
// import { imgproxy } from "https://deno.land/x/imgproxy/mod.ts";
import { compress } from "https://deno.land/x/compress/mod.ts";


interface Event {
  data: any;
}

export default async ({ event }: { event: Event }) => {
  // Get the image file from the event object
  const image = event.data;
  
  // Compress the image using the compress library
  const compressedImage = await compress(image);

  return {
    statusCode: 200,
    body: JSON.stringify({
      compressedImage: compressedImage
    })
  };
};
