// import { serve } from "https://deno.land/std@0.131.0/http/server.ts";
// import { BufReader } from "https://deno.land/std@0.131.0/io/bufio.ts";
// import { readLine } from "https://deno.land/std@0.131.0/io/util.ts";
import { config } from "https://deno.land/x/dotenv/mod.ts";
import { imgproxy } from "https://deno.land/x/imgproxy/mod.ts";


interface Event {
    data: any;
  }
  
  export default async ({ event }: { event: Event }) => {
    // Get the image file from the event object
    const image = event.data;
    
    // Compress the image using imgproxy
    const compressedImage = await imgproxy.resize(image, {
      width: 400,
      height: 400,
      quality: 80
    });
  
    return {
      statusCode: 200,
      body: JSON.stringify({
        compressedImage: compressedImage
      })
    };
  };  

