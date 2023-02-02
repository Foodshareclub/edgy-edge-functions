import { imgproxy } from "https://deno.land/x/imgproxy/mod.ts";

interface Event {
  data: any;
}

export default async ({ event }: { event: Event }) => {
  // Get the image file from the event object
  const image = event.data;
  
  // Generate a URL for the resized image using imgproxy
  const resizedImageUrl = imgproxy.url(image, {
    resize: "800x600"
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      resizedImageUrl: resizedImageUrl
    })
  };
};
